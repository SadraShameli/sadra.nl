'use client';

import {
    easeOut,
    motion,
    useInView,
    type Transition,
    type Variants,
} from 'framer-motion';
import { useRef, type JSX } from 'react';

type AnimatedTextProps = {
    className?: string;
    text: string;
    splitChar?: boolean;
    el?: keyof JSX.IntrinsicElements;
};

const defaultVariants: Variants = {
    hidden: {
        opacity: 0,
        y: -10,
    },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            ease: easeOut,
        },
    },
};

const defaultTransition: Transition = { staggerChildren: 0.1 };

export default function TextAnimation({
    className,
    text,
    el: Wrapper = 'p',
    splitChar,
}: AnimatedTextProps) {
    const ref = useRef(null);
    const isInView = useInView(ref, { amount: 0.5, once: true });

    return (
        <Wrapper className={className}>
            <span className="sr-only">{text}</span>

            <motion.span
                ref={ref}
                initial="hidden"
                animate={isInView ? 'visible' : 'hidden'}
                transition={defaultTransition}
                aria-hidden
            >
                {text.split(' ').map((word) =>
                    splitChar ? (
                        <span className="inline-block" key={word}>
                            {word.split('').map((char) => (
                                <motion.span
                                    className="inline-block"
                                    variants={defaultVariants}
                                    key={char}
                                >
                                    {char}
                                </motion.span>
                            ))}
                            <span className="inline-block">&nbsp;</span>
                        </span>
                    ) : (
                        <motion.span
                            className="inline-block"
                            variants={defaultVariants}
                            key={word}
                        >
                            {word}
                            <span className="inline-block">&nbsp;</span>
                        </motion.span>
                    ),
                )}
            </motion.span>
        </Wrapper>
    );
}
