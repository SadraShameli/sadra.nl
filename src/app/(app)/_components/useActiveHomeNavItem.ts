'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { HOME_SECTIONS, type HomeSectionId } from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';

const ACTIVATION_LINE_VIEWPORT_SHARE = 0.35;
const SCROLL_IDLE_MS = 160;

export enum HomeNavTarget {
    Top = 'top',
}

export interface ActiveHomeNav {
    readonly activeItem: ActiveHomeNavItem | null;
    readonly pin: (item: ActiveHomeNavItem) => void;
}

export type ActiveHomeNavItem = HomeNavTarget | HomeSectionId;

export function useActiveHomeNavItem(): ActiveHomeNav {
    const isHome = usePathname() === routes.home;
    const [active, setActive] = useState<ActiveHomeNavItem>(HomeNavTarget.Top);
    const pinned = useRef<ActiveHomeNavItem | null>(null);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const releasePinWhenIdle = useCallback(() => {
        clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
            pinned.current = null;
            setActive(sectionAtActivationLine() ?? HomeNavTarget.Top);
        }, SCROLL_IDLE_MS);
    }, []);

    const pin = useCallback(
        (item: ActiveHomeNavItem) => {
            pinned.current = item;
            setActive(item);
            releasePinWhenIdle();
        },
        [releasePinWhenIdle],
    );

    useEffect(() => {
        if (!isHome) return;
        let frame = 0;
        const measure = () => {
            frame = 0;
            if (pinned.current === null)
                setActive(sectionAtActivationLine() ?? HomeNavTarget.Top);
        };
        const onScroll = () => {
            if (pinned.current !== null) releasePinWhenIdle();
            if (frame === 0) frame = requestAnimationFrame(measure);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            cancelAnimationFrame(frame);
            clearTimeout(idleTimer.current);
        };
    }, [isHome, releasePinWhenIdle]);

    return { activeItem: isHome ? active : null, pin };
}

function sectionAtActivationLine(): HomeSectionId | null {
    const line = window.innerHeight * ACTIVATION_LINE_VIEWPORT_SHARE;
    let current: HomeSectionId | null = null;
    for (const section of HOME_SECTIONS) {
        const element = document.querySelector(`#${CSS.escape(section.id)}`);
        if (element !== null && element.getBoundingClientRect().top <= line)
            current = section.id;
    }
    return current;
}
