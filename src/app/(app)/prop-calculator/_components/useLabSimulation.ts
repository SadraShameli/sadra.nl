'use client';

import { useContext, useEffect, useRef, useState } from 'react';

import { planReferenceOf } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollModel';
import {
    type LabRunInputs,
    type LabScenarioInputs,
    type LabScenarioResult,
    type LabToolsRequest,
    parseToolsResult,
    runIdOf,
    ToolsRequestKind,
    ToolsResponseKind,
    type ToolsWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { type Plan, type RungSizing } from '~/lib/prop-calculator';

import { ComputationCache, initialFor } from './computationCache';
import { ComputationId } from './ComputationId';
import {
    describeSimulationFailure,
    partitionBySizing,
    type SizingRefusal,
} from './simulationFailure';
import { type LabScenario } from './types';
import {
    ComputationCacheContext,
    useDebouncedValue,
} from './useDebouncedSimulation';
import { createToolsWorker, WORKER_FAILURE_REASON } from './useToolsWorker';

export type LabResult = LabScenarioResult;

interface Arguments {
    activationDiscountPercent?: number;
    commissionPerRoundTrip: number;
    discountPercent?: number;
    fundedHorizonDays: number;
    linkActivationDiscount?: boolean;
    liveTransferHazard?: number;
    maxEvalDays: number;
    minRetainedCushion?: number;
    monthlySubscriptionDiscountPercent?: number;
    payoutRequestSize?: number;
    plan: Plan;
    resetDiscountPercent?: number;
    rungSizing?: RungSizing;
    scenarios: LabScenario[];
    seed: number;
}

interface LabListener {
    onError: () => void;
    onMessage: (data: unknown) => void;
}

const DEBOUNCE_MS = 600;
const UNEXPECTED_RESPONSE_REASON =
    'The tools worker answered the strategy lab with an unexpected response.';
const EMPTY_RESULTS = new Map<string, LabResult>();

export function useLabSimulation(arguments_: Arguments): {
    error: null | string;
    pending: boolean;
    refused: SizingRefusal<LabScenario>[];
    results: Map<string, LabResult>;
} {
    const {
        activationDiscountPercent = 0,
        commissionPerRoundTrip,
        discountPercent = 0,
        fundedHorizonDays,
        linkActivationDiscount = false,
        liveTransferHazard,
        maxEvalDays,
        minRetainedCushion,
        monthlySubscriptionDiscountPercent = 0,
        payoutRequestSize,
        plan,
        resetDiscountPercent = 0,
        rungSizing,
        scenarios,
        seed,
    } = arguments_;

    const run: LabRunInputs = {
        activationDiscountPercent,
        commissionPerRoundTrip,
        discountPercent,
        fundedHorizonDays,
        linkActivationDiscount,
        liveTransferHazard,
        maxEvalDays,
        minRetainedCushion,
        monthlySubscriptionDiscountPercent,
        payoutRequestSize,
        plan: planReferenceOf(plan),
        resetDiscountPercent,
        rungSizing,
        seed,
    };
    const key = buildCacheKey(run, scenarios);

    const sizing = partitionBySizing(scenarios, (sc) => ({
        instrument: sc.instrument ?? undefined,
        riskPerTrade: sc.riskPerTrade,
        stopPoints: sc.stopPoints ?? undefined,
    }));

    const sharedCache = useContext(ComputationCacheContext);
    const [localCache] = useState(() => new ComputationCache());
    const cache = sharedCache ?? localCache;
    const debouncedKey = useDebouncedValue(key, DEBOUNCE_MS);
    const keyReference = useRef(key);
    keyReference.current = key;
    const runReference = useRef(run);
    runReference.current = run;
    const acceptedReference = useRef(sizing.accepted);
    acceptedReference.current = sizing.accepted;
    const [initialState] = useState(() =>
        initialFor(ComputationId.StrategyLab, key, cache),
    );
    const [results, setResults] = useState<Map<string, LabResult>>(
        initialState.shouldCompute ? EMPTY_RESULTS : initialState.result,
    );
    const [pending, setPending] = useState(initialState.pending);
    const [error, setError] = useState<null | string>(null);
    const resultKeyReference = useRef<null | string>(
        initialState.shouldCompute ? null : key,
    );
    const settledErrorReference = useRef<null | string>(null);
    const workerReference = useRef<null | Worker>(null);
    const listenerReference = useRef<LabListener | null>(null);
    const requestIdReference = useRef(0);

    useEffect(
        () => () => {
            workerReference.current?.terminate();
            workerReference.current = null;
        },
        [],
    );

    useEffect(() => {
        if (resultKeyReference.current === debouncedKey) {
            setPending(false);
            setError(settledErrorReference.current);
            return;
        }
        setPending(true);
        setError(null);
        const computedKey = keyReference.current;
        const labRun = runReference.current;
        const queue = [...acceptedReference.current];
        const collected = new Map<string, LabResult>();
        let inFlight: null | { requestId: number; scenarioId: string } = null;

        const fail = (reason: string) => {
            inFlight = null;
            detach();
            const message = describeSimulationFailure(reason);
            resultKeyReference.current = computedKey;
            settledErrorReference.current = message;
            setResults(EMPTY_RESULTS);
            setError(message);
            setPending(false);
        };

        const advance = () => {
            const scenario = queue.shift();
            if (scenario === undefined) {
                detach();
                resultKeyReference.current = computedKey;
                settledErrorReference.current = null;
                cache.set(ComputationId.StrategyLab, computedKey, collected);
                setResults(collected);
                setPending(false);
                return;
            }
            const requestId = requestIdReference.current + 1;
            requestIdReference.current = requestId;
            inFlight = { requestId, scenarioId: scenario.id };
            const request: LabToolsRequest = {
                kind: ToolsRequestKind.Lab,
                run: labRun,
                runId: requestId,
                scenario: scenarioInputsOf(scenario),
            };
            ensureWorker(workerReference, listenerReference).postMessage(
                request,
            );
        };

        const listener: LabListener = {
            onError: () => {
                fail(WORKER_FAILURE_REASON);
            },
            onMessage: (data) => {
                if (inFlight === null) return;
                const answeredId = runIdOf(data);
                if (answeredId !== null && answeredId !== inFlight.requestId) {
                    return;
                }
                let result: ToolsWorkerResult;
                try {
                    result = parseToolsResult(data);
                } catch {
                    fail(UNEXPECTED_RESPONSE_REASON);
                    return;
                }
                if (result.runId !== inFlight.requestId) return;
                if (result.kind === ToolsResponseKind.Failed) {
                    fail(result.reason);
                    return;
                }
                if (result.kind !== ToolsResponseKind.Lab) {
                    fail(UNEXPECTED_RESPONSE_REASON);
                    return;
                }
                collected.set(inFlight.scenarioId, result.result);
                inFlight = null;
                advance();
            },
        };

        function detach() {
            if (listenerReference.current === listener) {
                listenerReference.current = null;
            }
        }

        listenerReference.current = listener;
        advance();
        return () => {
            detach();
            if (inFlight === null) return;
            inFlight = null;
            workerReference.current?.terminate();
            workerReference.current = null;
        };
    }, [cache, debouncedKey]);

    const isPending = scenarios.length > 0 && pending;
    const visibleResults = scenarios.length === 0 ? EMPTY_RESULTS : results;

    return {
        error,
        pending: isPending,
        refused: sizing.refused,
        results: visibleResults,
    };
}

function buildCacheKey(
    run: LabRunInputs,
    scenarios: readonly LabScenario[],
): string {
    return JSON.stringify({
        run: { ...run, liveTransferHazard: run.liveTransferHazard ?? null },
        scenarios: scenarios.map((s) => ({
            id: s.id,
            ...scenarioInputsOf(s),
        })),
    });
}

function ensureWorker(
    workerReference: { current: null | Worker },
    listenerReference: { current: LabListener | null },
): Worker {
    if (workerReference.current !== null) return workerReference.current;
    const worker = createToolsWorker();
    workerReference.current = worker;
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        listenerReference.current?.onMessage(event.data);
    });
    worker.addEventListener('error', () => {
        if (workerReference.current === worker) {
            workerReference.current = null;
        }
        worker.terminate();
        listenerReference.current?.onError();
    });
    return worker;
}

function scenarioInputsOf(scenario: LabScenario): LabScenarioInputs {
    return {
        accounts: scenario.accounts,
        correlation: scenario.correlation,
        dayStop: scenario.dayStop,
        groups: scenario.groups,
        instrument: scenario.instrument,
        riskPerTrade: scenario.riskPerTrade,
        rrRatio: scenario.rrRatio,
        stopPoints: scenario.stopPoints,
        tradesPerDay: scenario.tradesPerDay,
        winrate: scenario.winrate,
    };
}
