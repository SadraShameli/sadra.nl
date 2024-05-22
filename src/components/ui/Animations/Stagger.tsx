'use client';

import {
    type Transition,
    type Variants,
    easeOut,
    motion,
    useInView,
} from 'framer-motion';
import { useRef } from 'react';

interface MoveAround {
    className?: string;
    children?: JSX.Element[];
}

export default function StaggerAnimation({ className, children }: MoveAround) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    const defaultVariants: Variants = {
        hidden: {
            opacity: 0,
            x: -25,
        },
        visible: (index: number) => ({
            opacity: 1,
            x: 0,
            transition: {
                delay: 0.1 * index,
                ease: easeOut,
            },
        }),
    };

    const defaultTransition: Transition = {
        duration: 0.25,
        staggerChildren: 0.2,
        delay: 0.2,
    };

    return (
        <motion.ul className={className} ref={ref}>
            {children?.map((child, index) => {
                return (
                    <motion.li
                        variants={defaultVariants}
                        animate={isInView ? 'visible' : 'hidden'}
                        transition={defaultTransition}
                        custom={index}
                        key={index}
                    >
                        {child}
                    </motion.li>
                );
            })}
        </motion.ul>
    );
}
