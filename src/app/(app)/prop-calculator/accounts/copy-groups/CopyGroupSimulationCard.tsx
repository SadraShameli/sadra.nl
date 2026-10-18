'use client';

import { type ReactNode, useLayoutEffect, useMemo, useState } from 'react';

import { useWorkerTask } from '~/app/(app)/prop-calculator/_components/useWorkerTask';
import {
    IDLE_WORKER_TASK,
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    copyGroupRequestCacheKey,
    copyGroupUnpricedTriggerNoteOf,
    type CopyGroupWorkerOutcome,
    CopyGroupWorkerOutcomeKind,
    type CopyGroupWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { ComputingIndicator } from '~/components/ComputingIndicator';
import { InfoNote } from '~/components/InfoNote';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { formatCount, formatCurrency } from '~/lib/format';
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

const SIMULATION_FAILED_TITLE = 'The simulation could not run';

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
                    <InfoNote>Not simulated: {plan.reason}</InfoNote>
                </CardFrame>
            );
        }
    }
}

function CardFrame({
    children,
    info,
}: {
    readonly children: ReactNode;
    readonly info?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 border-t pt-4 text-sm">
            <PanelSubheading info={info}>{HEADING}</PanelSubheading>
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
                <QueryErrorNotice
                    message={outcome.reason}
                    title={SIMULATION_FAILED_TITLE}
                />
            );
        }
        case CopyGroupWorkerOutcomeKind.Rejected: {
            const { rejection } = outcome;
            return (
                <QueryErrorNotice
                    message={
                        rejection.kind ===
                        CopyGroupSimulationRejectionKind.MemberRefused
                            ? `${labelOf(plan.members, rejection.memberId)}: ${rejection.message}`
                            : rejection.message
                    }
                    title="Not simulated"
                />
            );
        }
        case CopyGroupWorkerOutcomeKind.Simulated: {
            return (
                <StatStrip
                    items={copyGroupFigureRowsOf(
                        outcome.result,
                        plan.horizonDays,
                    ).map((row) => ({
                        id: row.key,
                        info: row.note,
                        label: row.label,
                        value: row.value,
                    }))}
                />
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
    const { cancel } = task;
    useLayoutEffect(() => cancel, [cancel]);
    const [ranKey, setRanKey] = useState<null | string>(null);
    const key = useMemo(
        () => copyGroupRequestCacheKey(plan.request),
        [plan.request],
    );
    const unpricedTriggerNote = useMemo(
        () => copyGroupUnpricedTriggerNoteOf(plan.request),
        [plan.request],
    );
    const isStale = ranKey !== null && ranKey !== key;
    const state: WorkerTaskState<never, CopyGroupWorkerOutcome> = isStale
        ? IDLE_WORKER_TASK
        : task.state;
    const isRunning = state.phase === WorkerTaskPhase.Running;
    const hasRun = ranKey !== null;

    return (
        <CardFrame
            info={
                <>
                    <p>
                        Every copy trades {formatCurrency(plan.groupRisk, 2)}{' '}
                        per trade, placed within its own plan&apos;s rules, over
                        a {plan.horizonDays}-day funded horizon and{' '}
                        {formatCount(plan.request.trials)} trials. The accounts
                        take the same trades, the same wins and losses on each
                        one, so accounts on different plans bust together when
                        one loss reaches their different cushions.
                    </p>
                    {unpricedTriggerNote !== null && (
                        <p>{unpricedTriggerNote}</p>
                    )}
                    {plan.assumptions.map((assumption) => (
                        <p key={assumptionText(assumption)}>
                            {assumptionText(assumption)}
                        </p>
                    ))}
                </>
            }
        >
            {plan.leftOutLabels.length > 0 && (
                <InfoNote>
                    Left out because they could not be sized:{' '}
                    {plan.leftOutLabels.join(', ')}.
                </InfoNote>
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
                    {hasRun ? 'Run again' : 'Simulate group'}
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
                    <div aria-busy="true" className="flex flex-col gap-2">
                        <ComputingIndicator />
                        <Skeleton className="h-24 w-full" />
                    </div>
                )}
                {state.phase === WorkerTaskPhase.Done &&
                    state.result.kind ===
                        CopyGroupWorkerOutcomeKind.Simulated && (
                        <Outcome outcome={state.result} plan={plan} />
                    )}
            </div>
            {state.phase === WorkerTaskPhase.Failed && (
                <QueryErrorNotice
                    message={state.reason}
                    title={SIMULATION_FAILED_TITLE}
                />
            )}
            {state.phase === WorkerTaskPhase.Done &&
                state.result.kind !== CopyGroupWorkerOutcomeKind.Simulated && (
                    <Outcome outcome={state.result} plan={plan} />
                )}
        </CardFrame>
    );
}
