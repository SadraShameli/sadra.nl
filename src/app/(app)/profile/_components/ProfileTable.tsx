'use client';

import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { EmptyState } from '~/components/ui/empty-state';
import { formatDisplayDate, formatDisplayDateTime } from '~/lib/format';
import { cn } from '~/lib/utilities';

export const ProfileDatePrecision = {
    Day: 'day',
    Minute: 'minute',
} as const;

export type ProfileDatePrecision =
    (typeof ProfileDatePrecision)[keyof typeof ProfileDatePrecision];

const DATE_FORMATTER: Record<ProfileDatePrecision, (value: Date) => string> = {
    [ProfileDatePrecision.Day]: formatDisplayDate,
    [ProfileDatePrecision.Minute]: formatDisplayDateTime,
};

export function formatProfileDate(
    value: Date,
    precision: ProfileDatePrecision,
): string {
    return DATE_FORMATTER[precision](value);
}

export function MutedCell({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'text-xs text-muted-foreground tabular-nums',
                className,
            )}
        >
            {children}
        </span>
    );
}

export function PrimaryCell({ children }: { children: ReactNode }) {
    return (
        <span className="font-medium text-foreground tabular-nums">
            {children}
        </span>
    );
}

export function ProfileCollectionEmpty({
    description,
    icon,
    noun,
}: {
    description: string;
    icon: LucideIcon;
    noun: string;
}) {
    return (
        <EmptyState
            description={description}
            icon={icon}
            title={`No ${noun} yet`}
        />
    );
}

export function ProfileDateCell({
    precision,
    value,
}: {
    precision: ProfileDatePrecision;
    value: Date | null;
}) {
    return value === null ? (
        <MissingValue />
    ) : (
        <MutedCell>{formatProfileDate(value, precision)}</MutedCell>
    );
}
