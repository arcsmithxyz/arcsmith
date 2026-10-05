import Link from "next/link";
import { DOC_PAGES, docHref, docPage } from "@/lib/docs";
import { DOC_CONTENT } from "./content";

/** One docs page: title, lede, content, then previous / next. */
export function DocArticle({ slug }: { slug: string }) {
  const page = docPage(slug);
  const Content = DOC_CONTENT[slug];
  if (!page || !Content) return null;
  const index = DOC_PAGES.findIndex((p) => p.slug === slug);
  const prev = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];

  return (
    <article data-doc-article className="max-w-3xl">
      <p className="chip text-ink">Docs</p>
      <h1 className="headline mt-5 text-4xl text-ink sm:text-5xl">{page.title}</h1>
      <p className="mt-4 font-serif text-xl leading-relaxed text-muted">{page.description}</p>
      <div className="mt-2">
        <Content />
      </div>
      <nav aria-label="More docs" className="mt-16 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
        {prev ? (
          <Link href={docHref(prev.slug)} className="rounded-2xl border border-line p-4 transition-colors hover:border-ink/30">
            <span className="text-xs text-subtle">Previous</span>
            <span className="mt-1 block font-medium text-ink">← {prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={docHref(next.slug)} className="rounded-2xl border border-line p-4 text-right transition-colors hover:border-ink/30">
            <span className="text-xs text-subtle">Next</span>
            <span className="mt-1 block font-medium text-ink">{next.title} →</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
