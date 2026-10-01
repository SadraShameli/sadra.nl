import { sizingObjectiveText } from '~/lib/prop-calculator/advisor';

import { type ProvenanceView } from './adviceViewModel';

export function ProvenanceLine({
    provenance,
}: {
    readonly provenance: ProvenanceView;
}) {
    const parts = [
        `source ${provenance.source}`,
        `${provenance.startBasis} start`,
        sizingObjectiveText(provenance.objective),
        `computed ${provenance.computedAt}`,
        `snapshot ${provenance.snapshotDate}`,
        provenance.trials === null ? null : `n=${String(provenance.trials)}`,
        provenance.seed === null ? null : `seed ${String(provenance.seed)}`,
        provenance.solverVersion === null
            ? null
            : `solver ${provenance.solverVersion}`,
        provenance.planRulesFingerprint === null
            ? null
            : `plan rules fingerprint ${provenance.planRulesFingerprint}`,
        provenance.firmDataDate === null
            ? 'firm data unverified'
            : `firm data verified ${provenance.firmDataDate}`,
    ].filter((part): part is string => part !== null);
    return (
        <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p>
    );
}
