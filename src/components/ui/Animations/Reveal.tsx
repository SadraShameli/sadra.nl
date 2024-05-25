'use client';

import {
  type Transition,
  type Variants,
  motion,
  useInView,
} from 'framer-motion';
import { useRef } from 'react';

type RevealProps = {
  children: JSX.Element;
};

const defaultVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const defaultTransition: Transition = {
  duration: 1,
  ease: [0, 0, 0, 1],
  delay: 0.1,
};

export default function RevealAnimation({ children }: RevealProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <motion.div
      ref={ref}
      variants={defaultVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      transition={defaultTransition}
    >
      {children}
    </motion.div>
  );
}
