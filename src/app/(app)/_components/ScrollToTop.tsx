'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '~/lib/utils';

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
                'fixed right-4 bottom-4 z-50 flex size-12 items-center justify-center rounded-full border border-border bg-background/80 shadow-lg backdrop-blur-sm sm:right-10 sm:bottom-10 sm:size-14',
                'transition-all duration-300 ease-in-out',
                'hover:scale-110 hover:border-border/80 hover:bg-muted hover:text-foreground',
                visible
                    ? 'translate-y-0 opacity-100'
                    : 'pointer-events-none translate-y-3 opacity-0',
            )}
            data-state={visible ? 'visible' : 'hidden'}
            onClick={() => window.scrollTo({ behavior: 'smooth', top: 0 })}
        >
            <ArrowUp className="size-6" />
        </button>
    );
}
