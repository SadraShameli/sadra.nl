import { type Metadata } from 'next';
import { Suspense } from 'react';

import { SectionTone } from '~/app/(app)/_components/SectionShell';
import { PageTransition } from '~/components/PageTransition';
import { homepageContent, siteContent } from '~/lib/site/content';
import { HomeSectionId } from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { AboutSection } from './_components/home/AboutSection';
import { HeroIntro } from './_components/home/HeroIntro';
import { HomeSectionShell } from './_components/home/HomeSectionShell';
import {
    OwnerHeroCollage,
    PlaceholderHeroCollage,
} from './_components/home/OwnerHeroCollage';
import { SectionIntro } from './_components/home/SectionIntro';
import { SensorHubSection } from './_components/home/SensorHubSection';
import { ToolCards } from './_components/home/ToolCards';
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
                        'relative overflow-hidden lg:-mt-header',
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
                    <SectionIntro body={tools.body} heading={tools.heading} />
                    <ToolCards />
                </HomeSectionShell>

                <SensorHubSection />

                <HomeSectionShell
                    className="gap-10"
                    id={HomeSectionId.Readings}
                    tone={SectionTone.Ground}
                >
                    <SectionIntro body={live.body} heading={live.heading} />
                    <Suspense fallback={<ReadingSkeleton />}>
                        <ReadingSection />
                    </Suspense>
                </HomeSectionShell>

                <HomeSectionShell
                    id={HomeSectionId.Recordings}
                    tone={SectionTone.Alternate}
                >
                    <SectionIntro
                        body={recordings.body}
                        heading={recordings.heading}
                    />
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
