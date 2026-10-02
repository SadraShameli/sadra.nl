import { useMemo, useState } from 'react';

import { parsePositionSizeStop } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import {
    DEFAULT_ENTRY_INSTRUMENT,
    InstrumentStopEntry,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/InstrumentStopEntry';
import { type CopyGroupRow } from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    formatConjunctionList,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import { TradingPhase } from '~/lib/prop-calculator';
import {
    type CopyGroupSizingRejection,
    CopyGroupSizingRejectionKind,
    CopyGroupSizingResultKind,
    LiveTriggerCoverage,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
} from '~/lib/prop-calculator/advisor';

import { CopyGroupSimulationCard } from './CopyGroupSimulationCard';
import {
    bindingMemberIdsOf,
    COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT,
    COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
    type CopyGroupSizingSection,
    withPositionSizing,
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
    return <ReadyGroupSizing row={row} section={sizing.section} />;
}

function ReadyGroupSizing({
    row,
    section,
}: {
    readonly row: CopyGroupRow;
    readonly section: CopyGroupSizingSection;
}) {
    const [instrument, setInstrument] = useState(DEFAULT_ENTRY_INSTRUMENT);
    const [stopInput, setStopInput] = useState('');
    const stopPoints = parsePositionSizeStop(stopInput);
    const sized = useMemo(
        () =>
            stopPoints === null
                ? section
                : withPositionSizing(section, { instrument, stopPoints }),
        [section, instrument, stopPoints],
    );
    const { asOf, exposure, result, simulation, unsizedMembers } = sized;
    const isFundedGroup =
        sized.inputs.members.length > 0 &&
        sized.inputs.members.every(
            (member) => member.account.kind === TradingPhase.Funded,
        );
    const labelOf = (memberId: string) =>
        row.members.find((member) => member.id === memberId)?.label ?? memberId;
    const cappedBy =
        result.kind === CopyGroupSizingResultKind.Sized
            ? (result.sizing.rungs[0]?.cappedBy ?? [])
            : [];
    const memberLine =
        result.kind === CopyGroupSizingResultKind.Rejected
            ? rejectionMemberLineOf(result.rejection, labelOf)
            : null;
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
                    {result.liveTriggerCoverage !== null && (
                        <p className="text-muted-foreground">
                            {result.liveTriggerCoverage ===
                            LiveTriggerCoverage.Enforced
                                ? COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT
                                : COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT}
                        </p>
                    )}
                    {result.contractPlacement !== null && (
                        <p
                            className={
                                result.contractPlacement.isRefused
                                    ? 'font-medium text-amber-400'
                                    : undefined
                            }
                        >
                            {result.contractPlacement.isRefused
                                ? `The group size cannot be placed at this stop: it is below one contract, which risks ${formatCurrency(result.contractPlacement.riskPerContract, 2)}.`
                                : `Each copy places ${String(result.contractPlacement.contracts)} ${result.contractPlacement.contracts === 1 ? 'contract' : 'contracts'} at this stop, where one contract risks ${formatCurrency(result.contractPlacement.riskPerContract, 2)}.`}
                        </p>
                    )}
                </>
            ) : (
                <>
                    <p>{result.rejection.message}</p>
                    {memberLine !== null && (
                        <p className="text-muted-foreground">{memberLine}</p>
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
            {(isFundedGroup || stopPoints !== null) && (
                <InstrumentStopEntry
                    instrument={instrument}
                    instrumentId={`copy-group-instrument-${row.group.id}`}
                    onInstrumentChange={setInstrument}
                    onStopInputChange={setStopInput}
                    stopId={`copy-group-stop-${row.group.id}`}
                    stopInput={stopInput}
                />
            )}
            <CopyGroupSimulationCard plan={simulation} />
        </div>
    );
}

function rejectionMemberLineOf(
    rejection: CopyGroupSizingRejection,
    labelOf: (memberId: string) => string,
): null | string {
    switch (rejection.kind) {
        case CopyGroupSizingRejectionKind.BelowOneContractAtStop: {
            return `One contract at this stop risks more than the size allowed for ${formatConjunctionList(rejection.memberIds.map(labelOf))}.`;
        }
        case CopyGroupSizingRejectionKind.LiveNotModeled:
        case CopyGroupSizingRejectionKind.MixedStage:
        case CopyGroupSizingRejectionKind.NoMembers: {
            return null;
        }
        case CopyGroupSizingRejectionKind.NoCushionRoom: {
            return `No cushion room left for ${formatConjunctionList(rejection.memberIds.map(labelOf))}.`;
        }
    }
}
