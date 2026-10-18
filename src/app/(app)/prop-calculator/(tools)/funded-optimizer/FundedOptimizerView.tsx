'use client';

import { useMemo } from 'react';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import {
    fundedOptimizerLiveTransferLines,
    fundedOptimizerPolicyBasis,
    fundedOptimizerRanking,
    fundedOptimizerRequest,
    fundedOptimizerRows,
    fundedOptimizerTrialsNote,
    FundedPolicyBasis,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import { useFundedSweep } from '~/app/(app)/prop-calculator/_components/fundedOptimizer/useFundedSweep';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import {
    ObjectiveNotes,
    ObjectiveSelect,
    useCalculatorObjectiveChip,
} from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { useToolRulebook } from '~/app/(app)/prop-calculator/_components/useToolRulebook';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    type FundedSweepProgress,
    type FundedSweepRequest,
    type FundedSweepResult,
} from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import { FilterToolbar } from '~/components/FilterToolbar';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { DataTable } from '~/components/ui/data-table';
import { LifetimePayoutCapBasis } from '~/lib/prop-calculator/advisor';
import {
    FUNDED_ROW_HEADERS,
    FundedCandidateBuildKind,
    FundedCandidateRefusal,
    type FundedCandidateRefusalDetail,
    fundedSortDescription,
    type FundedSortKey,
    fundedSurvivorsNote,
} from '~/lib/prop-calculator/optimize';
import { type SimInputs } from '~/lib/prop-calculator/simulator';

function fundedColumnId(index: number): string {
    return `funded-column-${String(index)}`;
}

const RESULT_HEADING_ID = 'funded-optimizer-result-heading';

const POLICY_COLUMN_INDEX = 0;

const POLICY_BASIS_LABELS: Record<FundedPolicyBasis, string> = {
    [FundedPolicyBasis.CalculatorOverride]: 'your override',
    [FundedPolicyBasis.RulebookDefault]: 'rulebook default',
};

const LIFETIME_PAYOUT_CAP_BASIS_LABELS: Record<LifetimePayoutCapBasis, string> =
    {
        [LifetimePayoutCapBasis.LiveTriggersNotChecked]: 'not yet checked',
        [LifetimePayoutCapBasis.VerifiedCountTrigger]:
            'a verified count trigger',
        [LifetimePayoutCapBasis.VerifiedNoCountTrigger]:
            'a verified no-count trigger',
    };

