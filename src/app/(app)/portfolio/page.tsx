import { type Metadata } from 'next';
import { Suspense } from 'react';

import PortfolioHero from '~/app/(app)/_components/Portfolio/PortfolioHero';
import PortfolioSection from '~/app/(app)/_components/Portfolio/PortfolioSection';
import RootResumeLink from '~/app/(app)/_components/Portfolio/RootResumeLink';
import { SectionTone } from '~/app/(app)/_components/SectionShell';
import { PageTransition } from '~/components/PageTransition';
import { portfolioContent, siteContent } from '~/lib/site/content';
import { buildPublicPageMetadata } from '~/lib/site/metadata';
import { routes } from '~/lib/site/routes';

export const metadata: Metadata = buildPublicPageMetadata({
    canonical: routes.portfolio,
    description: portfolioContent.metaDescription,
    profile: true,
    title: portfolioContent.metaTitle,
});

export const ensureStatic = 'prefetch';

export default function PortfolioPage() {
    return (
        <PageTransition>
            <main className="app-portfolio">
                <PortfolioHero
                    email={siteContent.email}
                    heading={portfolioContent.heroHeading}
                    headline={portfolioContent.heroHeadline}
                    name={siteContent.manifest.name}
                    resumeLink={
                        <Suspense fallback={null}>
                            <RootResumeLink />
                        </Suspense>
                    }
                    sections={portfolioContent.sections}
                />
                {portfolioContent.sections.map((section) => (
                    <PortfolioSection
                        key={section.id}
                        section={section}
                        tone={SectionTone.Alternate}
                    />
                ))}
            </main>
        </PageTransition>
    );
}
