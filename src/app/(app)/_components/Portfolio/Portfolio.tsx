import type { ReactNode } from 'react';

import type { PortfolioSectionView } from '~/lib/site/content';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import { cn } from '~/lib/utilities';

import PortfolioHero from './PortfolioHero';
import PortfolioSection from './PortfolioSection';

export type PortfolioContentProperties = {
    education: PortfolioSectionView[];
    educationSectionTitle: string;
    email: string;
    experience: PortfolioSectionView[];
    experienceSectionTitle: string;
    heroHeadline: string;
    name: string;
    profiles: SocialProfile[];
    projects: PortfolioSectionView[];
    projectsSectionTitle: string;
    resumeLink: ReactNode;
};

type SocialProfile = {
    platform: string;
    title: string;
    url: string;
};

export default function PortfolioContent({
    education,
    educationSectionTitle,
    email,
    experience,
    experienceSectionTitle,
    heroHeadline,
    name,
    profiles,
    projects,
    projectsSectionTitle,
    resumeLink,
}: PortfolioContentProperties) {
    return (
        <div className={cn('app-portfolio__content', 'flex flex-col')}>
            <RevealAnimation>
                <PortfolioHero
                    email={email}
                    headline={heroHeadline}
                    name={name}
                    profiles={profiles}
                    resumeLink={resumeLink}
                />
            </RevealAnimation>

            <PortfolioSection
                entries={experience}
                eyebrowLabel="Work experience"
                hasLeadImage
                id="experience"
                title={experienceSectionTitle}
            />

            <PortfolioSection
                entries={projects}
                eyebrowLabel="Recent projects"
                id="projects"
                title={projectsSectionTitle}
            />

            <PortfolioSection
                entries={education}
                eyebrowLabel="Education"
                id="education"
                title={educationSectionTitle}
            />
        </div>
    );
}
