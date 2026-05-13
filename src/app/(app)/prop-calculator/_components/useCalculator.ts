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

function required<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
}

function clampNum(n: number, lo: number, hi: number, fallback: number): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
}

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.floor(n)));
}

const DEFAULT_FIRM: PropFirm = required(
    findFirm(FirmId.Apex),
    'Prop calculator: Apex firm missing from registry',
);
const DEFAULT_PLAN: Plan = required(
    DEFAULT_FIRM.plans.find((p) => p.accountSize === 50_000),
    'Prop calculator: default $50K plan missing from Apex',
);

function freshId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID();
    }
    return `lab-${Math.random().toString(36).slice(2, 11)}`;
}

export function buildDefaultLabScenarios(): LabScenario[] {
    return [
        {
            id: freshId(),
            label: 'Risk-scale',
            riskPerTrade: 500,
            winrate: 0.4,
            rrRatio: 2,
            tradesPerDay: 1,
            accounts: 10,
            correlation: 'copy',
            groups: 1,
            dayStop: { kind: 'none' },
        },
        {
            id: freshId(),
            label: 'Frequency-scale',
            riskPerTrade: 250,
            winrate: 0.35,
            rrRatio: 2,
            tradesPerDay: 4,
            accounts: 10,
            correlation: 'copy',
            groups: 1,
            dayStop: { kind: 'none' },
        },
        {
            id: freshId(),
            label: 'Group-split',
            riskPerTrade: 250,
            winrate: 0.4,
            rrRatio: 2,
            tradesPerDay: 1,
            accounts: 10,
            correlation: 'grouped',
            groups: 2,
            dayStop: { kind: 'none' },
        },
    ];
}

function defaultState(): CalculatorState {
    return {
        firm: DEFAULT_FIRM,
        plan: DEFAULT_PLAN,
        winrate: 0.4,
        rrRatio: 2,
        tradesPerDay: 1,
        sizingMode: SizingMode.Dollar,
        riskDollars: 250,
        riskPercent: 0.5,
        seed: 42,
        trials: 2000,
        maxEvalDays: 60,
        fundedHorizonDays: 60,
        evalDiscountPercent: 0,
        activationDiscountPercent: 0,
        linkActivationDiscount: false,
        commissionPerRoundTrip: 0,
        maxAttempts: 1,
        copyAccounts: 1,
        firmMemory: {},
        dayStop: { kind: 'none' },
        labScenarios: buildDefaultLabScenarios(),
    };
}

function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export interface PinnedScenario {
    state: CalculatorState;
    result: SimOutputs;
}

export interface UseCalculatorReturn {
    state: CalculatorState;
    firms: typeof ALL_FIRMS;
    result: SimOutputs;
    simInputs: SimInputs;
    pinned: PinnedScenario | null;
    isPending: boolean;
    setFirm: (firm: PropFirm) => void;
    setPlan: (plan: Plan) => void;
    setWinrate: (n: number) => void;
    setRrRatio: (n: number) => void;
    setTradesPerDay: (n: number) => void;
    setSizingMode: (m: SizingMode) => void;
    setRiskDollars: (n: number) => void;
    setRiskPercent: (n: number) => void;
    setSeed: (n: number) => void;
    setTrials: (n: number) => void;
    setMaxEvalDays: (n: number) => void;
    setEvalDiscountPercent: (n: number) => void;
    setActivationDiscountPercent: (n: number) => void;
    setLinkActivationDiscount: (linked: boolean) => void;
    setCommissionPerRoundTrip: (n: number) => void;
    setMaxAttempts: (n: number) => void;
    setCopyAccounts: (n: number) => void;
    setDayStop: (rule: DayStopRule) => void;
    setLabScenarios: (entries: LabScenario[]) => void;
    addLabScenario: () => void;
    updateLabScenario: (id: string, patch: Partial<LabScenario>) => void;
    removeLabScenario: (id: string) => void;
    resetLabScenarios: () => void;
    resetCoupon: () => void;
    pinScenario: () => void;
    unpinScenario: () => void;
    applyState: (next: CalculatorState) => void;
    reset: () => void;
}

