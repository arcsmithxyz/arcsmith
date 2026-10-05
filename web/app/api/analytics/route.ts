import { getAnalytics } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

/** The analytics page's data as JSON (cached for five minutes server-side). */
export async function GET() {
  try {
    const data = await getAnalytics();
    return Response.json(data, { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return Response.json({ error: "The Arc index didn't answer. Try again in a minute." }, { status: 502 });
  }
}
