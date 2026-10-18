import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    expectTypeOf,
    it,
    vi,
} from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type ComputationId,
    type ComputationResultMap,
} from '~/app/(app)/prop-calculator/_components/ComputationId';
import StrategyLabPanel from '~/app/(app)/prop-calculator/_components/StrategyLabPanel';
import {
    LabLinkStatus,
    type LabScenario,
} from '~/app/(app)/prop-calculator/_components/types';
import { type LabResult } from '~/app/(app)/prop-calculator/_components/useLabSimulation';
import {
    CorrelationMode,
    DayStopRuleKind,
    FirmId,
    type Fraction0to1,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    ECONOMICS_REASON_TEXT,
    EconomicsDisclosure,
    EconomicsReason,
} from '~/lib/prop-calculator/economics';
import { findFirm, LiveApplicabilityNote } from '~/lib/prop-calculator/firms';
import {
    LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LIVE_TRANSFER_NOTE_TEXT,
    LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
    LiveTransferContinuationKind,
} from '~/lib/prop-calculator/simulator';

import {
    dialogField,
    isDialogOpen,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import {
    chooseRowAction,
    confirmRowAction,
    isRowActionDisabled,
    openRowActions,
    rowActionItem,
    rowActionLabels,
} from '../../components/rowActionsMenu';
import { expectDialogFieldGridsOneColumnBelowMd } from './dialogFieldGrids';
import { InlineToolsWorker } from './labWorkerFixtures';
import {
    MISSING_REASON_BUTTON_SELECTOR,
    missingValueText,
} from './missingValue';

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const UNREPRESENTABLE_RR = 1.333;
const UNSOLVABLE_RISK_PER_TRADE = 0.0001;

const baseScenario: LabScenario = {
    accounts: 1,
    correlation: CorrelationMode.Copy,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 1,
    id: 'one-to-two',
    instrument: null,
    label: 'One to two',
    riskPerTrade: 250,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 1,
    winrate: 0.4,
};

const scenarios: LabScenario[] = [
    {
        ...baseScenario,
        id: 'unrepresentable',
        label: 'Unrepresentable',
        rrRatio: UNREPRESENTABLE_RR,
    },
    baseScenario,
    { ...baseScenario, id: 'one-to-one', label: 'One to one', rrRatio: 1 },
];

function flush() {
    for (let round = 0; round < 4; round++) {
        act(() => {
            vi.runOnlyPendingTimers();
        });
    }
}

function LabHarness({
    fundedHorizonDays = 5,
    initial,
    liveTransferHazard,
    plan = defaultCalculatorState().plan,
}: {
    fundedHorizonDays?: number;
    initial: LabScenario[];
    liveTransferHazard?: number;
    plan?: Plan;
}) {
    const [current, setCurrent] = useState(initial);
    return (
        <StrategyLabPanel
            activationDiscountPercent={0}
            commissionPerRoundTrip={0}
            evalDiscountPercent={0}
            fundedHorizonDays={fundedHorizonDays}
            labLink={{ status: LabLinkStatus.Absent }}
            linkActivationDiscount={false}
            liveTransferHazard={liveTransferHazard}
            maxEvalDays={10}
            minRetainedCushion={undefined}
            monthlySubscriptionDiscountPercent={0}
            onAdd={vi.fn()}
            onRemove={vi.fn()}
            onReset={vi.fn()}
            onUpdate={(id, patch) => {
                setCurrent((previous) =>
                    previous.map((scenario) =>
                        scenario.id === id
                            ? { ...scenario, ...patch }
                            : scenario,
                    ),
                );
            }}
            payoutRequestSize={undefined}
            plan={plan}
            resetDiscountPercent={0}
            rungSizing={undefined}
            scenarios={current}
            seed={1}
        />
    );
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function renderNothing(): null {
    return null;
}

function rowLabel(row: HTMLTableRowElement): string {
    return row.querySelector(':scope > th[scope="row"]')?.textContent ?? '';
}

describe('StrategyLabPanel theoretical pass probability (PT-53b)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(initial: LabScenario[]) {
        act(() => {
            root.render(<LabHarness initial={initial} />);
        });
        flush();
    }

    function columnIndex(header: string): number {
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (node) => node.textContent.trim(),
        );
        const index = headers.indexOf(header);
        if (index === -1) throw new Error(`no ${header} column`);
        return index;
    }

    function bodyRows(): HTMLTableRowElement[] {
        return [
            ...container.querySelectorAll<HTMLTableRowElement>(
                ':scope tbody tr',
            ),
        ];
    }

    function cellAt(
        label: string,
        header: string,
    ): HTMLTableCellElement | undefined {
        return bodyRows().find((row) => rowLabel(row) === label)?.cells[
            columnIndex(header)
        ];
    }

    function theoReasonOf(label: string): null | string {
        const trigger = bodyRows()
            .find((row) => rowLabel(row) === label)
            ?.cells[columnIndex('Theo')]?.querySelector(
                MISSING_REASON_BUTTON_SELECTOR,
            );
        if (!(trigger instanceof HTMLButtonElement)) return null;
        act(() => {
            trigger.click();
        });
        const popoverId = trigger.getAttribute('aria-controls');
        return popoverId === null
            ? null
            : (document.querySelector(`#${CSS.escape(popoverId)}`)
                  ?.textContent ?? null);
    }

    function theoByLabel(): Record<string, string> {
        const theo = columnIndex('Theo');
        return Object.fromEntries(
            bodyRows().map((row) => [
                rowLabel(row),
                row.cells[theo]?.textContent.trim() ?? '',
            ]),
        );
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
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

    it('keeps editing out of the scenario row and names every field of its edit dialog', () => {
        render(scenarios);
        const row = bodyRows().find(
            (candidate) => rowLabel(candidate) === 'One to two',
        );
        expect(
            row?.querySelectorAll('input, select, textarea, [role="combobox"]'),
        ).toHaveLength(0);
        openRowActions('One to two');
        expect(rowActionLabels()).toEqual(['Edit', 'Remove']);
        act(() => {
            rowActionItem('Edit').click();
        });
        const controls = [
            ...document.body.querySelectorAll<HTMLElement>(
                ':scope [role="dialog"] input, :scope [role="dialog"] [role="combobox"]',
            ),
        ];
        expect(controls.length).toBeGreaterThan(0);
        for (const control of controls) {
            const isLabelled =
                control.getAttribute('aria-label') !== null ||
                document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
                    ?.textContent !== undefined;
            expect({ control: control.outerHTML, isLabelled }).toEqual({
                control: control.outerHTML,
                isLabelled: true,
            });
        }
        expect(dialogField('Scenario name').value).toBe('One to two');
    });

    it('keeps the field grid of its edit dialog one column below md', () => {
        render(scenarios);
        chooseRowAction('One to two', 'Edit');
        expectDialogFieldGridsOneColumnBelowMd();
    });

    it('asks before removing a scenario and keeps the last one', () => {
        const onRemove = vi.fn<(id: string) => void>();
        act(() => {
            root.render(
                <StrategyLabPanel
                    activationDiscountPercent={0}
                    commissionPerRoundTrip={0}
                    evalDiscountPercent={0}
                    fundedHorizonDays={5}
                    labLink={{ status: LabLinkStatus.Absent }}
                    linkActivationDiscount={false}
                    maxEvalDays={10}
                    minRetainedCushion={undefined}
                    monthlySubscriptionDiscountPercent={0}
                    onAdd={vi.fn()}
                    onRemove={onRemove}
                    onReset={vi.fn()}
                    onUpdate={vi.fn()}
                    payoutRequestSize={undefined}
                    plan={defaultCalculatorState().plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={[baseScenario]}
                    seed={1}
                />,
            );
        });
        flush();
        openRowActions('One to two');
        expect(isRowActionDisabled('Remove')).toBe(true);
        act(() => {
            root.render(
                <StrategyLabPanel
                    activationDiscountPercent={0}
                    commissionPerRoundTrip={0}
                    evalDiscountPercent={0}
                    fundedHorizonDays={5}
                    labLink={{ status: LabLinkStatus.Absent }}
                    linkActivationDiscount={false}
                    maxEvalDays={10}
                    minRetainedCushion={undefined}
                    monthlySubscriptionDiscountPercent={0}
                    onAdd={vi.fn()}
                    onRemove={onRemove}
                    onReset={vi.fn()}
                    onUpdate={vi.fn()}
                    payoutRequestSize={undefined}
                    plan={defaultCalculatorState().plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={scenarios}
                    seed={1}
                />,
            );
        });
        flush();
        chooseRowAction('One to two', 'Remove');
        expect(onRemove).not.toHaveBeenCalled();
        confirmRowAction('Remove');
        expect(onRemove).toHaveBeenCalledExactlyOnceWith(baseScenario.id);
    });

    it('adds a scenario from the add dialog, prefilled with a copy of the last one', async () => {
        const onAdd = vi.fn<(scenario: LabScenario) => void>();
        act(() => {
            root.render(
                <StrategyLabPanel
                    activationDiscountPercent={0}
                    commissionPerRoundTrip={0}
                    evalDiscountPercent={0}
                    fundedHorizonDays={5}
                    labLink={{ status: LabLinkStatus.Absent }}
                    linkActivationDiscount={false}
                    maxEvalDays={10}
                    minRetainedCushion={undefined}
                    monthlySubscriptionDiscountPercent={0}
                    onAdd={onAdd}
                    onRemove={vi.fn()}
                    onReset={vi.fn()}
                    onUpdate={vi.fn()}
                    payoutRequestSize={undefined}
                    plan={defaultCalculatorState().plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={[baseScenario]}
                    seed={1}
                />,
            );
        });
        flush();
        const add = [...container.querySelectorAll('button')].find((node) =>
            node.textContent.includes('Add scenario'),
        );
        act(() => {
            add?.click();
        });
        expect(onAdd).not.toHaveBeenCalled();
        expect(dialogField('Scenario name').value).toBe('One to two copy');
        typeInto(dialogField('Reward to risk'), '3');
        await submitDialog('Add', () => vi.advanceTimersByTimeAsync(0));
        expect(onAdd).toHaveBeenCalledOnce();
        const added = onAdd.mock.calls[0]?.[0];
        expect(added?.label).toBe('One to two copy');
        expect(added?.rrRatio).toBe(3);
        expect(added?.id).not.toBe(baseScenario.id);
        expect(isDialogOpen()).toBe(false);
    });

    it('drops the stop and groups columns when no scenario has a stop or groups, instead of a column of n/a', () => {
        render(scenarios);
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (node) => node.textContent.trim(),
        );
        expect(headers).not.toContain('Stop pts');
        expect(headers).not.toContain('Groups');
        expect(container.textContent).not.toContain('n/a');
    });

    it('shows the stop and groups columns once one scenario has them, with a missing value on the rows without', () => {
        render([
            baseScenario,
            {
                ...baseScenario,
                correlation: CorrelationMode.Grouped,
                groups: 2,
                id: 'grouped',
                instrument: InstrumentSymbol.NQ,
                label: 'Grouped',
                stopPoints: 10,
            },
        ]);
        expect(cellAt('Grouped', 'Stop pts')?.textContent.trim()).toBe('10');
        expect(cellAt('Grouped', 'Groups')?.textContent.trim()).toBe('2');
        expect(cellAt('One to two', 'Stop pts')?.textContent.trim()).toBe(
            missingValueText(),
        );
        expect(cellAt('One to two', 'Groups')?.textContent.trim()).toBe(
            missingValueText(),
        );
        expect(container.textContent).not.toContain('n/a');
    });

    it('shows the not-applicable marker, never NaN%, for a reward:risk the walk cannot represent', () => {
        render(scenarios);
        const theo = theoByLabel();
        expect(theo.Unrepresentable).toBe(missingValueText());
        expect(container.textContent).not.toContain('n/a');
        expect(container.textContent).not.toContain('NaN');
        expect(theo['One to two']).toMatch(/^\d+\.\d%$/);
        expect(theo['One to one']).toMatch(/^\d+\.\d%$/);
    });

    it('sorts a missing theoretical pass probability after every value in both directions', () => {
        render(scenarios);
        const header = [
            ...container.querySelectorAll(':scope thead th button'),
        ].find((node) => node.textContent.trim() === 'Theo');
        if (!(header instanceof HTMLButtonElement)) {
            throw new TypeError('no sortable Theo header');
        }
        act(() => {
            header.click();
        });
        expect(bodyRows().map(rowLabel)).toEqual([
            'One to two',
            'One to one',
            'Unrepresentable',
        ]);
        act(() => {
            header.click();
        });
        expect(bodyRows().map(rowLabel)).toEqual([
            'One to one',
            'One to two',
            'Unrepresentable',
        ]);
    });

    it('explains why the theoretical pass probability is not applicable behind a focusable button', () => {
        render(scenarios);
        expect(theoReasonOf('Unrepresentable')).toMatch(/one decimal/);
        expect(theoReasonOf('One to two')).toBeNull();
    });

    it('names the reason from the economics library for each missing value', () => {
        render([
            ...scenarios,
            {
                ...baseScenario,
                id: 'tiny-risk',
                label: 'Tiny risk',
                riskPerTrade: UNSOLVABLE_RISK_PER_TRADE,
                rrRatio: 1,
            },
        ]);
        const theo = columnIndex('Theo');
        const cellOf = (label: string) =>
            bodyRows().find((row) => rowLabel(row) === label)?.cells[theo];
        expect(cellOf('Tiny risk')?.textContent.trim()).toBe(
            missingValueText(),
        );
        expect(theoReasonOf('Unrepresentable')).toContain(
            ECONOMICS_REASON_TEXT[EconomicsReason.UnsupportedRatio],
        );
        expect(theoReasonOf('Tiny risk')).toContain(
            ECONOMICS_REASON_TEXT[EconomicsReason.WalkGridTooLarge],
        );
        expect(theoReasonOf('One to one')).toBeNull();
        expect(container.textContent).not.toContain('NaN');
    });

    it.each([0, -50])(
        'names invalid input for a risk per trade of %d from a shared URL instead of a confident pass',
        (riskPerTrade) => {
            render([
                {
                    ...baseScenario,
                    id: 'bad-risk',
                    label: 'Bad risk',
                    riskPerTrade,
                },
            ]);
            expect(theoByLabel()['Bad risk']).toBe(missingValueText());
            expect(theoReasonOf('Bad risk')).toContain(
                ECONOMICS_REASON_TEXT[EconomicsReason.InvalidInput],
            );
        },
    );

    it('describes Theo as the exact pass probability of a random walk with a fixed drawdown floor and the library disclosure', () => {
        render([baseScenario]);
        const about = document.querySelector(
            'button[aria-label="About Scenarios"]',
        );
        if (!(about instanceof HTMLButtonElement)) {
            throw new TypeError('no strategy lab help button');
        }
        act(() => {
            about.click();
        });
        const help = document.body.textContent;
        expect(help).toContain('exact pass probability');
        expect(help).toContain('random walk');
        expect(help).toContain('fixed drawdown floor');
        expect(help).toContain(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.RandomWalkApproximation
            ],
        );
        expect(help).toContain('trailing or end-of-day drawdown');
        expect(help).toContain('day-stop rule');
        expect(help).not.toContain('banded');
        expect(help).not.toContain('tooltip');
        expect(help).not.toContain('closed-form');
        expect(help).not.toMatch(/gambler/i);
    });

    it('caches the lab result type, with the reason, under the StrategyLab computation', () => {
        expectTypeOf<
            ComputationResultMap[ComputationId.StrategyLab]
        >().toEqualTypeOf<Map<string, LabResult>>();
        expectTypeOf<LabResult['theoreticalPassProb']>().toEqualTypeOf<
            Fraction0to1 | undefined
        >();
        expectTypeOf<LabResult['theoreticalPassReason']>().toEqualTypeOf<
            EconomicsReason | undefined
        >();
    });

    it('shows the not-applicable marker after an RR of 1.333 is saved in the edit dialog', async () => {
        render([baseScenario]);
        expect(theoByLabel()['One to two']).toMatch(/^\d+\.\d%$/);
        chooseRowAction('One to two', 'Edit');
        const rr = dialogField('Reward to risk');
        typeInto(rr, String(UNREPRESENTABLE_RR));
        expect(rr.value).toBe(String(UNREPRESENTABLE_RR));
        await submitDialog('Save', () => vi.advanceTimersByTimeAsync(0));
        flush();
        expect(
            bodyRows()[0]?.cells[columnIndex('RR')]?.textContent.trim(),
        ).toBe(String(UNREPRESENTABLE_RR));
        expect(theoByLabel()['One to two']).toBe(missingValueText());
        expect(container.textContent).not.toContain('NaN');
    });
});

describe('StrategyLabPanel lifetime cap pooling gap (PT-12h, F-110 REV-5)', () => {
    const mffPro = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (mffPro === undefined) throw new Error('MFF Pro plan not found');

    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
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

    it('discloses the per-user cap is pooled across accounts on a multi-account MFF Pro scenario', () => {
        act(() => {
            root.render(
                <LabHarness
                    initial={[{ ...baseScenario, accounts: 2 }]}
                    plan={mffPro}
                />,
            );
        });
        flush();
        expect(container.textContent).toContain(
            "$50K · Pro's $100,000 lifetime cap is per user",
        );
    });

    it('says nothing on a single-account MFF Pro scenario', () => {
        act(() => {
            root.render(
                <LabHarness
                    initial={[{ ...baseScenario, accounts: 1 }]}
                    plan={mffPro}
                />,
            );
        });
        flush();
        expect(container.textContent).not.toContain('lifetime cap is per user');
    });
});

describe('StrategyLabPanel scenario charts', () => {
    let container: HTMLDivElement;
    let root: Root;

    function chartGrid(): Element | null {
        return container.querySelector(
            ':scope > .app-prop-calculator__strategy-lab-charts',
        );
    }

    function chartPanels(): Element[] {
        return [
            ...(chartGrid()?.querySelectorAll(':scope > .app-tool__panel') ??
                []),
        ];
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<LabHarness initial={scenarios} />);
        });
        flush();
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

    it('lays the charts out after the lab panel, one column below lg and two from lg', () => {
        const grid = chartGrid();
        expect(
            grid?.previousElementSibling?.classList.contains(
                'app-prop-calculator__strategy-lab',
            ),
        ).toBe(true);
        const classes = grid?.className.split(' ') ?? [];
        expect(classes).toEqual(
            expect.arrayContaining(['grid', 'lg:grid-cols-2']),
        );
        expect(
            classes.filter((name) => /^(?:sm|md):grid-cols-/.test(name)),
        ).toEqual([]);
    });

    it('gives each scenario its own chart panel, titled by the scenario, in scenario order', () => {
        expect(
            chartPanels().map(
                (panel) => panel.querySelector('h3')?.textContent,
            ),
        ).toEqual(scenarios.map((scenario) => scenario.label));
    });

    it('shows the expected max loss streak and the actual trades per day of each scenario as figures', () => {
        expect(
            chartPanels().filter(
                (panel) => panel.getAttribute('aria-busy') !== null,
            ),
        ).toEqual([]);
        for (const panel of chartPanels()) {
            expect(
                [...panel.querySelectorAll(':scope .app-stat-strip dt')].map(
                    (term) => term.textContent,
                ),
            ).toEqual(['Expected max loss streak', 'Actual trades per day']);
        }
    });
});

