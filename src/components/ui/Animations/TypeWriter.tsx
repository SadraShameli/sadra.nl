'use client';

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

import CursorBlinkerAnimation from './CursorBlink';

export type TypeWriterProps = {
    className?: string;
    cursor?: boolean;
    delay?: number;
    text: string;
};

export default function TypeWriterAnimation({
    className,
    cursor,
    delay,
    text,
}: TypeWriterProps) {
    const count = useMotionValue(0);
    const rounded = useTransform(count, (latest) => Math.round(latest));
    const displayText = useTransform(rounded, (latest) =>
        text.slice(0, latest),
    );

    useEffect(() => {
        const controls = animate(count, text.length, {
            delay,
            duration: 1,
            ease: [0, 0, 0, 1],
            type: 'keyframes',
        });
        return controls.stop;
    }, [count, delay, text.length]);

    return (
        <>
            <motion.span className={className}>{displayText}</motion.span>
            {cursor && <CursorBlinkerAnimation />}
        </>
    );
}
