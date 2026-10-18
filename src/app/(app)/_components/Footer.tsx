import { ArrowUpRight } from 'lucide-react';
import { cacheLife } from 'next/cache';
import Link from 'next/link';

import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import { SocialIcon } from '~/components/ui/social-icon';
import { homepageContent, siteContent, siteTools } from '~/lib/site/content';
import {
    FOOTER_SECTION_NUMBER,
    HOME_SECTIONS,
    homeSectionHref,
} from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { FooterSwitch } from './FooterSwitch';
import { FooterVariant } from './footerVariant';
import { EmphasisTitle } from './home/EmphasisTitle';
import { Marquee } from './home/Marquee';
import { NumberedEyebrow } from './home/NumberedEyebrow';
import { Watch } from './home/Watch';
import { SocialLinkButtons } from './SocialLinkButtons';

const FINE_PRINT = [
    { href: routes.legal.privacy, label: 'Privacy' },
    { href: routes.legal.terms, label: 'Terms' },
    { href: routes.contact, label: 'Contact' },
] as const;

const INDEX_LINK_CLASS =
    'flex items-baseline gap-3 text-ink-soft transition-[color,padding] duration-250 hover:pl-2 hover:text-camel focus-camel motion-reduce:transition-none';

const PHONE_FULL_WIDTH_COLUMN_CLASS = 'col-span-2 md:col-span-1';

enum FooterNavLabel {
    Elsewhere = 'Elsewhere',
    FinePrint = 'Fine print',
    Index = 'Index',
    Tools = 'Tools',
}

interface FooterYearProperties {
    readonly year: number;
}

export default async function Footer() {
    const year = await currentYear();

    return (
        <FooterSwitch
            variants={{
                [FooterVariant.Compact]: <CompactFooter year={year} />,
                [FooterVariant.Full]: <FullFooter year={year} />,
            }}
        />
    );
}

function CompactFooter({ year }: FooterYearProperties) {
    return (
        <footer className="app-shell__footer">
            <div className="mx-auto max-w-site px-6">
                <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-line-faint py-4 type-micro text-ink-muted">
                    <Copyright year={year} />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <nav
                            aria-label={FooterNavLabel.FinePrint}
                            className="flex flex-wrap items-center gap-x-6"
                        >
                            {FINE_PRINT.map((link) => (
                                <Link
                                    className="inline-flex h-11 items-center focus-camel transition-colors hover:text-camel motion-reduce:transition-none"
                                    href={link.href}
                                    key={link.href}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                        <nav
                            aria-label={FooterNavLabel.Elsewhere}
                            className="flex gap-1"
                        >
                            <SocialLinkButtons />
                        </nav>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function Copyright({ year }: FooterYearProperties) {
    return (
        <span>
            © {year} {siteContent.manifest.name}
        </span>
    );
}

async function currentYear(): Promise<number> {
    'use cache';
    cacheLife('days');
    return new Date().getFullYear();
}

function FooterHeading({ children }: { readonly children: string }) {
    return <span className="mb-2 type-micro text-ink-muted">{children}</span>;
}

function FullFooter({ year }: FooterYearProperties) {
    const { socialLinks } = siteContent;
    const {
        body,
        contactLabel,
        directMessageLabel,
        eyebrow,
        heading,
        madeBy,
        marquee,
    } = homepageContent.closing;
    const instagram = socialLinks.find(
        (profile) => profile.platform === 'instagram',
    );

    return (
        <footer
            className={cn(
                'app-shell__footer',
                'relative overflow-hidden border-t border-line-faint',
            )}
        >
            <div className="mx-auto flex max-w-site flex-wrap items-center justify-between gap-18 px-6 pt-24 pb-20 lg:pt-34 lg:pb-28">
                <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-8">
                    <NumberedEyebrow
                        label={eyebrow}
                        number={FOOTER_SECTION_NUMBER}
                        ruleClassName="max-w-40"
                    />
                    <ToolSectionHeading className="type-display-closing">
                        <EmphasisTitle heading={heading} />
                    </ToolSectionHeading>
                    <p className="m-0 max-w-115 type-body text-ink-muted">
                        {body}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Link
                            className="inline-flex h-14.5 items-center gap-3 rounded-full selected-pill px-7 text-base font-semibold focus-camel"
                            href={routes.contact}
                        >
                            {contactLabel}
                            <ArrowUpRight
                                aria-hidden
                                className="size-4.5"
                                strokeWidth={1.8}
                            />
                        </Link>
                        {instagram === undefined ? null : (
                            <Link
                                className="inline-flex h-14.5 items-center gap-3 rounded-full border border-line-strong px-6.5 text-base font-medium text-ink focus-camel transition-colors hover:border-line-hover hover:bg-surface-raised [&_svg]:size-4.5"
                                href={instagram.url}
                            >
                                <SocialIcon platform={instagram.platform} />
                                {directMessageLabel}
                            </Link>
                        )}
                    </div>
                </div>

                <Watch />
            </div>

            <div className="mx-auto max-w-site px-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-12 border-t border-line py-16 md:gap-x-12 lg:grid-cols-4">
                    <nav
                        aria-label={FooterNavLabel.Index}
                        className={cn(
                            PHONE_FULL_WIDTH_COLUMN_CLASS,
                            'flex flex-col gap-3',
                        )}
                    >
                        <FooterHeading>{FooterNavLabel.Index}</FooterHeading>
                        {HOME_SECTIONS.map((section) => (
                            <Link
                                className={cn(
                                    INDEX_LINK_CLASS,
                                    'type-display-item',
                                )}
                                href={homeSectionHref(section.id)}
                                key={section.id}
                            >
                                {section.indexLabel}
                            </Link>
                        ))}
                    </nav>

                    <nav
                        aria-label={FooterNavLabel.Tools}
                        className={cn(
                            PHONE_FULL_WIDTH_COLUMN_CLASS,
                            'flex flex-col gap-3',
                        )}
                    >
                        <FooterHeading>The desk</FooterHeading>
                        {siteTools.map((tool) => (
                            <Link
                                className={cn(
                                    INDEX_LINK_CLASS,
                                    'font-serif text-2xl italic',
                                )}
                                href={tool.href}
                                key={tool.ticker}
                            >
                                {tool.shortTitle}
                            </Link>
                        ))}
                    </nav>

                    <nav
                        aria-label={FooterNavLabel.Elsewhere}
                        className="flex flex-col gap-3"
                    >
                        <FooterHeading>
                            {FooterNavLabel.Elsewhere}
                        </FooterHeading>
                        {socialLinks.map((profile) => (
                            <Link
                                className={cn(
                                    INDEX_LINK_CLASS,
                                    'flex-col gap-0.5',
                                )}
                                href={profile.url}
                                key={profile.url}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {profile.title}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex flex-col gap-8">
                        <nav
                            aria-label={FooterNavLabel.FinePrint}
                            className="flex flex-col gap-3"
                        >
                            <FooterHeading>
                                {FooterNavLabel.FinePrint}
                            </FooterHeading>
                            {FINE_PRINT.map((link) => (
                                <Link
                                    className={cn(
                                        INDEX_LINK_CLASS,
                                        'text-base font-light',
                                    )}
                                    href={link.href}
                                    key={link.href}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-faint pt-6 pb-10 type-micro text-ink-muted">
                    <Copyright year={year} />
                    <span>{madeBy}</span>
                </div>
            </div>

            <Marquee words={marquee} />
        </footer>
    );
}
