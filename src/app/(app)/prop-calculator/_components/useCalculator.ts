'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
    ALL_FIRMS,
    FirmId,
    findFirm,
    simulate,
    type Plan,
    type PropFirm,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';

import { SizingMode, type CalculatorState } from './types';
import { decodeState, encodeState } from './urlState';

const SIM_DEBOUNCE_MS = 180;

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

    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (!params.has('firm')) return;
        try {
            const next = decodeState(params, ALL_FIRMS, defaultState());
            setState(next);
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        if (!hydratedRef.current) return;
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
        setWinrate: (n) => setState((s) => ({ ...s, winrate: n })),
        setRrRatio: (n) => setState((s) => ({ ...s, rrRatio: n })),
        setTradesPerDay: (n) => setState((s) => ({ ...s, tradesPerDay: n })),
        setSizingMode: (m) => setState((s) => ({ ...s, sizingMode: m })),
        setRiskDollars: (n) => setState((s) => ({ ...s, riskDollars: n })),
        setRiskPercent: (n) => setState((s) => ({ ...s, riskPercent: n })),
        setSeed: (n) => setState((s) => ({ ...s, seed: n })),
        setTrials: (n) => setState((s) => ({ ...s, trials: n })),
        setMaxEvalDays: (n) =>
            setState((s) => ({
                ...s,
                maxEvalDays: Math.max(10, Math.min(365, Math.floor(n))),
            })),
        setEvalDiscountPercent: (n) =>
            setState((s) => ({ ...s, evalDiscountPercent: n })),
        setActivationDiscountPercent: (n) =>
            setState((s) => ({ ...s, activationDiscountPercent: n })),
        setLinkActivationDiscount: (linked) =>
            setState((s) => ({ ...s, linkActivationDiscount: linked })),
        setCommissionPerRoundTrip: (n) =>
            setState((s) => ({ ...s, commissionPerRoundTrip: n })),
        setMaxAttempts: (n) =>
            setState((s) => ({
                ...s,
                maxAttempts: Math.max(1, Math.floor(n)),
            })),
        setCopyAccounts: (n) =>
            setState((s) => {
                const cap = s.firm.maxFundedAccounts(s.plan);
                const clamped = Math.max(1, Math.min(cap, Math.floor(n)));
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
