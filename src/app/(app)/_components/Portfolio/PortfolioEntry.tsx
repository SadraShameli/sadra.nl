import parse from 'html-react-parser';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { PortfolioSectionView } from '~/lib/site/content';

import { cn } from '~/lib/utilities';

import SkillChip from './SkillChip';

type PortfolioEntryProperties = {
    entry: PortfolioSectionView;
    isLeadImage: boolean;
};

const PRESENT_DATE = /\bPresent\s*$/;

export default function PortfolioEntry({
    entry,
    isLeadImage,
}: PortfolioEntryProperties) {
    const isCurrent = PRESENT_DATE.test(entry.date);
    const alt = `${entry.title} workspace`;

    return (
        <article
            className={cn(
                'app-portfolio__entry',
                'grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-[10rem_1fr] lg:grid-cols-[12rem_1fr]',
            )}
        >
            <div
                className={cn(
                    'app-portfolio__entry-meta',
                    'flex flex-col gap-y-1 text-sm/tight text-muted-foreground md:pt-1',
                )}
            >
                <span className="app-portfolio__entry-date tabular-nums">
                    {entry.date}
                </span>
                {entry.location ? (
                    entry.location.url ? (
                        <Link
                            className={cn(
                                'app-portfolio__entry-location',
                                'inline-flex min-h-11 w-fit items-center transition hover:text-foreground/90 md:min-h-0',
                            )}
                            href={entry.location.url}
                            rel="noreferrer"
                            target="_blank"
                        >
                            {entry.location.title}
                        </Link>
                    ) : (
                        <span className="app-portfolio__entry-location">
                            {entry.location.title}
                        </span>
                    )
                ) : null}
            </div>

            <div className="app-portfolio__entry-body flex flex-col gap-y-5">
                <div className="flex flex-col gap-x-6 gap-y-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {entry.url ? (
                            <Link
                                className={cn(
                                    'app-portfolio__entry-title-link',
                                    'group inline-flex min-h-11 items-center gap-1 text-xl/tight font-semibold text-foreground transition md:min-h-0',
                                )}
                                href={entry.url}
                                rel="noreferrer"
                                target="_blank"
                            >
                                <span className="border-b border-dashed border-transparent transition group-hover:border-current">
                                    {entry.title}
                                </span>
                                <ArrowUpRight
                                    aria-hidden="true"
                                    className="size-4 text-muted-foreground transition group-hover:text-foreground"
                                />
                            </Link>
                        ) : (
                            <h3 className="text-xl/tight font-semibold text-foreground">
                                {entry.title}
                            </h3>
                        )}

                        {entry.role ? (
                            <span className="inline-flex items-center gap-2 text-base text-foreground/80">
                                <span
                                    aria-hidden="true"
                                    className="text-muted-foreground/50"
                                >
                                    /
                                </span>
                                <span>{entry.role}</span>
                                {isCurrent ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="relative inline-flex size-2 items-center justify-center">
                                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/70" />
                                            <span className="relative inline-flex size-2 rounded-full bg-success" />
                                        </span>
                                        <span className="sr-only">
                                            Current role
                                        </span>
                                    </span>
                                ) : null}
                            </span>
                        ) : null}
                    </div>
                </div>

                {entry.imageUrl ? (
                    <Image
                        alt={alt}
                        className={cn(
                            'app-portfolio__entry-image',
                            'aspect-16/10 w-full max-w-md rounded-xl object-cover',
                        )}
                        decoding="async"
                        fetchPriority={isLeadImage ? 'high' : 'auto'}
                        height={500}
                        loading={isLeadImage ? 'eager' : 'lazy'}
                        sizes="(min-width: 1024px) 28rem, 100vw"
                        src={entry.imageUrl}
                        unoptimized
                        width={800}
                    />
                ) : null}

                {entry.summary ? (
                    <p
                        className={cn(
                            'app-portfolio__entry-summary',
                            'max-w-prose text-[0.9375rem] leading-relaxed text-foreground/90',
                        )}
                    >
                        {parse(entry.summary)}
                    </p>
                ) : null}

                {entry.highlights?.length ? (
                    <ul
                        className={cn(
                            'app-portfolio__entry-highlights',
                            'flex flex-col gap-y-2 text-[0.9375rem] leading-relaxed text-foreground/90',
                        )}
                    >
                        {entry.highlights.map((highlight, index) => (
                            <li
                                className="flex max-w-prose gap-x-3"
                                key={`${index}-${highlight}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="mt-[0.55em] inline-block size-1 shrink-0 rounded-full bg-muted-foreground/70"
                                />
                                <span>{highlight}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}

                {entry.skills?.length ? (
                    <ul
                        className={cn(
                            'app-portfolio__entry-skills',
                            'flex flex-wrap gap-1.5',
                        )}
                    >
                        {entry.skills.map((skill, index) => (
                            <SkillChip
                                key={`${index}-${skill}`}
                                label={skill}
                            />
                        ))}
                    </ul>
                ) : null}
            </div>
        </article>
    );
}
