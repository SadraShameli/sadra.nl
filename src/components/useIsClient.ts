'use client';

import { useSyncExternalStore } from 'react';

export function useIsClient(): boolean {
    return useSyncExternalStore(
        subscribeNever,
        () => true,
        () => false,
    );
}

function subscribeNever(): () => void {
    return unsubscribeNothing;
}

function unsubscribeNothing(): void {
    return;
}
