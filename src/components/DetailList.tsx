import { type ReactNode } from 'react';

import InfoPopover from '~/components/ui/info-popover';
import { cn } from '~/lib/utilities';

export enum DetailListLayout {
    Columns = 'columns',
    Stacked = 'stacked',
}

const LAYOUT_CLASS: Readonly<Record<DetailListLayout, string>> = {
    [DetailListLayout.Columns]:
        'md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-x-6 md:gap-y-2',
    [DetailListLayout.Stacked]: '',
};

const ITEM_CLASS: Readonly<Record<DetailListLayout, string>> = {
    [DetailListLayout.Columns]: 'flex min-w-0 flex-col gap-0.5 md:contents',
    [DetailListLayout.Stacked]: 'flex min-w-0 flex-col gap-0.5',
};

export interface DetailListItem {
    readonly id: string;
    readonly info?: ReactNode;
    readonly label: string;
    readonly value: ReactNode;
}

export function DetailList({
    className,
    items,
    label,
    layout = DetailListLayout.Columns,
}: {
    readonly className?: string;
    readonly items: readonly DetailListItem[];
    readonly label?: string;
    readonly layout?: DetailListLayout;
}) {
    return (
        <dl
            aria-label={label}
            className={cn(
                'app-detail-list',
                'm-0 grid gap-y-3 text-sm',
                LAYOUT_CLASS[layout],
                className,
            )}
        >
            {items.map((item) => (
                <div className={ITEM_CLASS[layout]} key={item.id}>
                    <dt className="flex items-center gap-1.5 text-ink-muted">
                        {item.label}
                        {item.info === undefined ? null : (
                            <InfoPopover title={item.label}>
                                {item.info}
                            </InfoPopover>
                        )}
                    </dt>
                    <dd className="m-0 min-w-0 wrap-break-word text-ink">
                        {item.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
