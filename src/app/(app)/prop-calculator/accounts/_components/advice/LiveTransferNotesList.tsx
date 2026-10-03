export function LiveTransferNotesList({
    label,
    notes,
}: {
    readonly label: string;
    readonly notes: readonly string[];
}) {
    if (notes.length === 0) return null;
    return (
        <ul
            aria-label={label}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
        >
            {notes.map((note) => (
                <li key={note}>{note}</li>
            ))}
        </ul>
    );
}
