'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    buildLadderGrid,
    canonicaliseGrid,
    type DayStopRule,
    ladderFrontier,
    type LadderGridConfig,
    type LadderScore,
    type Plan,
    type RungSizing,
} from '~/lib/prop-calculator';

import {
    type LadderWorkerRequest,
    LadderWorkerRequestKind,
    type LadderWorkerResponse,
    LadderWorkerResponseKind,
} from '../_workers/ladderWorkerMessages';

const BLOCK_SIZE = 20;
const MAX_WORKERS = 16;
const TOP_N = 25;

export enum LadderRunPhase {
    Cancelled = 'cancelled',
    Failed = 'failed',
    Idle = 'idle',
    Running = 'running',
    Succeeded = 'succeeded',
}

export interface LadderProgress {
    completed: number;
    elapsedMs: number;
    etaMs: null | number;
    total: number;
}

export interface LadderSearchInputs {
    grid: LadderGridConfig;
    maxDays: number;
    plan: Plan;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    sims: number;
    stopRule: DayStopRule;
    winrate: number;
}

export interface LadderSearchRun {
    byCost: readonly LadderScore[];
    byPassRate: readonly LadderScore[];
    bySpeed: readonly LadderScore[];
    droppedAliasCount: number;
    frontier: readonly LadderScore[];
    gridSize: number;
    laddersScored: number;
}

export type LadderSearchState =
    | { phase: LadderRunPhase.Cancelled; progress: LadderProgress }
    | { phase: LadderRunPhase.Failed; reason: string }
    | { phase: LadderRunPhase.Idle }
    | { phase: LadderRunPhase.Running; progress: LadderProgress }
    | {
          phase: LadderRunPhase.Succeeded;
          progress: LadderProgress;
          result: LadderSearchRun;
      };

const IDLE: LadderSearchState = { phase: LadderRunPhase.Idle };

export function useLadderSearch() {
    const [state, setState] = useState<LadderSearchState>(IDLE);
    const workersReference = useRef<Worker[]>([]);
    const cancelReference = useRef(false);
    const runIdReference = useRef(0);

    const teardown = useCallback(() => {
        for (const worker of workersReference.current) worker.terminate();
        workersReference.current = [];
    }, []);

    useEffect(() => {
        return () => {
            cancelReference.current = true;
            teardown();
        };
    }, [teardown]);

    const cancel = useCallback(() => {
        cancelReference.current = true;
        teardown();
        setState((previous) =>
            previous.phase === LadderRunPhase.Running
                ? {
                      phase: LadderRunPhase.Cancelled,
                      progress: previous.progress,
                  }
                : previous,
        );
    }, [teardown]);

    const run = useCallback(
        (inputs: LadderSearchInputs) => {
            cancelReference.current = false;
            teardown();
            runIdReference.current += 1;
            const runId = runIdReference.current;

            const cushion = inputs.plan.drawdown.amount;
            const ladders = canonicaliseGrid(buildLadderGrid(inputs.grid));
            const gridSize = buildLadderGrid(inputs.grid).length;
            const total = ladders.length;

            if (total === 0) {
                setState({
                    phase: LadderRunPhase.Failed,
                    reason: 'The grid is empty. Widen the risk range or step.',
                });
                return;
            }

            const startedAt = performance.now();
            setState({
                phase: LadderRunPhase.Running,
                progress: { completed: 0, elapsedMs: 0, etaMs: null, total },
            });

            const blocks: { firstIndex: number; ladders: number[][] }[] = [];
            for (let index = 0; index < total; index += BLOCK_SIZE) {
                blocks.push({
                    firstIndex: index,
                    ladders: ladders.slice(index, index + BLOCK_SIZE),
                });
            }

            const scores: LadderScore[] = [];
            let nextBlock = 0;
            let completed = 0;
            let settled = 0;

            const workerCount = Math.max(
                1,
                Math.min(
                    MAX_WORKERS,
                    blocks.length,
                    globalThis.navigator.hardwareConcurrency - 1,
                ),
            );

            const finish = () => {
                const scorable = scores.filter((score) =>
                    Number.isFinite(score.expectedDaysToFunded),
                );
                setState({
                    phase: LadderRunPhase.Succeeded,
                    progress: {
                        completed: total,
                        elapsedMs: performance.now() - startedAt,
                        etaMs: 0,
                        total,
                    },
                    result: {
                        byCost: scorable
                            .toSorted(
                                (a, b) => a.costPerFunded - b.costPerFunded,
                            )
                            .slice(0, TOP_N),
                        byPassRate: scorable
                            .toSorted((a, b) => b.passRate - a.passRate)
                            .slice(0, TOP_N),
                        bySpeed: scorable
                            .toSorted(
                                (a, b) =>
                                    a.expectedDaysToFunded -
                                    b.expectedDaysToFunded,
                            )
                            .slice(0, TOP_N),
                        droppedAliasCount: gridSize - total,
                        frontier: ladderFrontier(scorable),
                        gridSize,
                        laddersScored: total,
                    },
                });
                teardown();
            };

            const dispatch = (worker: Worker) => {
                if (cancelReference.current) return;
                const block = blocks[nextBlock];
                if (!block) return;
                nextBlock += 1;
                const request: LadderWorkerRequest = {
                    cushion,
                    evalPrice:
                        inputs.plan.fees.oneTimeEval +
                        inputs.plan.fees.activation,
                    firstIndex: block.firstIndex,
                    kind: LadderWorkerRequestKind.ScoreLadders,
                    ladders: block.ladders,
                    maxDays: inputs.maxDays,
                    planId: inputs.plan.id,
                    rrRatio: inputs.rrRatio,
                    rungSizing: inputs.rungSizing,
                    runId,
                    seed: inputs.seed,
                    sims: inputs.sims,
                    stopRule: inputs.stopRule,
                    winrate: inputs.winrate,
                };
                worker.postMessage(request);
            };

            const fail = (reason: string) => {
                cancelReference.current = true;
                teardown();
                setState({ phase: LadderRunPhase.Failed, reason });
            };

            for (let index = 0; index < workerCount; index++) {
                const worker = new Worker(
                    new URL('../_workers/ladderWorker.ts', import.meta.url),
                    { type: 'module' },
                );
                worker.addEventListener(
                    'message',
                    (event: MessageEvent<LadderWorkerResponse>) => {
                        if (cancelReference.current) return;
                        if (event.data.runId !== runId) return;

                        if (
                            event.data.kind === LadderWorkerResponseKind.Failed
                        ) {
                            fail(event.data.reason);
                            return;
                        }

                        scores.push(...event.data.scores);
                        completed += event.data.scores.length;
                        settled += 1;
                        const elapsedMs = performance.now() - startedAt;
                        setState({
                            phase: LadderRunPhase.Running,
                            progress: {
                                completed,
                                elapsedMs,
                                etaMs:
                                    completed > 0
                                        ? (elapsedMs / completed) *
                                          (total - completed)
                                        : null,
                                total,
                            },
                        });
                        if (settled >= blocks.length) {
                            finish();
                            return;
                        }
                        dispatch(worker);
                    },
                );
                worker.addEventListener('error', () => {
                    if (cancelReference.current) return;
                    fail('The ladder search worker failed.');
                });
                workersReference.current.push(worker);
                dispatch(worker);
            }
        },
        [teardown],
    );

    return { cancel, run, state };
}
