import { useCallback, useState } from 'react';

interface OpenRecordDialog<Row> {
    readonly editing: null | Row;
}

interface RecordDialog<Row> {
    readonly close: () => void;
    readonly editing: null | Row;
    readonly isOpen: boolean;
    readonly onOpenChange: (isOpen: boolean) => void;
    readonly startAdding: () => void;
    readonly startEditing: (row: Row) => void;
}

export function useRecordDialog<Row>(): RecordDialog<Row> {
    const [open, setOpen] = useState<null | OpenRecordDialog<Row>>(null);

    const close = useCallback(() => {
        setOpen(null);
    }, []);

    const onOpenChange = useCallback((isOpen: boolean) => {
        if (!isOpen) setOpen(null);
    }, []);

    const startAdding = useCallback(() => {
        setOpen({ editing: null });
    }, []);

    const startEditing = useCallback((row: Row) => {
        setOpen({ editing: row });
    }, []);

    return {
        close,
        editing: open?.editing ?? null,
        isOpen: open !== null,
        onOpenChange,
        startAdding,
        startEditing,
    };
}
