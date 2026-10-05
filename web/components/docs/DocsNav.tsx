"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOC_GROUPS, docHref } from "@/lib/docs";

function NavList({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Docs" className="flex flex-col gap-6">
      {DOC_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">{group.title}</p>
          <ul className="flex flex-col gap-0.5 border-l border-line">
            {group.pages.map((page) => {
              const href = docHref(page.slug);
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px block border-l py-1.5 pl-4 text-[0.9375rem] transition-colors duration-200 ${
                      active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:border-ink/30 hover:text-ink"
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Sidebar on wide screens; a collapsible menu above the page on narrow ones. */
export function DocsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openFor, setOpenFor] = useState(pathname);
  // Close the mobile menu after navigating.
  if (openFor !== pathname) {
    setOpenFor(pathname);
    setOpen(false);
  }

  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pb-10">
          <NavList pathname={pathname} />
        </div>
      </aside>
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 font-medium"
        >
          Docs menu
          <span aria-hidden className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
            ⌄
          </span>
        </button>
        {open && (
          <div className="mt-3 rounded-2xl border border-line bg-panel p-5">
            <NavList pathname={pathname} />
          </div>
        )}
      </div>
    </>
  );
}

/** "On this page": the current article's section headings, highlighting the one in view. */
export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-100px 0px -65% 0px" },
    );
    // Read the headings once the new page has rendered.
    const frame = requestAnimationFrame(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>("[data-doc-article] h2[id]")];
      setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent?.replace(/#$/, "").trim() ?? "" })));
      nodes.forEach((n) => observer.observe(n));
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  if (headings.length === 0) return null;
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-28">
        <p className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">On this page</p>
        <ul className="flex flex-col gap-2 text-sm">
          {headings.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`} className={`transition-colors duration-200 ${active === h.id ? "text-ink" : "text-muted hover:text-ink"}`}>
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
