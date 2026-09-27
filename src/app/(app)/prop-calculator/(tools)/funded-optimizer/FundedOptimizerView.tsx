'use client';

import { useMemo, useState } from 'react';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import {
    fundedOptimizerPolicyBasis,
    fundedOptimizerRequest,
    fundedOptimizerRows,
    FundedPolicyBasis,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import { useFundedSweep } from '~/app/(app)/prop-calculator/_components/fundedOptimizer/useFundedSweep';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { type FundedSweepRequest, type FundedSweepResult } from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import { useSession } from '~/lib/auth/client';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    FundedCandidateBuildKind,
    FundedCandidateRefusal,
    type FundedCandidateRefusalDetail,
    fundedSortDescription,
    FundedSortKey,
} from '~/lib/prop-calculator/optimize';
import { type SimInputs } from '~/lib/prop-calculator/simulator';
import { api } from '~/trpc/react';

const RESULT_HEADING_ID = 'funded-optimizer-result-heading';

const SORT_LABELS: Record<FundedSortKey, string> = {
    [FundedSortKey.Cycle]: 'This run only (per-cycle)',
    [FundedSortKey.Monthly]: 'Steady state (per month)',
};

const POLICY_BASIS_LABELS: Record<FundedPolicyBasis, string> = {
    [FundedPolicyBasis.CalculatorOverride]: 'your override',
    [FundedPolicyBasis.RulebookDefault]: 'rulebook default',
};

const HEADER_CELLS = [
    'funded policy',
    'per-cycle net',
    'horizon credit',
    'monthly net',
    'monthly ex-credit',
    'bust when funded',
    'survivors',
];

export function FundedOptimizerView() {
    const { state } = useCalculatorInputs();
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const rulebook =
        hasSession && rulebookQuery.data !== undefined
            ? rulebookQuery.data
            : DEFAULT_RULEBOOK;
    const [sort, setSort] = useState(FundedSortKey.Monthly);

    const request = useMemo(
        () => fundedOptimizerRequest(state, rulebook),
        [state, rulebook],
    );
    const sweep = useFundedSweep(request);
    const sortDescriptionInputs: SimInputs = { ...request.base, plan: state.plan };
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2
                            className="text-lg font-semibold tracking-tight text-white"
                            id={RESULT_HEADING_ID}
                        >
                            Funded optimizer
                        </h2>
                        <div className="flex gap-2" role="group">
                            {[FundedSortKey.Monthly, FundedSortKey.Cycle].map(
                                (key) => (
                                    <button
                                        aria-pressed={sort === key}
                                        className="rounded-md border border-white/10 px-3 py-1 text-xs text-muted-foreground aria-pressed:bg-white/10 aria-pressed:text-white"
                                        key={key}
                                        onClick={() => setSort(key)}
                                        type="button"
                                    >
                                        {SORT_LABELS[key]}
                                    </button>
                                ),
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {`cushion: ${POLICY_BASIS_LABELS[policyBasis.cushion]}, payout request: ${POLICY_BASIS_LABELS[policyBasis.payoutRequest]}`}
                    </p>
                    <FundedOptimizerResult
                        reason={sweep.reason}
                        request={request}
                        result={sweep.result}
                        sort={sort}
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
    reason,
    request,
    result,
    sort,
    sortDescriptionInputs,
    state,
}: {
    reason: null | string;
    request: FundedSweepRequest;
    result: FundedSweepResult | null;
    sort: FundedSortKey;
    sortDescriptionInputs: SimInputs;
    state: WorkerTaskPhase;
}) {
    if (reason !== null) return <SimulationFailureNotice message={reason} />;
    if (result === null || state === WorkerTaskPhase.Running) {
        return <PanelSkeleton />;
    }
    if (result.kind === FundedCandidateBuildKind.Refused) {
        return (
            <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
                {describeFundedSweepRefusal(result.refusal)}
            </p>
        );
    }
    const rows = fundedOptimizerRows(result.rows, sort, request.base.trials);
    return (
        <div className="flex flex-col gap-3">
            {result.notes.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {result.notes.map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
            )}
            <p className="whitespace-pre-line text-xs text-muted-foreground">
                {fundedSortDescription(sort, sortDescriptionInputs)}
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr>
                            {HEADER_CELLS.map((label) => (
                                <th
                                    className="whitespace-nowrap px-2 py-1 text-xs font-medium text-muted-foreground"
                                    key={label}
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                className="border-t border-white/5"
                                key={row.cells[0]}
                            >
                                {row.cells.map((cell, index) => (
                                    <td
                                        className="whitespace-nowrap px-2 py-1 tabular-nums"
                                        key={`${row.cells[0]}-${index}`}
                                    >
                                        {cell}
                                        {index === 3 &&
                                            row.monthlyNetStandardError !==
                                                null &&
                                            ` (SE ${row.monthlyNetStandardError.toFixed(2)})`}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
