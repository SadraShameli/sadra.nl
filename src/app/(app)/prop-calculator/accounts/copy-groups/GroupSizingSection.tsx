import { type CopyGroupRow } from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    formatConjunctionList,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    CopyGroupSizingRejectionKind,
    CopyGroupSizingResultKind,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
} from '~/lib/prop-calculator/advisor';

import { CopyGroupSimulationCard } from './CopyGroupSimulationCard';
import {
    bindingMemberIdsOf,
    type CopyGroupSizingSection,
} from './copyGroupSizingModel';

export type GroupSizingView =
    | { readonly kind: 'failed'; readonly message: string }
    | { readonly kind: 'pending' }
    | { readonly kind: 'ready'; readonly section: CopyGroupSizingSection };

export function GroupSizingSection({
    row,
    sizing,
}: {
    readonly row: CopyGroupRow;
    readonly sizing: GroupSizingView;
}) {
    if (sizing.kind === 'pending') {
        return (
            <p aria-busy="true" className="text-sm text-muted-foreground">
                Sizing and exposure are still loading.
            </p>
        );
    }
    if (sizing.kind === 'failed') {
        return (
            <p className="text-sm text-destructive">
                Sizing and exposure could not be checked: {sizing.message}
            </p>
        );
    }
    const { asOf, exposure, result, simulation, unsizedMembers } =
        sizing.section;
    const labelOf = (memberId: string) =>
        row.members.find((member) => member.id === memberId)?.label ?? memberId;
    const cappedBy =
        result.kind === CopyGroupSizingResultKind.Sized
            ? (result.sizing.rungs[0]?.cappedBy ?? [])
            : [];
    return (
        <div className="flex flex-col gap-2 text-sm">
            {result.kind === CopyGroupSizingResultKind.Sized ? (
                <>
                    <p>
                        Documented size for every copy:{' '}
                        <strong>
                            {formatCurrency(result.sizing.rungs[0]?.risk ?? 0)}
                        </strong>
                        , set by{' '}
                        {formatConjunctionList(
                            bindingMemberIdsOf(result).map(labelOf),
                        )}
                        , as of {asOf}.
                    </p>
                    {cappedBy.length > 0 && (
                        <p className="text-muted-foreground">
                            {cappedBy
                                .map(
                                    (constraint) =>
                                        SIZING_CONSTRAINT_TEXT[constraint],
                                )
                                .join(' ')}
                        </p>
                    )}
                    {result.sizing.assumptions.length > 0 && (
                        <p className="text-muted-foreground">
                            {result.sizing.assumptions
                                .map(
                                    (assumption) =>
                                        SIZING_ASSUMPTION_TEXT[assumption],
                                )
                                .join(' ')}
                        </p>
                    )}
                    {result.sizing.sources.length > 0 && (
                        <p className="text-muted-foreground">
                            Source: {result.sizing.sources.join(', ')}.
                        </p>
                    )}
                </>
            ) : (
                <>
                    <p>{result.rejection.message}</p>
                    {result.rejection.kind ===
                        CopyGroupSizingRejectionKind.NoCushionRoom && (
                        <p className="text-muted-foreground">
                            No cushion room left for{' '}
                            {formatConjunctionList(
                                result.rejection.memberIds.map(labelOf),
                            )}
                            .
                        </p>
                    )}
                </>
            )}
            {exposure !== null && (
                <p>
                    Combined exposure: worst-case daily loss of{' '}
                    {formatCurrency(exposure.maxDailyLoss)} across the group
                    {exposure.shareOfCushionAtRisk !== null &&
                        `, ${formatPercent(exposure.shareOfCushionAtRisk)} of its combined cushion`}
                    , each account sized to its own documented rung, not to the
                    shared copy size above.
                </p>
            )}
            {unsizedMembers.length > 0 && (
                <ul className="flex flex-col gap-1 text-muted-foreground">
                    {unsizedMembers.map((member) => (
                        <li key={member.memberId}>
                            {member.label} could not be sized: {member.reason}.
                        </li>
                    ))}
                </ul>
            )}
            <CopyGroupSimulationCard plan={simulation} />
        </div>
    );
}
