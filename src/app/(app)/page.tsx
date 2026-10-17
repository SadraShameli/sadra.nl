import { type Metadata } from 'next';
import { Suspense } from 'react';

import { PageTransition } from '~/components/PageTransition';
import { homepageContent, siteContent } from '~/lib/site/content';
import { HomeSectionId } from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { AboutSection } from './_components/home/AboutSection';
import { SectionHeading } from './_components/home/EmphasisTitle';
import { HeroIntro } from './_components/home/HeroIntro';
import {
    HomeSectionShell,
    SectionTone,
} from './_components/home/HomeSectionShell';
import {
    OwnerHeroCollage,
    PlaceholderHeroCollage,
} from './_components/home/OwnerHeroCollage';
import { SensorHubSection } from './_components/home/SensorHubSection';
import { ToolsWatchlist } from './_components/home/ToolsWatchlist';
import ReadingSection from './_components/Reading/Reading';
import ReadingSkeleton from './_components/Reading/ReadingSkeleton';
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

export const ensureStatic = 'prefetch';

export default function HomePage() {
    const { live, recordings, tools } = homepageContent;
    return (
        <PageTransition>
            <main className={'app-home'}>
                <section
                    className={cn(
                        'app-home__hero',
                        'relative overflow-hidden glow-corner lg:-mt-header',
                    )}
                >
                    <div className="relative mx-auto flex max-w-site flex-wrap items-center gap-14 px-6 pt-12 pb-20 lg:pt-37 lg:pb-32">
                        <HeroIntro />
                        <Suspense fallback={<PlaceholderHeroCollage />}>
                            <OwnerHeroCollage />
                        </Suspense>
                    </div>
                </section>

                <HomeSectionShell
                    id={HomeSectionId.Tools}
                    tone={SectionTone.Alternate}
                >
                    <SectionHeading
                        className="max-w-205 text-[clamp(42px,5.6vw,80px)] leading-none"
                        heading={tools.heading}
                    />
                    <ToolsWatchlist />
                </HomeSectionShell>

                <SensorHubSection />

                <HomeSectionShell
                    className="gap-10"
                    id={HomeSectionId.Live}
                    tone={SectionTone.Ground}
                >
                    <div className="flex flex-wrap items-end justify-between gap-6">
                        <SectionHeading heading={live.heading} />
                        <p className="m-0 max-w-110 type-body text-ink-muted">
                            {live.body}
                        </p>
                    </div>
                    <Suspense fallback={<ReadingSkeleton />}>
                        <ReadingSection />
                    </Suspense>
                </HomeSectionShell>

                <HomeSectionShell
                    id={HomeSectionId.Recordings}
                    tone={SectionTone.Alternate}
                >
                    <div className="flex flex-wrap items-end justify-between gap-6">
                        <SectionHeading heading={recordings.heading} />
                        <p className="m-0 max-w-110 type-body text-ink-muted">
                            {recordings.body}
                        </p>
                    </div>
                    <RecordingSection
                        decorChip={recordings.decorChip}
                        decorVideo={recordings.decorVideo}
                    />
                </HomeSectionShell>

                <AboutSection />
            </main>
        </PageTransition>
    );
}
