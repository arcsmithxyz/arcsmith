// Production build and server for one network, next to a running `next dev`:
//   pnpm preview:mainnet            (serves on $PORT, default 3100)
// NEXT_PUBLIC_* values are baked in at build time, so each network needs its own build.
//
// Next runs as a direct child of this process (no shell in between), and this process
// waits for it, so stopping the preview stops the server too.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const network = process.argv[2] ?? "mainnet";
const port = process.env.PORT ?? "3100";
const env = { ...process.env, NEXT_PUBLIC_ARC_NETWORK: network };
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

console.log(`[preview] building for Arc ${network}…`);
const build = spawnSync(process.execPath, [nextBin, "build"], { stdio: "inherit", env });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`[preview] serving on http://localhost:${port}`);
const server = spawn(process.execPath, [nextBin, "start", "-p", port], { stdio: "inherit", env });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
