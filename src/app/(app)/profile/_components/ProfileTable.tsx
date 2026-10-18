'use client';

import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

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

const NO_VALUE = '-';

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

export function ProfileDateCell({
    precision,
    value,
}: {
    precision: ProfileDatePrecision;
    value: Date | null;
}) {
    return (
        <MutedCell>
            {value === null ? NO_VALUE : formatProfileDate(value, precision)}
        </MutedCell>
    );
}

export function ProfileTableEmpty({
    action,
    description,
    filtered,
    icon,
    noun,
}: {
    action?: ReactNode;
    description: string;
    filtered: boolean;
    icon: LucideIcon;
    noun: string;
}) {
    return filtered ? (
        <EmptyState
            description="Try a different search or clear the filters."
            icon={icon}
            title={`No matching ${noun}`}
        />
    ) : (
        <EmptyState
            action={action}
            description={description}
            icon={icon}
            title={`No ${noun} yet`}
        />
    );
}
