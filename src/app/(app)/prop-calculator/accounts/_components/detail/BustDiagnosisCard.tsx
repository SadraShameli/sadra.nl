import {
    type BustDiagnosis,
    BustDiagnosisKind,
} from '~/lib/prop-accounts/conduct';

const BUST_DIAGNOSIS_LABEL: Readonly<Record<BustDiagnosisKind, string>> = {
    [BustDiagnosisKind.Structural]:
        'Structural: a rule was broken, not a drawdown reached while trading within the plan',
    [BustDiagnosisKind.Unknown]:
        'Unknown: not enough recorded evidence to tell',
    [BustDiagnosisKind.WithinPlan]:
        'Within plan: the documented rules were followed and the drawdown was reached anyway',
};

export function BustDiagnosisCard({
    diagnosis,
}: {
    readonly diagnosis: BustDiagnosis;
}) {
    return (
        <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">
                {BUST_DIAGNOSIS_LABEL[diagnosis.kind]}
            </p>
            {diagnosis.evidence.length === 0 ? (
                <p className="text-muted-foreground">
                    No supporting evidence recorded.
                </p>
            ) : (
                <ul className="flex flex-col gap-1 text-muted-foreground">
                    {diagnosis.evidence.map((item, index) => (
                        <li key={`${item.kind}-${String(index)}`}>
                            {item.detail}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
