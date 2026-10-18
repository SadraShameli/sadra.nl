import { type ReactNode } from 'react';

import InfoPopover from '~/components/ui/info-popover';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

export enum StatStripSize {
    Compact = 'compact',
    Default = 'default',
    Large = 'large',
}

export enum StatTone {
    Default = 'default',
    Muted = 'muted',
    Negative = 'negative',
    Positive = 'positive',
    Warning = 'warning',
}

export interface StatStripItem {
    readonly caption?: ReactNode;
    readonly id: string;
    readonly info?: ReactNode;
    readonly isLoading?: boolean;
    readonly label: string;
    readonly tone?: StatTone;
    readonly value: ReactNode;
}

const TONE_CLASS: Readonly<Record<StatTone, string>> = {
    [StatTone.Default]: 'text-ink',
    [StatTone.Muted]: 'text-ink-muted',
    [StatTone.Negative]: 'text-destructive',
    [StatTone.Positive]: 'text-success',
    [StatTone.Warning]: 'text-warning',
};

const VALUE_CLASS: Readonly<Record<StatStripSize, string>> = {
    [StatStripSize.Compact]: 'text-sm font-medium',
    [StatStripSize.Default]: 'type-display-item',
    [StatStripSize.Large]: 'type-display-figure',
};

const CELL_BASIS_CLASS: Readonly<Record<StatStripSize, string>> = {
    [StatStripSize.Compact]: 'basis-32',
    [StatStripSize.Default]: 'basis-40',
    [StatStripSize.Large]: 'basis-40',
};

const SKELETON_CLASS: Readonly<Record<StatStripSize, string>> = {
    [StatStripSize.Compact]: 'h-4 w-16',
    [StatStripSize.Default]: 'h-7 w-20',
    [StatStripSize.Large]: 'h-10 w-28',
};

export function StatStrip({
    className,
    isLoading = false,
    items,
    label,
    size = StatStripSize.Default,
}: {
    readonly className?: string;
    readonly isLoading?: boolean;
    readonly items: readonly StatStripItem[];
    readonly label?: string;
    readonly size?: StatStripSize;
}) {
    return (
        <div
            aria-busy={isLoading || undefined}
            aria-label={label}
            className={cn(
                'app-stat-strip',
                'min-w-0 overflow-hidden rounded-lg border border-line-faint',
                className,
            )}
            role={label === undefined ? undefined : 'group'}
        >
            <dl className="-mr-px -mb-px flex flex-wrap">
                {items.map((item) => {
                    const isItemLoading = isLoading || item.isLoading === true;
                    return (
                        <div
                            className={cn(
                                'flex min-w-0 grow flex-col gap-1.5 border-r border-b border-line-faint px-4 py-3',
                                CELL_BASIS_CLASS[size],
                            )}
                            key={item.id}
                        >
                            <dt className="flex items-center gap-1.5 type-micro text-ink-muted">
                                {item.label}
                                {item.info !== undefined && (
                                    <InfoPopover title={item.label}>
                                        {item.info}
                                    </InfoPopover>
                                )}
                            </dt>
                            <dd
                                className={cn(
                                    'm-0 min-w-0 tabular-nums',
                                    TONE_CLASS[item.tone ?? StatTone.Default],
                                    VALUE_CLASS[size],
                                )}
                            >
                                {isItemLoading ? (
                                    <Skeleton
                                        className={SKELETON_CLASS[size]}
                                    />
                                ) : (
                                    item.value
                                )}
                            </dd>
                            {item.caption !== undefined && !isItemLoading && (
                                <dd className="m-0 text-xs text-ink-muted">
                                    {item.caption}
                                </dd>
                            )}
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
