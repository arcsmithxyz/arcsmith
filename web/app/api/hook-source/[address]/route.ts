import { isAddress } from "@/lib/permissions";
import { hookSource } from "@/lib/server/hook-labels";

/**
 * Whether a hook's source code is published, and under what name. The lookup can take several
 * seconds the first time, so pages ask for it here after they've rendered.
 */
export async function GET(_request: Request, context: RouteContext<"/api/hook-source/[address]">) {
  const { address } = await context.params;
  if (!isAddress(address)) return Response.json({ error: "Not an address." }, { status: 400 });
  const source = await hookSource(address);
  // Unknown (lookup failed) is answered quickly next time too, but not cached for long.
  return Response.json({ source }, { headers: { "cache-control": source ? "public, max-age=3600" : "no-store" } });
}
