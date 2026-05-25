import { type Metadata } from 'next';

import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { portfolioContent, siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';

import PortfolioContent from '../_components/Portfolio/Portfolio';

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

export default async function PortfolioPage() {
    const session = await getServerSession();
    const canViewResume = isRoot(session?.user.role);

    return (
        <main className={`app-portfolio container grid w-full pt-spacing`}>
            <div className="my-content mx-auto w-full max-w-4xl">
                <PortfolioContent
                    canViewResume={canViewResume}
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
                    projectsSectionTitle={portfolioContent.projectsSectionTitle}
                />
            </div>
        </main>
    );
}
