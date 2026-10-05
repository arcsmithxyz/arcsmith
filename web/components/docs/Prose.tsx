import Link from "next/link";

/**
 * Building blocks for docs pages, in the site's type system: Geist headings, serif reading
 * text. Section headings carry ids so the "On this page" list and anchor links work.
 */

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="group headline mt-14 scroll-mt-28 text-3xl text-ink">
      <a href={`#${id}`}>
        {children}
        <span aria-hidden className="ml-2 text-subtle opacity-0 transition-opacity group-hover:opacity-100">
          #
        </span>
      </a>
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 text-xl font-medium text-ink">{children}</h3>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 font-serif text-lg leading-relaxed text-text/85">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-4 flex list-disc flex-col gap-2 pl-6 font-serif text-lg leading-relaxed text-text/85 marker:text-subtle">{children}</ul>;
}

export function OL({ children }: { children: React.ReactNode }) {
  return <ol className="mt-4 flex list-decimal flex-col gap-2 pl-6 font-serif text-lg leading-relaxed text-text/85 marker:text-subtle">{children}</ol>;
}

/** Inline code. */
export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <figure className="mt-6 overflow-hidden rounded-2xl bg-ink text-on-ink">
      {label && <figcaption className="border-b border-white/10 px-5 py-2 font-mono text-xs text-on-ink/60">{label}</figcaption>}
      <pre className="overflow-x-auto p-5 font-mono text-sm leading-relaxed">
        <code>{code.trim()}</code>
      </pre>
    </figure>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children: React.ReactNode }) {
  const styles = tone === "warn" ? "border-warn/25 bg-warn-soft/60" : "border-validator/20 bg-sky/20";
  return (
    <aside className={`mt-6 rounded-2xl border p-5 ${styles}`}>
      <p className="font-medium text-ink">{title}</p>
      <div className="mt-1 font-serif leading-relaxed text-text/85">{children}</div>
    </aside>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[520px] text-left">
        <thead className="bg-surface">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-sm font-medium text-ink">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 font-serif text-text/85">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Numbered steps with the number in a circle. */
export function Steps({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="mt-6 flex flex-col gap-5">
      {items.map((item, i) => (
        <li key={item.title} className="grid grid-cols-[2.25rem_1fr] gap-4">
          <span className="tabular grid size-9 place-items-center rounded-full border border-ink/25 font-serif text-ink">{i + 1}</span>
          <div>
            <p className="text-lg font-medium text-ink">{item.title}</p>
            <div className="mt-1 font-serif leading-relaxed text-text/85">{item.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CardLinks({ items }: { items: { href: string; title: string; body: string }[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group rounded-2xl border border-line bg-panel p-5 transition-[border-color,translate] duration-300 ease-spring hover:-translate-y-0.5 hover:border-ink/30"
        >
          <p className="font-medium text-ink">
            {item.title} <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
          </p>
          <p className="mt-1 font-serif text-sm leading-relaxed text-muted">{item.body}</p>
        </Link>
      ))}
    </div>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-validator underline underline-offset-4 hover:text-ink">
      {children}
    </a>
  ) : (
    <Link href={href} className="text-validator underline underline-offset-4 hover:text-ink">
      {children}
    </Link>
  );
}
