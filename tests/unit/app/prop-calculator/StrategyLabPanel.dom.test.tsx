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
import { NOT_APPLICABLE } from '~/lib/format';
import {
    CorrelationMode,
    DayStopRuleKind,
    FirmId,
    type Fraction0to1,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator';
import { LiveApplicabilityNote } from '~/lib/prop-calculator/advisor';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    ECONOMICS_REASON_TEXT,
    EconomicsDisclosure,
    EconomicsReason,
} from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LIVE_TRANSFER_NOTE_TEXT,
    LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
    LiveTransferContinuationKind,
} from '~/lib/prop-calculator/simulator';

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
    return row.querySelector('input')?.value ?? '';
}

function typeInto(input: HTMLInputElement, text: string) {
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', text, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    flush();
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

    function theoReasonOf(label: string): null | string {
        const trigger = bodyRows()
            .find((row) => rowLabel(row) === label)
            ?.cells[columnIndex('Theo')]?.querySelector(
                'button[aria-label="About Theo not applicable"]',
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

    it('shows the not-applicable marker, never NaN%, for a reward:risk the walk cannot represent', () => {
        render(scenarios);
        const theo = theoByLabel();
        expect(theo.Unrepresentable).toBe(NOT_APPLICABLE);
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
        expect(cellOf('Tiny risk')?.textContent.trim()).toBe(NOT_APPLICABLE);
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
            expect(theoByLabel()['Bad risk']).toBe(NOT_APPLICABLE);
            expect(theoReasonOf('Bad risk')).toContain(
                ECONOMICS_REASON_TEXT[EconomicsReason.InvalidInput],
            );
        },
    );

    it('describes Theo as the exact pass probability of a random walk with a fixed drawdown floor and the library disclosure', () => {
        render([baseScenario]);
        const about = document.querySelector(
            'button[aria-label="About Multi-account strategy lab"]',
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

    it('shows the not-applicable marker after a typed RR of 1.333', () => {
        render([baseScenario]);
        expect(theoByLabel()['One to two']).toMatch(/^\d+\.\d%$/);
        const rr =
            bodyRows()[0]?.cells[columnIndex('RR')]?.querySelector('input');
        if (!(rr instanceof HTMLInputElement))
            throw new TypeError('no RR input');
        typeInto(rr, String(UNREPRESENTABLE_RR));
        expect(rr.value).toBe(String(UNREPRESENTABLE_RR));
        expect(theoByLabel()['One to two']).toBe(NOT_APPLICABLE);
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
        expect(container.textContent).toContain(
            'Live-transfer hazard of 50.0% per paid payout (your assumption, not a firm rule)',
        );
        expect(container.textContent).not.toContain('\u{2014}');
    });

    it('words a hazard below one tenth of a percent with the digits it was entered with', () => {
        render(0.0004);
        expect(container.textContent).toContain(
            'Live-transfer hazard of 0.04% per paid payout',
        );
        expect(container.textContent).not.toContain('of 0.0% per paid payout');
    });

    it('words the continuation with the one lib text the advice note uses', () => {
        render(0.5, {
            ...payingScenario,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });
        expect(container.textContent).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.Modeled
            ],
        );
    });

    it('words the unmodeled continuation with the one lib text the advice note uses', () => {
        render(0.5);
        expect(container.textContent).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        );
    });

    it('says the payout that concludes an account is also a transfer chance', () => {
        render(0.5);
        expect(container.textContent).toContain(
            LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
        );
    });

    it('says the rest of the account is valued at $0 where no live plan is modeled for the scenario', () => {
        render(0.5);
        expect(container.textContent).toContain('valued at $0');
        expect(container.textContent).not.toContain('recurring withdrawals');
    });

    it('says the live plan continues the account and adds only its recurring withdrawals where it is modeled', () => {
        render(0.5, {
            ...payingScenario,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 10,
        });
        const text = container.textContent;
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
        const text = container.textContent;
        expect(text).toContain(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT);
        expect(text).toContain(
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed
            ],
        );
    });

    it('adds no continuation disclosure where the rest of the account is valued at $0', () => {
        render(0.5);
        const text = container.textContent;
        expect(text).not.toContain(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT);
        expect(text).not.toContain(
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed
            ],
        );
    });

    it('says a transferred account keeps its slot to the end of the funded horizon', () => {
        render(0.5);
        expect(container.textContent).toContain(
            'keeps its slot to the end of the funded horizon',
        );
    });
});
