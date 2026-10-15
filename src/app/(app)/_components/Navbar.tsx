'use client';

import Link from 'next/link';
import { type ReactNode, useRef } from 'react';

import { SocialIcon } from '~/components/ui/SocialIcon';
import { siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { useHeaderHeightVariable } from './useHeaderHeightVariable';

export default function Navbar({ accountLink }: { accountLink: ReactNode }) {
    const { navBrand, socialLinks } = siteContent;
    const navReference = useRef<HTMLElement>(null);
    useHeaderHeightVariable(navReference);

    return (
        <nav
            className={cn(
                'app-shell__navbar',
                'sticky inset-x-0 top-0 z-50 bg-black/75 backdrop-blur-2xl backdrop-saturate-200',
            )}
            ref={navReference}
        >
            <div className="container mx-auto flex items-center justify-between py-5">
                <div className="flex items-center gap-3">
                    <Link
                        className={cn(
                            'app-shell__brand',
                            'font-orbitron text-lg font-semibold tracking-widest text-white',
                        )}
                        href={routes.home}
                    >
                        {navBrand}
                    </Link>
                </div>

                <div className="flex items-center gap-x-3 text-white sm:gap-x-4 lg:gap-x-6">
                    {socialLinks.map((profile) => (
                        <Link
                            aria-label={profile.platform}
                            className={cn(
                                'app-shell__social-link',
                                'flex size-5 items-center justify-center transition hover:opacity-50',
                            )}
                            href={profile.url}
                            key={`${profile.platform}-${profile.url}`}
                        >
                            <SocialIcon platform={profile.platform} />
                        </Link>
                    ))}

                    {accountLink}
                </div>
            </div>
            <div className={'app-shell__subnav-slot'} id="navbar-subnav-slot" />
        </nav>
    );
}
