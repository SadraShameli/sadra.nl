'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
    ACTION_CLEARANCE_PX,
    INTERACTIVE_SELECTOR,
    isScrollToTopVisible,
} from '~/app/(app)/_components/scrollToTopVisibility';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utilities';

export const STICKY_ACTION_BAR_PROPS = {
    'data-sticky-action-bar': true,
} as const;

const FOOTER_SELECTOR = 'footer';

export default function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false);
    const buttonReference = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        let frame = 0;
        const update = () => {
            frame = 0;
            const button = buttonReference.current;
            if (button === null) return;
            setIsVisible(
                isScrollToTopVisible({
                    footerTop:
                        document
                            .querySelector(FOOTER_SELECTOR)
                            ?.getBoundingClientRect().top ?? null,
                    hasActionUnderButton: hasActionUnder(button),
                    scrollY: window.scrollY,
                    viewportHeight: window.innerHeight,
                }),
            );
        };
        const schedule = () => {
            if (frame === 0) frame = window.requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        return () => {
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            if (frame !== 0) window.cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <Button
            aria-label="Scroll to top"
            className={cn(
                'app-scroll',
                'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 size-12 md:right-10 md:bottom-10 md:size-14',
                '[body:has([data-sticky-action-bar])_&]:bottom-[calc(5rem+env(safe-area-inset-bottom))] md:[body:has([data-sticky-action-bar])_&]:bottom-24',
                'btn-transition ease-in-out hover:scale-110',
                isVisible
                    ? 'translate-y-0 opacity-100'
                    : 'pointer-events-none translate-y-3 opacity-0',
            )}
            data-state={isVisible ? 'visible' : 'hidden'}
            onClick={() => window.scrollTo({ behavior: 'smooth', top: 0 })}
            ref={buttonReference}
            size="icon-tap"
            type="button"
            variant="glass"
        >
            <ArrowUp aria-hidden className="size-5" strokeWidth={1.6} />
        </Button>
    );
}

function hasActionUnder(button: HTMLElement): boolean {
    const rect = button.getBoundingClientRect();
    const left = rect.left - ACTION_CLEARANCE_PX;
    const right = rect.right + ACTION_CLEARANCE_PX;
    const top = rect.top - ACTION_CLEARANCE_PX;
    const bottom = rect.bottom + ACTION_CLEARANCE_PX;
    const probes: readonly (readonly [number, number])[] = [
        [left, top],
        [right, top],
        [left, bottom],
        [right, bottom],
        [(left + right) / 2, (top + bottom) / 2],
    ];
    return probes.some(([x, y]) =>
        document
            .elementsFromPoint(x, y)
            .some(
                (element) =>
                    !button.contains(element) &&
                    element.closest(INTERACTIVE_SELECTOR) !== null,
            ),
    );
}
