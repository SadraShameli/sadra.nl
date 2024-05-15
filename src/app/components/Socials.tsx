import Link from 'next/link';

import RevealAnimation from '~/components/Animations/Reveal';
import StaggerAnimation from '~/components/Animations/Stagger';
import Resume from '~/data/Resume';

import SectionTitle from './SectionTitle';

export default function SocialsSection() {
    return (
        <>
            <SectionTitle text='Follow my socials' />
            <GenerateItems />
        </>
    );
}

function GenerateItems() {
    return (
        <RevealAnimation>
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
                                <Link href={profile.url} aria-label={profile.title}>
                                    <div className='size-12 transition hover:opacity-50'>{profile.icon}</div>
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </StaggerAnimation>
        </RevealAnimation>
    );
}
