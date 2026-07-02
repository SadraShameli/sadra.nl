'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '~/lib/utils';

const CHARS = String.raw`!<>-\/[]{}=+*^?#@$%`;

interface Properties {
    className?: string;
    href?: string;
    text: string;
    trigger?: number;
}

export default function GlitchBrand({
    className = 'font-orbitron text-lg font-semibold tracking-widest text-white',
    href = '/',
    text,
    trigger = 0,
}: Properties) {
    const [display, setDisplay] = useState(text);

    const runBurst = useCallback(
        (onDone?: () => void) => {
            let frames = 0;
            const total = 6 + Math.floor(Math.random() * 7);
            let t: ReturnType<typeof setTimeout>;

            const burst = () => {
                if (frames < total) {
                    setDisplay(corrupt(text));
                    frames++;
                    t = setTimeout(burst, 50);
                } else {
                    setDisplay(text);
                    onDone?.();
                }
            };
            burst();
            return () => clearTimeout(t);
        },
        [text],
    );

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        const schedule = () => {
            timer = setTimeout(
                () => runBurst(schedule),
                800 + Math.random() * 1700,
            );
        };

        schedule();
        return () => clearTimeout(timer);
    }, [runBurst]);

    useEffect(() => {
        if (trigger === 0) return;
        runBurst();
    }, [runBurst, trigger]);

    return (
        <Link className={cn('app-brand__glitch', className)} href={href}>
            {display}
        </Link>
    );
}

function corrupt(text: string): string {
    return Array.from(text)
        .map((c) => {
            if (c === '_') return c;
            return Math.random() < 0.45
                ? (CHARS[Math.floor(Math.random() * CHARS.length)] ?? c)
                : c;
        })
        .join('');
}
