'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
    ALL_FIRMS,
    type DayPolicy,
    type DayStopRule,
    type InstrumentSymbol,
    percent,
    type Plan,
    type RungSizing,
    type SimInputs,
    type SimOutputs,
    simulate,
    type TradingFirm,
} from '~/lib/prop-calculator';

import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from './calculatorReducer';
import { riskPercentToDollars } from './riskConversion';
import {
    type CalculatorState,
    type LabScenario,
    type PortfolioEntry,
    SizingMode,
} from './types';
import { decodeState, encodeState } from './urlState';
import { useDebouncedValue } from './useDebouncedSimulation';

const SIM_DEBOUNCE_MS = 180;

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
    setEvalDayPolicy: (policy: DayPolicy | null) => void;
    setEvalDiscountPercent: (n: number) => void;
    setFirm: (firm: TradingFirm) => void;
    setFundedHorizonDays: (n: number) => void;
    setIdleDayProbability: (n: number) => void;
    setInstrument: (instrument: InstrumentSymbol | null) => void;
    setLabScenarios: (entries: LabScenario[]) => void;
    setLinkActivationDiscount: (isLinked: boolean) => void;
    setMaxAttempts: (n: number) => void;
    setMaxEvalDays: (n: number) => void;
    setMonthlySubscriptionDiscountPercent: (n: number) => void;
    setPayoutRequestSize: (n: null | number) => void;
    setPlan: (plan: Plan) => void;
    setPortfolio: (entries: PortfolioEntry[]) => void;
    setResetDiscountPercent: (n: number) => void;
    setRetainedCushion: (n: null | number) => void;
    setRiskDollars: (n: number) => void;
    setRiskPercent: (n: number) => void;
    setRrRatio: (n: number) => void;
    setRungSizing: (mode: RungSizing) => void;
    setSeed: (n: number) => void;
    setSizingMode: (m: SizingMode) => void;
    setStopPoints: (n: number) => void;
    setTradesPerDay: (n: number) => void;
    setTrials: (n: number) => void;
    setWinrate: (n: number) => void;
    simInputs: SimInputs;
    state: CalculatorState;
    unpinScenario: () => void;
    updateLabScenario: (id: string, patch: Partial<LabScenario>) => void;
}

