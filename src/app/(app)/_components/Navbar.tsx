'use client';

import { User } from 'lucide-react';
import { type Session } from 'next-auth';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { SocialIcon } from '~/components/ui/SocialIcon';
import { siteContent } from '~/lib/content';
import { routes } from '~/lib/routes';
import { cn } from '~/lib/utils';

import BrandTypewriter from './brand/BrandTypewriter';

export default function Navbar({ session }: { session: null | Session }) {
    const { navBrand, socialLinks } = siteContent;
    const [, setGlitchTrigger] = useState(0);

    const handleTransition = useCallback(() => {
        setGlitchTrigger((n) => n + 1);
    }, []);

    return (
        <nav
            className={cn(
                'app-shell__navbar',
                'sticky top-0 right-0 left-0 z-50 bg-black/75 backdrop-blur-2xl backdrop-saturate-200',
            )}
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
                    <BrandTypewriter onTransition={handleTransition} />
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

                    <Link
                        aria-label={session?.user ? 'Profile' : 'Sign in'}
                        className={cn(
                            'app-shell__account-link',
                            'flex size-5 items-center justify-center text-white transition hover:opacity-60',
                        )}
                        href={
                            session?.user ? routes.profile : routes.auth.login
                        }
                    >
                        <User className="size-5" strokeWidth={1.75} />
                    </Link>
                </div>
            </div>
            <div className={'app-shell__subnav-slot'} id="navbar-subnav-slot" />
        </nav>
    );
}
