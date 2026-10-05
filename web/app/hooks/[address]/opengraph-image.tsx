import { ImageResponse } from "next/og";
import { REACH_FILL } from "@/lib/badge";
import { APP_NAME } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { isAddress } from "@/lib/permissions";
import { getHookCard, getTokenCard } from "@/lib/server/hook-card";
import { readerKind } from "@/lib/server/hook-reader";

// The preview card X, Telegram and Discord show when a Hook Reader link is shared: for a hook,
// what its address allows; for a token, the hooks its pools run. Capabilities, never a verdict.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `What a Uniswap v4 hook on Arc can do, read with the ${APP_NAME} Hook Reader`;

const NAVY = "#1b3158";
const DIM = "rgba(255,255,255,0.72)";

export default async function HookShareImage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  // Without the index we can't tell a hook from a token, and a token's address would earn a made-up
  // list of abilities. So when it is down the card makes no claims (crawlers keep a card for days).
  const kind = isAddress(address) ? await readerKind(address).catch(() => null) : null;
  const token = kind === "token" ? await getTokenCard(address).catch(() => null) : null;
  const hook = kind === "hook" ? await getHookCard(address).catch(() => null) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "58px 72px 54px",
          color: "#ffffff",
          // The blue shader look: navy to electric blue under a dot screen.
          backgroundColor: "#071a8a",
          backgroundImage:
            "radial-gradient(circle, rgba(1,6,30,0.5) 1.6px, transparent 2.1px), linear-gradient(180deg, #030820 0%, #071a8a 48%, #0b31e6 100%)",
          backgroundSize: "9px 9px, 100% 100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>{APP_NAME}</div>
          <div style={{ display: "flex", fontSize: 24, padding: "8px 22px", border: "2px solid rgba(255,255,255,0.45)", borderRadius: 999 }}>
            {token ? "Token check" : "Hook check"}
          </div>
        </div>

        {hook ? <HookBody hook={hook} /> : token ? <TokenBody token={token} /> : <GenericBody />}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: DIM }}>
          <div style={{ display: "flex" }}>Capabilities, not a verdict. Read from the address.</div>
          <div style={{ display: "flex", color: "#ffffff" }}>arcsmith.xyz/hooks</div>
        </div>
      </div>
    ),
    size,
  );
}

function HookBody({ hook }: { hook: NonNullable<Awaited<ReturnType<typeof getHookCard>>> }) {
  const title = hook.name ?? shortAddress(hook.address);
  const fill = REACH_FILL[hook.reach.level];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", fontSize: 28, color: DIM }}>A Uniswap v4 hook on Arc</div>
        <div style={{ display: "flex", fontSize: title.length > 20 ? 68 : 92, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>{title}</div>
        {hook.name && <div style={{ display: "flex", fontSize: 28, color: DIM }}>{shortAddress(hook.address)}</div>}
      </div>
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 600,
            padding: "10px 30px",
            borderRadius: 999,
            background: fill.background,
            color: fill.text,
          }}
        >
          {hook.reach.label}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {hook.abilities.length > 0 ? (
          hook.abilities.map((a) => (
            <div
              key={a.key}
              style={{
                display: "flex",
                fontSize: 27,
                padding: "6px 20px",
                borderRadius: 999,
                // Warm for what can cost money, an outline for what can only stop something.
                background: a.severity === "bad" ? "rgba(233,161,63,0.95)" : "rgba(255,255,255,0.1)",
                color: a.severity === "bad" ? NAVY : "#ffffff",
                border: a.severity === "bad" ? "2px solid transparent" : "2px solid rgba(255,255,255,0.4)",
              }}
            >
              {a.badge}
            </div>
          ))
        ) : (
          <div style={{ display: "flex", fontSize: 30, color: DIM }}>It can&apos;t change trades or liquidity.</div>
        )}
      </div>
    </div>
  );
}

function TokenBody({ token }: { token: NonNullable<Awaited<ReturnType<typeof getTokenCard>>> }) {
  const where = `${token.capped ? "At least " : ""}${token.poolCount} ${token.poolCount === 1 ? "pool" : "pools"} on Arc, ${token.hookedCount} with a hook`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 108, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>{token.symbol}</div>
          {token.identity && (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 600,
                padding: "6px 22px",
                borderRadius: 999,
                background: token.identity.status === "canonical" ? "rgba(255,255,255,0.14)" : "#e9a13f",
                color: token.identity.status === "canonical" ? "#ffffff" : NAVY,
                border: token.identity.status === "canonical" ? "2px solid rgba(255,255,255,0.45)" : "2px solid transparent",
              }}
            >
              {token.identity.status === "canonical" ? `The real ${token.identity.token.symbol}` : `Not the real ${token.identity.token.symbol}`}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 34, color: DIM }}>
          {token.name} · {where}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {token.hooks.map((h) => {
          const fill = REACH_FILL[h.reach.level];
          return (
            <div key={h.address} style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 32 }}>
              <div style={{ display: "flex", width: 380, fontWeight: 600 }}>{h.name ?? shortAddress(h.address)}</div>
              <div style={{ display: "flex", fontSize: 26, padding: "4px 20px", borderRadius: 999, background: fill.background, color: fill.text }}>
                {h.reach.label}
              </div>
            </div>
          );
        })}
        {token.moreHooks > 0 && <div style={{ display: "flex", fontSize: 26, color: DIM }}>and {token.moreHooks} more</div>}
        {token.hooks.length === 0 && <div style={{ display: "flex", fontSize: 32, color: DIM }}>None of its pools runs a hook.</div>}
      </div>
    </div>
  );
}

function GenericBody() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", fontSize: 92, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>Read any hook on Arc</div>
      <div style={{ display: "flex", fontSize: 36, color: DIM }}>What a Uniswap v4 hook can do, in plain words.</div>
    </div>
  );
}