export function FundedOptimizerView() {
    const { state } = useCalculatorInputs();
    const { rulebook } = useToolRulebook();
    const ranking = fundedOptimizerRanking(state.objective);
    const objectiveChip = useCalculatorObjectiveChip();

    const request = useMemo(
        () => fundedOptimizerRequest(state, rulebook),
        [state, rulebook],
    );
    const sweep = useFundedSweep(request);
    const sortDescriptionInputs: SimInputs = {
        ...request.base,
        plan: state.plan,
    };
    const policyBasis = useMemo(
        () => fundedOptimizerPolicyBasis(state),
        [state],
    );
    const builtResult =
        sweep.reason === null &&
        sweep.phase !== WorkerTaskPhase.Running &&
        sweep.result?.kind === FundedCandidateBuildKind.Built
            ? sweep.result
            : null;
    const trialsNote = fundedOptimizerTrialsNote(state.trials);
    const notes =
        builtResult === null
            ? []
            : [
                  ...(trialsNote === null ? [] : [trialsNote]),
                  ...fundedOptimizerLiveTransferLines(
                      state.plan,
                      state.liveTransferHazard,
                      builtResult.rows,
                  ),
                  ...builtResult.notes,
              ];

    return (
        <>
            <ToolPageHeading toolId={ToolId.FundedOptimizer} />
            <div className="app-prop-calculator__funded-optimizer mb-10 flex flex-col gap-6">
                <InputsSummary />
                <section aria-labelledby={RESULT_HEADING_ID}>
                    <ToolPanel
                        description={`Cushion: ${POLICY_BASIS_LABELS[policyBasis.cushion]} · Payout request: ${POLICY_BASIS_LABELS[policyBasis.payoutRequest]} · Lifetime payout cap: ${LIFETIME_PAYOUT_CAP_BASIS_LABELS[request.policy.lifetimePayoutCapBasis]}`}
                        info={
                            <>
                                {notes.length > 0 && (
                                    <ul className="flex flex-col gap-1">
                                        {notes.map((note) => (
                                            <li
                                                className="first-letter:uppercase"
                                                key={note}
                                            >
                                                {note}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className="whitespace-pre-line">
                                    {fundedSortDescription(
                                        ranking.sort,
                                        sortDescriptionInputs,
                                    )}
                                </p>
                                <p className="whitespace-pre-line">
                                    {fundedSurvivorsNote(request.base.trials)}
                                </p>
                            </>
                        }
                        isComputing={
                            sweep.reason === null &&
                            (sweep.result === null ||
                                sweep.phase === WorkerTaskPhase.Running)
                        }
                        title={ranking.heading}
                        titleId={RESULT_HEADING_ID}
                    >
                        <FilterToolbar label="Funded optimizer ranking">
                            <ObjectiveSelect
                                objective={objectiveChip.objective}
                                onChange={objectiveChip.onChange}
                            />
                        </FilterToolbar>
                        <ObjectiveNotes
                            choiceNotes={objectiveChip.choiceNotes}
                            note={objectiveChip.note}
                        />
                        <FundedOptimizerResult
                            progress={sweep.progress}
                            reason={sweep.reason}
                            request={request}
                            result={sweep.result}
                            sort={ranking.sort}
                            state={sweep.phase}
                        />
                    </ToolPanel>
                </section>
            </div>
        </>
    );
}

function describeFundedSweepRefusal(
    refusal: FundedCandidateRefusalDetail,
): string {
    switch (refusal.kind) {
        case FundedCandidateRefusal.InvalidLists: {
            return `Invalid funded candidates: ${refusal.issues}`;
        }
        case FundedCandidateRefusal.LadderRungBelowOneContract: {
            return 'Every funded ladder rung is below one contract at this stop.';
        }
        case FundedCandidateRefusal.NoCandidates: {
            return 'No funded policies to test at this risk and stop.';
        }
        case FundedCandidateRefusal.PercentNeedsStop: {
            return 'Percent-of-cushion candidates need an instrument and a stop.';
        }
    }
}

function FundedOptimizerResult({
    progress,
    reason,
    request,
    result,
    sort,
    state,
}: {
    progress: FundedSweepProgress | null;
    reason: null | string;
    request: FundedSweepRequest;
    result: FundedSweepResult | null;
    sort: FundedSortKey;
    state: WorkerTaskPhase;
}) {
    if (reason !== null) return <SimulationFailureNotice message={reason} />;
    if (result === null || state === WorkerTaskPhase.Running) {
        return (
            <div className="flex flex-col gap-2">
                {progress !== null && (
                    <p className="text-xs text-muted-foreground" role="status">
                        {`${progress.completed} of ${progress.total} policies`}
                    </p>
                )}
                <PanelSkeleton />
            </div>
        );
    }
    if (result.kind === FundedCandidateBuildKind.Refused) {
        return (
            <StatusRow
                title={describeFundedSweepRefusal(result.refusal)}
                tone={StatusTone.Warn}
            />
        );
    }
    const rows = fundedOptimizerRows(result.rows, sort, request.base.trials);
    return (
        <DataTable
            columns={FUNDED_ROW_HEADERS.map((label, index) => ({
                cell: ({
                    row: { original: row },
                }: {
                    row: { original: (typeof rows)[number] };
                }) => {
                    const standardError = row.standardErrors[index] ?? null;
                    return (
                        <span className="whitespace-nowrap tabular-nums">
                            {row.cells[index]}
                            {standardError !== null && ` (SE ${standardError})`}
                        </span>
                    );
                },
                header: label,
                id: fundedColumnId(index),
                meta: { isRowHeader: index === POLICY_COLUMN_INDEX },
            }))}
            data={[...rows]}
            isSortable={false}
            pageSize={null}
            rowId={(row) => String(row.cells[POLICY_COLUMN_INDEX])}
        />
    );
}
