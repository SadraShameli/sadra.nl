'use client';

import { useMemo, useState } from 'react';

import { useWorkerTask } from '~/app/(app)/prop-calculator/_components/useWorkerTask';
import {
    IDLE_WORKER_TASK,
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    copyGroupRequestCacheKey,
    type CopyGroupWorkerOutcome,
    CopyGroupWorkerOutcomeKind,
    type CopyGroupWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import { Button } from '~/components/ui/Button';
import { formatCurrency } from '~/lib/format';
import { assumptionText } from '~/lib/prop-calculator/advisor';
import { CopyGroupSimulationRejectionKind } from '~/lib/prop-calculator/simulator';

import {
    copyGroupFigureRowsOf,
    type CopyGroupSimulationPlan,
    CopyGroupSimulationPlanKind,
    type CopyGroupSimulationPlanMember,
} from './copyGroupSimulationModel';

type ReadyPlan = Extract<
    CopyGroupSimulationPlan,
    { kind: CopyGroupSimulationPlanKind.Ready }
>;

const HEADING = 'Correlated bust risk and payouts';

export function CopyGroupSimulationCard({
    plan,
}: {
    readonly plan: CopyGroupSimulationPlan;
}) {
    switch (plan.kind) {
        case CopyGroupSimulationPlanKind.Ready: {
            return <ReadyCard plan={plan} />;
        }
        case CopyGroupSimulationPlanKind.Unavailable: {
            return (
                <CardFrame>
                    <p className="text-muted-foreground">
                        Not simulated: {plan.reason}
                    </p>
                </CardFrame>
            );
        }
    }
}

function CardFrame({ children }: { readonly children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2 border-t pt-3 text-sm">
            <h3 className="font-semibold">{HEADING}</h3>
            {children}
        </div>
    );
}

function createCopyGroupWorker(): Worker {
    return new Worker(
        new URL('../../_workers/copyGroupWorker.ts', import.meta.url),
        { type: 'module' },
    );
}

function labelOf(
    members: readonly CopyGroupSimulationPlanMember[],
    memberId: string,
): string {
    return members.find((member) => member.id === memberId)?.label ?? memberId;
}

function Outcome({
    outcome,
    plan,
}: {
    readonly outcome: CopyGroupWorkerOutcome;
    readonly plan: ReadyPlan;
}) {
    switch (outcome.kind) {
        case CopyGroupWorkerOutcomeKind.Failed: {
            return (
                <p className="text-destructive" role="alert">
                    The simulation could not run: {outcome.reason}
                </p>
            );
        }
        case CopyGroupWorkerOutcomeKind.Rejected: {
            const { rejection } = outcome;
            return (
                <p className="text-destructive" role="alert">
                    Not simulated:{' '}
                    {rejection.kind ===
                    CopyGroupSimulationRejectionKind.MemberRefused
                        ? `${labelOf(plan.members, rejection.memberId)}: ${rejection.message}`
                        : rejection.message}
                </p>
            );
        }
        case CopyGroupWorkerOutcomeKind.Simulated: {
            return (
                <dl className="flex flex-col gap-3">
                    {copyGroupFigureRowsOf(
                        outcome.result,
                        plan.horizonDays,
                    ).map((row) => (
                        <div key={row.key}>
                            <dt className="text-muted-foreground">
                                {row.label}
                            </dt>
                            <dd className="font-medium">{row.value}</dd>
                            <dd className="text-xs text-muted-foreground">
                                {row.note}
                            </dd>
                        </div>
                    ))}
                </dl>
            );
        }
    }
}

function ReadyCard({ plan }: { readonly plan: ReadyPlan }) {
    const task = useWorkerTask<
        CopyGroupWorkerRequest,
        never,
        CopyGroupWorkerOutcome
    >(createCopyGroupWorker);
    const [ranKey, setRanKey] = useState<null | string>(null);
    const key = useMemo(
        () => copyGroupRequestCacheKey(plan.request),
        [plan.request],
    );
    const isStale = ranKey !== null && ranKey !== key;
    const state: WorkerTaskState<never, CopyGroupWorkerOutcome> = isStale
        ? IDLE_WORKER_TASK
        : task.state;
    const isRunning = state.phase === WorkerTaskPhase.Running;
    const hasRun = ranKey !== null;

    return (
        <CardFrame>
            <p className="text-muted-foreground">
                Every copy trades {formatCurrency(plan.groupRisk)} per trade,
                placed within its own plan&apos;s rules, over a{' '}
                {plan.horizonDays}-day funded horizon and{' '}
                {plan.request.trials.toLocaleString('en-US')} trials. The
                accounts take the same trades, the same wins and losses on each
                one, so accounts on different plans bust together when one loss
                reaches their different cushions.
            </p>
            {plan.leftOutLabels.length > 0 && (
                <p className="text-muted-foreground">
                    Left out of the simulation because they could not be sized:{' '}
                    {plan.leftOutLabels.join(', ')}.
                </p>
            )}
            {plan.assumptions.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground">
                    {plan.assumptions.map((assumption) => (
                        <li key={assumptionText(assumption)}>
                            {assumptionText(assumption)}
                        </li>
                    ))}
                </ul>
            )}
            <div>
                <Button
                    aria-disabled={isRunning}
                    className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    onClick={() => {
                        if (isRunning) return;
                        setRanKey(key);
                        task.run(plan.request);
                    }}
                    size="sm"
                    variant="outline"
                >
                    {isRunning
                        ? 'Simulating...'
                        : hasRun
                          ? 'Run again'
                          : 'Simulate group'}
                </Button>
            </div>
            <div role="status">
                {isStale && (
                    <p className="text-muted-foreground">
                        The group changed since the last run. Run it again for
                        current figures.
                    </p>
                )}
                {isRunning && (
                    <p aria-busy="true" className="text-muted-foreground">
                        Simulating {plan.request.members.length} accounts...
                    </p>
                )}
                {state.phase === WorkerTaskPhase.Done &&
                    state.result.kind ===
                        CopyGroupWorkerOutcomeKind.Simulated && (
                        <Outcome outcome={state.result} plan={plan} />
                    )}
            </div>
            {state.phase === WorkerTaskPhase.Failed && (
                <p className="text-destructive" role="alert">
                    The simulation could not run: {state.reason}
                </p>
            )}
            {state.phase === WorkerTaskPhase.Done &&
                state.result.kind !== CopyGroupWorkerOutcomeKind.Simulated && (
                    <Outcome outcome={state.result} plan={plan} />
                )}
        </CardFrame>
    );
}
