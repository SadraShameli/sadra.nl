import { motion } from 'framer-motion';

const defaultVariants = {
  blinking: {
    opacity: [0, 0, 1, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'easeOut',
      times: [0, 0.5, 0.5, 1],
    },
  },
};

export default function CursorBlinkerAnimation() {
  return (
    <motion.div
      variants={defaultVariants}
      animate="blinking"
      className="ml-2 inline-block h-3/4 w-[1.5px] translate-y-1 bg-white opacity-0"
    />
  );
}
