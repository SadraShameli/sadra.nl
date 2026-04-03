import Link from 'next/link';

import GithubIcon from '~/components/ui/Icons/Github';
import InstagramIcon from '~/components/ui/Icons/Instagram';
import WhatsAppIcon from '~/components/ui/Icons/WhatsApp';
import YoutubeIcon from '~/components/ui/Icons/Youtube';
import type { Site } from '~/payload-types';

function SocialIcon({ platform }: { platform: string }) {
    switch (platform) {
        case 'youtube':
            return <YoutubeIcon />;
        case 'github':
            return <GithubIcon />;
        case 'whatsapp':
            return <WhatsAppIcon />;
        case 'instagram':
            return <InstagramIcon />;
        case 'linkedin':
            return (
                <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                >
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            );
        default:
            return null;
    }
}

export default function Navbar({ site }: { site: Site }) {
    const links = site.socialLinks ?? [];

    return (
        <nav className="sticky top-0 right-0 left-0 z-50 bg-black/75 backdrop-blur-2xl backdrop-saturate-200">
            <div className="container mx-auto flex items-center justify-between py-5">
                <Link
                    className="font-orbitron text-lg font-semibold tracking-widest text-white"
                    href="/"
                >
                    {site.navBrand}
                </Link>

                <div className="flex items-center justify-between gap-x-4 text-white lg:gap-x-6">
                    {links.map((profile) => (
                        <Link
                            className="flex size-5 items-center justify-center transition hover:opacity-50"
                            key={`${profile.platform}-${profile.url}`}
                            href={profile.url}
                            aria-label={profile.platform}
                        >
                            <SocialIcon platform={profile.platform} />
                        </Link>
                    ))}
                </div>
            </div>
        </nav>
    );
}
