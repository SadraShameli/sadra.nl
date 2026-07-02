import parse from 'html-react-parser';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { PortfolioSectionView } from '~/lib/site/content';

import { cn } from '~/lib/utils';

import SkillChip from './SkillChip';

type PortfolioEntryProperties = {
    entry: PortfolioSectionView;
};

const PRESENT_DATE = /\bPresent\s*$/;

export default function PortfolioEntry({ entry }: PortfolioEntryProperties) {
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
                    'flex flex-col gap-y-1 text-sm leading-tight text-neutral-400 md:pt-1',
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
                                'inline-flex min-h-11 w-fit items-center transition hover:text-neutral-200 md:min-h-0',
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
                                    'group inline-flex min-h-11 items-center gap-1 text-xl leading-tight font-semibold text-white transition md:min-h-0',
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
                                    className="size-4 text-neutral-400 transition group-hover:text-white"
                                />
                            </Link>
                        ) : (
                            <h3 className="text-xl leading-tight font-semibold text-white">
                                {entry.title}
                            </h3>
                        )}

                        {entry.role ? (
                            <span className="inline-flex items-center gap-2 text-base text-neutral-300">
                                <span
                                    aria-hidden="true"
                                    className="text-neutral-600"
                                >
                                    /
                                </span>
                                <span>{entry.role}</span>
                                {isCurrent ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="relative inline-flex size-2 items-center justify-center">
                                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
                                            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
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
                        height={500}
                        loading="lazy"
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
                            'max-w-prose text-[0.9375rem] leading-relaxed text-neutral-200',
                        )}
                    >
                        {parse(entry.summary)}
                    </p>
                ) : null}

                {entry.highlights?.length ? (
                    <ul
                        className={cn(
                            'app-portfolio__entry-highlights',
                            'flex flex-col gap-y-2 text-[0.9375rem] leading-relaxed text-neutral-200',
                        )}
                    >
                        {entry.highlights.map((highlight, index) => (
                            <li
                                className="flex max-w-prose gap-x-3"
                                key={`${index}-${highlight}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="mt-[0.55em] inline-block size-1 shrink-0 rounded-full bg-neutral-500"
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
                            'flex flex-wrap gap-x-1.5 gap-y-1.5',
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
