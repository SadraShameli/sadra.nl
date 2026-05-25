'use client';

import {
    motion,
    type Transition,
    useInView,
    type Variants,
} from 'framer-motion';
import { useRef } from 'react';

type RevealProps = {
    children: React.ReactNode;
    className?: string;
};

const defaultVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0 },
};

const defaultTransition: Transition = {
    duration: 1,
    ease: [0, 0, 0, 1],
};

export default function RevealAnimation({ children, className }: RevealProps) {
    const ref = useRef(null);
    const isInView = useInView(ref, { amount: 0.1, once: true });

    return (
        <motion.div
            animate={isInView ? 'visible' : 'hidden'}
            className={className}
            initial="hidden"
            ref={ref}
            transition={defaultTransition}
            variants={defaultVariants}
        >
            {children}
        </motion.div>
    );
}
