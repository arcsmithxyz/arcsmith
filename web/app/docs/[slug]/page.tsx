import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/docs/DocArticle";
import { DOC_PAGES, docPage } from "@/lib/docs";

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const page = docPage(slug);
  return page ? { title: `${page.title} · Docs`, description: page.description } : {};
}

export default async function DocPageRoute(props: PageProps<"/docs/[slug]">) {
  const { slug } = await props.params;
  if (!slug || !docPage(slug)) notFound();
  return <DocArticle slug={slug} />;
}
