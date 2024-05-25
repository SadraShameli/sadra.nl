'use client';

import {
  type Transition,
  type Variants,
  easeOut,
  motion,
  useInView,
} from 'framer-motion';
import { useRef } from 'react';

type StaggerProps = {
  className?: string;
  children?: JSX.Element[];
};

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

export default function StaggerAnimation({
  className,
  children,
}: StaggerProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

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
