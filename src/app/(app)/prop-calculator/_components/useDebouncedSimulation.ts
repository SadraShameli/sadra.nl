import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { ComputationCache, initialFor } from './computationCache';
import { type ComputationId, type ComputationResultMap } from './ComputationId';
import { describeSimulationFailure } from './simulationFailure';

export interface DebouncedComputation<T> {
    error: null | string;
    pending: boolean;
    result: T;
}

export const ComputationCacheContext = createContext<ComputationCache | null>(
    null,
);

export function useDebouncedComputation<Id extends ComputationId>(
    id: Id,
    key: string,
    delay: number,
    compute: () => ComputationResultMap[Id],
    initial: ComputationResultMap[Id],
    refusal: null | string = null,
): DebouncedComputation<ComputationResultMap[Id]> {
    const sharedCache = useContext(ComputationCacheContext);
    const [localCache] = useState(() => new ComputationCache());
    const cache = sharedCache ?? localCache;
    const debouncedKey = useDebouncedValue(key, delay);
    const computeReference = useRef(compute);
    computeReference.current = compute;
    const keyReference = useRef(key);
    keyReference.current = key;
    const initialReference = useRef(initial);
    initialReference.current = initial;
    const refusalReference = useRef(refusal);
    refusalReference.current = refusal;
    const [initialState] = useState(() => initialFor(id, key, cache));
    const [result, setResult] = useState<ComputationResultMap[Id]>(
        initialState.shouldCompute ? initial : initialState.result,
    );
    const [pending, setPending] = useState(initialState.pending);
    const [error, setError] = useState<null | string>(null);
    const resultKeyReference = useRef<null | string>(
        initialState.shouldCompute ? null : key,
    );

    useEffect(() => {
        if (resultKeyReference.current === debouncedKey) return;
        let isCancelled = false;
        setPending(true);
        setError(null);
        const handle = setTimeout(() => {
            if (isCancelled) {
                return;
            }

            if (refusalReference.current !== null) {
                resultKeyReference.current = null;
                setResult(initialReference.current);
                setPending(false);
                return;
            }

            const computedKey = keyReference.current;
            resultKeyReference.current = computedKey;
            try {
                const next = computeReference.current();
                cache.set(id, computedKey, next);
                setResult(next);
            } catch (error_) {
                setResult(initialReference.current);
                setError(describeSimulationFailure(error_));
            }
            setPending(false);
        }, 0);
        return () => {
            isCancelled = true;
            clearTimeout(handle);
        };
    }, [cache, debouncedKey, id]);

    return refusal === null
        ? { error, pending, result }
        : { error: refusal, pending: false, result: initial };
}

export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}
