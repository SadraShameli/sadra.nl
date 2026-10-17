'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '~/lib/utilities';

export const STICKY_ACTION_BAR_PROPS = {
    'data-sticky-action-bar': true,
} as const;

export default function ScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 50);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <button
            aria-label="Scroll to top"
            className={cn(
                'app-scroll',
                'fixed right-4 bottom-4 z-50 flex size-12 cursor-pointer items-center justify-center rounded-full border glass text-ink focus-camel hover:border-line-hover hover:text-camel sm:right-10 sm:bottom-10 sm:size-14',
                '[body:has([data-sticky-action-bar])_&]:bottom-20 sm:[body:has([data-sticky-action-bar])_&]:bottom-24',
                'btn-transition ease-in-out hover:scale-110',
                visible
                    ? 'translate-y-0 opacity-100'
                    : 'pointer-events-none translate-y-3 opacity-0',
            )}
            data-state={visible ? 'visible' : 'hidden'}
            onClick={() => window.scrollTo({ behavior: 'smooth', top: 0 })}
            type="button"
        >
            <ArrowUp aria-hidden className="size-5" strokeWidth={1.6} />
        </button>
    );
}
