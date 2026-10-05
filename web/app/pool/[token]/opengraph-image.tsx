import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/config";
import { resolvePoolPage } from "@/lib/server/markets";
import { getPoolCard } from "@/lib/server/pool-card";

// The preview card X, Telegram and Discord show when a pool link is shared.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `A pool on ${APP_NAME}`;

const NAVY = "#1b3158";
const MUTED = "#56606d";

export default async function PoolShareImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Image routes don't see the query string, so a token's later markets (?market=<n>) share
  // the card of its first one: same token, possibly different fees.
  const page = await resolvePoolPage(token, undefined).catch(() => null);
  const card = page?.kind === "page" ? await getPoolCard(page.id).catch(() => null) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          // The site's dawn sky.
          background: "linear-gradient(165deg, #c3d3ef 0%, #d9d5e8 28%, #efd8cb 58%, #fbecd2 82%, #fbf5f0 100%)",
          color: NAVY,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>{APP_NAME}</div>
          <div style={{ display: "flex", fontSize: 24, padding: "8px 20px", border: `2px solid ${NAVY}`, borderRadius: 999 }}>
            {card ? (card.isLaunch ? "Launched here" : "Existing token") : "Uniswap v4 hooks on Arc"}
          </div>
        </div>

        {card ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 120, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>{card.symbol}</div>
            <div style={{ display: "flex", fontSize: 40, color: MUTED, marginTop: 12 }}>
              {card.name} · {card.symbol} / {card.quoteSymbol}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 96, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>Hooks from blocks</div>
        )}

        {card ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", gap: 56 }}>
              <Figure label="Price" value={card.price} />
              <Figure label="Fully diluted" value={card.fdv} />
              <Figure label="Buy / sell fee" value={`${card.buyFee} / ${card.sellFee}`} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: MUTED }}>
              <span style={{ display: "flex" }}>Built from</span>
              {card.blocks.length > 0 ? (
                card.blocks.slice(0, 5).map((block) => (
                  <span key={block} style={{ display: "flex", padding: "6px 16px", borderRadius: 999, background: "rgba(27,49,88,0.08)", color: NAVY }}>
                    {block}
                  </span>
                ))
              ) : (
                <span style={{ display: "flex", color: NAVY }}>the base fee only</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 32, color: MUTED }}>Compose Uniswap v4 hook rules from on-chain blocks, on Arc.</div>
        )}
      </div>
    ),
    size,
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 52, fontWeight: 600, letterSpacing: -1.5 }}>{value}</div>
      <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
}
