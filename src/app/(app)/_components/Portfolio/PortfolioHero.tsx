import type { ReactNode } from 'react';

import { ArrowDownRight, FileText, Mail, Send } from 'lucide-react';
import Link from 'next/link';

import { EmphasisTitle } from '~/app/(app)/_components/home/EmphasisTitle';
import { Button } from '~/components/ui/button';
import {
    type EmphasisHeading,
    type PortfolioSection,
    portfolioSectionHref,
} from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const COUNT_DIGITS = 2;

export default function PortfolioHero({
    email,
    heading,
    headline,
    name,
    resumeLink,
    sections,
}: {
    readonly email: string;
    readonly heading: EmphasisHeading;
    readonly headline: string;
    readonly name: string;
    readonly resumeLink: ReactNode;
    readonly sections: readonly PortfolioSection[];
}) {
    return (
        <section
            className={cn(
                'app-portfolio__hero',
                'relative overflow-hidden lg:-mt-header',
            )}
        >
            <div className="relative mx-auto flex max-w-site flex-wrap items-end justify-between gap-14 px-6 pt-12 pb-20 lg:pt-44 lg:pb-28">
                <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
                    <div className="type-eyebrow text-camel">
                        Portfolio · {name}
                    </div>
                    <h1 className="m-0 type-display-hero text-ink">
                        <EmphasisTitle heading={heading} />
                    </h1>
                    <p className="m-0 max-w-xl type-lead text-ink-muted">
                        {headline}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button asChild size="lg">
                            <Link href={routes.contact}>
                                <Send aria-hidden className="size-4" />
                                Contact
                            </Link>
                        </Button>
                        {resumeLink}
                        <Button asChild size="icon-lg" variant="outline">
                            <Link
                                aria-label={`Email ${name}`}
                                href={`mailto:${email}`}
                            >
                                <Mail aria-hidden className="size-4" />
                            </Link>
                        </Button>
                    </div>
                </div>

                <nav
                    aria-label="On this page"
                    className="w-full max-w-sm flex-[1_1_320px]"
                >
                    <ol className="m-0 flex list-none flex-col border-t border-line p-0">
                        {sections.map((section) => (
                            <li key={section.id}>
                                <Link
                                    className="group flex items-center gap-4 border-b border-line py-4 text-ink focus-camel transition-colors hover:text-camel"
                                    href={portfolioSectionHref(section.id)}
                                >
                                    <span className="type-eyebrow text-camel">
                                        {section.number}
                                    </span>
                                    <span className="flex-1 type-small font-medium">
                                        {section.eyebrow}
                                    </span>
                                    <span className="type-micro text-ink-muted tabular-nums">
                                        {String(
                                            section.entries.length,
                                        ).padStart(COUNT_DIGITS, '0')}
                                    </span>
                                    <ArrowDownRight
                                        aria-hidden
                                        className="size-4 text-ink-muted transition-colors group-hover:text-camel"
                                        strokeWidth={1.6}
                                    />
                                </Link>
                            </li>
                        ))}
                    </ol>
                </nav>
            </div>
        </section>
    );
}

export function ResumeLinkButton() {
    return (
        <Button asChild size="lg" variant="outline">
            <Link href={routes.resume.index}>
                <FileText aria-hidden className="size-4" />
                Resume
            </Link>
        </Button>
    );
}
