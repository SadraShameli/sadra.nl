import Link from 'next/link';

import RevealAnimation from '~/components/Animations/Reveal';
import StaggerAnimation from '~/components/Animations/Stagger';
import Resume from '~/data/Resume';

export default function SocialsSection() {
    return (
        <RevealAnimation>
            <>
                <h2 className='xl:text-7x pb-16 text-center text-4xl font-semibold text-white md:text-6xl'>Follow my socials</h2>

                <GenerateItems />
            </>
        </RevealAnimation>
    );
}

function GenerateItems() {
    return (
        <StaggerAnimation className='grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-7'>
            {Resume.basics.profiles.map((profile, index) => {
                return (
                    <div className='bg-gradient-card1 flex rounded-2xl px-5 text-white' key={index}>
                        <div className='pt-5'>
                            <Link href={profile.url}>
                                <button className='hover:btn-scale btn-transition absolute rounded-lg bg-emerald-950 bg-opacity-50 px-4 py-3 text-xs font-semibold tracking-wider text-emerald-400 saturate-50 hover:bg-emerald-600 hover:text-black'>
                                    {profile.title}
                                </button>
                            </Link>
                        </div>

                        <div className='md:py-18 mx-auto py-16'>
                            <Link href={profile.url}>
                                <div className='size-12 transition hover:opacity-50'>{profile.icon}</div>
                            </Link>
                        </div>
                    </div>
                );
            })}
        </StaggerAnimation>
    );
}