describe('StrategyLabPanel scenario waiting for its run', () => {
    let container: HTMLDivElement;
    let root: Root;

    const added: LabScenario = {
        ...baseScenario,
        id: 'added',
        label: 'Added',
        rrRatio: 3,
    };

    const refusedScenario: LabScenario = {
        ...baseScenario,
        id: 'refused',
        instrument: InstrumentSymbol.NQ,
        label: 'Refused NQ',
        riskPerTrade: 150,
        stopPoints: 10,
    };

    function render(list: LabScenario[]) {
        act(() => {
            root.render(
                <StrategyLabPanel
                    activationDiscountPercent={0}
                    commissionPerRoundTrip={0}
                    evalDiscountPercent={0}
                    fundedHorizonDays={5}
                    labLink={{ status: LabLinkStatus.Absent }}
                    linkActivationDiscount={false}
                    maxEvalDays={10}
                    minRetainedCushion={undefined}
                    monthlySubscriptionDiscountPercent={0}
                    onAdd={vi.fn()}
                    onRemove={vi.fn()}
                    onReset={vi.fn()}
                    onUpdate={vi.fn()}
                    payoutRequestSize={undefined}
                    plan={defaultCalculatorState().plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={list}
                    seed={1}
                />,
            );
        });
    }

    function passCell(label: string): HTMLTableCellElement | undefined {
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (node) => node.textContent.trim(),
        );
        return [
            ...container.querySelectorAll<HTMLTableRowElement>(
                ':scope tbody tr',
            ),
        ].find((row) => rowLabel(row) === label)?.cells[
            headers.indexOf('MC eval pass')
        ];
    }

    function chartPanel(label: string): Element | undefined {
        return [
            ...container.querySelectorAll(
                ':scope > .app-prop-calculator__strategy-lab-charts > .app-tool__panel',
            ),
        ].find((panel) => panel.querySelector('h3')?.textContent === label);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
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

    it('shows a just-added scenario as loading, not as not simulated, before its debounced run starts', () => {
        render([baseScenario]);
        flush();
        render([baseScenario, added]);
        expect(
            passCell('Added')?.querySelector('[data-slot="skeleton"]'),
        ).not.toBeNull();
        expect(
            passCell('Added')?.querySelector(MISSING_REASON_BUTTON_SELECTOR),
        ).toBeNull();
        expect(
            chartPanel('Added')?.querySelector('[data-slot="empty"]'),
        ).toBeNull();
        expect(
            chartPanel('Added')?.querySelector('[data-slot="skeleton"]'),
        ).not.toBeNull();
        flush();
        expect(passCell('Added')?.textContent.trim()).toMatch(/^\d+\.\d%$/);
    });

    it('keeps a refused scenario not simulated, with its reason, before and after the run', () => {
        render([baseScenario]);
        flush();
        render([baseScenario, refusedScenario]);
        expect(
            passCell('Refused NQ')?.querySelector(
                MISSING_REASON_BUTTON_SELECTOR,
            ),
        ).not.toBeNull();
        expect(
            chartPanel('Refused NQ')?.querySelector('[data-slot="empty"]'),
        ).not.toBeNull();
        flush();
        expect(passCell('Refused NQ')?.textContent.trim()).toBe(
            missingValueText(),
        );
        expect(
            passCell('Refused NQ')?.querySelector('[data-slot="skeleton"]'),
        ).toBeNull();
        expect(
            chartPanel('Refused NQ')?.querySelector('[data-slot="empty"]'),
        ).not.toBeNull();
    });

    it('names the reset action by its visible text, with no native title tooltip', () => {
        render([baseScenario]);
        const reset = [...container.querySelectorAll('button')].find(
            (button) => button.textContent.trim() === 'Reset',
        );
        expect(reset).toBeDefined();
        expect(reset?.hasAttribute('title')).toBe(false);
    });
});

function hazardText(): string {
    const about = document.body.querySelector<HTMLButtonElement>(
        ':scope button[aria-label="About Live-transfer hazard"]',
    );
    if (about !== null) {
        act(() => {
            about.click();
        });
    }
    return document.body.textContent;
}

describe('StrategyLabPanel live-transfer hazard (PT-73, F-V26)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const payingScenario: LabScenario = {
        ...baseScenario,
        accounts: 3,
        id: 'paying',
        label: 'Paying',
        winrate: 0.55,
    };

    function render(
        liveTransferHazard: number | undefined,
        scenario: LabScenario = payingScenario,
    ) {
        act(() => {
            root.render(
                <LabHarness
                    fundedHorizonDays={60}
                    initial={[scenario]}
                    liveTransferHazard={liveTransferHazard}
                    plan={rapidEodPlan()}
                />,
            );
        });
        flush();
    }

    function headers(): string[] {
        return [...container.querySelectorAll(':scope thead th')].map((node) =>
            node.textContent.trim(),
        );
    }

    function cell(header: string): string {
        const index = headers().indexOf(header);
        if (index === -1) throw new Error(`no ${header} column`);
        const row =
            container.querySelector<HTMLTableRowElement>(':scope tbody tr');
        return row?.cells[index]?.textContent.trim() ?? '';
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
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

    it('adds no column and no note while no hazard is set', () => {
        render(undefined);
        expect(headers()).not.toContain('E[$/mo] no transfer');
        expect(headers()).not.toContain('Sent live');
        expect(container.textContent).not.toContain('Live-transfer hazard');
    });

    it('shows the monthly net at hazard 0 beside the user hazard, and the share sent live', () => {
        render(undefined);
        const unpriced = cell('E[$/mo]');
        render(1);
        expect(headers()).toContain('E[$/mo] no transfer');
        expect(headers()).toContain('Sent live');
        expect(cell('E[$/mo] no transfer')).toBe(unpriced);
        expect(cell('E[$/mo]')).not.toBe(unpriced);
        expect(cell('Sent live')).toMatch(/^\d+\.\d%$/);
        expect(cell('Sent live')).not.toBe('0.0%');
    });

    it('labels the hazard as your assumption, not a firm rule', () => {
        render(0.5);
        expect(hazardText()).toContain(
            'Live-transfer hazard of 50.0% per paid payout (your assumption, not a firm rule)',
        );
        expect(hazardText()).not.toContain('\u{2014}');
    });

    it('words a hazard below one tenth of a percent with the digits it was entered with', () => {
        render(0.0004);
        expect(hazardText()).toContain(
            'Live-transfer hazard of 0.04% per paid payout',
        );
        expect(hazardText()).not.toContain('of 0.0% per paid payout');
    });

    it('words the continuation with the one lib text the advice note uses', () => {
        render(0.5, {
            ...payingScenario,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });
        expect(hazardText()).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.Modeled
            ],
        );
    });

    it('words the unmodeled continuation with the one lib text the advice note uses', () => {
        render(0.5);
        expect(hazardText()).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        );
    });

    it('says the payout that concludes an account is also a transfer chance', () => {
        render(0.5);
        expect(hazardText()).toContain(LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT);
    });

    it('says the rest of the account is valued at $0 where no live plan is modeled for the scenario', () => {
        render(0.5);
        expect(hazardText()).toContain('valued at $0');
        expect(hazardText()).not.toContain('recurring withdrawals');
    });

    it('says the live plan continues the account and adds only its recurring withdrawals where it is modeled', () => {
        render(0.5, {
            ...payingScenario,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });
        const text = hazardText();
        expect(text).toContain('recurring withdrawals');
        expect(text).toContain('not counted');
        expect(text).not.toContain('valued at $0');
    });

    it('says the live continuation ignores the funded day stop and rung sizing, and carries the live plan note, where it is modeled', () => {
        render(0.5, {
            ...payingScenario,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });
        const text = hazardText();
        expect(text).toContain(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT);
        expect(text).toContain(
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed
            ],
        );
    });

    it('adds no continuation disclosure where the rest of the account is valued at $0', () => {
        render(0.5);
        const text = hazardText();
        expect(text).not.toContain(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT);
        expect(text).not.toContain(
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed
            ],
        );
    });

    it('says a transferred account keeps its slot to the end of the funded horizon', () => {
        render(0.5);
        expect(hazardText()).toContain(
            'keeps its slot to the end of the funded horizon',
        );
    });
});
