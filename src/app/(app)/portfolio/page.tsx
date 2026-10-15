import { type Metadata } from 'next';
import { Suspense } from 'react';

import PortfolioContent from '~/app/(app)/_components/Portfolio/Portfolio';
import RootResumeLink from '~/app/(app)/_components/Portfolio/RootResumeLink';
import { PageTransition } from '~/components/PageTransition';
import { portfolioContent, siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';

export const metadata: Metadata = {
    alternates: { canonical: routes.portfolio },
    description: portfolioContent.metaDescription,
    openGraph: {
        description: portfolioContent.metaDescription,
        title: portfolioContent.metaTitle,
        type: 'profile',
        url: routes.portfolio,
    },
    title: portfolioContent.metaTitle,
};

export const ensureStatic = 'prefetch';

export default function PortfolioPage() {
    return (
        <PageTransition>
            <main className={`app-portfolio container grid w-full pt-spacing`}>
                <div className="my-content mx-auto w-full max-w-4xl">
                    <PortfolioContent
                        education={portfolioContent.education}
                        educationSectionTitle={
                            portfolioContent.educationSectionTitle
                        }
                        email={siteContent.email}
                        experience={portfolioContent.experience}
                        experienceSectionTitle={
                            portfolioContent.experienceSectionTitle
                        }
                        heroHeadline={portfolioContent.heroHeadline}
                        name={siteContent.manifest.name}
                        profiles={siteContent.profiles}
                        projects={portfolioContent.projects}
                        projectsSectionTitle={
                            portfolioContent.projectsSectionTitle
                        }
                        resumeLink={
                            <Suspense fallback={null}>
                                <RootResumeLink />
                            </Suspense>
                        }
                    />
                </div>
            </main>
        </PageTransition>
    );
}
