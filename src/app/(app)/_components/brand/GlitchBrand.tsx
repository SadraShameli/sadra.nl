'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const CHARS = '!<>-\\/[]{}=+*^?#@$%';

function corrupt(text: string): string {
    return text
        .split('')
        .map((c) => {
            if (c === '_') return c;
            return Math.random() < 0.45
                ? (CHARS[Math.floor(Math.random() * CHARS.length)] ?? c)
                : c;
        })
        .join('');
}

interface Props {
    text: string;
    href?: string;
    className?: string;
    trigger?: number;
}

export default function GlitchBrand({
    text,
    href = '/',
    className = 'font-orbitron text-lg font-semibold tracking-widest text-white',
    trigger = 0,
}: Props) {
    const [display, setDisplay] = useState(text);

    const runBurst = (onDone?: () => void) => {
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
    };

    // Idle random glitch schedule
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    // Triggered glitch when typewriter transitions
    useEffect(() => {
        if (trigger === 0) return;
        runBurst();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trigger]);

    return (
        <Link href={href} className={className}>
            {display}
        </Link>
    );
}
