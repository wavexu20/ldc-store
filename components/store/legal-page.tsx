import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type LegalSection = {
  title: string;
  paragraphs: string[];
};

export function LegalPage({ title, intro, updated, sections, backLabel }: { title: string; intro: string; updated: string; sections: LegalSection[]; backLabel: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>
      <article className="mt-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-9">
        <header className="border-b pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{intro}</p>
          <p className="mt-3 text-xs text-muted-foreground">{updated}</p>
        </header>
        <div className="mt-7 space-y-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-semibold">{section.title}</h2>
              <div className="mt-2 space-y-2 text-sm leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
