'use client';

import { formatDistanceToNow } from 'date-fns';

import { useIsClient } from '~/components/useIsClient';

export function RelativeTime({
    className,
    value,
}: {
    readonly className?: string;
    readonly value: Date | string;
}) {
    const isClient = useIsClient();
    const date = new Date(value);
    return (
        <time className={className} dateTime={date.toISOString()}>
            {isClient ? formatDistanceToNow(date, { addSuffix: true }) : null}
        </time>
    );
}
