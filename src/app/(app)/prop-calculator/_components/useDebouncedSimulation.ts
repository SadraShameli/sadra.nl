import { useEffect, useRef, useState } from 'react';

export interface DebouncedComputation<T> {
    pending: boolean;
    result: T;
}

export function useDebouncedComputation<T>(
    key: string,
    delay: number,
    compute: () => T,
    initial: T,
    isInitiallyPending = false,
): DebouncedComputation<T> {
    const debouncedKey = useDebouncedValue(key, delay);
    const computeReference = useRef(compute);
    computeReference.current = compute;
    const [result, setResult] = useState<T>(initial);
    const [pending, setPending] = useState(isInitiallyPending);

    useEffect(() => {
        let isCancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const next = computeReference.current();
            if (!isCancelled) {
                setResult(next);
                setPending(false);
            }
        }, 0);
        return () => {
            isCancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    return { pending, result };
}

export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}
