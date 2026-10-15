import { type Route } from 'next';
import { cacheLife } from 'next/cache';
import Link from 'next/link';

import Eyebrow from '~/components/Eyebrow';
import { SocialIcon } from '~/components/ui/SocialIcon';
import { siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

type Column = {
    heading: string;
    links: { external?: boolean; href: Route; label: string }[];
};

const columns: Column[] = [
    {
        heading: 'Tools',
        links: [
            { href: routes.portfolio, label: 'Portfolio' },
            { href: routes.propCalculator.index, label: 'Prop calculator' },
            { href: routes.tradeChecklist.index, label: 'Trade checklist' },
        ],
    },
    {
        heading: 'Site',
        links: [
            { href: routes.contact, label: 'Contact' },
            { href: routes.legal.privacy, label: 'Privacy' },
            { href: routes.legal.terms, label: 'Terms' },
        ],
    },
];

export default async function Footer() {
    const { metaDescription, navBrand, socialLinks } = siteContent;
    const year = await currentYear();

    return (
        <footer
            className={cn(
                'app-shell__footer',
                'relative mt-24 border-t border-border/60 bg-linear-to-b from-background to-background/95',
            )}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/15 to-transparent"
            />
            <div className="container mx-auto px-6 pt-16 pb-8">
                <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(2,1fr)_auto] md:gap-12">
                    <div className="flex flex-col gap-4">
                        <Link
                            className="font-orbitron text-xl font-semibold tracking-widest text-foreground transition hover:opacity-70"
                            href={routes.home}
                        >
                            {navBrand}
                        </Link>
                        <p className="text-sm text-muted-foreground md:max-w-xs">
                            {metaDescription}.
                        </p>
                    </div>

                    {columns.map((col) => (
                        <nav
                            aria-label={col.heading}
                            className="flex flex-col gap-3"
                            key={col.heading}
                        >
                            <Eyebrow as="h2">{col.heading}</Eyebrow>
                            <ul className="flex flex-col gap-2">
                                {col.links.map((link) => (
                                    <li key={link.href}>
                                        <Link
                                            className="text-sm text-foreground transition hover:opacity-60"
                                            href={link.href}
                                        >
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}

                    <div className="flex flex-col gap-3">
                        <Eyebrow as="h2">Connect</Eyebrow>
                        <ul className="flex items-center gap-x-3">
                            {socialLinks.map((profile) => (
                                <li key={`${profile.platform}-${profile.url}`}>
                                    <Link
                                        aria-label={profile.platform}
                                        className="flex size-4 items-center justify-center text-foreground transition hover:opacity-60 [&_svg]:size-4"
                                        href={profile.url}
                                        rel="noreferrer"
                                        target="_blank"
                                    >
                                        <SocialIcon
                                            platform={profile.platform}
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-12 border-t border-border/60 pt-6">
                    <p className="text-sm text-muted-foreground">
                        © {year} Sadra Shameli. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}

async function currentYear(): Promise<number> {
    'use cache';
    cacheLife('days');
    return new Date().getFullYear();
}
