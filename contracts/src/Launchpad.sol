// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/libraries/FixedPoint96.sol";
import {FixedPoint128} from "v4-core/libraries/FixedPoint128.sol";
import {SafeCast} from "v4-core/libraries/SafeCast.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {HookKernel} from "./HookKernel.sol";
import {BlockCatalog} from "./BlockCatalog.sol";
import {LaunchToken} from "./LaunchToken.sol";

/// @title Launchpad
/// @notice Opens Uniswap v4 pools that run on the HookKernel, in two lanes:
///
///  - **Launch**: deploys a fixed-supply token and puts the whole supply into a single-sided
///    position against USDC, from the launch price upward. That position is locked by
///    construction — nothing here removes liquidity — and the fees it earns are split
///    between the creator, the protocol and the authors of the blocks the pool uses.
///  - **Open market**: attaches a block stack to a token that already exists. The pool
///    starts empty; anyone can provide liquidity (e.g. through the LiquidityManager) and
///    earns its fees like in any Uniswap pool.
///
/// Either way the block stack is frozen at creation by the kernel.
contract Launchpad is IUnlockCallback, Ownable2Step, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using BalanceDeltaLibrary for BalanceDelta;
    using SafeERC20 for IERC20;

    uint256 public constant TOKEN_SUPPLY = 1_000_000_000e18;
    int24 public constant LAUNCH_TICK_SPACING = 200;
    uint16 public constant MAX_PROTOCOL_SHARE_BPS = 5_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// Liquidity is sized for slightly less than the supply, so rounding inside the
    /// PoolManager can never ask for more tokens than exist. The leftover is burned.
    uint256 internal constant LIQUIDITY_MARGIN = 1e9;
    uint256 internal constant MAX_NAME_LENGTH = 32;
    uint256 internal constant MAX_SYMBOL_LENGTH = 12;
    uint256 internal constant MAX_URI_LENGTH = 256;
    uint256 internal constant MAX_DESCRIPTION_LENGTH = 500;

    struct Market {
        /// The launched or listed token the pool's rules are about.
        address subject;
        /// What it trades against (USDC for launches).
        address quote;
        address creator;
        PoolId poolId;
        uint40 createdAt;
        /// Protocol's share of the locked position's fees (launches only; frozen).
        uint16 protocolShareBps;
        bool subjectIsCurrency0;
        bool isLaunch;
        int24 tickSpacing;
    }

    struct LaunchMetadata {
        string imageURI;
        string description;
        string website;
    }

    /// A pool's frozen rules: its base fee and its block stack.
    struct Rules {
        uint24 baseFee;
        address[] blocks;
        bytes[] configs;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string imageURI;
        string description;
        string website;
        Rules rules;
    }

    struct OpenParams {
        address subject;
        address quote;
        int24 tickSpacing;
        uint160 sqrtPriceX96;
        Rules rules;
    }

    enum Action {
        AddLiquidity,
        CollectFees
    }

    IPoolManager public immutable poolManager;
    HookKernel public immutable kernel;
    BlockCatalog public immutable catalog;
    /// Quote currency for launches (Arc USDC, ERC-20 interface).
    Currency public immutable usdc;
    /// Pool tick of the launch price when the token sorts as currency0; negated otherwise.
    int24 public immutable launchTick;

    address public treasury;
    /// Protocol's share of launch fees for launches created from now on, in bps.
    uint16 public protocolShareBps;
    bool public paused;

    Market[] internal _markets;
    mapping(uint256 marketId => LaunchMetadata) internal _metadata;
    /// Royalty rate per block of each launch, frozen at launch (aligned with the kernel's stack).
    mapping(uint256 marketId => uint16[]) internal _royaltyBps;
    /// marketId + 1 for every pool opened here (0 = not ours).
    mapping(PoolId => uint256) public marketIdPlusOne;
    /// marketId + 1 for every token launched here (0 = not a launch).
    mapping(address token => uint256) public launchIdPlusOne;
    /// Fee balances waiting to be claimed, per account and currency.
    mapping(address account => mapping(address currency => uint256)) public claimable;

    event Launched(uint256 indexed marketId, address indexed token, address indexed creator, PoolId poolId, string name, string symbol);
    event MarketOpened(uint256 indexed marketId, address indexed subject, address indexed creator, PoolId poolId, address quote);
    event FeesCollected(uint256 indexed marketId, uint256 amount0, uint256 amount1);
    event RoyaltyAccrued(uint256 indexed marketId, address indexed block, address indexed author, address currency, uint256 amount);
    event Claimed(address indexed account, address indexed currency, uint256 amount);
    event CreatorTransferred(uint256 indexed marketId, address indexed from, address indexed to);
    event TreasuryUpdated(address treasury);
    event ProtocolShareUpdated(uint16 protocolShareBps);
    event PausedUpdated(bool paused);

    error NotPoolManager();
    error NotCreator();
    error ZeroAddress();
    error Paused();
    error InvalidMetadata();
    error InvalidLaunchTick();
    error InvalidProtocolShare();
    error InvalidMarket();
    error KernelMismatch();
    error UnknownMarket();
    error NotALaunch();
    error NothingToClaim();
    error UnexpectedDelta();

    constructor(
        IPoolManager poolManager_,
        HookKernel kernel_,
        Currency usdc_,
        int24 launchTick_,
        address treasury_,
        uint16 protocolShareBps_,
        address owner_
    ) Ownable(owner_) {
        if (address(poolManager_) == address(0) || Currency.unwrap(usdc_) == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (kernel_.poolManager() != poolManager_) revert KernelMismatch();
        if (protocolShareBps_ > MAX_PROTOCOL_SHARE_BPS) revert InvalidProtocolShare();
        // Both the tick and its negation must be spacing-aligned and strictly inside the
        // usable range, so the locked position can sit on either side of it.
        int24 maxUsable = TickMath.maxUsableTick(LAUNCH_TICK_SPACING);
        if (launchTick_ % LAUNCH_TICK_SPACING != 0 || launchTick_ <= -maxUsable || launchTick_ >= maxUsable) {
            revert InvalidLaunchTick();
        }

        poolManager = poolManager_;
        kernel = kernel_;
        catalog = kernel_.catalog();
        usdc = usdc_;
        launchTick = launchTick_;
        treasury = treasury_;
        protocolShareBps = protocolShareBps_;
    }

    // ---------------------------------------------------------------------------
    // Launch lane
    // ---------------------------------------------------------------------------

    /// @notice Creates a token, opens its pool with the given frozen rules and locks the
    /// whole supply as liquidity. The caller becomes the creator.
    function launch(LaunchParams calldata params) external nonReentrant returns (uint256 marketId, address token) {
        if (paused) revert Paused();
        _validateMetadata(params);

        token = address(new LaunchToken(params.name, params.symbol, TOKEN_SUPPLY, address(this)));
        (PoolId poolId, bool subjectIsCurrency0) = _openLaunchPool(token, params.rules);
        marketId = _record(token, Currency.unwrap(usdc), poolId, subjectIsCurrency0, true, LAUNCH_TICK_SPACING, protocolShareBps);

        LaunchMetadata storage m = _metadata[marketId];
        m.imageURI = params.imageURI;
        m.description = params.description;
        m.website = params.website;
        launchIdPlusOne[token] = marketId + 1;

        // Freeze each block's royalty rate as it stands today.
        uint16[] storage royalties = _royaltyBps[marketId];
        for (uint256 i; i < params.rules.blocks.length; i++) {
            royalties.push(catalog.royaltyBpsOf(params.rules.blocks[i]));
        }

        emit Launched(marketId, token, msg.sender, poolId, params.name, params.symbol);
    }

    function _openLaunchPool(address token, Rules calldata rules) internal returns (PoolId poolId, bool tokenIsCurrency0) {
        tokenIsCurrency0 = token < Currency.unwrap(usdc);
        PoolKey memory key = _launchKey(token, tokenIsCurrency0);
        (int24 tickLower, int24 tickUpper) = _launchRange(tokenIsCurrency0);

        kernel.register(key, _registerParams(rules, true, tokenIsCurrency0, TOKEN_SUPPLY));
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(tokenIsCurrency0 ? tickLower : tickUpper));

        uint128 liquidity = _liquidityForSupply(tokenIsCurrency0, tickLower, tickUpper);
        poolManager.unlock(abi.encode(Action.AddLiquidity, key, tickLower, tickUpper, liquidity));

        uint256 leftover = IERC20(token).balanceOf(address(this));
        if (leftover != 0) IERC20(token).safeTransfer(DEAD, leftover);
        poolId = key.toId();
    }

    // ---------------------------------------------------------------------------
    // Open-market lane
    // ---------------------------------------------------------------------------

    /// @notice Opens a hooked pool for a token that already exists, at a starting price the
    /// caller chooses. The pool starts without liquidity. The caller becomes its creator.
    /// @dev One pool per (pair, tick spacing): the kernel and dynamic fee are fixed parts of
    /// the pool key, so a pair can have at most one market per supported spacing.
    function openMarket(OpenParams calldata params) external nonReentrant returns (uint256 marketId) {
        if (paused) revert Paused();
        address subject = params.subject;
        address quote = params.quote;
        if (
            subject == quote || subject.code.length == 0 || quote.code.length == 0
                || (params.tickSpacing != 10 && params.tickSpacing != 60 && params.tickSpacing != 200)
        ) revert InvalidMarket();

        bool subjectIsCurrency0 = subject < quote;
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(subjectIsCurrency0 ? subject : quote),
            currency1: Currency.wrap(subjectIsCurrency0 ? quote : subject),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: params.tickSpacing,
            hooks: IHooks(address(kernel))
        });
        kernel.register(key, _registerParams(params.rules, false, subjectIsCurrency0, IERC20(subject).totalSupply()));
        poolManager.initialize(key, params.sqrtPriceX96);

        // No locked position, so no fees flow through here and no protocol share applies.
        marketId = _record(subject, quote, key.toId(), subjectIsCurrency0, false, params.tickSpacing, 0);
        emit MarketOpened(marketId, subject, msg.sender, key.toId(), quote);
    }

    // ---------------------------------------------------------------------------
    // Fees (launch lane)
    // ---------------------------------------------------------------------------

    /// @notice Collects the fees a launch's locked position has earned and splits them into
    /// claimable balances: creator, block-author royalties, treasury. Anyone can call it.
    function collectFees(uint256 marketId) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        return _collectFees(marketId);
    }

    /// @notice Withdraws the caller's claimable balance of one currency.
    function claim(address currency) external nonReentrant returns (uint256 amount) {
        amount = _claim(msg.sender, currency);
        if (amount == 0) revert NothingToClaim();
    }

    /// @notice Collects a launch's fees, then pays out the caller's balances of both of its
    /// currencies. The one-click path for creators.
    function collectAndClaim(uint256 marketId) external nonReentrant returns (uint256 tokenAmount, uint256 quoteAmount) {
        _collectFees(marketId);
        Market storage m = _markets[marketId];
        tokenAmount = _claim(msg.sender, m.subject);
        quoteAmount = _claim(msg.sender, m.quote);
    }

    /// @notice Hands a market's creator rights (and a launch's future fee share) to another address.
    function transferCreator(uint256 marketId, address newCreator) external {
        Market storage m = _market(marketId);
        if (msg.sender != m.creator) revert NotCreator();
        if (newCreator == address(0)) revert ZeroAddress();
        m.creator = newCreator;
        emit CreatorTransferred(marketId, msg.sender, newCreator);
    }

    // ---------------------------------------------------------------------------
    // Uniswap v4 unlock callback
    // ---------------------------------------------------------------------------

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Action action, PoolKey memory key, int24 tickLower, int24 tickUpper, uint128 liquidity) =
            abi.decode(data, (Action, PoolKey, int24, int24, uint128));

        if (action == Action.AddLiquidity) {
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: int256(uint256(liquidity)),
                    salt: bytes32(0)
                }),
                ""
            );
            _pay(key.currency0, delta.amount0());
            _pay(key.currency1, delta.amount1());
            return "";
        }

        // CollectFees: a zero-liquidity modification returns exactly the fees owed.
        (BalanceDelta fees,) = poolManager.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: 0, salt: 0}),
            ""
        );
        return abi.encode(_receive(key.currency0, fees.amount0()), _receive(key.currency1, fees.amount1()));
    }

    // ---------------------------------------------------------------------------
    // Owner — affects future markets only, never an existing pool or balance
    // ---------------------------------------------------------------------------

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setProtocolShareBps(uint16 protocolShareBps_) external onlyOwner {
        if (protocolShareBps_ > MAX_PROTOCOL_SHARE_BPS) revert InvalidProtocolShare();
        protocolShareBps = protocolShareBps_;
        emit ProtocolShareUpdated(protocolShareBps_);
    }

    /// @notice Pauses new launches and new markets. Trading and claims are unaffected.
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedUpdated(paused_);
    }

    // ---------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory, LaunchMetadata memory) {
        return (_market(marketId), _metadata[marketId]);
    }

    /// @notice Markets in id order from `start`, up to `count` of them.
    function getMarkets(uint256 start, uint256 count) external view returns (Market[] memory page) {
        uint256 total = _markets.length;
        if (start >= total) return page;
        uint256 end = start + count > total ? total : start + count;
        page = new Market[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = _markets[i];
        }
    }

    function poolKeyOf(uint256 marketId) public view returns (PoolKey memory) {
        Market storage m = _market(marketId);
        bool s0 = m.subjectIsCurrency0;
        return PoolKey({
            currency0: Currency.wrap(s0 ? m.subject : m.quote),
            currency1: Currency.wrap(s0 ? m.quote : m.subject),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: m.tickSpacing,
            hooks: IHooks(address(kernel))
        });
    }

    /// @notice Royalty rate per block of a launch, frozen at launch, aligned with the kernel's stack.
    function royaltiesOf(uint256 marketId) external view returns (uint16[] memory) {
        return _royaltyBps[marketId];
    }

    /// @notice Current pool price, tick and in-range liquidity for a market.
    function marketState(uint256 marketId) external view returns (uint160 sqrtPriceX96, int24 tick, uint128 liquidity) {
        PoolId poolId = _market(marketId).poolId;
        (sqrtPriceX96, tick,,) = poolManager.getSlot0(poolId);
        liquidity = poolManager.getLiquidity(poolId);
    }

    /// @notice Fees a launch's locked position has earned but `collectFees` hasn't collected yet.
    function pendingFees(uint256 marketId) external view returns (uint256 amount0, uint256 amount1) {
        Market storage m = _market(marketId);
        if (!m.isLaunch) return (0, 0);
        (int24 tickLower, int24 tickUpper) = _launchRange(m.subjectIsCurrency0);
        (uint128 liquidity, uint256 lastGrowth0, uint256 lastGrowth1) =
            poolManager.getPositionInfo(m.poolId, address(this), tickLower, tickUpper, bytes32(0));
        (uint256 growth0, uint256 growth1) = poolManager.getFeeGrowthInside(m.poolId, tickLower, tickUpper);
        // Fee growth counters are designed to wrap; the difference is what matters.
        unchecked {
            amount0 = FullMath.mulDiv(growth0 - lastGrowth0, liquidity, FixedPoint128.Q128);
            amount1 = FullMath.mulDiv(growth1 - lastGrowth1, liquidity, FixedPoint128.Q128);
        }
    }

    // ---------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------

    function _market(uint256 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert UnknownMarket();
        return _markets[marketId];
    }

    function _registerParams(Rules calldata rules, bool isLaunch, bool subjectIsCurrency0, uint256 supply)
        internal
        pure
        returns (HookKernel.RegisterParams memory)
    {
        return HookKernel.RegisterParams({
            isLaunch: isLaunch,
            subjectIsCurrency0: subjectIsCurrency0,
            baseFee: rules.baseFee,
            subjectSupply: supply,
            blocks: rules.blocks,
            configs: rules.configs
        });
    }

    function _record(
        address subject,
        address quote,
        PoolId poolId,
        bool subjectIsCurrency0,
        bool isLaunch,
        int24 tickSpacing,
        uint16 shareBps
    ) internal returns (uint256 marketId) {
        marketId = _markets.length;
        // Field by field: pushing a struct literal runs out of stack slots under via-IR.
        Market storage m = _markets.push();
        m.subject = subject;
        m.quote = quote;
        m.creator = msg.sender;
        m.poolId = poolId;
        m.createdAt = uint40(block.timestamp);
        m.protocolShareBps = shareBps;
        m.subjectIsCurrency0 = subjectIsCurrency0;
        m.isLaunch = isLaunch;
        m.tickSpacing = tickSpacing;
        marketIdPlusOne[poolId] = marketId + 1;
    }

    function _collectFees(uint256 marketId) internal returns (uint256 amount0, uint256 amount1) {
        Market storage m = _market(marketId);
        if (!m.isLaunch) revert NotALaunch();
        PoolKey memory key = poolKeyOf(marketId);
        (int24 tickLower, int24 tickUpper) = _launchRange(m.subjectIsCurrency0);

        bytes memory result = poolManager.unlock(abi.encode(Action.CollectFees, key, tickLower, tickUpper, uint128(0)));
        (amount0, amount1) = abi.decode(result, (uint256, uint256));

        address[] memory blocks = kernel.blocksOf(m.poolId);
        _split(marketId, m, blocks, Currency.unwrap(key.currency0), amount0);
        _split(marketId, m, blocks, Currency.unwrap(key.currency1), amount1);
        emit FeesCollected(marketId, amount0, amount1);
    }

    /// @dev creator gets (1 − protocol share); the protocol share pays each block's author
    /// its frozen royalty rate, and the rest goes to the treasury.
    function _split(uint256 marketId, Market storage m, address[] memory blocks, address currency, uint256 amount)
        internal
    {
        if (amount == 0) return;
        uint256 protocolAmount = amount * m.protocolShareBps / 10_000;
        claimable[m.creator][currency] += amount - protocolAmount;

        uint256 royalties;
        uint16[] storage rates = _royaltyBps[marketId];
        for (uint256 i; i < rates.length; i++) {
            if (rates[i] == 0) continue;
            uint256 royalty = protocolAmount * rates[i] / 10_000;
            if (royalty == 0) continue;
            address author = catalog.authorOf(blocks[i]);
            claimable[author][currency] += royalty;
            royalties += royalty;
            emit RoyaltyAccrued(marketId, blocks[i], author, currency, royalty);
        }
        claimable[treasury][currency] += protocolAmount - royalties;
    }

    function _claim(address account, address currency) internal returns (uint256 amount) {
        amount = claimable[account][currency];
        if (amount == 0) return 0;
        claimable[account][currency] = 0;
        IERC20(currency).safeTransfer(account, amount);
        emit Claimed(account, currency, amount);
    }

    /// @dev Settles a debt to the PoolManager. Adding single-sided liquidity only ever owes
    /// the token side, so a positive delta here means something is wrong.
    function _pay(Currency currency, int128 amount) internal {
        if (amount > 0) revert UnexpectedDelta();
        if (amount == 0) return;
        poolManager.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), uint256(uint128(-amount)));
        poolManager.settle();
    }

    function _receive(Currency currency, int128 amount) internal returns (uint256) {
        if (amount < 0) revert UnexpectedDelta();
        if (amount == 0) return 0;
        uint256 value = uint256(uint128(amount));
        poolManager.take(currency, address(this), value);
        return value;
    }

    function _launchKey(address token, bool tokenIsCurrency0) internal view returns (PoolKey memory) {
        Currency tokenCurrency = Currency.wrap(token);
        return PoolKey({
            currency0: tokenIsCurrency0 ? tokenCurrency : usdc,
            currency1: tokenIsCurrency0 ? usdc : tokenCurrency,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: LAUNCH_TICK_SPACING,
            hooks: IHooks(address(kernel))
        });
    }

    /// @dev The locked position spans from the launch price to the end of the usable range
    /// on the side where the token gets more expensive. Currency0's price rises with the
    /// tick, currency1's falls, hence the mirror image.
    function _launchRange(bool tokenIsCurrency0) internal view returns (int24 tickLower, int24 tickUpper) {
        if (tokenIsCurrency0) return (launchTick, TickMath.maxUsableTick(LAUNCH_TICK_SPACING));
        return (TickMath.minUsableTick(LAUNCH_TICK_SPACING), -launchTick);
    }

    /// @dev Liquidity for a position holding (almost) the whole supply, with the pool price
    /// on the position's edge so it holds only the token.
    function _liquidityForSupply(bool tokenIsCurrency0, int24 tickLower, int24 tickUpper)
        internal
        pure
        returns (uint128)
    {
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 amount = TOKEN_SUPPLY - LIQUIDITY_MARGIN;
        uint256 liquidity = tokenIsCurrency0
            // amount0 = L * (sqrtU - sqrtL) / (sqrtL * sqrtU), in Q96 terms
            ? FullMath.mulDiv(amount, FullMath.mulDiv(sqrtLower, sqrtUpper, FixedPoint96.Q96), sqrtUpper - sqrtLower)
            // amount1 = L * (sqrtU - sqrtL), in Q96 terms
            : FullMath.mulDiv(amount, FixedPoint96.Q96, sqrtUpper - sqrtLower);
        return SafeCast.toUint128(liquidity);
    }

    function _validateMetadata(LaunchParams calldata params) internal pure {
        uint256 nameLength = bytes(params.name).length;
        uint256 symbolLength = bytes(params.symbol).length;
        if (
            nameLength == 0 || nameLength > MAX_NAME_LENGTH || symbolLength == 0 || symbolLength > MAX_SYMBOL_LENGTH
                || bytes(params.imageURI).length > MAX_URI_LENGTH || bytes(params.website).length > MAX_URI_LENGTH
                || bytes(params.description).length > MAX_DESCRIPTION_LENGTH
        ) revert InvalidMetadata();
    }
}