export function useCalculator(): UseCalculatorReturn {
    const [state, setState] = useState<CalculatorState>(defaultState);
    const [pinned, setPinned] = useState<PinnedScenario | null>(null);
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
            plan: state.plan,
            winrate: state.winrate,
            rrRatio: state.rrRatio,
            riskPerTrade,
            tradesPerDay: state.tradesPerDay,
            maxEvalDays: state.maxEvalDays,
            fundedHorizonDays: state.fundedHorizonDays,
            trials: state.trials,
            seed: state.seed,
            discounts: {
                evalPercent: state.evalDiscountPercent,
                activationPercent: effectiveActivationDiscount,
            },
            commissionPerRoundTrip: state.commissionPerRoundTrip,
            maxAttempts: state.maxAttempts,
            copyAccounts: state.copyAccounts,
            dayStop: state.dayStop,
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
                    planId: s.plan.id,
                    copyAccounts: s.copyAccounts,
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
                firm,
                plan,
                copyAccounts,
                firmMemory: memoryWithCurrent,
            };
        });
    };

    const setPlan = (plan: Plan) => {
        setState((s) => {
            const cap = s.firm.maxFundedAccounts(plan);
            const copyAccounts = Math.min(s.copyAccounts, cap);
            return {
                ...s,
                plan,
                copyAccounts,
                firmMemory: {
                    ...s.firmMemory,
                    [s.firm.id]: { planId: plan.id, copyAccounts },
                },
            };
        });
    };

    return {
        state,
        firms: ALL_FIRMS,
        result,
        simInputs,
        pinned,
        isPending,
        setFirm,
        setPlan,
        setWinrate: (n) =>
            setState((s) => ({
                ...s,
                winrate: clampNum(n, 0.05, 0.95, s.winrate),
            })),
        setRrRatio: (n) =>
            setState((s) => ({
                ...s,
                rrRatio: clampNum(n, 0.5, 10, s.rrRatio),
            })),
        setTradesPerDay: (n) =>
            setState((s) => ({
                ...s,
                tradesPerDay: clampInt(n, 1, 50, s.tradesPerDay),
            })),
        setSizingMode: (m) => setState((s) => ({ ...s, sizingMode: m })),
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
        setSeed: (n) =>
            setState((s) => ({
                ...s,
                seed: Number.isFinite(n) ? Math.floor(n) : s.seed,
            })),
        setTrials: (n) =>
            setState((s) => ({
                ...s,
                trials: clampInt(n, 100, 5000, s.trials),
            })),
        setMaxEvalDays: (n) =>
            setState((s) => ({
                ...s,
                maxEvalDays: clampInt(n, 10, 365, s.maxEvalDays),
            })),
        setEvalDiscountPercent: (n) =>
            setState((s) => ({
                ...s,
                evalDiscountPercent: clampNum(n, 0, 100, s.evalDiscountPercent),
            })),
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
        setLinkActivationDiscount: (linked) =>
            setState((s) => ({ ...s, linkActivationDiscount: linked })),
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
        setMaxAttempts: (n) =>
            setState((s) => ({
                ...s,
                maxAttempts: clampInt(n, 1, 10, s.maxAttempts),
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
                            planId: s.plan.id,
                            copyAccounts: clamped,
                        },
                    },
                };
            }),
        setDayStop: (rule) => setState((s) => ({ ...s, dayStop: rule })),
        setLabScenarios: (entries) =>
            setState((s) => ({ ...s, labScenarios: entries })),
        addLabScenario: () =>
            setState((s) => {
                const last = s.labScenarios[s.labScenarios.length - 1];
                const base: LabScenario = last
                    ? { ...last, id: freshId(), label: `${last.label} copy` }
                    : {
                          id: freshId(),
                          label: 'New scenario',
                          riskPerTrade: 250,
                          winrate: 0.4,
                          rrRatio: 2,
                          tradesPerDay: 1,
                          accounts: 10,
                          correlation: 'copy',
                          groups: 1,
                          dayStop: { kind: 'none' },
                      };
                return { ...s, labScenarios: [...s.labScenarios, base] };
            }),
        updateLabScenario: (id, patch) =>
            setState((s) => ({
                ...s,
                labScenarios: s.labScenarios.map((sc) =>
                    sc.id === id ? { ...sc, ...patch } : sc,
                ),
            })),
        removeLabScenario: (id) =>
            setState((s) => ({
                ...s,
                labScenarios: s.labScenarios.filter((sc) => sc.id !== id),
            })),
        resetLabScenarios: () =>
            setState((s) => ({
                ...s,
                labScenarios: buildDefaultLabScenarios(),
            })),
        resetCoupon: () =>
            setState((s) => ({
                ...s,
                evalDiscountPercent: 0,
                activationDiscountPercent: 0,
                linkActivationDiscount: false,
            })),
        pinScenario: () => setPinned({ state, result }),
        unpinScenario: () => setPinned(null),
        applyState: (next) => setState(next),
        reset: () => setState(defaultState()),
    };
}
