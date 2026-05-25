'use client';

import { Check, Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utils';

type Orientation = 'horizontal' | 'vertical';
type State = 'active' | 'completed' | 'inactive';

interface StepperContextValue {
    orientation: Orientation;
    value: number;
}

const StepperContext = React.createContext<null | StepperContextValue>(null);

interface StepperItemContextValue {
    loading: boolean;
    state: State;
    step: number;
}

function useStepperContext(): StepperContextValue {
    const ctx = React.useContext(StepperContext);
    if (!ctx) {
        throw new Error('Stepper.* must be used inside <Stepper>');
    }
    return ctx;
}

const StepperItemContext = React.createContext<null | StepperItemContextValue>(
    null,
);

export interface StepperDescriptionProps {
    children: React.ReactNode;
    className?: string;
}

export interface StepperIndicatorProps {
    children?: React.ReactNode;
    className?: string;
}

export interface StepperItemProps {
    children: React.ReactNode;
    className?: string;
    completed?: boolean;
    loading?: boolean;
    step: number;
}

export interface StepperProps {
    children: React.ReactNode;
    className?: string;
    orientation?: Orientation;
    value: number;
}

export interface StepperSeparatorProps {
    className?: string;
}

export interface StepperTitleProps {
    children: React.ReactNode;
    className?: string;
}

export function Stepper({
    children,
    className,
    orientation = 'horizontal',
    value,
}: StepperProps) {
    const ctx = React.useMemo(
        () => ({ orientation, value }),
        [orientation, value],
    );
    return (
        <StepperContext.Provider value={ctx}>
            <ol
                className={cn(
                    'flex',
                    orientation === 'horizontal'
                        ? 'flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2'
                        : 'flex-col gap-1',
                    className,
                )}
                data-orientation={orientation}
                data-slot="stepper"
            >
                {children}
            </ol>
        </StepperContext.Provider>
    );
}

export function StepperDescription({
    children,
    className,
}: StepperDescriptionProps) {
    return (
        <span
            className={cn(
                'font-mono text-[10px] tracking-wide text-muted-foreground',
                className,
            )}
            data-slot="stepper-description"
        >
            {children}
        </span>
    );
}

export function StepperIndicator({
    children,
    className,
}: StepperIndicatorProps) {
    const { loading, state, step } = useStepperItemContext();
    return (
        <span
            aria-current={state === 'active' ? 'step' : undefined}
            className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                state === 'completed' &&
                    'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
                state === 'active' &&
                    'border-primary bg-primary text-primary-foreground',
                state === 'inactive' &&
                    'border-border/60 bg-background text-muted-foreground',
                className,
            )}
            data-slot="stepper-indicator"
            data-state={state}
        >
            {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
            ) : state === 'completed' ? (
                <Check className="size-3.5" />
            ) : (
                (children ?? step)
            )}
        </span>
    );
}

export function StepperItem({
    children,
    className,
    completed,
    loading = false,
    step,
}: StepperItemProps) {
    const { value } = useStepperContext();
    const isActive = step === value;
    const resolvedCompleted = completed ?? step < value;
    const state: State = resolvedCompleted
        ? 'completed'
        : isActive
          ? 'active'
          : 'inactive';
    const itemCtx = React.useMemo(
        () => ({ loading, state, step }),
        [loading, state, step],
    );
    return (
        <StepperItemContext.Provider value={itemCtx}>
            <li
                className={cn('flex items-center gap-2', className)}
                data-slot="stepper-item"
                data-state={state}
            >
                {children}
            </li>
        </StepperItemContext.Provider>
    );
}

export function StepperSeparator({ className }: StepperSeparatorProps) {
    const { orientation } = useStepperContext();
    return (
        <span
            aria-hidden
            className={cn(
                'shrink-0 bg-border/60',
                orientation === 'horizontal'
                    ? 'ml-3.5 h-4 w-px sm:ml-0 sm:h-px sm:w-8'
                    : 'ml-3.5 h-4 w-px',
                className,
            )}
            data-slot="stepper-separator"
        />
    );
}

export function StepperTitle({ children, className }: StepperTitleProps) {
    const { state } = useStepperItemContext();
    return (
        <span
            className={cn(
                'text-sm leading-none font-medium',
                state === 'inactive' ? 'text-muted-foreground' : 'text-white',
                className,
            )}
            data-slot="stepper-title"
        >
            {children}
        </span>
    );
}

function useStepperItemContext(): StepperItemContextValue {
    const ctx = React.useContext(StepperItemContext);
    if (!ctx) {
        throw new Error('Stepper.Item.* must be used inside <StepperItem>');
    }
    return ctx;
}
