import { DocsNav, DocsToc } from "@/components/docs/DocsNav";

/** GitBook-style frame: sidebar, article, and an "On this page" list on wide screens. */
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div className="grid gap-8 py-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[230px_minmax(0,1fr)_190px]">
        <DocsNav />
        <div className="min-w-0">{children}</div>
        <DocsToc />
      </div>
    </div>
  );
}
