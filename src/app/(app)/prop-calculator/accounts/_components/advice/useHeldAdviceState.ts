'use client';

import { useEffect, useRef } from 'react';

import {
    AccountAdvicePhase,
    type AccountAdviceState,
} from './useAccountAdvice';

export interface HeldAdviceState {
    readonly isRecomputing: boolean;
    readonly state: AccountAdviceState;
}

interface Held {
    readonly holdKey: string;
    readonly state: Extract<
        AccountAdviceState,
        { phase: AccountAdvicePhase.Ready }
    >;
}

export function useHeldAdviceState(
    current: AccountAdviceState,
    holdKey: string,
): HeldAdviceState {
    const held = useRef<Held | null>(null);
    useEffect(() => {
        if (current.phase === AccountAdvicePhase.Ready) {
            held.current = { holdKey, state: current };
        } else if (current.phase === AccountAdvicePhase.Failed) {
            held.current = null;
        }
    });
    return current.phase === AccountAdvicePhase.Loading &&
        held.current?.holdKey === holdKey
        ? { isRecomputing: true, state: held.current.state }
        : { isRecomputing: false, state: current };
}
