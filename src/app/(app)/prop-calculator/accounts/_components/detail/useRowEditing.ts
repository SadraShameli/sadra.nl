import { useCallback, useEffect, useRef, useState } from 'react';

interface RowEditing<Row> {
    readonly editing: null | Row;
    readonly startEditing: (row: Row, trigger: HTMLElement) => void;
    readonly stopEditing: () => void;
}

export function useRowEditing<Row>(): RowEditing<Row> {
    const [editing, setEditing] = useState<null | Row>(null);
    const returnFocusTo = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (editing !== null) return;
        const trigger = returnFocusTo.current;
        returnFocusTo.current = null;
        if (trigger?.isConnected === true) trigger.focus();
    }, [editing]);

    const startEditing = useCallback((row: Row, trigger: HTMLElement) => {
        returnFocusTo.current = trigger;
        setEditing(row);
    }, []);

    const stopEditing = useCallback(() => {
        setEditing(null);
    }, []);

    return { editing, startEditing, stopEditing };
}
