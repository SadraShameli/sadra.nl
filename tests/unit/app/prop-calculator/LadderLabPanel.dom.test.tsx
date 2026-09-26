import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import LadderLabPanel from '~/app/(app)/prop-calculator/_components/LadderLabPanel';
import {
    initialLadderLabForm,
    ladderSearchInputsFor,
} from '~/app/(app)/prop-calculator/_components/ladderLabRestore';
import {
    type LadderResultSlot,
    LadderSlotEvent,
    ladderSlotFor,
} from '~/app/(app)/prop-calculator/_components/ladderResultSlot';
import {
    type LadderProgress,
    LadderRunPhase,
    type LadderSearchInputs,
    type LadderSearchState,
} from '~/app/(app)/prop-calculator/_components/ladderSearchTypes';
import {
    ApexVariant,
    type DayPolicy,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    type LadderScore,
    type Plan,
    PolicySizing,
    RungSizing,
    type SimInputs,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

interface PanelHarness {
    ladderSlot: LadderResultSlot | null;
    runInputs: LadderSearchInputs | null;
    search: LadderSearchState | null;
    setRungSizing: Mock<(rungSizing: RungSizing) => void>;
    writeLadderSlot: Mock<
        (event: LadderSlotEvent, slot: LadderResultSlot | null) => void
    >;
}

const harness = vi.hoisted((): PanelHarness => ({
    ladderSlot: null,
    runInputs: null,
    search: null,
    setRungSizing: vi.fn(),
    writeLadderSlot: vi.fn(),
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        setRungSizing: harness.setRungSizing,
        writeLadderSlot: harness.writeLadderSlot,
    }),
    useLabSlots: () => ({ ladderSlot: harness.ladderSlot }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/useLadderSearch', () => ({
    useLadderSearch: () => ({
        cancel: vi.fn(),
        run: vi.fn(),
        runInputs: harness.runInputs,
        state: harness.search,
    }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/charts/LadderFrontierChartView',
    () => ({ default: () => null }),
);

function apexPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function baseInputsWith(rungSizing: RungSizing): SimInputs {
    return {
        commissionPerRoundTrip: 4,
        copyAccounts: 1,
        fundedHorizonDays: 60,
        instrument: InstrumentSymbol.NQ,
        maxEvalDays: 60,
        plan: apexPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        rungSizing,
        seed: 42,
        stopPoints: 10,
        tradesPerDay: 2,
        trials: 2000,
        winrate: 0.4,
    };
}

function progress(completed: number): LadderProgress {
    return { completed, elapsedMs: completed * 10, etaMs: 100, total: 40 };
}

function searchInputsFor(
    baseInputs: SimInputs,
    rungSizing: RungSizing,
): LadderSearchInputs {
    return ladderSearchInputsFor(baseInputs, {
        ...initialLadderLabForm(
            null,
            baseInputs.plan.drawdown.amount,
            rungSizing,
        ),
        rungSizing,
    });
}

const score: LadderScore = {
    costPerFunded: 900,
    costPerFundedStandardError: 20,
    expectedDaysToFunded: 12,
    expectedDaysToFundedStandardError: 0.5,
    ladder: [200, 300, 400],
    meanDaysOnFail: 5,
    meanDaysOnPass: 9,
    passRate: 0.4,
    passRateStandardError: 0.01,
};

function succeeded(): LadderSearchState {
    return {
        phase: LadderRunPhase.Succeeded,
        progress: progress(40),
        result: {
            byCost: [score],
            byPassRate: [score],
            bySpeed: [score],
            droppedAliasCount: 0,
            frontier: [score],
            gridSize: 40,
            laddersScored: 40,
            unscorableCount: 0,
        },
    };
}

function writes(event: LadderSlotEvent): (LadderResultSlot | null)[] {
    return harness.writeLadderSlot.mock.calls
        .filter(([written]) => written === event)
        .map(([, slot]) => slot);
}

describe('LadderLabPanel', () => {
    let container: HTMLDivElement;
    let root: Root;
    let isMounted: boolean;
    const onApply = vi.fn<(policy: DayPolicy | null) => void>();

    function render(baseInputs: SimInputs, activePolicy: DayPolicy | null) {
        act(() => {
            root.render(
                <LadderLabPanel
                    activePolicy={activePolicy}
                    baseInputs={baseInputs}
                    onApply={onApply}
                />,
            );
        });
        isMounted = true;
    }

    function unmount() {
        act(() => {
            root.unmount();
        });
        isMounted = false;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.ladderSlot = null;
        harness.runInputs = null;
        harness.search = { phase: LadderRunPhase.Idle };
        harness.setRungSizing.mockClear();
        harness.writeLadderSlot.mockClear();
        onApply.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        isMounted = false;
    });

    afterEach(() => {
        if (isMounted) unmount();
        container.remove();
    });

    it('writes no slot while a run only reports progress', () => {
        const baseInputs = baseInputsWith(RungSizing.CapToCushion);
        render(baseInputs, null);
        harness.runInputs = searchInputsFor(
            baseInputs,
            RungSizing.CapToCushion,
        );
        for (const completed of [0, 20, 39]) {
            harness.search = {
                phase: LadderRunPhase.Running,
                progress: progress(completed),
            };
            render(baseInputs, null);
        }
        expect(harness.writeLadderSlot).not.toHaveBeenCalled();
    });

    it('writes one Completed slot with the run inputs when the run succeeds', () => {
        const baseInputs = baseInputsWith(RungSizing.CapToCushion);
        const runInputs = searchInputsFor(baseInputs, RungSizing.CapToCushion);
        harness.runInputs = runInputs;
        harness.search = {
            phase: LadderRunPhase.Running,
            progress: progress(10),
        };
        render(baseInputs, null);
        const done = succeeded();
        harness.search = done;
        render(baseInputs, null);
        render(baseInputs, null);
        render(baseInputs, {
            ladder: score.ladder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { kind: DayStopRuleKind.None },
        });

        expect(harness.writeLadderSlot).toHaveBeenCalledTimes(1);
        expect(writes(LadderSlotEvent.Completed)).toEqual([
            {
                cancelledByNavigation: false,
                displayInstrument: InstrumentSymbol.NQ,
                inputs: runInputs,
                result: done,
            },
        ]);
    });

    it('writes a slot cancelled by navigation when it unmounts mid-run', () => {
        const baseInputs = baseInputsWith(RungSizing.CapToCushion);
        const runInputs = searchInputsFor(baseInputs, RungSizing.CapToCushion);
        harness.runInputs = runInputs;
        harness.search = {
            phase: LadderRunPhase.Running,
            progress: progress(17),
        };
        render(baseInputs, null);
        unmount();

        expect(harness.writeLadderSlot).toHaveBeenCalledTimes(1);
        expect(writes(LadderSlotEvent.Unmounted)).toEqual([
            {
                cancelledByNavigation: true,
                displayInstrument: InstrumentSymbol.NQ,
                inputs: runInputs,
                result: {
                    phase: LadderRunPhase.Cancelled,
                    progress: progress(17),
                },
            },
        ]);
    });

    it.each([RungSizing.SkipIfUnaffordable, RungSizing.CapToCushion])(
        'seeds the unaffordable rung choice from the calculator inputs (%s)',
        (rungSizing) => {
            render(baseInputsWith(rungSizing), null);
            const select = [...container.querySelectorAll('label')]
                .find((label) =>
                    label.textContent.startsWith('Unaffordable rung'),
                )
                ?.querySelector('select');
            expect(select).toBeInstanceOf(HTMLSelectElement);
            expect(select?.value).toBe(rungSizing);
        },
    );

    it('applies both the ladder and the rung sizing it was scored with', () => {
        const baseInputs = baseInputsWith(RungSizing.CapToCushion);
        const scoredInputs = searchInputsFor(
            baseInputs,
            RungSizing.SkipIfUnaffordable,
        );
        harness.ladderSlot = ladderSlotFor(
            LadderSlotEvent.Completed,
            succeeded(),
            scoredInputs,
            InstrumentSymbol.NQ,
        );
        render(baseInputs, null);

        const apply = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Apply' && !button.disabled,
        );
        expect(apply).toBeDefined();
        act(() => {
            apply?.click();
        });

        expect(onApply).toHaveBeenCalledExactlyOnceWith({
            ladder: [200, 300, 400],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: scoredInputs.stopRule,
        });
        expect(harness.setRungSizing).toHaveBeenCalledExactlyOnceWith(
            RungSizing.SkipIfUnaffordable,
        );
    });

    it.each<[string, RungSizing, string]>([
        [
            'Clear when the calculator runs it under its scored rung sizing',
            RungSizing.SkipIfUnaffordable,
            'Clear',
        ],
        [
            'Apply again when the calculator rung sizing changed after Apply',
            RungSizing.CapToCushion,
            'Apply',
        ],
    ])('offers %s on the applied row', (_name, calculatorRungSizing, label) => {
        const scoredInputs = searchInputsFor(
            baseInputsWith(calculatorRungSizing),
            RungSizing.SkipIfUnaffordable,
        );
        harness.ladderSlot = ladderSlotFor(
            LadderSlotEvent.Completed,
            succeeded(),
            scoredInputs,
            InstrumentSymbol.NQ,
        );
        render(baseInputsWith(calculatorRungSizing), {
            ladder: score.ladder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: scoredInputs.stopRule,
        });

        const rowButtons = [
            ...(container
                .querySelector('tbody')
                ?.querySelectorAll(':scope button') ?? []),
        ].map((button) => button.textContent);
        expect(rowButtons).toEqual([label]);
    });

    it('says Apply also sets the unaffordable rung choice for every trade, funded included', () => {
        render(baseInputsWith(RungSizing.CapToCushion), null);
        expect(container.textContent).toContain(
            'Apply also sets the unaffordable rung choice for every trade in the simulation, eval and funded, not only for this ladder.',
        );
    });
});
