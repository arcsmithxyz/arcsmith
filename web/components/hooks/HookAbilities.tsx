import { abilitiesOf, decodePermissions } from "@/lib/permissions";
import { Badge } from "../ui";

const RISK_TONE = { info: "neutral", notice: "warn", delta: "bad" } as const;
const RISK_LABEL = { info: "Informational", notice: "Can refuse", delta: "Moves money" } as const;

const GROUPS = [
  { audience: "trade", title: "When you trade" },
  { audience: "liquidity", title: "If you provide liquidity" },
] as const;

/**
 * What a hook can do, as plain yes/no answers to the questions traders and liquidity providers
 * have. The 14 raw permission flags behind the answers stay available, folded away, for
 * anyone who wants them.
 */
export function HookAbilities({ address, hasPools }: { address: string; hasPools: boolean }) {
  const abilities = abilitiesOf(address);
  const permissions = decodePermissions(address);
  const enabled = permissions.filter((p) => p.enabled);

  return (
    <section aria-labelledby="abilities-heading" className="mt-10">
      <h2 id="abilities-heading" className="text-lg font-medium">
        What this hook can do
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Read from its address. &ldquo;Yes&rdquo; means it&apos;s allowed to, not that it always does.
        {hasPools && " To see what it actually charges, preview a swap below."}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <div key={group.audience} className="card p-2">
            <h3 className="px-4 pt-3 pb-2 text-sm font-medium text-muted">{group.title}</h3>
            <ul>
              {abilities
                .filter((a) => a.audience === group.audience)
                .map((a) => (
                  <li key={a.key} className="flex gap-4 border-t border-line px-4 py-3.5 first:border-0">
                    <Answer can={a.can} severity={a.severity} />
                    <div className="min-w-0">
                      <p className="font-medium">{a.question}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{a.can ? a.yes : a.no}</p>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <details className="group mt-5">
        <summary className="cursor-pointer text-sm text-muted underline-offset-2 hover:text-text hover:underline">
          Technical details: the {permissions.length} permission flags ({enabled.length} on)
        </summary>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {permissions.map((p) => (
            <li key={p.key} className={`panel p-4 ${p.enabled ? "" : "opacity-45"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                {p.enabled ? <Badge tone={RISK_TONE[p.risk]}>{RISK_LABEL[p.risk]}</Badge> : <Badge>Off</Badge>}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.meaning}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Uniswap v4 reads these flags from the last characters of the hook&apos;s address. They say where a hook can step in,
          not what it does there. Read its verified source before trusting it with funds.
        </p>
      </details>
    </section>
  );
}

/** "Yes" in red or amber by how much it can cost you; "No" in green. */
function Answer({ can, severity }: { can: boolean; severity: "warn" | "bad" }) {
  const style = !can ? "bg-buy-soft text-buy" : severity === "bad" ? "bg-sell-soft text-sell" : "bg-warn-soft text-warn";
  return (
    <span className={`mt-0.5 inline-flex h-7 w-12 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${style}`}>
      {can ? "Yes" : "No"}
    </span>
  );
}
