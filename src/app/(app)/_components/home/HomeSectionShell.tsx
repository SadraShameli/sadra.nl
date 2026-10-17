import { type ReactNode } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { homeSection, type HomeSectionId } from '~/lib/site/homeSections';
import { cn } from '~/lib/utilities';

import { NumberedEyebrow } from './NumberedEyebrow';

export enum SectionTone {
    Alternate = 'alternate',
    Ground = 'ground',
}

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
        <section
            className={cn(
                'app-home__section',
                HEADER_SCROLL_MARGIN,
                'border-t border-line-faint',
                tone === SectionTone.Alternate && 'bg-ground-alt/85',
            )}
            id={id}
        >
            <div
                className={cn(
                    'mx-auto flex max-w-site flex-col gap-12 px-6 py-20 lg:py-32',
                    className,
                )}
            >
                <NumberedEyebrow
                    label={section.eyebrow}
                    number={section.number}
                />
                {children}
            </div>
        </section>
    );
}
