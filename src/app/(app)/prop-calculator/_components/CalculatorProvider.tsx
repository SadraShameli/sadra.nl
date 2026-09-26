'use client';

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    ALL_FIRMS,
    type PlanOptIns,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';

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
