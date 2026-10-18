import { MissingValue } from '~/components/MissingValue';
import { ConversionNote, Eur } from '~/lib/accounting/core/money';

export function ConversionNotes({
    notes,
}: {
    readonly notes: readonly string[];
}) {
    const summary = ConversionNote.summarize(notes);
    if (summary.descriptions.length === 0) return <MissingValue />;
    return (
        <span className="flex flex-col gap-0.5 text-xs">
            {summary.descriptions.map((description) => (
                <span key={description}>{description}</span>
            ))}
            {summary.feeEur === 0 ? null : (
                <span className="text-ink-muted">
                    Fee {Eur.format(summary.feeEur)}
                </span>
            )}
        </span>
    );
}
