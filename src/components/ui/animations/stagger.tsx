'use client';

import {
    easeOut,
    motion,
    type Transition,
    useInView,
    type Variants,
} from 'framer-motion';
import { useRef } from 'react';

type StaggerProperties = {
    children?: React.ReactNode[];
    className?: string;
};

const defaultVariants: Variants = {
    hidden: {
        opacity: 0,
        x: -25,
    },
    visible: (index: number) => ({
        opacity: 1,
        transition: {
            delay: 0.1 * index,
            ease: easeOut,
        },
        x: 0,
    }),
};

const defaultTransition: Transition = {
    delay: 0.2,
    duration: 0.25,
    staggerChildren: 0.2,
};

export default function StaggerAnimation({
    children,
    className,
}: StaggerProperties) {
    const reference = useRef(null);
    const isInView = useInView(reference, { once: true });

    return (
        <motion.ul className={className} ref={reference}>
            {children?.map((child, index) => {
                return (
                    <motion.li
                        animate={isInView ? 'visible' : 'hidden'}
                        custom={index}
                        key={index}
                        transition={defaultTransition}
                        variants={defaultVariants}
                    >
                        {child}
                    </motion.li>
                );
            })}
        </motion.ul>
    );
}
