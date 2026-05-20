import Link from 'next/link';

import { SocialIcon } from '~/components/ui/SocialIcon';
import { siteContent } from '~/lib/content';
import { routes } from '~/lib/routes';
import { cn } from '~/lib/utils';

type Column = {
    heading: string;
    links: { external?: boolean; href: string; label: string }[];
};

const columns: Column[] = [
    {
        heading: 'Tools',
        links: [
            { href: routes.resume, label: 'Resume' },
            { href: routes.propCalculator, label: 'Prop calculator' },
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

export default function Footer() {
    const { metaDescription, navBrand, socialLinks } = siteContent;
    const year = new Date().getFullYear();

    return (
        <footer
            className={cn(
                'app-shell__footer',
                'relative mt-32 border-t border-white/5 bg-linear-to-b from-black to-black/95',
            )}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/15 to-transparent"
            />
            <div className="container mx-auto px-6 pt-16 pb-8">
                <div className="grid gap-12 sm:grid-cols-[1.4fr_repeat(2,1fr)_auto]">
                    <div className="flex flex-col gap-4">
                        <Link
                            className="font-orbitron text-xl font-semibold tracking-widest text-white transition hover:opacity-70"
                            href={routes.home}
                        >
                            {navBrand}
                        </Link>
                        <p className="max-w-xs text-sm text-muted-foreground">
                            {metaDescription}.
                        </p>
                    </div>

                    {columns.map((col) => (
                        <nav
                            aria-label={col.heading}
                            className="flex flex-col gap-3"
                            key={col.heading}
                        >
                            <h2 className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                                {col.heading}
                            </h2>
                            <ul className="flex flex-col gap-2">
                                {col.links.map((link) => (
                                    <li key={link.href}>
                                        <Link
                                            className="text-sm text-white transition hover:opacity-60"
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
                        <h2 className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                            Connect
                        </h2>
                        <ul className="flex items-center gap-x-3">
                            {socialLinks.map((profile) => (
                                <li key={`${profile.platform}-${profile.url}`}>
                                    <Link
                                        aria-label={profile.platform}
                                        className="flex size-4 items-center justify-center text-white transition hover:opacity-60 [&_svg]:size-4"
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

                <div className="mt-12 border-t border-white/5 pt-6">
                    <p className="text-sm text-muted-foreground">
                        © {year} Sadra Shameli. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
