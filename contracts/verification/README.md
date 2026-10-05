# Publishing Arcsmith's contract source on Arc Explorer

One file per deployed contract on Arc mainnet. Each was checked on 2026-10-02 by compiling it with
solc 0.8.26 and comparing the result with the code on-chain: all ten are an **exact match**, so the explorer
should accept them as fully verified.

| # | Contract | Address | File |
|---|---|---|---|
| 1 | HookKernel (the hook every pool runs on) | `0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4` | `HookKernel.standard-input.json` |
| 2 | Launchpad | `0x7843B87F83BF8eE6B846f086120F3407b4C6F174` | `Launchpad.standard-input.json` |
| 3 | BlockCatalog | `0xC178a08100139124c02C93A6091eFDb491131651` | `BlockCatalog.standard-input.json` |
| 4 | GuardBlock (Launch guard) | `0x9826217754D383eEa8e13938015c21BF4e1Ef624` | `GuardBlock.standard-input.json` |
| 5 | DamperBlock (Dump damper) | `0xBf0026B74eb055A587560B70Bc0CaFBac48Dc933` | `DamperBlock.standard-input.json` |
| 6 | BurnBlock (Auto-burn) | `0x94DED950469ea2b90d703C559a0d967cD4C054ff` | `BurnBlock.standard-input.json` |
| 7 | SurgeBlock (Surge fee) | `0xcb228C32111D3001e681361b57567B7983538ADd` | `SurgeBlock.standard-input.json` |
| 8 | LaunchRouter | `0xDF32f5B75B634FB7C54082C1f5067cc54b199f18` | `LaunchRouter.standard-input.json` |
| 9 | LiquidityManager | `0x245AC60b525cA3ac386d8e7ac96a9E9c85F05566` | `LiquidityManager.standard-input.json` |
| 10 | LaunchToken (the TEST token, as an example launch) | `0xDC84d98F62d69013baAACDB7e1eFf587b36d0982` | `LaunchToken.standard-input.json` |

## Steps (about 2 minutes per contract)

1. Open the verification page for the contract, replacing `<address>` with the address from the table:
   `https://explorer.arc.io/address/<address>/contract-verification`
   (Or open the address on the explorer, go to the **Contract** tab and click **Verify & publish**.)
2. **Contract license**: choose **MIT License (MIT)**.
3. **Verification method**: choose **Solidity (Standard JSON input)**.
4. **Compiler**: choose **v0.8.26+commit.8a97fa7a** (exactly this one, not 0.8.36 or a nightly).
5. **Standard Input JSON**: drop in the matching file from this folder.
6. Click **Verify & publish** and wait. It can take a minute: the explorer compiles the code itself.
7. When it's done, the Contract tab shows "Contract source code verified (exact match)" and the contract name.

The form doesn't ask for a contract name or constructor arguments: the explorer finds the contract in the file
by its address and reads the arguments from the deployment.

Start with **HookKernel** (#1): the Hook Reader on arcsmith.xyz shows its status, so it's the one people will
check. After that, the order doesn't matter.

## If something goes wrong

- **"Bytecode doesn't match"**: check the compiler is exactly v0.8.26+commit.8a97fa7a and that you uploaded the
  file for that address. Don't edit the files: a single changed character breaks the match.
- **A security check or captcha**: complete it yourself in your browser; it's the explorer's bot protection.
- **The Hook Reader still says "not published"**: it caches results for up to 6 hours. It updates on its own.

## Note on HookKernel

`HookKernel.standard-input.json` contains the kernel's source **as deployed on 2026-09-28**. That's the version
before the fix made on 2026-09-27 at 12:27 UTC (in `_impactPpm`, for a fresh launch resting exactly on the edge
of its liquidity), which never reached the deployed kernel. The fix exists in `src/HookKernel.sol` today, so that
file no longer matches the chain. Publishing the deployed version is the honest record of what runs on Arc.
Launchpad's file includes the same deployed kernel source, because Launchpad imports it.
