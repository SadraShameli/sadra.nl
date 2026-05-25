'use client';

import { useCallback, useRef, useState } from 'react';

export interface StreamHandle<TEvent> {
    abort: () => void;
    error: null | string;
    events: TEvent[];
    reset: () => void;
    running: boolean;
    start: (request: RequestInit & { url: string }) => Promise<void>;
}

export function useImportStream<TEvent>(): StreamHandle<TEvent> {
    const [events, setEvents] = useState<TEvent[]>([]);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<null | string>(null);
    const controllerRef = useRef<AbortController | null>(null);

    const abort = useCallback(() => {
        controllerRef.current?.abort();
    }, []);

    const reset = useCallback(() => {
        setEvents([]);
        setError(null);
        setRunning(false);
    }, []);

    const start = useCallback(
        async ({ url, ...init }: RequestInit & { url: string }) => {
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            setEvents([]);
            setError(null);
            setRunning(true);

            try {
                const response = await fetch(url, {
                    ...init,
                    signal: controller.signal,
                });
                if (!response.ok || !response.body) {
                    throw new Error(
                        `Stream open failed: ${response.status} ${response.statusText}`,
                    );
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let idx: number;
                    while ((idx = buffer.indexOf('\n\n')) !== -1) {
                        const chunk = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);
                        for (const line of chunk.split('\n')) {
                            if (line.startsWith('data:')) {
                                const json = line.slice(5).trim();
                                if (!json) continue;
                                try {
                                    const parsed = JSON.parse(json) as TEvent;
                                    setEvents((prev) => [...prev, parsed]);
                                } catch {}
                            }
                        }
                    }
                }
            } catch (error_) {
                const isAbort =
                    error_ instanceof DOMException &&
                    error_.name === 'AbortError';
                if (!isAbort) {
                    setError(
                        error_ instanceof Error
                            ? error_.message
                            : String(error_),
                    );
                }
            } finally {
                setRunning(false);
            }
        },
        [],
    );

    return { abort, error, events, reset, running, start };
}
