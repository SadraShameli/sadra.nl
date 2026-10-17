'use client';

import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useIsReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribeToReducedMotion,
        isReducedMotionPreferred,
        isReducedMotionDuringPrerender,
    );
}

function isReducedMotionDuringPrerender(): boolean {
    return false;
}

function isReducedMotionPreferred(): boolean {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}
