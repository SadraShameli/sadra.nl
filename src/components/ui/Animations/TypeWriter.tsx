'use client';

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

import CursorBlinkerAnimation from './CursorBlink';

export type TypeWriterProps = {
  className?: string;
  text: string;
  delay?: number;
  cursor?: boolean;
};

export default function TypeWriterAnimation({
  className,
  text,
  delay,
  cursor,
}: TypeWriterProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const displayText = useTransform(rounded, (latest) => text.slice(0, latest));

  useEffect(() => {
    const controls = animate(count, text.length, {
      type: 'keyframes',
      duration: 1,
      ease: [0, 0, 0, 1],
      delay,
    });
    return controls.stop;
  }, [count, delay, text.length]);

  return (
    <>
      <motion.span className={className}>{displayText}</motion.span>
      {cursor && <CursorBlinkerAnimation />}
    </>
  );
}
