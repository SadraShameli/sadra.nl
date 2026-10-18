import parse from 'html-react-parser';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { PortfolioSectionView } from '~/lib/site/content';

import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utilities';

const PRESENT_DATE = /\bPresent\s*$/;

export default function PortfolioEntry({
    entry,
}: {
    readonly entry: PortfolioSectionView;
}) {
    const isCurrent = PRESENT_DATE.test(entry.date);

    return (
        <article
            className={cn(
                'app-portfolio__entry',
                'grid gap-x-12 gap-y-6 lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_22rem]',
            )}
        >
            <div className="flex flex-col items-start gap-2">
                <span className="type-micro text-ink-muted">{entry.date}</span>
                {entry.location ? (
                    entry.location.url ? (
                        <Link
                            className="text-sm text-ink-muted transition-colors hover:text-ink"
                            href={entry.location.url}
                            rel="noreferrer"
                            target="_blank"
                        >
                            {entry.location.title}
                        </Link>
                    ) : (
                        <span className="text-sm text-ink-muted">
                            {entry.location.title}
                        </span>
                    )
                ) : null}
                {isCurrent ? <Badge>Current</Badge> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <h3 className="m-0 type-display-title text-ink">
                        {entry.url ? (
                            <Link
                                className="group inline-flex items-center gap-2 transition-colors hover:text-camel"
                                href={entry.url}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {entry.title}
                                <ArrowUpRight
                                    aria-hidden
                                    className="size-5 text-ink-muted transition-colors group-hover:text-camel"
                                    strokeWidth={1.6}
                                />
                            </Link>
                        ) : (
                            entry.title
                        )}
                    </h3>
                    {entry.role ? (
                        <p className="m-0 text-base text-ink-muted">
                            {entry.role}
                        </p>
                    ) : null}
                </div>

                {entry.summary ? (
                    <p className="m-0 max-w-prose type-small text-ink-soft">
                        {parse(entry.summary)}
                    </p>
                ) : null}

                {entry.highlights?.length ? (
                    <ul className="m-0 flex max-w-prose list-none flex-col gap-2.5 p-0 type-small text-ink-soft">
                        {entry.highlights.map((highlight) => (
                            <li className="flex gap-3" key={highlight}>
                                <span
                                    aria-hidden
                                    className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-camel"
                                />
                                <span>{highlight}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}

                {entry.skills?.length ? (
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {entry.skills.map((skill) => (
                            <li key={skill}>
                                <Badge>{skill}</Badge>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>

            {entry.imageUrl ? (
                <Image
                    alt={`${entry.title} workspace`}
                    className="aspect-4/3 w-full rounded-lg border border-line object-cover lg:col-start-2 xl:col-start-3 xl:row-start-1"
                    height={600}
                    loading="lazy"
                    sizes="(min-width: 1280px) 22rem, (min-width: 1024px) 60vw, 100vw"
                    src={entry.imageUrl}
                    unoptimized
                    width={800}
                />
            ) : null}
        </article>
    );
}
