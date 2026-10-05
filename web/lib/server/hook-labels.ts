import { arcMainnet } from "../chains";
import { knownHook, type HookSource } from "../known-hooks";
import { cached } from "./cache";
import { serverClient } from "./chain";

/**
 * Whether a hook's source code is published, and under what contract name. Asks Blockscout's
 * shared verified-source database (the one Arc Explorer uses) with the hook's deployed
 * bytecode, after a short hand-checked list (lib/known-hooks.ts). Cached for hours: sources
 * rarely change, and the database is a free public service.
 */

const LOOKUP = "https://eth-bytecode-db.services.blockscout.com/api/v2/bytecodes/sources:search-all";
const TTL_SECONDS = 6 * 60 * 60;

type Match = { contractName?: string; matchType?: string };

/** The hook's source status, or null when it couldn't be checked (no code, or the lookup failed). */
export async function hookSource(address: string): Promise<HookSource | null> {
  const known = knownHook(address);
  if (known) return { published: true, ...known };
  return cached(`hook-source:${address.toLowerCase()}`, TTL_SECONDS, () => lookUp(address)).catch(() => null);
}

async function lookUp(address: string): Promise<HookSource | null> {
  const code = await serverClient(arcMainnet).getCode({ address: address as `0x${string}` });
  if (!code || code === "0x") return null;
  const res = await fetch(LOOKUP, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bytecode: code, bytecodeType: "DEPLOYED_BYTECODE", chain: String(arcMainnet.id), address }),
    // The shared database can take several seconds; pages ask after rendering, so allow it.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Source lookup answered ${res.status}`);
  const body = (await res.json()) as Record<string, Match[] | undefined>;
  const matches = [...(body.ethBytecodeDbSources ?? []), ...(body.sourcifySources ?? []), ...(body.allianceSources ?? [])].filter(
    (m) => m.contractName,
  );
  // An exact match beats a partial one (same code, different metadata).
  const best = matches.find((m) => m.matchType === "FULL") ?? matches[0];
  return best ? { published: true, name: best.contractName!, exact: best.matchType === "FULL" } : { published: false };
}
