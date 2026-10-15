import type { PortfolioSectionView } from '~/lib/site/content';

import StaggerAnimation from '~/components/ui/Animations/Stagger';
import { cn } from '~/lib/utilities';

import PortfolioEntry from './PortfolioEntry';
import SectionEyebrow from './SectionEyebrow';

type PortfolioSectionProperties = {
    entries: PortfolioSectionView[];
    eyebrowLabel?: string;
    hasLeadImage?: boolean;
    id: string;
    title: string;
};

export default function PortfolioSection({
    entries,
    eyebrowLabel,
    hasLeadImage = false,
    id,
    title,
}: PortfolioSectionProperties) {
    const headingId = `${id}-heading`;

    return (
        <section
            aria-labelledby={headingId}
            className={cn('app-portfolio__section', 'pt-spacing')}
        >
            <h2 className="sr-only" id={headingId}>
                {title}
            </h2>

            <SectionEyebrow
                count={entries.length}
                label={eyebrowLabel ?? title.toUpperCase()}
            />

            <StaggerAnimation className="mt-8 flex flex-col gap-y-14 lg:gap-y-16">
                {entries.map((entry, index) => (
                    <PortfolioEntry
                        entry={entry}
                        isLeadImage={hasLeadImage && index === 0}
                        key={`${entry.title}-${entry.date}-${index}`}
                    />
                ))}
            </StaggerAnimation>
        </section>
    );
}
