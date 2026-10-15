'use client';

import { ChevronDown } from 'lucide-react';
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
import { CalculatorObjectiveChip } from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
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
import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/Collapsible';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { LifetimePayoutCapBasis } from '~/lib/prop-calculator/advisor';
import { type Plan } from '~/lib/prop-calculator/core';
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

const RESULT_HEADING_ID = 'funded-optimizer-result-heading';

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

    return (
        <>
            <ToolPageHeading toolId={ToolId.FundedOptimizer} />
            <div className="app-prop-calculator__funded-optimizer mb-10 flex flex-col gap-6">
                <InputsSummary />
                <section
                    aria-labelledby={RESULT_HEADING_ID}
                    className="flex flex-col gap-4"
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={RESULT_HEADING_ID}
                    >
                        {ranking.heading}
                    </h2>
                    <CalculatorObjectiveChip />
                    <p className="text-xs text-muted-foreground">
                        {`Cushion: ${POLICY_BASIS_LABELS[policyBasis.cushion]} · Payout request: ${POLICY_BASIS_LABELS[policyBasis.payoutRequest]} · Lifetime payout cap: ${LIFETIME_PAYOUT_CAP_BASIS_LABELS[request.policy.lifetimePayoutCapBasis]}`}
                    </p>
                    <FundedOptimizerResult
                        hazard={state.liveTransferHazard}
                        plan={state.plan}
                        progress={sweep.progress}
                        reason={sweep.reason}
                        request={request}
                        requestedTrials={state.trials}
                        result={sweep.result}
                        sort={ranking.sort}
                        sortDescriptionInputs={sortDescriptionInputs}
                        state={sweep.phase}
                    />
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
    hazard,
    plan,
    progress,
    reason,
    request,
    requestedTrials,
    result,
    sort,
    sortDescriptionInputs,
    state,
}: {
    hazard: number;
    plan: Plan;
    progress: FundedSweepProgress | null;
    reason: null | string;
    request: FundedSweepRequest;
    requestedTrials: number;
    result: FundedSweepResult | null;
    sort: FundedSortKey;
    sortDescriptionInputs: SimInputs;
    state: WorkerTaskPhase;
}) {
    if (reason !== null) return <SimulationFailureNotice message={reason} />;
    if (result === null || state === WorkerTaskPhase.Running) {
        return (
            <div aria-busy="true" className="flex flex-col gap-2">
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
            <Alert>
                <AlertDescription>
                    {describeFundedSweepRefusal(result.refusal)}
                </AlertDescription>
            </Alert>
        );
    }
    const rows = fundedOptimizerRows(result.rows, sort, request.base.trials);
    const trialsNote = fundedOptimizerTrialsNote(requestedTrials);
    const notes = [
        ...(trialsNote === null ? [] : [trialsNote]),
        ...fundedOptimizerLiveTransferLines(plan, hazard, result.rows),
        ...result.notes,
    ];
    return (
        <div className="flex flex-col gap-3">
            {notes.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {notes.map((note) => (
                        <li className="first-letter:uppercase" key={note}>
                            {note}
                        </li>
                    ))}
                </ul>
            )}
            <Table>
                <TableHeader>
                    <TableRow>
                        {FUNDED_ROW_HEADERS.map((label) => (
                            <TableHead
                                className="first-letter:uppercase"
                                key={label}
                                scope="col"
                            >
                                {label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.cells[0]}>
                            {row.cells.map((cell, index) => {
                                const standardError =
                                    row.standardErrors[index] ?? null;
                                return (
                                    <TableCell
                                        className="whitespace-nowrap tabular-nums"
                                        key={`${row.cells[0]}-${index}`}
                                    >
                                        {cell}
                                        {standardError !== null &&
                                            ` (SE ${standardError})`}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Collapsible className="rounded-md border">
                <CollapsibleTrigger asChild>
                    <Button
                        className="group w-full justify-between"
                        type="button"
                        variant="ghost"
                    >
                        How the ranking and the survivors column work
                        <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-2 px-3 pb-3 text-sm whitespace-pre-line text-muted-foreground">
                    <p>{fundedSortDescription(sort, sortDescriptionInputs)}</p>
                    <p>{fundedSurvivorsNote(request.base.trials)}</p>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
