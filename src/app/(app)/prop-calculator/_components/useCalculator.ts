'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
    ALL_FIRMS,
    type DayStopRule,
    findFirm,
    FirmId,
    type Plan,
    type PropFirm,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

import { type CalculatorState, type LabScenario, SizingMode } from './types';
import { decodeState, encodeState } from './urlState';

const SIM_DEBOUNCE_MS = 180;

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function clampNum(n: number, lo: number, hi: number, fallback: number): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
}

function required<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
}

const DEFAULT_FIRM: PropFirm = required(
    findFirm(FirmId.Apex),
    'Prop calculator: Apex firm missing from registry',
);
const DEFAULT_PLAN: Plan = required(
    DEFAULT_FIRM.plans.find((p) => p.accountSize === 50_000),
    'Prop calculator: default $50K plan missing from Apex',
);

export interface PinnedScenario {
    result: SimOutputs;
    state: CalculatorState;
}

export interface UseCalculatorReturn {
    addLabScenario: () => void;
    applyState: (next: CalculatorState) => void;
    firms: typeof ALL_FIRMS;
    isPending: boolean;
    pinned: null | PinnedScenario;
    pinScenario: () => void;
    removeLabScenario: (id: string) => void;
    reset: () => void;
    resetCoupon: () => void;
    resetLabScenarios: () => void;
    result: SimOutputs;
    setActivationDiscountPercent: (n: number) => void;
    setCommissionPerRoundTrip: (n: number) => void;
    setCopyAccounts: (n: number) => void;
    setDayStop: (rule: DayStopRule) => void;
    setEvalDiscountPercent: (n: number) => void;
    setFirm: (firm: PropFirm) => void;
    setLabScenarios: (entries: LabScenario[]) => void;
    setLinkActivationDiscount: (linked: boolean) => void;
    setMaxAttempts: (n: number) => void;
    setMaxEvalDays: (n: number) => void;
    setPlan: (plan: Plan) => void;
    setRiskDollars: (n: number) => void;
    setRiskPercent: (n: number) => void;
    setRrRatio: (n: number) => void;
    setSeed: (n: number) => void;
    setSizingMode: (m: SizingMode) => void;
    setTradesPerDay: (n: number) => void;
    setTrials: (n: number) => void;
    setWinrate: (n: number) => void;
    simInputs: SimInputs;
    state: CalculatorState;
    unpinScenario: () => void;
    updateLabScenario: (id: string, patch: Partial<LabScenario>) => void;
}

export function buildDefaultLabScenarios(): LabScenario[] {
    return [
        {
            accounts: 10,
            correlation: 'copy',
            dayStop: { kind: 'none' },
            groups: 1,
            id: freshId(),
            label: 'Risk-scale',
            riskPerTrade: 500,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: 0.4,
        },
        {
            accounts: 10,
            correlation: 'copy',
            dayStop: { kind: 'none' },
            groups: 1,
            id: freshId(),
            label: 'Frequency-scale',
            riskPerTrade: 250,
            rrRatio: 2,
            tradesPerDay: 4,
            winrate: 0.35,
        },
        {
            accounts: 10,
            correlation: 'grouped',
            dayStop: { kind: 'none' },
            groups: 2,
            id: freshId(),
            label: 'Group-split',
            riskPerTrade: 250,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: 0.4,
        },
    ];
}