export function useCalculator(): UseCalculatorReturn {
    const [state, dispatch] = useReducer(
        calculatorReducer,
        undefined,
        defaultCalculatorState,
    );
    const [pinned, setPinned] = useState<null | PinnedScenario>(null);
    const hydratedReference = useRef(false);
    const skipNextWriteReference = useRef(true);

    useEffect(() => {
        if (hydratedReference.current) return;
        hydratedReference.current = true;
        if (typeof window === 'undefined') return;
        const parameters = new URLSearchParams(window.location.search);
        if (!parameters.has('firm')) return;
        try {
            const next = decodeState(
                parameters,
                ALL_FIRMS,
                defaultCalculatorState(),
            );
            skipNextWriteReference.current = true;
            dispatch({ state: next, type: CalculatorActionType.ApplyState });
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        if (skipNextWriteReference.current) {
            skipNextWriteReference.current = false;
            return;
        }
        if (typeof window === 'undefined') return;
        const parameters = encodeState(state).toString();
        const next = `${window.location.pathname}?${parameters}${window.location.hash}`;
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
                : riskPercentToDollars(
                      state.riskPercent,
                      state.plan.accountSize,
                  ),
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
                activationPercent: percent(effectiveActivationDiscount),
                evalPercent: percent(state.evalDiscountPercent),
                monthlySubscriptionPercent: percent(
                    state.monthlySubscriptionDiscountPercent,
                ),
                resetPercent: percent(state.resetDiscountPercent),
            },
            evalDayPolicy: state.evalDayPolicy ?? undefined,
            fundedHorizonDays: state.fundedHorizonDays,
            idleDayProbability: state.idleDayProbability,
            instrument: state.instrument ?? undefined,
            maxAttempts: state.maxAttempts,
            maxEvalDays: state.maxEvalDays,
            minRetainedCushion: state.retainedCushion ?? undefined,
            payoutRequestSize: state.payoutRequestSize ?? undefined,
            plan: state.plan,
            riskPerTrade,
            rrRatio: state.rrRatio,
            rungSizing: state.rungSizing,
            seed: state.seed,
            stopPoints: state.stopPoints ?? undefined,
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
            state.monthlySubscriptionDiscountPercent,
            state.resetDiscountPercent,
            state.commissionPerRoundTrip,
            state.maxAttempts,
            state.copyAccounts,
            state.dayStop,
            state.evalDayPolicy,
            state.instrument,
            state.stopPoints,
            state.retainedCushion,
            state.idleDayProbability,
            state.payoutRequestSize,
            state.rungSizing,
        ],
    );

    const debouncedInputs = useDebouncedValue(simInputs, SIM_DEBOUNCE_MS);
    const result = useMemo(() => simulate(debouncedInputs), [debouncedInputs]);
    const isPending = simInputs !== debouncedInputs;

    const act = (action: CalculatorAction) => dispatch(action);

    return {
        addLabScenario: () =>
            act({ type: CalculatorActionType.AddLabScenario }),
        applyState: (next) =>
            act({ state: next, type: CalculatorActionType.ApplyState }),
        firms: ALL_FIRMS,
        isPending,
        pinned,
        pinScenario: () => setPinned({ result, state }),
        removeLabScenario: (id) =>
            act({ id, type: CalculatorActionType.RemoveLabScenario }),
        reset: () => act({ type: CalculatorActionType.Reset }),
        resetCoupon: () => act({ type: CalculatorActionType.ResetCoupon }),
        resetLabScenarios: () =>
            act({ type: CalculatorActionType.ResetLabScenarios }),
        result,
        setActivationDiscountPercent: (n) =>
            act({
                type: CalculatorActionType.SetActivationDiscountPercent,
                value: n,
            }),
        setCommissionPerRoundTrip: (n) =>
            act({
                type: CalculatorActionType.SetCommissionPerRoundTrip,
                value: n,
            }),
        setCopyAccounts: (n) =>
            act({ type: CalculatorActionType.SetCopyAccounts, value: n }),
        setDayStop: (rule) =>
            act({ rule, type: CalculatorActionType.SetDayStop }),
        setEvalDayPolicy: (policy) =>
            act({ policy, type: CalculatorActionType.SetEvalDayPolicy }),
        setEvalDiscountPercent: (n) =>
            act({
                type: CalculatorActionType.SetEvalDiscountPercent,
                value: n,
            }),
        setFirm: (firm) => act({ firm, type: CalculatorActionType.SetFirm }),
        setFundedHorizonDays: (n) =>
            act({
                type: CalculatorActionType.SetFundedHorizonDays,
                value: n,
            }),
        setIdleDayProbability: (n) =>
            act({ type: CalculatorActionType.SetIdleDayProbability, value: n }),
        setInstrument: (instrument) =>
            act({ instrument, type: CalculatorActionType.SetInstrument }),
        setLabScenarios: (entries) =>
            act({ entries, type: CalculatorActionType.SetLabScenarios }),
        setLinkActivationDiscount: (isLinked) =>
            act({
                isLinked,
                type: CalculatorActionType.SetLinkActivationDiscount,
            }),
        setMaxAttempts: (n) =>
            act({ type: CalculatorActionType.SetMaxAttempts, value: n }),
        setMaxEvalDays: (n) =>
            act({ type: CalculatorActionType.SetMaxEvalDays, value: n }),
        setMonthlySubscriptionDiscountPercent: (n) =>
            act({
                type: CalculatorActionType.SetMonthlySubscriptionDiscountPercent,
                value: n,
            }),
        setPayoutRequestSize: (n) =>
            act({ type: CalculatorActionType.SetPayoutRequestSize, value: n }),
        setPlan: (plan) => act({ plan, type: CalculatorActionType.SetPlan }),
        setPortfolio: (entries) =>
            act({ entries, type: CalculatorActionType.SetPortfolio }),
        setResetDiscountPercent: (n) =>
            act({
                type: CalculatorActionType.SetResetDiscountPercent,
                value: n,
            }),
        setRetainedCushion: (n) =>
            act({ type: CalculatorActionType.SetRetainedCushion, value: n }),
        setRiskDollars: (n) =>
            act({ type: CalculatorActionType.SetRiskDollars, value: n }),
        setRiskPercent: (n) =>
            act({ type: CalculatorActionType.SetRiskPercent, value: n }),
        setRrRatio: (n) =>
            act({ type: CalculatorActionType.SetRrRatio, value: n }),
        setRungSizing: (mode) =>
            act({ type: CalculatorActionType.SetRungSizing, value: mode }),
        setSeed: (n) => act({ type: CalculatorActionType.SetSeed, value: n }),
        setSizingMode: (mode) =>
            act({ mode, type: CalculatorActionType.SetSizingMode }),
        setStopPoints: (n) =>
            act({ type: CalculatorActionType.SetStopPoints, value: n }),
        setTradesPerDay: (n) =>
            act({ type: CalculatorActionType.SetTradesPerDay, value: n }),
        setTrials: (n) =>
            act({ type: CalculatorActionType.SetTrials, value: n }),
        setWinrate: (n) =>
            act({ type: CalculatorActionType.SetWinrate, value: n }),
        simInputs,
        state,
        unpinScenario: () => setPinned(null),
        updateLabScenario: (id, patch) =>
            act({ id, patch, type: CalculatorActionType.UpdateLabScenario }),
    };
}
