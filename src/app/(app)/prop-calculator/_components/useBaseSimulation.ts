'use client';

import { useEffect, useState } from 'react';

import {
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

import { type ComputationCache } from './computationCache';
import { ComputationId } from './ComputationId';
import { simInputsCacheKey } from './simInputsCacheKey';
import { describeSimulationFailure } from './simulationFailure';
import { useDebouncedValue } from './useDebouncedSimulation';

export interface BaseSimulation {
    isPending: boolean;
    result: null | SimOutputs;
}

export interface BaseSimulationGate {
    hasConsumer: boolean;
    legacyHashSettled: boolean;
    mounted: boolean;
}

export interface BaseSimulationRun extends BaseSimulation {
    error: null | string;
}

interface ComputedBaseSimulation {
    error: null | string;
    inputs: SimInputs;
    result: null | SimOutputs;
}

export function baseSimulationKey(inputs: SimInputs): string {
    return simInputsCacheKey(inputs);
}

export function shouldRunBaseSimulation({
    hasConsumer,
    legacyHashSettled,
    mounted,
}: BaseSimulationGate): boolean {
    return mounted && legacyHashSettled && hasConsumer;
}

export function useBaseSimulation(
    simInputs: SimInputs,
    gate: BaseSimulationGate,
    cache: ComputationCache,
    debounceMs: number,
): BaseSimulationRun {
    const debouncedInputs = useDebouncedValue(simInputs, debounceMs);
    const isEnabled = shouldRunBaseSimulation(gate);
    const [computed, setComputed] = useState<ComputedBaseSimulation | null>(
        null,
    );

    useEffect(() => {
        if (!isEnabled) return;
        setComputed(runBaseSimulation(debouncedInputs, cache));
    }, [cache, debouncedInputs, isEnabled]);

    return {
        error: computed?.error ?? null,
        isPending: computed?.inputs !== simInputs,
        result: computed?.result ?? null,
    };
}

function runBaseSimulation(
    inputs: SimInputs,
    cache: ComputationCache,
): ComputedBaseSimulation {
    const refusal = simInputsSizingIssue(inputs);
    if (refusal !== null) return { error: refusal, inputs, result: null };
    const key = baseSimulationKey(inputs);
    const cached = cache.get(ComputationId.BaseSimulation, key);
    if (cached !== undefined) return { error: null, inputs, result: cached };
    try {
        const result = simulate(inputs);
        cache.set(ComputationId.BaseSimulation, key, result);
        return { error: null, inputs, result };
    } catch (error) {
        return {
            error: describeSimulationFailure(error),
            inputs,
            result: null,
        };
    }
}
