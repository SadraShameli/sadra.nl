import { type FirmId } from '~/lib/prop-calculator';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

import { provenanceTextOf, type ProvenanceView } from './adviceViewModel';

export function ProvenanceLine({
    firmId,
    provenance,
}: {
    readonly firmId: FirmId;
    readonly provenance: ProvenanceView;
}) {
    const text = provenanceTextOf(
        provenance,
        firmDataProvenance(firmId).openItems,
    );
    return (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p>{text.parts.join(' · ')}</p>
            {text.openItems.length === 0 ? (
                <p>{text.openItemsSummary}</p>
            ) : (
                <details>
                    <summary className="cursor-pointer">
                        {text.openItemsSummary}
                    </summary>
                    <ul className="list-disc pl-4">
                        {text.openItems.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
