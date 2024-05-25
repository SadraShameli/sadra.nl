'use client';

import {
  type TargetAndTransition,
  type Transition,
  motion,
} from 'framer-motion';

type MoveAroundProps = {
  className?: string;
  children?: JSX.Element;
};

const defaultAnimation: TargetAndTransition = {
  scale: [1, 1.1, 0.9, 1],
  transform: [
    'translate(0px, 0px)',
    'translate(30px, -50px)',
    'translate(-20px, 20px)',
    'translate(0px, 0px)',
  ],
};

const defaultTransition: Transition = {
  duration: 15,
  ease: 'easeOut',
  repeat: Infinity,
  times: [0, 0.33, 0.66, 1],
};

export default function MoveAroundAnimation({
  className,
  children,
}: MoveAroundProps) {
  return (
    <motion.div
      className={className}
      animate={defaultAnimation}
      transition={defaultTransition}
    >
      {children}
    </motion.div>
  );
}
