import Link from 'next/link';
import resumeSadra from '~/data/Resume/Sadra';

export default function Navbar() {
    return (
        <nav className="sticky left-0 right-0 top-0 z-50 bg-black bg-opacity-75 backdrop-blur-2xl backdrop-saturate-200">
            <div className="container mx-auto flex items-center justify-between py-5">
                <Link
                    className="font-orbitron text-lg font-semibold tracking-widest text-white"
                    href="/"
                >
                    _{resumeSadra.basics.firstName.toLowerCase()}
                </Link>

                <div className="flex items-center justify-between gap-x-4 text-white lg:gap-x-6">
                    {resumeSadra.profiles.map((profile, index) => {
                        return (
                            <Link
                                className="size-5 transition hover:opacity-50"
                                key={index}
                                href={profile.url}
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
