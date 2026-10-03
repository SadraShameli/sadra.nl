import { useMemo, useState } from 'react';

import { parsePositionSizeStop } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import {
    DEFAULT_ENTRY_INSTRUMENT,
    InstrumentStopEntry,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/InstrumentStopEntry';
import {
    RungTable,
    type RungTableRow,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/RungTable';
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
    type DocumentedRung,
    LiveTriggerCoverage,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
} from '~/lib/prop-calculator/advisor';

import { CopyGroupSimulationCard } from './CopyGroupSimulationCard';
import {
    bindingMemberIdsOf,
    COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT,
    COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
    COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT,
    COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT,
    copyGroupPayoutCountBlockText,
    copyGroupRuleTermsOf,
    type CopyGroupSizingSection,
    withPositionSizing,
} from './copyGroupSizingModel';

const NO_GROUP_SIZE_TEXT =
    "No rung fits the group's room today, so the group has no size.";

export enum GroupSizingViewKind {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
}

export type GroupSizingView =
    | { readonly kind: GroupSizingViewKind.Failed; readonly message: string }
    | { readonly kind: GroupSizingViewKind.Pending }
    | {
          readonly kind: GroupSizingViewKind.Ready;
          readonly refreshFailure?: null | string;
          readonly section: CopyGroupSizingSection;
      };

export function GroupSizingSection({
    row,
    sizing,
}: {
    readonly row: CopyGroupRow;
    readonly sizing: GroupSizingView;
}) {
    if (sizing.kind === GroupSizingViewKind.Pending) {
        return (
            <p
                aria-busy="true"
                className="text-sm text-muted-foreground"
                role="status"
            >
                Sizing and exposure are still loading.
            </p>
        );
    }
    if (sizing.kind === GroupSizingViewKind.Failed) {
        return (
            <p className="text-sm text-destructive" role="alert">
                Sizing and exposure could not be checked: {sizing.message}
            </p>
        );
    }
    return (
        <ReadyGroupSizing
            refreshFailure={sizing.refreshFailure ?? null}
            row={row}
            section={sizing.section}
        />
    );
}

function ReadyGroupSizing({
    refreshFailure,
    row,
    section,
}: {
    readonly refreshFailure: null | string;
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
    const { asOf, exposure, result, simulation, staleMembers, unsizedMembers } =
        sized;
    const isFundedGroup =
        sized.inputs.members.length > 0 &&
        sized.inputs.members.every(
            (member) => member.account.kind === TradingPhase.Funded,
        );
    const labelOf = (memberId: string) =>
        row.members.find((member) => member.id === memberId)?.label ?? memberId;
    const memberLine =
        result.kind === CopyGroupSizingResultKind.Rejected
            ? rejectionMemberLineOf(result.rejection, labelOf)
            : null;
    const [firstRung] =
        result.kind === CopyGroupSizingResultKind.Sized
            ? result.sizing.rungs
            : [];
    if (staleMembers.length > 0) {
        return (
            <div className="flex flex-col gap-2 text-sm">
                <RefreshFailure message={refreshFailure} />
                {staleMembers.map((member) => (
                    <p key={member.memberId} role="status">
                        The balance for {member.label} is from {member.asOf},
                        which is too old to size from. Enter today&apos;s
                        balance for {member.label} to see the group size.
                    </p>
                ))}
                <UnsizedMembers members={unsizedMembers} />
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2 text-sm">
            <RefreshFailure message={refreshFailure} />
            {result.kind === CopyGroupSizingResultKind.Sized ? (
                <>
                    {firstRung === undefined ? (
                        <p>{NO_GROUP_SIZE_TEXT}</p>
                    ) : (
                        <>
                            <p>
                                Documented size for every copy:{' '}
                                <strong>
                                    {formatCurrency(firstRung.risk)}
                                </strong>
                                , set by{' '}
                                {formatConjunctionList(
                                    bindingMemberIdsOf(result).map(labelOf),
                                )}
                                , as of {asOf}.
                            </p>
                            <RungTable
                                label={`Documented ladder for ${row.group.name}`}
                                rungs={rungTableRowsOf(result.sizing.rungs)}
                            />
                            {copyGroupRuleTermsOf(result.sizing).map((term) => (
                                <p key={term}>{term}</p>
                            ))}
                        </>
                    )}
                    {result.divergences.map((divergence) => (
                        <p
                            className="text-muted-foreground"
                            key={divergence.memberId}
                        >
                            {divergence.memberLabel} would size trade{' '}
                            {divergence.rungIndex + 1} at{' '}
                            {formatCurrency(divergence.ownRisk, 2)}, above the
                            group&apos;s{' '}
                            {formatCurrency(divergence.groupRisk, 2)} (the group
                            takes the smaller)
                        </p>
                    ))}
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
                    {result.payoutCountBlocks.length > 0 && (
                        <>
                            {result.payoutCountBlocks.map((block) => (
                                <p
                                    className="font-medium text-amber-400"
                                    key={block.firm}
                                >
                                    {copyGroupPayoutCountBlockText(
                                        block,
                                        labelOf,
                                    )}
                                </p>
                            ))}
                            <p className="text-muted-foreground">
                                {COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT}
                            </p>
                        </>
                    )}
                    {result.payoutCountNotChecked.length > 0 && (
                        <p className="text-muted-foreground">
                            {COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT}
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
                    , the sum of each account&apos;s own documented rung: an
                    upper bound on the group worst case, because the shared copy
                    size above is never larger than any member&apos;s own.
                </p>
            )}
            {exposure !== null && exposure.leftOutAccountIds.length > 0 && (
                <p className="text-muted-foreground">
                    {exposure.leftOutAccountIds.length}{' '}
                    {exposure.leftOutAccountIds.length === 1
                        ? 'member'
                        : 'members'}{' '}
                    not included:{' '}
                    {formatConjunctionList(
                        exposure.leftOutAccountIds.map(labelOf),
                    )}
                    .
                </p>
            )}
            <UnsizedMembers members={unsizedMembers} />
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

function RefreshFailure({ message }: { readonly message: null | string }) {
    if (message === null) return null;
    return (
        <p className="text-sm text-destructive" role="alert">
            Sizing and exposure may be out of date, the latest refresh failed:{' '}
            {message}
        </p>
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

function rungTableRowsOf(
    rungs: readonly DocumentedRung[],
): readonly RungTableRow[] {
    return rungs.map((rung) => ({
        cappedByText: rung.cappedBy.map(
            (constraint) => SIZING_CONSTRAINT_TEXT[constraint],
        ),
        risk: rung.risk,
        runningLossAfter: rung.runningLossAfter,
        takeProfit: rung.takeProfit,
    }));
}

function UnsizedMembers({
    members,
}: {
    readonly members: CopyGroupSizingSection['unsizedMembers'];
}) {
    if (members.length === 0) return null;
    return (
        <ul className="flex flex-col gap-1 text-muted-foreground">
            {members.map((member) => (
                <li key={member.memberId}>
                    {member.label} could not be sized: {member.reason}.
                </li>
            ))}
        </ul>
    );
}
