import { SectionHeading } from '~/app/(app)/_components/home/EmphasisTitle';
import {
    SectionShell,
    type SectionTone,
} from '~/app/(app)/_components/SectionShell';
import StaggerAnimation from '~/components/ui/animations/stagger';
import { type PortfolioSection as PortfolioSectionCopy } from '~/lib/site/content';

import PortfolioEntry from './PortfolioEntry';

export default function PortfolioSection({
    section,
    tone,
}: {
    readonly section: PortfolioSectionCopy;
    readonly tone: SectionTone;
}) {
    return (
        <SectionShell
            blockClassName="app-portfolio__section"
            eyebrow={section.eyebrow}
            id={section.id}
            number={section.number}
            tone={tone}
        >
            <SectionHeading heading={section.heading} />
            <StaggerAnimation className="flex flex-col [&>*+*]:mt-12 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-12">
                {section.entries.map((entry) => (
                    <PortfolioEntry
                        entry={entry}
                        key={`${entry.title}-${entry.date}`}
                    />
                ))}
            </StaggerAnimation>
        </SectionShell>
    );
}
