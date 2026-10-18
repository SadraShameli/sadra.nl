import { type ReactNode } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { cn } from '~/lib/utilities';

import { NumberedEyebrow } from './home/NumberedEyebrow';

export enum SectionTone {
    Alternate = 'alternate',
    Ground = 'ground',
}

export function SectionShell({
    blockClassName,
    children,
    className,
    eyebrow,
    id,
    number,
    tone,
}: {
    readonly blockClassName: string;
    readonly children: ReactNode;
    readonly className?: string;
    readonly eyebrow: string;
    readonly id: string;
    readonly number: string;
    readonly tone: SectionTone;
}) {
    return (
        <section
            className={cn(
                blockClassName,
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
                <NumberedEyebrow label={eyebrow} number={number} />
                {children}
            </div>
        </section>
    );
}
