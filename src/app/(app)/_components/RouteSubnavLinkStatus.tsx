'use client';

import { useLinkStatus } from 'next/link';

import { cn } from '~/lib/utilities';

export function RouteSubnavLinkStatus() {
    const { pending } = useLinkStatus();
    return (
        <span
            aria-hidden
            className={cn(
                'pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-current opacity-0 transition-opacity',
                pending && 'animate-pulse opacity-100 delay-100',
            )}
            data-pending={pending}
        />
    );
}
