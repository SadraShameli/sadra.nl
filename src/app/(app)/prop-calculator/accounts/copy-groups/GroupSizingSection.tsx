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
import { ruleSourceListText } from '~/app/(app)/prop-calculator/accounts/_components/ruleSourceText';
import { InfoNote } from '~/components/InfoNote';
import { StatStrip, type StatStripItem } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Alert, AlertDescription } from '~/components/ui/alert';
import {
    formatConjunctionList,
    formatCurrency,
    formatDisplayDate,
    formatPercent,
} from '~/lib/format';
import { TradingPhase } from '~/lib/prop-calculator';
import {
    type CopyGroupSizingRejection,
    CopyGroupSizingRejectionKind,
    type CopyGroupSizingResult,
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
            <InfoNote aria-busy="true" role="status">
                Sizing and exposure are still loading.
            </InfoNote>
        );
    }
    if (sizing.kind === GroupSizingViewKind.Failed) {
        return (
            <Alert variant="destructive">
                <AlertDescription>
                    Sizing and exposure could not be checked: {sizing.message}
                </AlertDescription>
            </Alert>
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
            <div className="flex flex-col gap-3">
                <RefreshFailure message={refreshFailure} />
                {staleMembers.map((member) => (
                    <StatusRow
                        detail={`Enter today's balance for ${member.label} to see the group size.`}
                        key={member.memberId}
                        title={`The balance for ${member.label} is from ${formatDisplayDate(member.asOf)}, too old to size from`}
                        tone={StatusTone.Warn}
                    />
                ))}
                <UnsizedMembers members={unsizedMembers} />
            </div>
        );
    }
    const figures: StatStripItem[] = [];
    if (
        firstRung !== undefined &&
        result.kind === CopyGroupSizingResultKind.Sized
    ) {
        figures.push({
            caption: `Set by ${formatConjunctionList(bindingMemberIdsOf(result).map(labelOf))} on ${formatDisplayDate(asOf)}`,
            id: 'size',
            info: <SizingNotes result={result} />,
            label: 'Documented size for every copy',
            value: formatCurrency(firstRung.risk, 2),
        });
    }
    if (exposure !== null) {
        figures.push({
            caption:
                exposure.shareOfCushionAtRisk === null
                    ? undefined
                    : `${formatPercent(exposure.shareOfCushionAtRisk)} of the combined cushion`,
            id: 'exposure',
            info: (
                <>
                    <p>
                        Combined exposure: the sum of each account&apos;s own
                        documented rung. It is an upper bound on the group worst
                        case, because the shared copy size is never larger than
                        any member&apos;s own.
                    </p>
                    {exposure.leftOutAccountIds.length > 0 && (
                        <p>
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
                </>
            ),
            label: 'Worst-case daily loss',
            value: formatCurrency(exposure.maxDailyLoss, 2),
        });
    }
    const placement =
        result.kind === CopyGroupSizingResultKind.Sized
            ? result.contractPlacement
            : null;
    if (placement !== null && !placement.isRefused) {
        figures.push({
            caption: `${formatCurrency(placement.riskPerContract, 2)} risk each at this stop`,
            id: 'contracts',
            label: 'Contracts per copy',
            value: String(placement.contracts),
        });
    }
    return (
        <div className="flex flex-col gap-4">
            <RefreshFailure message={refreshFailure} />
            {result.kind === CopyGroupSizingResultKind.Rejected && (
                <StatusRow
                    detail={memberLine ?? undefined}
                    title={result.rejection.message}
                    tone={StatusTone.Warn}
                />
            )}
            {result.kind === CopyGroupSizingResultKind.Sized &&
                firstRung === undefined && (
                    <StatusRow
                        title={NO_GROUP_SIZE_TEXT}
                        tone={StatusTone.Warn}
                    />
                )}
            {figures.length > 0 && (
                <StatStrip
                    items={figures}
                    label={`Sizing for ${row.group.name}`}
                />
            )}
            {result.kind === CopyGroupSizingResultKind.Sized &&
                firstRung !== undefined && (
                    <>
                        <RungTable
                            label={`Documented ladder for ${row.group.name}`}
                            rungs={rungTableRowsOf(result.sizing.rungs)}
                        />
                        <div className="flex flex-col gap-1 text-sm text-ink">
                            {copyGroupRuleTermsOf(result.sizing).map((term) => (
                                <p className="m-0" key={term}>
                                    {term}
                                </p>
                            ))}
                        </div>
                    </>
                )}
            {result.kind === CopyGroupSizingResultKind.Sized &&
                result.payoutCountBlocks.map((block) => (
                    <StatusRow
                        key={block.firm}
                        title={copyGroupPayoutCountBlockText(block, labelOf)}
                        tone={StatusTone.Warn}
                    />
                ))}
            {placement?.isRefused === true && (
                <StatusRow
                    detail={`It is below one contract, which risks ${formatCurrency(placement.riskPerContract, 2)}.`}
                    title="The group size cannot be placed at this stop"
                    tone={StatusTone.Warn}
                />
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
        <Alert variant="destructive">
            <AlertDescription>
                Sizing and exposure may be out of date, the latest refresh
                failed: {message}
            </AlertDescription>
        </Alert>
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

function SizingNotes({
    result,
}: {
    readonly result: Extract<
        CopyGroupSizingResult,
        { kind: CopyGroupSizingResultKind.Sized }
    >;
}) {
    return (
        <>
            {result.divergences.map((divergence) => (
                <p key={divergence.memberId}>
                    {divergence.memberLabel} would size trade{' '}
                    {divergence.rungIndex + 1} at{' '}
                    {formatCurrency(divergence.ownRisk, 2)}, above the
                    group&apos;s {formatCurrency(divergence.groupRisk, 2)} (the
                    group takes the smaller)
                </p>
            ))}
            {result.sizing.assumptions.length > 0 && (
                <p>
                    {result.sizing.assumptions
                        .map((assumption) => SIZING_ASSUMPTION_TEXT[assumption])
                        .join(' ')}
                </p>
            )}
            {result.sizing.sources.length > 0 && (
                <p>Source: {ruleSourceListText(result.sizing.sources)}.</p>
            )}
            {result.liveTriggerCoverage !== null && (
                <p>
                    {result.liveTriggerCoverage === LiveTriggerCoverage.Enforced
                        ? COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT
                        : COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT}
                </p>
            )}
            {result.payoutCountBlocks.length > 0 && (
                <p>{COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT}</p>
            )}
            {result.payoutCountNotChecked.length > 0 && (
                <p>{COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT}</p>
            )}
        </>
    );
}

function UnsizedMembers({
    members,
}: {
    readonly members: CopyGroupSizingSection['unsizedMembers'];
}) {
    if (members.length === 0) return null;
    return (
        <>
            {members.map((member) => (
                <StatusRow
                    detail={`${member.reason}.`}
                    key={member.memberId}
                    title={`${member.label} could not be sized`}
                    tone={StatusTone.Neutral}
                />
            ))}
        </>
    );
}
