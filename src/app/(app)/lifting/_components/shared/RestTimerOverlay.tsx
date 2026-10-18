'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetSide,
    SheetTitle,
} from '~/components/ui/sheet';
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
            if (next !== seconds) {
                return;
            }

            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                navigator.vibrate([180, 80, 180]);
            }
            autoCloseReference.current = setTimeout(
                () => onCloseReference.current(),
                5000,
            );
        }, 250);
        return () => clearInterval(tick);
    }, [open, seconds]);

    const remaining = Math.max(0, seconds - elapsed);
    const isOverrun = elapsed > seconds;
    const progressPct = Math.min(100, (elapsed / Math.max(seconds, 1)) * 100);

    return (
        <Sheet
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
            open={open}
        >
            <SheetContent
                className="h-svh items-center justify-center gap-0"
                side={SheetSide.Bottom}
            >
                <SheetTitle className="text-xs font-normal tracking-[0.4em] text-muted-foreground uppercase">
                    Rest
                </SheetTitle>
                <span
                    className={cn(
                        'mt-2 text-[120px] leading-none font-bold tabular-nums',
                        isOverrun ? 'text-success' : 'text-foreground',
                    )}
                >
                    {DurationFormat.seconds(remaining)}
                </span>
                <SheetDescription className="mt-2 tabular-nums">
                    Target {DurationFormat.seconds(seconds)}
                    {isOverrun && (
                        <span className="ml-2 text-success">
                            +{DurationFormat.seconds(elapsed - seconds)}
                        </span>
                    )}
                </SheetDescription>
                <Progress
                    className={cn(
                        'mt-8 h-1.5 w-[min(80vw,420px)] bg-foreground/5',
                        isOverrun && '*:data-state:bg-success',
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
            </SheetContent>
        </Sheet>
    );
}
