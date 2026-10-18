import {
    Circle,
    CircleCheck,
    CircleX,
    type LucideIcon,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

export enum StatusTone {
    Fail = 'fail',
    Neutral = 'neutral',
    Pass = 'pass',
    Warn = 'warn',
}

const STATUS_TONE_CLASS: Readonly<Record<StatusTone, string>> = {
    [StatusTone.Fail]: 'bg-destructive/15 text-destructive',
    [StatusTone.Neutral]: 'bg-muted text-ink-muted',
    [StatusTone.Pass]: 'bg-success/15 text-success',
    [StatusTone.Warn]: 'bg-warning/15 text-warning',
};

const STATUS_METER_CLASS: Readonly<Record<StatusTone, string>> = {
    [StatusTone.Fail]: 'bg-destructive',
    [StatusTone.Neutral]: 'bg-ink-muted',
    [StatusTone.Pass]: 'bg-success',
    [StatusTone.Warn]: 'bg-warning',
};

const STATUS_ICON: Readonly<Record<StatusTone, LucideIcon>> = {
    [StatusTone.Fail]: CircleX,
    [StatusTone.Neutral]: Circle,
    [StatusTone.Pass]: CircleCheck,
    [StatusTone.Warn]: TriangleAlert,
};

export function StatusRow({
    actions,
    className,
    detail,
    meter,
    title,
    tone,
    value,
}: {
    readonly actions?: ReactNode;
    readonly className?: string;
    readonly detail?: ReactNode;
    readonly meter?: { readonly filled: number; readonly total: number };
    readonly title: ReactNode;
    readonly tone: StatusTone;
    readonly value?: ReactNode;
}) {
    const Icon = STATUS_ICON[tone];
    return (
        <div
            className={cn(
                'app-status-row',
                'flex flex-col gap-3 rounded-2xl border border-line px-4 py-3',
                className,
            )}
            role="status"
        >
            <div className="flex flex-wrap items-center gap-3">
                <span
                    className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        STATUS_TONE_CLASS[tone],
                    )}
                >
                    <Icon aria-hidden className="size-4.5" />
                </span>
                <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                    <p className="m-0 text-sm font-medium text-foreground">
                        {title}
                    </p>
                    {detail !== undefined && (
                        <p className="m-0 text-xs text-muted-foreground">
                            {detail}
                        </p>
                    )}
                </div>
                {value !== undefined && (
                    <span className="font-mono text-lg text-foreground tabular-nums">
                        {value}
                    </span>
                )}
                {actions !== undefined && (
                    <div className="flex flex-wrap items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>
            {meter !== undefined && (
                <div aria-hidden className="flex gap-1">
                    {Array.from({ length: meter.total }, (_, index) => (
                        <span
                            className={cn(
                                'h-1.5 flex-1 rounded-full bg-muted',
                                index < meter.filled &&
                                    STATUS_METER_CLASS[tone],
                            )}
                            key={index}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
