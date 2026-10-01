import { type ReasonView } from './adviceViewModel';

export function ReasonsList({
    reasons,
}: {
    readonly reasons: readonly ReasonView[];
}) {
    if (reasons.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No differences from the documented rule were found.
            </p>
        );
    }
    return (
        <ul className="flex flex-col gap-1 text-sm">
            {reasons.map((reason, index) => (
                <li key={`${reason.kind}-${String(index)}`}>{reason.text}</li>
            ))}
        </ul>
    );
}
