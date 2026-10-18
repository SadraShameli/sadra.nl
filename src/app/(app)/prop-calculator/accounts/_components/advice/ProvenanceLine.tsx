import { DisclosureTrigger } from '~/app/(app)/prop-calculator/accounts/_components/DisclosureTrigger';
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible';
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
            <p className="wrap-break-word">{text.parts.join(' · ')}</p>
            {text.openItems.length === 0 ? (
                <p>{text.openItemsSummary}</p>
            ) : (
                <Collapsible className="flex flex-col">
                    <DisclosureTrigger className="text-xs">
                        {text.openItemsSummary}
                    </DisclosureTrigger>
                    <CollapsibleContent>
                        <ul className="list-disc pl-4">
                            {text.openItems.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
}
