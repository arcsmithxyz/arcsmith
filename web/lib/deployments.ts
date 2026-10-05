import type { Address } from "viem";

export type Deployment = {
  poolManager: Address;
  usdc: Address;
  catalog: Address;
  kernel: Address;
  launchpad: Address;
  router: Address;
  liquidityManager: Address;
  guardBlock: Address;
  damperBlock: Address;
  burnBlock: Address;
  surgeBlock: Address;
  /** Block the contracts were deployed at; nothing of ours exists before it. */
  deployedAtBlock: bigint;
  /** True once every contract above (except Uniswap's and USDC) is verified on the network's explorer as an exact match. */
  sourceVerified?: boolean;
};

/** The local chain's addresses change on every start, so dev-local passes them in as JSON. */
function localDeployment(json: string | undefined): Deployment | null {
  if (!json) return null;
  const d = JSON.parse(json);
  return { ...d, deployedAtBlock: BigInt(d.deployedAtBlock) };
}

// Copied from contracts/deployments/<chainId>.json after each broadcast.
// `null` means the contracts are not deployed on that network yet.
export const deployments: Record<number, Deployment | null> = {
  // Arc testnet, deployed 2026-09-28 (smoke-tested: launch, trade, fees, open market, liquidity)
  5042002: {
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    usdc: "0x3600000000000000000000000000000000000000",
    catalog: "0x979f02A2F6Ab289D792bDd0551A371fADfa014B3",
    kernel: "0x7d4FA76C6Ca4D026653F462Dd26712007C2428c4",
    launchpad: "0x3da12f45c60ea792427220FcF93d0BC2fdeC1431",
    router: "0x77bd8507a7E97B46Aa8eB54EB420731be9368835",
    liquidityManager: "0x76D6B2B72A1C11C84a7d7C597946a0a04f6fb1b1",
    guardBlock: "0x606e9C09655DA6547e8bb3041f17e675E7905891",
    damperBlock: "0x7ffCD54b92B38Addb2C55C455350cF0bFA43BE4e",
    burnBlock: "0x7De6e21F2663B7a942b550a4F772fc0C3F13a817",
    surgeBlock: "0xb9526367B4a3191B268956c5943dEbBcebaD5816",
    deployedAtBlock: 64417389n,
  },
  // Arc mainnet, deployed 2026-09-28. Owner + treasury: 0x1d02…48b9; protocol share 10%.
  // Smoke-tested (11/11). The catalog's ownership awaits acceptOwnership() from the owner.
  5042: {
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    usdc: "0x3600000000000000000000000000000000000000",
    catalog: "0xC178a08100139124c02C93A6091eFDb491131651",
    kernel: "0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4",
    launchpad: "0x7843B87F83BF8eE6B846f086120F3407b4C6F174",
    router: "0xDF32f5B75B634FB7C54082C1f5067cc54b199f18",
    liquidityManager: "0x245AC60b525cA3ac386d8e7ac96a9E9c85F05566",
    guardBlock: "0x9826217754D383eEa8e13938015c21BF4e1Ef624",
    damperBlock: "0xBf0026B74eb055A587560B70Bc0CaFBac48Dc933",
    burnBlock: "0x94DED950469ea2b90d703C559a0d967cD4C054ff",
    surgeBlock: "0xcb228C32111D3001e681361b57567B7983538ADd",
    deployedAtBlock: 23195402n,
    // All verified on Arc Explorer as exact matches on 2026-10-03 (contracts/verification/).
    sourceVerified: true,
  },
  // Local Anvil chain, set by scripts/dev-local.mjs
  31337: localDeployment(process.env.NEXT_PUBLIC_LOCAL_DEPLOYMENT),
};
