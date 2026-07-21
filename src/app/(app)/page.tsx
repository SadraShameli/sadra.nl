import { ArrowUpRight } from 'lucide-react';
import { type Metadata } from 'next';
import Image from 'next/image';

import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import { Badge } from '~/components/ui/Badge';
import { homepageContent, siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import AboutSection from './_components/About';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

export const metadata: Metadata = {
    alternates: { canonical: routes.home },
    description: siteContent.metaDescription,
    openGraph: {
        description: siteContent.metaDescription,
        siteName: 'sadra.nl',
        title: siteContent.metaTitle,
        type: 'website',
        url: routes.home,
    },
    title: siteContent.metaTitle,
    twitter: {
        card: 'summary_large_image',
        description: siteContent.metaDescription,
        title: siteContent.metaTitle,
    },
};

export default async function HomePage() {
    const { gallery, heroImage } = homepageContent;
    return (
        <main className={'app-home'}>
            <section
                className={cn(
                    'app-home__hero',
                    'container pt-spacing lg:-mt-17 lg:grid lg:h-screen lg:grid-cols-2 lg:items-center lg:gap-20',
                )}
            >
                <Image
                    alt="Sadra Shameli - daytrader and developer"
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
                    <h1 className="font-orbitron text-5xl font-semibold text-white sm:text-6xl lg:text-8xl lg:font-bold">
                        {homepageContent.heroTitle}
                    </h1>

                    <p className="mt-5 bg-gradient-neutral-anim text-lg font-semibold lg:mt-5 lg:text-xl">
                        {homepageContent.heroSubtitle}
                    </p>

                    <div className="mt-18 flex flex-col items-start gap-1">
                        <HeroToolChip
                            href={routes.portfolio}
                            label={homepageContent.ctaLabel}
                        />
                        <HeroToolChip
                            href={routes.propCalculator}
                            label="Prop firm calculator"
                        />
                        <HeroToolChip
                            href={routes.tradeChecklist.index}
                            label="Trade checklist"
                        />
                        <HeroToolChip
                            href={routes.lifting.index}
                            label="Lifting tracker"
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
                <AboutSection gallery={gallery} />
            </section>
        </main>
    );
}

function HeroToolChip({ href, label }: { href: string; label: string }) {
    return (
        <Badge
            asChild
            className={cn(
                'app-home__cta-link',
                'group gap-1 border-white/10 bg-transparent px-3 py-1 text-xs font-medium text-neutral-400 transition hover:border-white/25 hover:bg-white/4 hover:text-white',
            )}
            variant="outline"
        >
            <a href={href}>
                <span>{label}</span>
                <ArrowUpRight className="size-3 shrink-0 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
            </a>
        </Badge>
    );
}
