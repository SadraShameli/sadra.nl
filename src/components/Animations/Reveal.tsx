'use client';

import { type Transition, type Variants, motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface RevealProps {
    children: JSX.Element;
}

export default function RevealAnimation({ children }: RevealProps) {
    const defaultVariants: Variants = {
        hidden: { opacity: 0.25, y: 20 },
        visible: { opacity: 1, y: 0 },
    };

    const defaultTransition: Transition = { duration: 0.5, ease: 'easeOut' };

    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, amount: 0.25 });

    return (
        <motion.div ref={ref} variants={defaultVariants} initial='hidden' animate={isInView ? 'visible' : 'hidden'} transition={defaultTransition}>
            {children}
        </motion.div>
    );
}
