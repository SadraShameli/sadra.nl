import type { PortfolioSectionView } from '~/lib/site/content';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import { cn } from '~/lib/utils';

import PortfolioHero from './PortfolioHero';
import PortfolioSection from './PortfolioSection';

export type PortfolioContentProps = {
    canViewResume: boolean;
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
};

type SocialProfile = {
    platform: string;
    title: string;
    url: string;
};

export default function PortfolioContent({
    canViewResume,
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
}: PortfolioContentProps) {
    return (
        <div className={cn('app-portfolio__content', 'flex flex-col')}>
            <RevealAnimation>
                <PortfolioHero
                    canViewResume={canViewResume}
                    email={email}
                    headline={heroHeadline}
                    name={name}
                    profiles={profiles}
                />
            </RevealAnimation>

            <PortfolioSection
                entries={experience}
                eyebrowLabel="Work experience"
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
