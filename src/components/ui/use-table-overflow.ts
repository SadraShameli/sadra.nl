'use client';

import { type RefObject, useLayoutEffect, useState } from 'react';

const FIT_TOLERANCE_PX = 1;

export function useIsTableOverflowing(
    {
        frameReference,
        rootReference,
        tableReference,
    }: {
        readonly frameReference: RefObject<HTMLElement | null>;
        readonly rootReference: RefObject<HTMLElement | null>;
        readonly tableReference: RefObject<HTMLTableElement | null>;
    },
    isEnabled: boolean,
): boolean {
    const [isOverflowing, setIsOverflowing] = useState(false);

    useLayoutEffect(() => {
        const root = rootReference.current;
        const frame = frameReference.current;
        const table = tableReference.current;
        if (!isEnabled || root === null || frame === null || table === null) {
            return;
        }
        const measure = () => {
            const available = frame.clientWidth;
            if (available === 0) return;
            setIsOverflowing(
                naturalWidthOf(root, table) > available + FIT_TOLERANCE_PX,
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        observer.observe(table);
        return () => {
            observer.disconnect();
        };
    }, [frameReference, isEnabled, rootReference, tableReference]);

    return isOverflowing;
}

function naturalWidthOf(root: HTMLElement, table: HTMLTableElement): number {
    const cards = root.dataset.tableCards;
    if (cards === undefined) return table.scrollWidth;
    delete root.dataset.tableCards;
    const width = table.scrollWidth;
    root.dataset.tableCards = cards;
    return width;
}
