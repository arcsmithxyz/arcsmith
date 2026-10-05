import { hookBadge } from "@/lib/badge";

/**
 * A small SVG badge for a hook: "hook check | Can move your money". Built from the address
 * alone, so it needs no index and no network, and it isn't rate limited: READMEs load badges
 * through shared image proxies, and one busy proxy address would otherwise break them for everyone.
 * The edge keeps each one for a day.
 */
export async function GET(_request: Request, context: RouteContext<"/api/v1/hooks/[address]/badge.svg">) {
  const { address } = await context.params;
  return new Response(hookBadge(address), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
