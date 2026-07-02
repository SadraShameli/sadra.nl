'use client';

import {
    easeOut,
    motion,
    type Transition,
    useInView,
    type Variants,
} from 'framer-motion';
import { type JSX, useRef } from 'react';

type AnimatedTextProperties = {
    className?: string;
    el?: keyof JSX.IntrinsicElements;
    splitChar?: boolean;
    text: string;
};

const defaultVariants: Variants = {
    hidden: {
        opacity: 0,
        y: -10,
    },
    visible: {
        opacity: 1,
        transition: {
            ease: easeOut,
        },
        y: 0,
    },
};

const defaultTransition: Transition = { staggerChildren: 0.1 };

export default function TextAnimation({
    className,
    el: Wrapper = 'p',
    splitChar,
    text,
}: AnimatedTextProperties) {
    const reference = useRef(null);
    const isInView = useInView(reference, { amount: 0.5, once: true });

    return (
        <Wrapper className={className}>
            <span className="sr-only">{text}</span>

            <motion.span
                animate={isInView ? 'visible' : 'hidden'}
                aria-hidden
                initial="hidden"
                ref={reference}
                transition={defaultTransition}
            >
                {text.split(' ').map((word) =>
                    splitChar ? (
                        <span className="inline-block" key={word}>
                            {Array.from(word).map((char) => (
                                <motion.span
                                    className="inline-block"
                                    key={char}
                                    variants={defaultVariants}
                                >
                                    {char}
                                </motion.span>
                            ))}
                            <span className="inline-block">&nbsp;</span>
                        </span>
                    ) : (
                        <motion.span
                            className="inline-block"
                            key={word}
                            variants={defaultVariants}
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
