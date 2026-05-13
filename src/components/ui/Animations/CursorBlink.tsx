import { easeOut, motion, type Variants } from 'framer-motion';

const defaultVariants: Variants = {
    blinking: {
        opacity: [0, 0, 1, 1],
        transition: {
            duration: 1,
            ease: easeOut,
            repeat: Infinity,
            times: [0, 0.5, 0.5, 1],
        },
    },
};

export default function CursorBlinkerAnimation() {
    return (
        <motion.div
            animate="blinking"
            className="ml-2 inline-block h-3/4 w-[1.5px] translate-y-1 bg-white opacity-0"
            variants={defaultVariants}
        />
    );
}
