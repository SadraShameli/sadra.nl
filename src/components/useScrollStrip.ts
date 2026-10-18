'use client';

import { type RefObject, useEffect, useState } from 'react';

import { cn } from '~/lib/utilities';

export interface ScrollStripEdges {
    readonly hasMoreLeft: boolean;
    readonly hasMoreRight: boolean;
}

const EDGE_TOLERANCE_PX = 1;

const CENTERING_DIVISOR = 2;

const NO_OVERFLOW: ScrollStripEdges = {
    hasMoreLeft: false,
    hasMoreRight: false,
};

export function scrollStripFadeClass(edges: ScrollStripEdges): string {
    return cn(
        edges.hasMoreLeft && 'mask-l-from-90% mask-l-to-100%',
        edges.hasMoreRight && 'mask-r-from-90% mask-r-to-100%',
    );
}

export function useScrollStrip(
    stripReference: RefObject<HTMLElement | null>,
    {
        activeKey,
        activeSelector,
    }: {
        readonly activeKey: string | undefined;
        readonly activeSelector: string;
    },
): ScrollStripEdges {
    const [edges, setEdges] = useState<ScrollStripEdges>(NO_OVERFLOW);

    useEffect(() => {
        const strip = stripReference.current;
        if (strip === null) return;
        const measure = () => {
            const next = edgesOf(strip);
            setEdges((current) =>
                current.hasMoreLeft === next.hasMoreLeft &&
                current.hasMoreRight === next.hasMoreRight
                    ? current
                    : next,
            );
        };
        measure();
        strip.addEventListener('scroll', measure, { passive: true });
        const observer = new ResizeObserver(measure);
        observer.observe(strip);
        for (const child of strip.children) observer.observe(child);
        return () => {
            strip.removeEventListener('scroll', measure);
            observer.disconnect();
        };
    }, [stripReference]);

    useEffect(() => {
        const strip = stripReference.current;
        if (strip === null || activeKey === undefined) return;
        const active = strip.querySelector(activeSelector);
        if (!(active instanceof HTMLElement)) return;
        strip.scrollTo({
            left:
                active.offsetLeft -
                (strip.clientWidth - active.offsetWidth) / CENTERING_DIVISOR,
        });
    }, [activeKey, activeSelector, stripReference]);

    return edges;
}

function edgesOf(strip: HTMLElement): ScrollStripEdges {
    return {
        hasMoreLeft: strip.scrollLeft > EDGE_TOLERANCE_PX,
        hasMoreRight:
            strip.scrollLeft + strip.clientWidth <
            strip.scrollWidth - EDGE_TOLERANCE_PX,
    };
}
