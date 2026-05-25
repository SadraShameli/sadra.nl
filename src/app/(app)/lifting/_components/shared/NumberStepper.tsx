'use client';

import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utils';

interface NumberStepperProps {
    className?: string;
    decimals?: number;
    label?: string;
    longPressMultiplier?: number;
    max?: number;
    min?: number;
    onChange: (next: number) => void;
    step?: number;
    suffix?: string;
    value: number;
}

const LONG_PRESS_MS = 350;
const REPEAT_MS = 90;

export function NumberStepper({
    className,
    decimals = 1,
    label,
    longPressMultiplier = 5,
    max = 9999,
    min = 0,
    onChange,
    step = 1,
    suffix,
    value,
}: NumberStepperProps) {
    const timeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);
    const intervalRef = useRef<null | ReturnType<typeof setInterval>>(null);

    const clamp = useCallback(
        (n: number): number => {
            if (Number.isNaN(n)) return min;
            return Math.max(
                min,
                Math.min(max, Number(n.toFixed(decimals + 4))),
            );
        },
        [min, max, decimals],
    );

    const apply = useCallback(
        (direction: -1 | 1, magnitude = 1) => {
            onChange(clamp(value + direction * step * magnitude));
        },
        [clamp, onChange, step, value],
    );

    const startHold = (direction: -1 | 1) => {
        apply(direction, 1);
        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                apply(direction, longPressMultiplier);
            }, REPEAT_MS);
        }, LONG_PRESS_MS);
    };

    const clearHold = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        timeoutRef.current = null;
        intervalRef.current = null;
    };

    useEffect(() => clearHold, []);

    const display = decimals > 0 ? value.toFixed(decimals) : value.toString();

    return (
        <div className={cn('flex flex-col gap-1', className)}>
            {label && (
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    {label}
                </span>
            )}
            <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-card">
                <Button
                    aria-label={`Decrease ${label ?? ''}`}
                    className="h-9 w-9 shrink-0 rounded-none p-0 text-muted-foreground hover:text-foreground"
                    onPointerCancel={clearHold}
                    onPointerDown={() => startHold(-1)}
                    onPointerLeave={clearHold}
                    onPointerUp={clearHold}
                    type="button"
                    variant="ghost"
                >
                    <Minus className="size-4" />
                </Button>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-1 border-x border-border/60 px-3 font-semibold tabular-nums">
                    <span className="text-lg text-foreground">{display}</span>
                    {suffix && (
                        <span className="text-xs text-muted-foreground">
                            {suffix}
                        </span>
                    )}
                </div>
                <Button
                    aria-label={`Increase ${label ?? ''}`}
                    className="h-9 w-9 shrink-0 rounded-none p-0 text-muted-foreground hover:text-foreground"
                    onPointerCancel={clearHold}
                    onPointerDown={() => startHold(1)}
                    onPointerLeave={clearHold}
                    onPointerUp={clearHold}
                    type="button"
                    variant="ghost"
                >
                    <Plus className="size-4" />
                </Button>
            </div>
        </div>
    );
}
