'use client';

import { type RefObject, useEffect } from 'react';

import { HEADER_HEIGHT_VARIABLE } from './headerHeight';

export function useHeaderHeightVariable(
    headerReference: RefObject<HTMLElement | null>,
): void {
    useEffect(() => {
        const header = headerReference.current;
        if (header === null) return;
        const root = document.documentElement;
        const observer = new ResizeObserver(() => {
            root.style.setProperty(
                HEADER_HEIGHT_VARIABLE,
                `${String(header.getBoundingClientRect().height)}px`,
            );
        });
        observer.observe(header);
        return () => {
            observer.disconnect();
            root.style.removeProperty(HEADER_HEIGHT_VARIABLE);
        };
    }, [headerReference]);
}