export function useCalculator(): UseCalculatorReturn {
    const [state, setState] = useState<CalculatorState>(defaultState);
    const [pinned, setPinned] = useState<null | PinnedScenario>(null);
    const hydratedRef = useRef(false);
    const skipNextWriteRef = useRef(true);

    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (!params.has('firm')) return;
        try {
            const next = decodeState(params, ALL_FIRMS, defaultState());
            skipNextWriteRef.current = true;
            setState(next);
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        if (skipNextWriteRef.current) {
            skipNextWriteRef.current = false;
            return;
        }
        if (typeof window === 'undefined') return;
        const params = encodeState(state).toString();
        const next = `${window.location.pathname}?${params}${window.location.hash}`;
        if (
            next !==
            window.location.pathname +
                window.location.search +
                window.location.hash
        ) {
            window.history.replaceState(null, '', next);
        }
    }, [state]);

    const riskPerTrade = useMemo(
        () =>
            state.sizingMode === SizingMode.Dollar
                ? state.riskDollars
                : (state.plan.accountSize * state.riskPercent) / 100,
        [state.sizingMode, state.riskDollars, state.riskPercent, state.plan],
    );

    const effectiveActivationDiscount: number = state.linkActivationDiscount
        ? state.evalDiscountPercent
        : state.activationDiscountPercent;

    const simInputs = useMemo(
        () => ({
            commissionPerRoundTrip: state.commissionPerRoundTrip,
            copyAccounts: state.copyAccounts,
            dayStop: state.dayStop,
            discounts: {
                activationPercent: effectiveActivationDiscount,
                evalPercent: state.evalDiscountPercent,
            },
            fundedHorizonDays: state.fundedHorizonDays,
            maxAttempts: state.maxAttempts,
            maxEvalDays: state.maxEvalDays,
            plan: state.plan,
            riskPerTrade,
            rrRatio: state.rrRatio,
            seed: state.seed,
            tradesPerDay: state.tradesPerDay,
            trials: state.trials,
            winrate: state.winrate,
        }),
        [
            state.plan,
            state.winrate,
            state.rrRatio,
            riskPerTrade,
            state.tradesPerDay,
            state.maxEvalDays,
            state.fundedHorizonDays,
            state.trials,
            state.seed,
            state.evalDiscountPercent,
            effectiveActivationDiscount,
            state.commissionPerRoundTrip,
            state.maxAttempts,
            state.copyAccounts,
            state.dayStop,
        ],
    );

    const debouncedInputs = useDebouncedValue(simInputs, SIM_DEBOUNCE_MS);
    const result = useMemo(() => simulate(debouncedInputs), [debouncedInputs]);
    const isPending = simInputs !== debouncedInputs;

    const setFirm = (firm: PropFirm) => {
        const firstPlan = firm.plans[0];
        if (!firstPlan) return;
        setState((s) => {
            const memoryWithCurrent = {
                ...s.firmMemory,
                [s.firm.id]: {
                    copyAccounts: s.copyAccounts,
                    planId: s.plan.id,
                },
            };
            const remembered = memoryWithCurrent[firm.id];
            const plan = remembered
                ? (firm.findPlan(remembered.planId) ?? firstPlan)
                : firstPlan;
            const copyAccounts = remembered
                ? Math.max(
                      1,
                      Math.min(
                          remembered.copyAccounts,
                          firm.maxFundedAccounts(plan),
                      ),
                  )
                : 1;
            return {
                ...s,
                copyAccounts,
                firm,
                firmMemory: memoryWithCurrent,
                plan,
            };
        });
    };

    const setPlan = (plan: Plan) => {
        setState((s) => {
            const cap = s.firm.maxFundedAccounts(plan);
            const copyAccounts = Math.min(s.copyAccounts, cap);
            return {
                ...s,
                copyAccounts,
                firmMemory: {
                    ...s.firmMemory,
                    [s.firm.id]: { copyAccounts, planId: plan.id },
                },
                plan,
            };
        });
    };

    return {
        addLabScenario: () =>
            setState((s) => {
                const last = s.labScenarios.at(-1);
                const base: LabScenario = last
                    ? { ...last, id: freshId(), label: `${last.label} copy` }
                    : {
                          accounts: 10,
                          correlation: 'copy',
                          dayStop: { kind: 'none' },
                          groups: 1,
                          id: freshId(),
                          label: 'New scenario',
                          riskPerTrade: 250,
                          rrRatio: 2,
                          tradesPerDay: 1,
                          winrate: 0.4,
                      };
                return { ...s, labScenarios: [...s.labScenarios, base] };
            }),
        applyState: (next) => setState(next),
        firms: ALL_FIRMS,
        isPending,
        pinned,
        pinScenario: () => setPinned({ result, state }),
        removeLabScenario: (id) =>
            setState((s) => ({
                ...s,
                labScenarios: s.labScenarios.filter((sc) => sc.id !== id),
            })),
        reset: () => setState(defaultState()),
        resetCoupon: () =>
            setState((s) => ({
                ...s,
                activationDiscountPercent: 0,
                evalDiscountPercent: 0,
                linkActivationDiscount: false,
            })),
        resetLabScenarios: () =>
            setState((s) => ({
                ...s,
                labScenarios: buildDefaultLabScenarios(),
            })),
        result,
        setActivationDiscountPercent: (n) =>
            setState((s) => ({
                ...s,
                activationDiscountPercent: clampNum(
                    n,
                    0,
                    100,
                    s.activationDiscountPercent,
                ),
            })),
        setCommissionPerRoundTrip: (n) =>
            setState((s) => ({
                ...s,
                commissionPerRoundTrip: clampNum(
                    n,
                    0,
                    50,
                    s.commissionPerRoundTrip,
                ),
            })),
        setCopyAccounts: (n) =>
            setState((s) => {
                const cap = s.firm.maxFundedAccounts(s.plan);
                const clamped = clampInt(n, 1, cap, s.copyAccounts);
                return {
                    ...s,
                    copyAccounts: clamped,
                    firmMemory: {
                        ...s.firmMemory,
                        [s.firm.id]: {
                            copyAccounts: clamped,
                            planId: s.plan.id,
                        },
                    },
                };
            }),
        setDayStop: (rule) => setState((s) => ({ ...s, dayStop: rule })),
        setEvalDiscountPercent: (n) =>
            setState((s) => ({
                ...s,
                evalDiscountPercent: clampNum(n, 0, 100, s.evalDiscountPercent),
            })),
        setFirm,
        setLabScenarios: (entries) =>
            setState((s) => ({ ...s, labScenarios: entries })),
        setLinkActivationDiscount: (linked) =>
            setState((s) => ({ ...s, linkActivationDiscount: linked })),
        setMaxAttempts: (n) =>
            setState((s) => ({
                ...s,
                maxAttempts: clampInt(n, 1, 10, s.maxAttempts),
            })),
        setMaxEvalDays: (n) =>
            setState((s) => ({
                ...s,
                maxEvalDays: clampInt(n, 10, 365, s.maxEvalDays),
            })),
        setPlan,
        setRiskDollars: (n) =>
            setState((s) => ({
                ...s,
                riskDollars: clampNum(n, 1, s.plan.accountSize, s.riskDollars),
            })),
        setRiskPercent: (n) =>
            setState((s) => ({
                ...s,
                riskPercent: clampNum(n, 0.05, 100, s.riskPercent),
            })),
        setRrRatio: (n) =>
            setState((s) => ({
                ...s,
                rrRatio: clampNum(n, 0.5, 10, s.rrRatio),
            })),
        setSeed: (n) =>
            setState((s) => ({
                ...s,
                seed: Number.isFinite(n) ? Math.floor(n) : s.seed,
            })),
        setSizingMode: (m) => setState((s) => ({ ...s, sizingMode: m })),
        setTradesPerDay: (n) =>
            setState((s) => ({
                ...s,
                tradesPerDay: clampInt(n, 1, 50, s.tradesPerDay),
            })),
        setTrials: (n) =>
            setState((s) => ({
                ...s,
                trials: clampInt(n, 100, 5000, s.trials),
            })),
        setWinrate: (n) =>
            setState((s) => ({
                ...s,
                winrate: clampNum(n, 0.05, 0.95, s.winrate),
            })),
        simInputs,
        state,
        unpinScenario: () => setPinned(null),
        updateLabScenario: (id, patch) =>
            setState((s) => ({
                ...s,
                labScenarios: s.labScenarios.map((sc) =>
                    sc.id === id ? { ...sc, ...patch } : sc,
                ),
            })),
    };
}

function defaultState(): CalculatorState {
    return {
        activationDiscountPercent: 0,
        commissionPerRoundTrip: 0,
        copyAccounts: 1,
        dayStop: { kind: 'none' },
        evalDiscountPercent: 0,
        firm: DEFAULT_FIRM,
        firmMemory: {},
        fundedHorizonDays: 60,
        labScenarios: buildDefaultLabScenarios(),
        linkActivationDiscount: false,
        maxAttempts: 1,
        maxEvalDays: 60,
        plan: DEFAULT_PLAN,
        riskDollars: 250,
        riskPercent: 0.5,
        rrRatio: 2,
        seed: 42,
        sizingMode: SizingMode.Dollar,
        tradesPerDay: 1,
        trials: 2000,
        winrate: 0.4,
    };
}

function freshId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID();
    }
    return `lab-${Math.random().toString(36).slice(2, 11)}`;
}

function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}
