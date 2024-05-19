import Link from 'next/link';

import Resume from '~/data/Resume';

export default function Navbar() {
    return (
        <nav className="fixed left-0 right-0 top-0 z-50 bg-black bg-opacity-75 shadow-2xl backdrop-blur-2xl backdrop-saturate-200">
            <div className="mx-auto flex max-w-content items-center justify-between px-6 py-5">
                <h2 className="font-orbitron text-lg font-semibold tracking-widest text-white">
                    &gt;_{Resume.basics.firstName.toLowerCase()}.
                </h2>

                <div className="flex items-center justify-between gap-x-4 text-white sm:gap-x-6">
                    {Resume.basics.profiles.map((profile, index) => {
                        return (
                            <Link
                                className="size-5 transition hover:opacity-50"
                                href={profile.url}
                                key={index}
                                aria-label={profile.title}
                            >
                                {profile.icon}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}
