'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    type Dispatch,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';

import {
    ALL_FIRMS,
    type DayPolicy,
    type DayStopRule,
    type InstrumentSymbol,
    type Plan,
    type PlanOptIns,
    type RungSizing,
    type SimInputs,
    type SimOutputs,
    type TradingFirm,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { CalculatorUrlParameter } from '~/lib/schemas/url';
import { legacySectionTarget } from '~/lib/site/legacyCalculatorLinks';

import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from './calculatorReducer';
import {
    isLegacyHashSettled,
    type LegacyHashReplacement,
    legacyHashReplacement,
    nextUrl,
    stillPendingLegacyHash,
} from './calculatorUrlSync';
import { toCouponDiscounts } from './couponDiscounts';
import { writeLastToolQuery } from './lastToolQuery';
import { watchLegacyFragmentScroll } from './legacyFragmentScroll';
import { riskPercentToDollars } from './riskConversion';
import { isCalculatorInputsPath } from './toolCatalog';
import { tradingInputBounds } from './tradingInputBounds';
import {
    type CalculatorState,
    type LabScenario,
    LinkParameter,
    type PortfolioEntry,
    SizingMode,
} from './types';
import { decodeState, encodeState, withSharedLab } from './urlState';
import { useDebouncedValue } from './useDebouncedSimulation';

export const SIM_DEBOUNCE_MS = 180;

export interface CalculatorActions {
    addLabScenario: () => void;
    applyState: (next: CalculatorState) => void;
    dispatch: Dispatch<CalculatorAction>;
    removeLabScenario: (id: string) => void;
    reset: () => void;
    resetCoupon: () => void;
    resetLabScenarios: () => void;
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
    setTakesFundedReset: (isTaken: boolean) => void;
    setTakesOneTimeEarlyWithdrawal: (isTaken: boolean) => void;
    setTradesPerDay: (n: number) => void;
    setTrials: (n: number) => void;
    setWinrate: (n: number) => void;
    updateLabScenario: (id: string, patch: Partial<LabScenario>) => void;
}

export interface PinnedScenario {
    result: SimOutputs;
}

export interface UseCalculatorReturn {
    actions: CalculatorActions;
    debouncedQuery: string;
    legacyHashSettled: boolean;
    mounted: boolean;
    planOptIns: PlanOptIns;
    simInputs: SimInputs;
    state: CalculatorState;
}

interface MountState {
    mounted: boolean;
    pendingLegacyHash: LegacyHashReplacement | null;
}

type SimInputsSource = Pick<
    CalculatorState,
    | 'activationDiscountPercent'
    | 'commissionPerRoundTrip'
    | 'copyAccounts'
    | 'dayStop'
    | 'evalDayPolicy'
    | 'evalDiscountPercent'
    | 'fundedHorizonDays'
    | 'idleDayProbability'
    | 'instrument'
    | 'linkActivationDiscount'
    | 'maxAttempts'
    | 'maxEvalDays'
    | 'monthlySubscriptionDiscountPercent'
    | 'payoutRequestSize'
    | 'plan'
    | 'resetDiscountPercent'
    | 'retainedCushion'
    | 'riskDollars'
    | 'riskPercent'
    | 'rrRatio'
    | 'rungSizing'
    | 'seed'
    | 'sizingMode'
    | 'stopPoints'
    | 'takesFundedReset'
    | 'takesOneTimeEarlyWithdrawal'
    | 'tradesPerDay'
    | 'trials'
    | 'winrate'
>;

export function buildSimInputs(source: SimInputsSource): SimInputs {
    const riskPerTrade =
        source.sizingMode === SizingMode.Dollar
            ? source.riskDollars
            : riskPercentToDollars(source.riskPercent, source.plan.accountSize);
    return {
        commissionPerRoundTrip: source.commissionPerRoundTrip,
        copyAccounts: source.copyAccounts,
        dayStop: source.dayStop,
        discounts: toCouponDiscounts({
            activationDiscountPercent: source.activationDiscountPercent,
            evalDiscountPercent: source.evalDiscountPercent,
            linkActivationDiscount: source.linkActivationDiscount,
            monthlySubscriptionDiscountPercent:
                source.monthlySubscriptionDiscountPercent,
            resetDiscountPercent: source.resetDiscountPercent,
        }),
        evalDayPolicy: source.evalDayPolicy ?? undefined,
        fundedHorizonDays: source.fundedHorizonDays,
        idleDayProbability: source.idleDayProbability,
        instrument: source.instrument ?? undefined,
        maxAttempts: source.maxAttempts,
        maxEvalDays: source.maxEvalDays,
        minRetainedCushion: source.retainedCushion ?? undefined,
        payoutRequestSize: source.payoutRequestSize ?? undefined,
        plan: withPlanOptIns(source.plan, {
            takesFundedReset: source.takesFundedReset,
            takesOneTimeEarlyWithdrawal: source.takesOneTimeEarlyWithdrawal,
        }),
        riskPerTrade,
        rrRatio: source.rrRatio,
        rungSizing: source.rungSizing,
        seed: source.seed,
        stopPoints: source.stopPoints ?? undefined,
        tradesPerDay: source.tradesPerDay,
        trials: source.trials,
        winrate: source.winrate,
    };
}

export function createCalculatorActions(
    dispatch: Dispatch<CalculatorAction>,
): CalculatorActions {
    return {
        addLabScenario: () =>
            dispatch({ type: CalculatorActionType.AddLabScenario }),
        applyState: (next) =>
            dispatch({ state: next, type: CalculatorActionType.ApplyState }),
        dispatch,
        removeLabScenario: (id) =>
            dispatch({ id, type: CalculatorActionType.RemoveLabScenario }),
        reset: () => dispatch({ type: CalculatorActionType.Reset }),
        resetCoupon: () => dispatch({ type: CalculatorActionType.ResetCoupon }),
        resetLabScenarios: () =>
            dispatch({ type: CalculatorActionType.ResetLabScenarios }),
        setActivationDiscountPercent: (n) =>
            dispatch({
                type: CalculatorActionType.SetActivationDiscountPercent,
                value: n,
            }),
        setCommissionPerRoundTrip: (n) =>
            dispatch({
                type: CalculatorActionType.SetCommissionPerRoundTrip,
                value: n,
            }),
        setCopyAccounts: (n) =>
            dispatch({ type: CalculatorActionType.SetCopyAccounts, value: n }),
        setDayStop: (rule) =>
            dispatch({ rule, type: CalculatorActionType.SetDayStop }),
        setEvalDayPolicy: (policy) =>
            dispatch({ policy, type: CalculatorActionType.SetEvalDayPolicy }),
        setEvalDiscountPercent: (n) =>
            dispatch({
                type: CalculatorActionType.SetEvalDiscountPercent,
                value: n,
            }),
        setFirm: (firm) =>
            dispatch({ firm, type: CalculatorActionType.SetFirm }),
        setFundedHorizonDays: (n) =>
            dispatch({
                type: CalculatorActionType.SetFundedHorizonDays,
                value: Math.min(n, tradingInputBounds().fundedHorizonDays.max),
            }),
        setIdleDayProbability: (n) =>
            dispatch({
                type: CalculatorActionType.SetIdleDayProbability,
                value: n,
            }),
        setInstrument: (instrument) =>
            dispatch({ instrument, type: CalculatorActionType.SetInstrument }),
        setLabScenarios: (entries) =>
            dispatch({ entries, type: CalculatorActionType.SetLabScenarios }),
        setLinkActivationDiscount: (isLinked) =>
            dispatch({
                isLinked,
                type: CalculatorActionType.SetLinkActivationDiscount,
            }),
        setMaxAttempts: (n) =>
            dispatch({ type: CalculatorActionType.SetMaxAttempts, value: n }),
        setMaxEvalDays: (n) =>
            dispatch({ type: CalculatorActionType.SetMaxEvalDays, value: n }),
        setMonthlySubscriptionDiscountPercent: (n) =>
            dispatch({
                type: CalculatorActionType.SetMonthlySubscriptionDiscountPercent,
                value: n,
            }),
        setPayoutRequestSize: (n) =>
            dispatch({
                type: CalculatorActionType.SetPayoutRequestSize,
                value: n,
            }),
        setPlan: (plan) =>
            dispatch({ plan, type: CalculatorActionType.SetPlan }),
        setPortfolio: (entries) =>
            dispatch({ entries, type: CalculatorActionType.SetPortfolio }),
        setResetDiscountPercent: (n) =>
            dispatch({
                type: CalculatorActionType.SetResetDiscountPercent,
                value: n,
            }),
        setRetainedCushion: (n) =>
            dispatch({
                type: CalculatorActionType.SetRetainedCushion,
                value: n,
            }),
        setRiskDollars: (n) =>
            dispatch({ type: CalculatorActionType.SetRiskDollars, value: n }),
        setRiskPercent: (n) =>
            dispatch({ type: CalculatorActionType.SetRiskPercent, value: n }),
        setRrRatio: (n) =>
            dispatch({ type: CalculatorActionType.SetRrRatio, value: n }),
        setRungSizing: (mode) =>
            dispatch({ type: CalculatorActionType.SetRungSizing, value: mode }),
        setSeed: (n) =>
            dispatch({ type: CalculatorActionType.SetSeed, value: n }),
        setSizingMode: (mode) =>
            dispatch({ mode, type: CalculatorActionType.SetSizingMode }),
        setStopPoints: (n) =>
            dispatch({ type: CalculatorActionType.SetStopPoints, value: n }),
        setTakesFundedReset: (isTaken) =>
            dispatch({
                isTaken,
                type: CalculatorActionType.SetTakesFundedReset,
            }),
        setTakesOneTimeEarlyWithdrawal: (isTaken) =>
            dispatch({
                isTaken,
                type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
            }),
        setTradesPerDay: (n) =>
            dispatch({ type: CalculatorActionType.SetTradesPerDay, value: n }),
        setTrials: (n) =>
            dispatch({ type: CalculatorActionType.SetTrials, value: n }),
        setWinrate: (n) =>
            dispatch({ type: CalculatorActionType.SetWinrate, value: n }),
        updateLabScenario: (id, patch) =>
            dispatch({
                id,
                patch,
                type: CalculatorActionType.UpdateLabScenario,
            }),
    };
}

export function initialStateFromSearch(search: string): CalculatorState {
    const parameters = new URLSearchParams(search);
    const defaults = defaultCalculatorState();
    if (!parameters.has(CalculatorUrlParameter.Firm)) {
        try {
            return withSharedLinkParameters(defaults, parameters);
        } catch {
            return withSharedLab(defaults, parameters);
        }
    }
    try {
        return decodeState(parameters, ALL_FIRMS, defaults);
    } catch {
        return withSharedLab(defaults, parameters);
    }
}

export function pinScenario(result: SimOutputs): PinnedScenario {
    return { result };
}

export function useCalculator(): UseCalculatorReturn {
    const searchParameters = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const [state, dispatch] = useReducer(
        calculatorReducer,
        searchParameters.toString(),
        initialStateFromSearch,
    );
    const [mount, setMount] = useState<MountState>({
        mounted: false,
        pendingLegacyHash: null,
    });
    const hasMountedReference = useRef(false);
    const hasSettledLegacyHash = isLegacyHashSettled(
        mount.mounted,
        mount.pendingLegacyHash,
        pathname,
    );

    useEffect(() => {
        if (hasMountedReference.current) return;
        hasMountedReference.current = true;
        const { hash } = window.location;
        const fragmentTarget = legacySectionTarget(hash);
        if (fragmentTarget !== null)
            watchLegacyFragmentScroll(
                fragmentTarget.fragment,
                fragmentTarget.route,
            );
        const pendingLegacyHash = legacyHashReplacement(state, pathname, hash);
        if (pendingLegacyHash !== null)
            router.replace(pendingLegacyHash.target);
        setMount({ mounted: true, pendingLegacyHash });
    }, [pathname, router, state]);

    useEffect(() => {
        const pendingLegacyHash = stillPendingLegacyHash(
            mount.pendingLegacyHash,
            pathname,
        );
        if (pendingLegacyHash === mount.pendingLegacyHash) return;
        setMount({ mounted: true, pendingLegacyHash });
    }, [mount.pendingLegacyHash, pathname]);

    useEffect(() => {
        if (!hasSettledLegacyHash || !isCalculatorInputsPath(pathname)) return;
        const url = nextUrl(
            state,
            pathname,
            searchParameters.toString(),
            window.location.hash,
        );
        if (url !== null) window.history.replaceState(null, '', url);
        writeLastToolQuery(encodeState(state).toString());
    }, [hasSettledLegacyHash, pathname, searchParameters, state]);

    const {
        activationDiscountPercent,
        commissionPerRoundTrip,
        copyAccounts,
        dayStop,
        evalDayPolicy,
        evalDiscountPercent,
        fundedHorizonDays,
        idleDayProbability,
        instrument,
        linkActivationDiscount,
        maxAttempts,
        maxEvalDays,
        monthlySubscriptionDiscountPercent,
        payoutRequestSize,
        plan,
        resetDiscountPercent,
        retainedCushion,
        riskDollars,
        riskPercent,
        rrRatio,
        rungSizing,
        seed,
        sizingMode,
        stopPoints,
        takesFundedReset,
        takesOneTimeEarlyWithdrawal,
        tradesPerDay,
        trials,
        winrate,
    } = state;

    const planOptIns = useMemo<PlanOptIns>(
        () => ({ takesFundedReset, takesOneTimeEarlyWithdrawal }),
        [takesFundedReset, takesOneTimeEarlyWithdrawal],
    );

    const simInputs = useMemo(
        () =>
            buildSimInputs({
                activationDiscountPercent,
                commissionPerRoundTrip,
                copyAccounts,
                dayStop,
                evalDayPolicy,
                evalDiscountPercent,
                fundedHorizonDays,
                idleDayProbability,
                instrument,
                linkActivationDiscount,
                maxAttempts,
                maxEvalDays,
                monthlySubscriptionDiscountPercent,
                payoutRequestSize,
                plan,
                resetDiscountPercent,
                retainedCushion,
                riskDollars,
                riskPercent,
                rrRatio,
                rungSizing,
                seed,
                sizingMode,
                stopPoints,
                takesFundedReset,
                takesOneTimeEarlyWithdrawal,
                tradesPerDay,
                trials,
                winrate,
            }),
        [
            activationDiscountPercent,
            commissionPerRoundTrip,
            copyAccounts,
            dayStop,
            evalDayPolicy,
            evalDiscountPercent,
            fundedHorizonDays,
            idleDayProbability,
            instrument,
            linkActivationDiscount,
            maxAttempts,
            maxEvalDays,
            monthlySubscriptionDiscountPercent,
            payoutRequestSize,
            plan,
            resetDiscountPercent,
            retainedCushion,
            riskDollars,
            riskPercent,
            rrRatio,
            rungSizing,
            seed,
            sizingMode,
            stopPoints,
            takesFundedReset,
            takesOneTimeEarlyWithdrawal,
            tradesPerDay,
            trials,
            winrate,
        ],
    );

    const query = useMemo(() => encodeState(state).toString(), [state]);
    const debouncedQuery = useDebouncedValue(query, SIM_DEBOUNCE_MS);
    const actions = useMemo(() => createCalculatorActions(dispatch), []);

    return {
        actions,
        debouncedQuery,
        legacyHashSettled: hasSettledLegacyHash,
        mounted: mount.mounted,
        planOptIns,
        simInputs,
        state,
    };
}

function sharedLinkParameterField(
    parameter: LinkParameter,
): 'dayStop' | 'evalDayPolicy' | 'portfolio' {
    switch (parameter) {
        case LinkParameter.DayStop: {
            return 'dayStop';
        }
        case LinkParameter.EvalDayPolicy: {
            return 'evalDayPolicy';
        }
        case LinkParameter.Portfolio: {
            return 'portfolio';
        }
    }
}

const SHARED_LINK_FIELDS = [
    'labLink',
    'labScenarios',
    'linkParameters',
    ...Object.values(LinkParameter).map(sharedLinkParameterField),
] satisfies readonly (keyof CalculatorState)[];

function withSharedLinkParameters(
    defaults: CalculatorState,
    parameters: URLSearchParams,
): CalculatorState {
    const decoded = decodeState(parameters, ALL_FIRMS, defaults);
    const shared = Object.fromEntries(
        SHARED_LINK_FIELDS.map((field) => [field, decoded[field]]),
    ) as Pick<CalculatorState, (typeof SHARED_LINK_FIELDS)[number]>;
    return { ...defaults, ...shared };
}
