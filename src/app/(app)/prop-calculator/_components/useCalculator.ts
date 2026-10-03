'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    type Dispatch,
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';
import { z } from 'zod';

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
} from '~/lib/prop-calculator';
import {
    type BankrollParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { chooseObjective } from '~/lib/prop-calculator/advisor/actions';
import {
    CalculatorUrlParameter,
    OBJECTIVE_URL_PARAMETER,
} from '~/lib/schemas/url';
import { legacySectionTarget } from '~/lib/site/legacyCalculatorLinks';

import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from './calculatorReducer';
import { buildSimInputs } from './calculatorSimInputs';
import {
    isLegacyHashSettled,
    type LegacyHashReplacement,
    legacyHashReplacement,
    nextUrl,
    stillPendingLegacyHash,
} from './calculatorUrlSync';
import { writeLastToolQuery } from './lastToolQuery';
import { watchLegacyFragmentScroll } from './legacyFragmentScroll';
import { isCalculatorInputsPath } from './toolCatalog';
import { tradingInputBounds } from './tradingInputBounds';
import {
    type CalculatorState,
    type LabScenario,
    LinkParameter,
    type PortfolioEntry,
    type SizingMode,
} from './types';
import {
    decodeState,
    encodeState,
    type EncodeStateOptions,
    ObjectiveUrlMode,
    withSharedLab,
} from './urlState';
import { useDebouncedValue } from './useDebouncedSimulation';

export { buildSimInputs } from './calculatorSimInputs';

export const SIM_DEBOUNCE_MS = 180;

const objectiveInLinkSchema = z.enum(SizingObjective);

export enum ObjectiveOrigin {
    Automatic = 'automatic',
    Chosen = 'chosen',
    Default = 'default',
    Link = 'link',
}

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
    setLiveTransferHazard: (n: number) => void;
    setMaxAttempts: (n: number) => void;
    setMaxEvalDays: (n: number) => void;
    setMonthlySubscriptionDiscountPercent: (n: number) => void;
    setObjective: (objective: SizingObjective) => void;
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

export interface SignedInAutomaticObjectiveInputs {
    availableCents: null | number;
    bankroll: BankrollParameters;
}

export interface SignedInObjectiveInputs extends SignedInAutomaticObjectiveInputs {
    hasLinkObjective: boolean;
    isObjectiveChanged: boolean;
}

export interface UseCalculatorReturn {
    actions: CalculatorActions;
    applyAutomaticObjective: (objective: SizingObjective) => void;
    debouncedQuery: string;
    encodeOptions: EncodeStateOptions;
    hasLinkObjective: boolean;
    legacyHashSettled: boolean;
    mounted: boolean;
    objectiveOrigin: ObjectiveOrigin;
    planOptIns: PlanOptIns;
    rememberAutomaticObjective: (objective: null | SizingObjective) => void;
    simInputs: SimInputs;
    state: CalculatorState;
}

interface MountState {
    mounted: boolean;
    pendingLegacyHash: LegacyHashReplacement | null;
}

interface ObjectiveOriginState {
    automaticObjective: null | SizingObjective;
    origin: ObjectiveOrigin;
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
        setLiveTransferHazard: (n) =>
            dispatch({
                type: CalculatorActionType.SetLiveTransferHazard,
                value: n,
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
        setObjective: (objective) =>
            dispatch({
                objective,
                type: CalculatorActionType.SetObjective,
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

export function initialStateFromSearch(
    search: string,
    decode: typeof decodeState = decodeState,
): CalculatorState {
    const parameters = new URLSearchParams(search);
    const defaults = defaultCalculatorState();
    if (!parameters.has(CalculatorUrlParameter.Firm)) {
        try {
            return withSharedLinkParameters(defaults, parameters, decode);
        } catch {
            return withSharedLab(defaults, parameters);
        }
    }
    try {
        return decode(parameters, ALL_FIRMS, defaults);
    } catch {
        return withSharedLab(defaults, parameters);
    }
}

export function isObjectiveInSearch(search: string): boolean {
    return objectiveInLinkSchema.safeParse(
        new URLSearchParams(search).get(OBJECTIVE_URL_PARAMETER) ?? undefined,
    ).success;
}

export function objectiveUrlModeOf(origin: ObjectiveOrigin): ObjectiveUrlMode {
    switch (origin) {
        case ObjectiveOrigin.Automatic: {
            return ObjectiveUrlMode.Omitted;
        }
        case ObjectiveOrigin.Chosen:
        case ObjectiveOrigin.Link: {
            return ObjectiveUrlMode.Explicit;
        }
        case ObjectiveOrigin.Default: {
            return ObjectiveUrlMode.Natural;
        }
    }
}

export function pinScenario(result: SimOutputs): PinnedScenario {
    return { result };
}

export function signedInAutomaticObjective(
    inputs: SignedInAutomaticObjectiveInputs,
): null | SizingObjective {
    const chosen = chooseObjective(inputs.availableCents, inputs.bankroll);
    return chosen === SizingObjective.MonthlyNet ? null : chosen;
}

export function signedInDefaultObjective(
    inputs: SignedInObjectiveInputs,
): null | SizingObjective {
    return inputs.hasLinkObjective || inputs.isObjectiveChanged
        ? null
        : signedInAutomaticObjective(inputs);
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
    const [hasLinkObjective] = useState(() =>
        isObjectiveInSearch(searchParameters.toString()),
    );
    const [originState, setOriginState] = useState<ObjectiveOriginState>(
        () => ({
            automaticObjective: null,
            origin: hasLinkObjective
                ? ObjectiveOrigin.Link
                : ObjectiveOrigin.Default,
        }),
    );
    const objectiveOrigin =
        originState.origin === ObjectiveOrigin.Automatic &&
        state.objective !== originState.automaticObjective
            ? ObjectiveOrigin.Chosen
            : originState.origin;
    const encodeOptions = useMemo<EncodeStateOptions>(
        () => ({ objectiveUrl: objectiveUrlModeOf(objectiveOrigin) }),
        [objectiveOrigin],
    );
    const automaticObjectiveReference = useRef<null | SizingObjective>(null);
    const trackedDispatch = useCallback<Dispatch<CalculatorAction>>(
        (action) => {
            if (action.type === CalculatorActionType.SetObjective) {
                setOriginState({
                    automaticObjective: null,
                    origin: ObjectiveOrigin.Chosen,
                });
            }
            if (action.type === CalculatorActionType.Reset) {
                const automatic = automaticObjectiveReference.current;
                setOriginState({
                    automaticObjective: automatic,
                    origin:
                        automatic === null
                            ? ObjectiveOrigin.Default
                            : ObjectiveOrigin.Automatic,
                });
                dispatch(action);
                if (automatic !== null) {
                    dispatch({
                        objective: automatic,
                        type: CalculatorActionType.SetObjective,
                    });
                }
                return;
            }
            dispatch(action);
        },
        [],
    );
    const applyAutomaticObjective = useCallback(
        (objective: SizingObjective) => {
            automaticObjectiveReference.current = objective;
            setOriginState({
                automaticObjective: objective,
                origin: ObjectiveOrigin.Automatic,
            });
            dispatch({ objective, type: CalculatorActionType.SetObjective });
        },
        [],
    );
    const rememberAutomaticObjective = useCallback(
        (objective: null | SizingObjective) => {
            automaticObjectiveReference.current = objective;
        },
        [],
    );
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
        const pendingLegacyHash = legacyHashReplacement(
            state,
            pathname,
            hash,
            encodeOptions,
        );
        if (pendingLegacyHash !== null)
            router.replace(pendingLegacyHash.target);
        setMount({ mounted: true, pendingLegacyHash });
    }, [encodeOptions, pathname, router, state]);

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
            encodeOptions,
        );
        if (url !== null) window.history.replaceState(null, '', url);
        writeLastToolQuery(encodeState(state, encodeOptions).toString());
    }, [encodeOptions, hasSettledLegacyHash, pathname, searchParameters, state]);

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

    const query = useMemo(
        () => encodeState(state, encodeOptions).toString(),
        [encodeOptions, state],
    );
    const debouncedQuery = useDebouncedValue(query, SIM_DEBOUNCE_MS);
    const actions = useMemo(
        () => createCalculatorActions(trackedDispatch),
        [trackedDispatch],
    );

    return {
        actions,
        applyAutomaticObjective,
        debouncedQuery,
        encodeOptions,
        hasLinkObjective,
        legacyHashSettled: hasSettledLegacyHash,
        mounted: mount.mounted,
        objectiveOrigin,
        planOptIns,
        rememberAutomaticObjective,
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
    decode: typeof decodeState,
): CalculatorState {
    const decoded = decode(parameters, ALL_FIRMS, defaults);
    const shared = Object.fromEntries(
        SHARED_LINK_FIELDS.map((field) => [field, decoded[field]]),
    ) as Pick<CalculatorState, (typeof SHARED_LINK_FIELDS)[number]>;
    return { ...defaults, ...shared };
}
