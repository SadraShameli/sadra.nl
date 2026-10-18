import { type ReactNode } from 'react';

import {
    SectionShell,
    type SectionTone,
} from '~/app/(app)/_components/SectionShell';
import { homeSection, type HomeSectionId } from '~/lib/site/homeSections';

export function HomeSectionShell({
    children,
    className,
    id,
    tone,
}: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly id: HomeSectionId;
    readonly tone: SectionTone;
}) {
    const section = homeSection(id);
    return (
        <SectionShell
            blockClassName="app-home__section"
            className={className}
            eyebrow={section.eyebrow}
            id={id}
            number={section.number}
            tone={tone}
        >
            {children}
        </SectionShell>
    );
}
