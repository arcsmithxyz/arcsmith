import { composePosts } from "@/lib/bot/posts";

/**
 * What the X bot would post for the last ?minutes=N (default 60, max 1440), including the
 * daily recap. Read-only: it never posts anything.
 */
export async function GET(request: Request) {
  const minutes = Math.min(1440, Math.max(1, Number(new URL(request.url).searchParams.get("minutes")) || 60));
  const to = Math.floor(Date.now() / 1000);
  try {
    const posts = await composePosts({ from: to - minutes * 60, to, forceRecap: true });
    return Response.json({ window: { minutes }, posts }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Couldn't read the Arc index or chain just now." }, { status: 502 });
  }
}
