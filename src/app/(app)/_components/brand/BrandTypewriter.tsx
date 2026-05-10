'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const WORDS = [
    '// daytrader',
    '// developer',
    '// photography',
    '// cars',
    '// guitar',
];
const TYPE_MS = 85;
const ERASE_MS = 48;
const HOLD_MS = 2400;
const GAP_MS = 420;

interface Props {
    onTransition?: () => void;
}

export default function BrandTypewriter({ onTransition }: Props) {
    const [displayed, setDisplayed] = useState('');

    useEffect(() => {
        let wordIdx = 0;
        let charIdx = 0;
        let erasing = false;
        let timer: ReturnType<typeof setTimeout>;

        const tick = () => {
            const word = WORDS[wordIdx] ?? '';

            if (!erasing) {
                if (charIdx < word.length) {
                    charIdx++;
                    setDisplayed(word.slice(0, charIdx));
                    timer = setTimeout(tick, TYPE_MS);
                } else {
                    timer = setTimeout(() => {
                        erasing = true;
                        tick();
                    }, HOLD_MS);
                }
            } else {
                if (charIdx > 0) {
                    charIdx--;
                    setDisplayed(word.slice(0, charIdx));
                    timer = setTimeout(tick, ERASE_MS);
                } else {
                    wordIdx = (wordIdx + 1) % WORDS.length;
                    erasing = false;
                    onTransition?.();
                    timer = setTimeout(tick, GAP_MS);
                }
            }
        };

        timer = setTimeout(tick, 900);
        return () => clearTimeout(timer);
    }, [onTransition]);

    return (
        <span className="flex items-center font-mono text-xs text-white/40">
            <span>{displayed}</span>
            <motion.span
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{
                    duration: 1,
                    repeat: Infinity,
                    times: [0, 0.45, 0.45, 1],
                }}
                className="ml-0.5 inline-block h-3 w-[1.5px] translate-y-px bg-white/40"
            />
        </span>
    );
}
