"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_NAME } from "@/lib/config";
import { ContractAddress } from "./ContractAddress";
import { HookSearchDialog } from "./HookSearchDialog";
import { WalletButton } from "./WalletButton";
import { XLink } from "./XLink";

const NAV = [
  { href: "/discover", label: "Discover" },
  { href: "/blocks", label: "Blocks" },
  { href: "/hooks", label: "Hook reader" },
  { href: "/analytics", label: "Analytics" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/docs", label: "Docs" },
];

/**
 * Floating glass bar that stays on screen while you scroll, and switches to light text over
 * sections marked `data-nav-theme="dark"`. Below the `lg` breakpoint the links move into a
 * full-screen menu.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Whether the page has scrolled at all (for the glass background), read once per frame.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 12);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Which band sits under the bar: watch a thin strip where the header is.
  useEffect(() => {
    const sections = document.querySelectorAll("[data-nav-theme='dark']");
    const under = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) under.add(entry.target);
          else under.delete(entry.target);
        }
        setDark(under.size > 0);
      },
      { rootMargin: `-36px 0px -${Math.max(window.innerHeight - 40, 0)}px 0px` },
    );
    sections.forEach((s) => observer.observe(s));
    return () => {
      observer.disconnect();
      setDark(false);
    };
  }, [pathname]);

  // The menu closes on navigation and with Escape, and freezes the page behind it.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [menuOpen]);

  const onDark = dark && !menuOpen;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="px-4 pt-3 sm:px-6">
        <div
          // Transparent over the top of the page, a soft glass bar once you scroll.
          className={`pointer-events-auto relative mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 rounded-2xl border pr-2 pl-4 transition-[background-color,border-color,color,backdrop-filter] duration-500 ease-spring ${
            onDark
              ? "border-white/15 bg-white/8 text-on-ink backdrop-blur-lg"
              : scrolled || menuOpen
                ? "border-ink/8 bg-bg/75 text-text backdrop-blur-lg"
                : "border-transparent bg-transparent text-text"
          }`}
        >
          <Link
            href="/"
            className="flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-validator"
          >
            {/* The navy logo turns white over dark sections. */}
            <Image
              src="/art/arcsmith-white.png"
              alt={APP_NAME}
              width={799}
              height={166}
              unoptimized
              priority
              className={`h-7 w-auto transition-[filter] duration-500 ease-spring sm:h-8 ${onDark ? "brightness-0 invert" : ""}`}
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,opacity] duration-300 ease-spring focus-visible:outline-2 focus-visible:outline-validator ${
                    onDark ? "hover:bg-white/10" : "hover:bg-ink/6"
                  } ${active ? (onDark ? "bg-white/12" : "bg-ink/8") : "opacity-80 hover:opacity-100"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <HookSearchDialog className={onDark ? "hover:bg-white/10" : "hover:bg-ink/6"} />
            <XLink />
            {/* Launching is the main action; the wallet button stays quiet beside it. */}
            <WalletButton tone="quiet" />
            <Link href="/build" className={`pill pill-sm ${onDark ? "pill-light" : "pill-ink"}`}>
              Launch token
            </Link>
          </div>

          <HookSearchDialog className={`ml-auto lg:hidden ${onDark ? "hover:bg-white/10" : "hover:bg-ink/6"}`} />
          <button
            type="button"
            className={`relative grid size-11 place-items-center rounded-xl transition-colors duration-300 lg:hidden ${
              onDark ? "hover:bg-white/10" : "hover:bg-ink/6"
            }`}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {/* Two lines that rotate into an X. */}
            <span
              aria-hidden
              className={`absolute h-0.5 w-5 rounded-full bg-current transition-transform duration-500 ease-spring ${
                menuOpen ? "rotate-45" : "-translate-y-1"
              }`}
            />
            <span
              aria-hidden
              className={`absolute h-0.5 w-5 rounded-full bg-current transition-transform duration-500 ease-spring ${
                menuOpen ? "-rotate-45" : "translate-y-1"
              }`}
            />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} pathname={pathname} />
    </header>
  );
}

function MobileMenu({ open, pathname }: { open: boolean; pathname: string }) {
  const items = [{ href: "/build", label: "Launch token" }, ...NAV];
  return (
    <div
      id="site-menu"
      className={`fixed inset-0 -z-10 flex flex-col bg-bg/85 px-6 pt-28 pb-10 backdrop-blur-3xl transition-[opacity,visibility] duration-500 ease-spring lg:hidden ${
        open ? "pointer-events-auto visible opacity-100" : "invisible opacity-0"
      }`}
    >
      <nav aria-label="Main" className="flex flex-col gap-2">
        {items.map((item, i) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              tabIndex={open ? undefined : -1}
              style={{ transitionDelay: open ? `${100 + i * 50}ms` : "0ms" }}
              className={`headline text-5xl transition-[translate,opacity] duration-700 ease-spring ${
                open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
              } ${active ? "text-validator" : "text-text"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div
        style={{ transitionDelay: open ? "400ms" : "0ms" }}
        className={`mt-auto flex flex-col gap-4 transition-[translate,opacity] duration-700 ease-spring ${
          open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 text-ink">
          <ContractAddress />
          <XLink className="border border-current/20" />
        </div>
        <WalletButton size="lg" className="w-full" />
      </div>
    </div>
  );
}
