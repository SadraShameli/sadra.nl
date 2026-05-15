import { Calculator, ClipboardList, type LucideIcon, User } from 'lucide-react';
import Image from 'next/image';

import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import { homepageContent, siteContent } from '~/lib/content';
import { cn } from '~/lib/utils';

import AboutSection from './_components/About';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

export default function HomePage() {
    const resumeHref = siteContent.resumeUrl;
    const { gallery, heroImage } = homepageContent;

    return (
        <main className={'app-home'}>
            <section
                className={cn(
                    'app-home__hero',
                    'container grid-cols-2 grid-rows-2 items-center gap-5 pt-spacing lg:-mt-17 lg:grid lg:h-screen lg:grid-rows-none lg:gap-20',
                )}
            >
                <Image
                    alt=""
                    className={cn(
                        'app-home__hero-image',
                        'aspect-square rounded-2xl object-cover',
                    )}
                    height={800}
                    priority
                    src={heroImage}
                    width={800}
                />

                <div className="flex flex-col pt-spacing-inner lg:mt-0">
                    <h1 className="text-6xl font-semibold text-white lg:text-8xl lg:font-bold">
                        {homepageContent.heroTitle}
                    </h1>

                    <p className="mt-5 bg-gradient-neutral-anim text-lg font-semibold lg:mt-5 lg:text-xl">
                        {homepageContent.heroSubtitle}
                    </p>

                    <div className="mt-10 flex flex-wrap gap-2">
                        <HeroToolChip
                            href={resumeHref}
                            icon={User}
                            label={homepageContent.ctaLabel}
                        />
                        <HeroToolChip
                            href="/prop-calculator"
                            icon={Calculator}
                            label="Prop firm calculator"
                        />
                        <HeroToolChip
                            href="/trade-checklist"
                            icon={ClipboardList}
                            label="Trade checklist"
                        />
                    </div>
                </div>
            </section>

            <section
                className={cn('app-home__sensor-hub', 'container py-spacing')}
            >
                <SectionTitle text={homepageContent.sensorHubTitle} />

                <SectionDescription
                    text={homepageContent.sensorHubDescription}
                />

                <video
                    autoPlay
                    className={cn(
                        'app-home__sensor-hub-video',
                        'rounded-2xl pt-spacing-inner',
                    )}
                    loop
                    muted
                    playsInline
                >
                    <source
                        src={homepageContent.sensorHubVideo}
                        type="video/mp4"
                    />
                </video>
            </section>

            <section
                className={cn('app-home__recordings', 'container py-spacing')}
            >
                <SectionTitle text={homepageContent.recordingsTitle} />
                <SectionDescription
                    text={homepageContent.recordingsDescription}
                />
                <RecordingSection
                    decorVideoUrl={homepageContent.recordingDecorVideo}
                />
            </section>

            <section
                className={cn('app-home__readings', 'container py-spacing')}
            >
                <SectionTitle text={homepageContent.readingsTitle} />
                <SectionDescription
                    text={homepageContent.readingsDescription}
                />
                <ReadingSection />
            </section>

            <section className={cn('app-home__about', 'container pt-spacing')}>
                <SectionTitle text={homepageContent.aboutSectionTitle} />
                <AboutSection
                    gallery={gallery}
                    spotifyEmbedUrl={homepageContent.aboutSpotifyEmbedUrl}
                />
            </section>
        </main>
    );
}

function HeroToolChip({
    href,
    icon: Icon,
    label,
}: {
    href: string;
    icon: LucideIcon;
    label: string;
}) {
    return (
        <a
            className={cn(
                'app-home__cta-link',
                'group inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white no-underline transition hover:border-white/20 hover:bg-white/10 hover:text-white',
            )}
            href={href}
        >
            <Icon className="size-3.5 shrink-0" strokeWidth={2} />
            <span>{label}</span>
        </a>
    );
}
