// One command for a full local environment:
//   1. starts an Anvil chain (or reuses one already on :8545),
//   2. installs Multicall3 (Arc has it, plain Anvil doesn't),
//   3. deploys the contracts with a mock USDC and seeds demo launches (contracts/script/DeployLocal.s.sol),
//   4. runs `next dev` pointed at that chain.
// Usage: pnpm dev:local
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const contracts = join(web, "..", "contracts");
const RPC = "http://127.0.0.1:8545";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** Foundry binaries live in ~/.foundry/bin, which isn't always on PATH for GUI-launched shells. */
function foundry(name) {
  const file = join(homedir(), ".foundry", "bin", process.platform === "win32" ? `${name}.exe` : name);
  return existsSync(file) ? file : name;
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function chainId() {
  try {
    return parseInt(await rpc("eth_chainId"), 16);
  } catch {
    return null;
  }
}

let anvil;
const existing = await chainId();
if (existing !== null) {
  if (existing !== 31337) throw new Error(`Port 8545 is used by another chain (id ${existing}).`);
  console.log("[dev-local] Reusing the Anvil node already running on :8545");
} else {
  // Instant mining while seeding; switched to a block per second afterwards.
  anvil = spawn(foundry("anvil"), ["--silent"], { stdio: "inherit" });
  const stop = () => anvil?.kill();
  process.on("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
  for (let tries = 0; (await chainId()) === null; tries++) {
    if (tries > 50) throw new Error("Anvil didn't start on :8545.");
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("[dev-local] Anvil started on :8545");
}

const multicallCode = readFileSync(join(web, "scripts", "multicall3-runtime.hex"), "utf8").trim();
await rpc("anvil_setCode", [MULTICALL3, multicallCode]);

console.log("[dev-local] Deploying contracts and seeding demo launches…");
// Forge sets each gas limit to simulated gas used × a multiplier. Swaps need more headroom
// than they use: the kernel refuses to call a block without a full gas budget in hand
// (InsufficientGasForBlocks), so the default 130% is too tight. Wallets are unaffected —
// eth_estimateGas searches for a limit that succeeds.
const forge = spawnSync(
  foundry("forge"),
  ["script", "script/DeployLocal.s.sol", "--rpc-url", RPC, "--broadcast", "--slow", "--gas-estimate-multiplier", "300"],
  { cwd: contracts, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
);
if (forge.status !== 0) {
  console.error(forge.stdout);
  throw new Error("Local deploy failed.");
}
// Now a block every second, so block.timestamp keeps moving between trades like on Arc
// (the launch guard and the damper both depend on it).
await rpc("evm_setIntervalMining", [1]);

const deployment = readFileSync(join(contracts, "deployments", "31337.json"), "utf8");
console.log(`[dev-local] Deployed: ${deployment.replace(/\s+/g, " ")}`);

const next = spawn(process.execPath, [join(web, "node_modules", "next", "dist", "bin", "next"), "dev"], {
  cwd: web,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_ARC_NETWORK: "local", NEXT_PUBLIC_LOCAL_DEPLOYMENT: deployment },
});
next.on("exit", (code) => process.exit(code ?? 0));
