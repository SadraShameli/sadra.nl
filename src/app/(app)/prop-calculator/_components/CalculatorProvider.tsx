'use client';

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { useSession } from '~/lib/auth/client';
import {
    ALL_FIRMS,
    type PlanOptIns,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';
import { api } from '~/trpc/react';

import { ComputationCache } from './computationCache';
import {
    isSlotWriteAllowed,
    type LadderResultSlot,
    type LadderSlotEvent,
} from './ladderResultSlot';
import { type CalculatorState, ChartType } from './types';
import { type BaseSimulationRun, useBaseSimulation } from './useBaseSimulation';
import {
    type CalculatorActions,
    type PinnedScenario,
    pinScenario,
    signedInDefaultObjective,
    SIM_DEBOUNCE_MS,
    useCalculator,
} from './useCalculator';
import { ComputationCacheContext } from './useDebouncedSimulation';

export interface CalculatorInputs {
    debouncedQuery: string;
    firms: typeof ALL_FIRMS;
    planOptIns: PlanOptIns;
    simInputs: SimInputs;
    state: CalculatorState;
}

export interface CalculatorLabSlots {
    chartType: ChartType;
    ladderSlot: LadderResultSlot | null;
    pinned: null | PinnedScenario;
}

export interface CalculatorProviderActions extends CalculatorActions {
    pinScenario: (result: SimOutputs) => void;
    registerBaseResultConsumer: () => () => void;
    setChartType: (chartType: ChartType) => void;
    unpinScenario: () => void;
    writeLadderSlot: (
        event: LadderSlotEvent,
        slot: LadderResultSlot | null,
    ) => void;
}

interface CalculatorProviderProperties {
    children: ReactNode;
}

const CalculatorInputsContext = createContext<CalculatorInputs | null>(null);
const BaseResultContext = createContext<BaseSimulationRun | null>(null);
const LabSlotsContext = createContext<CalculatorLabSlots | null>(null);
const CalculatorActionsContext =
    createContext<CalculatorProviderActions | null>(null);

export function CalculatorProvider({ children }: CalculatorProviderProperties) {
    const calculator = useCalculator();
    const [cache] = useState(() => new ComputationCache());
    const [consumerCount, setConsumerCount] = useState(0);
    const [pinned, setPinned] = useState<null | PinnedScenario>(null);
    const [chartType, setChartType] = useState<ChartType>(
        ChartType.DaysToPassHistogram,
    );
    const [ladderSlot, setLadderSlot] = useState<LadderResultSlot | null>(null);

    const base = useBaseSimulation(
        calculator.simInputs,
        {
            hasConsumer: consumerCount > 0,
            legacyHashSettled: calculator.legacyHashSettled,
            mounted: calculator.mounted,
        },
        cache,
        SIM_DEBOUNCE_MS,
    );

    const calculatorActions = calculator.actions;
    const { hasLinkObjective } = calculator;
    const { objective } = calculator.state;
    const initialObjective = useRef(objective);
    const hasChosenObjectiveReference = useRef(false);
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebook = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    }).data;
    const availableCents = api.propAccounts.bankroll.summary.useQuery(
        undefined,
        {
            enabled: hasSession,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        },
    ).data?.availableCents;
    useEffect(() => {
        if (
            !hasSession ||
            availableCents === undefined ||
            rulebook === undefined ||
            hasChosenObjectiveReference.current
        ) {
            return;
        }
        hasChosenObjectiveReference.current = true;
        const chosen = signedInDefaultObjective({
            availableCents,
            bankroll: rulebook.bankroll,
            hasLinkObjective,
            isObjectiveChanged: objective !== initialObjective.current,
        });
        if (chosen !== null) calculatorActions.setObjective(chosen);
    }, [
        availableCents,
        calculatorActions,
        hasLinkObjective,
        hasSession,
        objective,
        rulebook,
    ]);
    const actions = useMemo<CalculatorProviderActions>(
        () => ({
            ...calculatorActions,
            pinScenario: (result) => setPinned(pinScenario(result)),
            registerBaseResultConsumer: () => {
                setConsumerCount((count) => count + 1);
                return () => setConsumerCount((count) => count - 1);
            },
            setChartType,
            unpinScenario: () => setPinned(null),
            writeLadderSlot: (event, slot) => {
                if (slot === null || !isSlotWriteAllowed(event)) return;
                setLadderSlot(slot);
            },
        }),
        [calculatorActions],
    );

    const { debouncedQuery, planOptIns, simInputs, state } = calculator;
    const inputs = useMemo<CalculatorInputs>(
        () => ({
            debouncedQuery,
            firms: ALL_FIRMS,
            planOptIns,
            simInputs,
            state,
        }),
        [debouncedQuery, planOptIns, simInputs, state],
    );

    const { error, isPending, result } = base;
    const baseResult = useMemo<BaseSimulationRun>(
        () => ({ error, isPending, result }),
        [error, isPending, result],
    );

    const labSlots = useMemo<CalculatorLabSlots>(
        () => ({ chartType, ladderSlot, pinned }),
        [chartType, ladderSlot, pinned],
    );

    return (
        <ComputationCacheContext.Provider value={cache}>
            <CalculatorActionsContext.Provider value={actions}>
                <CalculatorInputsContext.Provider value={inputs}>
                    <BaseResultContext.Provider value={baseResult}>
                        <LabSlotsContext.Provider value={labSlots}>
                            {children}
                        </LabSlotsContext.Provider>
                    </BaseResultContext.Provider>
                </CalculatorInputsContext.Provider>
            </CalculatorActionsContext.Provider>
        </ComputationCacheContext.Provider>
    );
}

export function useBaseResult(): BaseSimulationRun {
    const { registerBaseResultConsumer } = useCalculatorActions();
    useEffect(() => registerBaseResultConsumer(), [registerBaseResultConsumer]);
    return required(useContext(BaseResultContext), 'useBaseResult');
}

export function useCalculatorActions(): CalculatorProviderActions {
    return required(
        useContext(CalculatorActionsContext),
        'useCalculatorActions',
    );
}

export function useCalculatorInputs(): CalculatorInputs {
    return required(useContext(CalculatorInputsContext), 'useCalculatorInputs');
}

export function useLabSlots(): CalculatorLabSlots {
    return required(useContext(LabSlotsContext), 'useLabSlots');
}

function required<T>(value: null | T, hook: string): T {
    if (value === null) {
        throw new Error(`${hook} must be used inside CalculatorProvider`);
    }
    return value;
}
