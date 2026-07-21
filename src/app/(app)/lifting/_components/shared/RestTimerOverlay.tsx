'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Progress } from '~/components/ui/Progress';
import { DurationFormat } from '~/lib/lifting/format';
import { cn } from '~/lib/utilities';

interface RestTimerOverlayProperties {
    onClose: () => void;
    open: boolean;
    seconds: number;
}

export function RestTimerOverlay({
    onClose,
    open,
    seconds,
}: RestTimerOverlayProperties) {
    const [elapsed, setElapsed] = useState(0);
    const startReference = useRef<null | number>(null);
    const autoCloseReference = useRef<null | ReturnType<typeof setTimeout>>(
        null,
    );
    const onCloseReference = useRef(onClose);

    useEffect(() => {
        onCloseReference.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) {
            setElapsed(0);
            startReference.current = null;
            if (autoCloseReference.current) {
                clearTimeout(autoCloseReference.current);
                autoCloseReference.current = null;
            }
            return;
        }
        startReference.current = Date.now();
        const tick = setInterval(() => {
            if (startReference.current === null) return;
            const next = Math.floor(
                (Date.now() - startReference.current) / 1000,
            );
            setElapsed(next);
            if (next === seconds) {
                if (
                    typeof navigator !== 'undefined' &&
                    'vibrate' in navigator
                ) {
                    navigator.vibrate([180, 80, 180]);
                }
                autoCloseReference.current = setTimeout(
                    () => onCloseReference.current(),
                    5000,
                );
            }
        }, 250);
        return () => clearInterval(tick);
    }, [open, seconds]);

    const remaining = Math.max(0, seconds - elapsed);
    const isOverrun = elapsed > seconds;
    const progressPct = Math.min(100, (elapsed / Math.max(seconds, 1)) * 100);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                        'fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl',
                    )}
                    exit={{ opacity: 0, y: 40 }}
                    initial={{ opacity: 0, y: 40 }}
                    transition={{ damping: 30, stiffness: 400, type: 'spring' }}
                >
                    <Button
                        aria-label="Dismiss timer"
                        className="absolute top-4 right-4 size-10 rounded-full p-0 text-muted-foreground hover:bg-white/10"
                        onClick={onClose}
                        type="button"
                        variant="ghost"
                    >
                        <X className="size-5" />
                    </Button>
                    <span className="text-xs tracking-[0.4em] text-muted-foreground uppercase">
                        Rest
                    </span>
                    <span
                        className={cn(
                            'mt-2 text-[120px] leading-none font-bold tabular-nums',
                            isOverrun ? 'text-emerald-400' : 'text-foreground',
                        )}
                    >
                        {DurationFormat.seconds(remaining)}
                    </span>
                    <span className="mt-2 text-sm text-muted-foreground tabular-nums">
                        Target {DurationFormat.seconds(seconds)}
                        {isOverrun && (
                            <span className="ml-2 text-emerald-400">
                                +{DurationFormat.seconds(elapsed - seconds)}
                            </span>
                        )}
                    </span>
                    <Progress
                        className={cn(
                            'mt-8 h-1.5 w-[min(80vw,420px)] bg-white/5',
                            isOverrun && '*:data-state:bg-emerald-400',
                        )}
                        value={progressPct}
                    />
                    <Button
                        className="mt-10 rounded-full px-8"
                        onClick={onClose}
                        type="button"
                    >
                        Skip rest
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
