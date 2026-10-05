import Link from "next/link";

/** Small shared pieces used across pages. */

export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 pt-14 pb-10 md:grid-cols-2 md:gap-16">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="headline mt-3 text-4xl sm:text-5xl">{title}</h1>
      </div>
      {children && <div className="self-end leading-relaxed text-muted">{children}</div>}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="tabular mt-1 text-xl font-medium">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-lg font-medium">{title}</p>
      <p className="max-w-md text-muted">{body}</p>
      {action && (
        <Link href={action.href} className="pill pill-ink mt-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" className="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const tones = {
    neutral: "border border-line bg-panel text-muted",
    good: "bg-buy-soft text-buy",
    warn: "bg-warn-soft text-warn",
    bad: "bg-sell-soft text-sell",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-panel)] bg-surface ${className}`} aria-hidden />;
}
