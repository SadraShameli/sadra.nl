import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { type Cell } from '~/app/(app)/prop-calculator/_components/SensitivityHeatmap';
import { baseSimulationFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import {
    type BaseSimulationRun,
    useBaseSimulation,
} from '~/app/(app)/prop-calculator/_components/useBaseSimulation';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    type DebouncedComputation,
    useDebouncedComputation,
} from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import {
    InstrumentSymbol,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, simulate: vi.fn(actual.simulate) };
});

const OPEN_GATE = {
    hasConsumer: true,
    legacyHashSettled: true,
    mounted: true,
};

const SMALL_TRIALS = 20;

function flushTimers() {
    for (let round = 0; round < 3; round++) {
        act(() => {
            vi.runOnlyPendingTimers();
        });
    }
}

function refusedInputs(): SimInputs {
    return buildSimInputs(
        stateWith({
            instrument: InstrumentSymbol.NQ,
            riskDollars: 150,
            stopPoints: 10,
        }),
    );
}

function stateWith(patch: Partial<CalculatorState>): CalculatorState {
    return { ...defaultCalculatorState(), trials: SMALL_TRIALS, ...patch };
}

describe('the web never runs a simulation the engine refuses (PT-11f)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.mocked(simulate).mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('useBaseSimulation', () => {
        let latest: BaseSimulationRun | null;

        function Harness({ inputs }: { inputs: SimInputs }) {
            const [cache] = useState(() => new ComputationCache());
            latest = useBaseSimulation(inputs, OPEN_GATE, cache, 0);
            return null;
        }

        function render(inputs: SimInputs) {
            act(() => {
                root.render(<Harness inputs={inputs} />);
            });
        }

        beforeEach(() => {
            latest = null;
        });

        it('skips the simulation for NQ at a 10 point stop and $150 of funded flat risk and returns the refusal text', () => {
            const inputs = refusedInputs();
            const refusal = simInputsSizingIssue(inputs);
            expect(refusal).not.toBeNull();
            render(inputs);
            expect(simulate).not.toHaveBeenCalled();
            expect(latest?.error).toBe(refusal);
            expect(latest?.result).toBeNull();
            expect(latest?.isPending).toBe(false);
        });

        it('drops a result computed for earlier inputs once the inputs are refused', () => {
            render(buildSimInputs(stateWith({})));
            expect(latest?.result).not.toBeNull();
            render(refusedInputs());
            flushTimers();
            expect(latest?.result).toBeNull();
            expect(latest?.error).toBe(simInputsSizingIssue(refusedInputs()));
        });

        it('turns any other engine error into a readable message instead of an uncaught effect error', () => {
            vi.mocked(simulate).mockImplementationOnce(() => {
                throw new Error('Invalid SimInputs: winrate must be below 1');
            });
            render(buildSimInputs(stateWith({ winrate: 0.41 })));
            expect(latest?.error).toBe('winrate must be below 1');
            expect(latest?.result).toBeNull();
            expect(latest?.isPending).toBe(false);
        });

        it('gives the views a failure message for a non-sizing engine error, and none while pending or after a result', () => {
            const inputs = buildSimInputs(stateWith({ winrate: 0.42 }));
            expect(
                baseSimulationFailure(inputs, {
                    isPending: true,
                    result: null,
                }),
            ).toBeNull();
            vi.mocked(simulate).mockImplementationOnce(() => {
                throw new Error('groups must be 1');
            });
            render(inputs);
            if (latest === null) throw new Error('no hook result');
            expect(baseSimulationFailure(inputs, latest)).toBe(
                'The simulation could not run for these inputs, so there is no result to show. Change an input to run it again.',
            );
            const settled = buildSimInputs(stateWith({ winrate: 0.43 }));
            render(settled);
            expect(baseSimulationFailure(settled, latest)).toBeNull();
            const refused = refusedInputs();
            expect(
                baseSimulationFailure(refused, {
                    isPending: true,
                    result: null,
                }),
            ).toBe(simInputsSizingIssue(refused));
        });

        it('leaves the default inputs (stop points off) unaffected', () => {
            const inputs = buildSimInputs(stateWith({}));
            expect(inputs.stopPoints).toBeUndefined();
            expect(simInputsSizingIssue(inputs)).toBeNull();
            render(inputs);
            expect(simulate).toHaveBeenCalledTimes(1);
            expect(latest?.error).toBeNull();
            expect(latest?.result?.evalPassProbability).toBeGreaterThanOrEqual(
                0,
            );
            expect(latest?.isPending).toBe(false);
        });
    });

    describe('useDebouncedComputation', () => {
        let latest: DebouncedComputation<Cell[]> | null;
        const INITIAL: Cell[] = [];

        function Harness({
            computationKey,
            compute,
            refusal,
        }: {
            computationKey: string;
            compute: () => Cell[];
            refusal?: null | string;
        }) {
            latest = useDebouncedComputation(
                ComputationId.Sensitivity,
                computationKey,
                0,
                compute,
                INITIAL,
                refusal,
            );
            return null;
        }

        function render(
            computationKey: string,
            compute: () => Cell[],
            refusal?: null | string,
        ) {
            act(() => {
                root.render(
                    <Harness
                        computationKey={computationKey}
                        compute={compute}
                        refusal={refusal}
                    />,
                );
            });
            flushTimers();
        }

        function cells(...winrates: number[]): Cell[] {
            return winrates.map((winrate) => ({
                evalPass: 0.5,
                fundedSurvival: 0.5,
                monthlyNet: 100,
                rr: 2,
                winrate,
            }));
        }

        beforeEach(() => {
            latest = null;
        });

        it('surfaces a thrown engine error as a readable message and stops pending', () => {
            render('a', () => {
                throw new Error(
                    'Invalid SimInputs: riskPerTrade $150 is below one NQ contract',
                );
            });
            expect(latest?.error).toBe(
                'riskPerTrade $150 is below one NQ contract',
            );
            expect(latest?.pending).toBe(false);
            expect(latest?.result).toBe(INITIAL);
        });

        it('never shows the result of earlier inputs after a later computation fails', () => {
            render('a', () => cells(0.4, 0.5));
            expect(latest?.result).toEqual(cells(0.4, 0.5));
            render('b', () => {
                throw new Error('boom');
            });
            expect(latest?.result).toBe(INITIAL);
            expect(latest?.error).toBe('boom');
        });

        it('does not compute while the inputs are refused and shows the refusal', () => {
            const compute = vi.fn(() => cells(0.4));
            render('a', compute, 'refused: raise the risk');
            expect(compute).not.toHaveBeenCalled();
            expect(latest?.error).toBe('refused: raise the risk');
            expect(latest?.pending).toBe(false);
            expect(latest?.result).toBe(INITIAL);
        });

        it('computes again once the refusal clears', () => {
            const compute = vi.fn(() => cells(0.6));
            render('a', compute, 'refused');
            render('b', compute, null);
            expect(compute).toHaveBeenCalledTimes(1);
            expect(latest?.error).toBeNull();
            expect(latest?.result).toEqual(cells(0.6));
        });

        it('settles again when the inputs return from a refusal to the ones last computed', () => {
            const compute = vi.fn(() => cells(0.5));
            render('a', compute, null);
            render('b', compute, 'refused');
            render('a', compute, null);
            expect(latest?.pending).toBe(false);
            expect(latest?.error).toBeNull();
            expect(latest?.result).toEqual(cells(0.5));
        });
    });
});
