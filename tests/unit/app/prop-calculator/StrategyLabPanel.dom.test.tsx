import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import StrategyLabPanel from '~/app/(app)/prop-calculator/_components/StrategyLabPanel';
import { type LabScenario } from '~/app/(app)/prop-calculator/_components/types';
import { NOT_APPLICABLE } from '~/lib/format';
import { CorrelationMode, DayStopRuleKind } from '~/lib/prop-calculator';

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const UNREPRESENTABLE_RR = 1.333;

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

function LabHarness({ initial }: { initial: LabScenario[] }) {
    const [current, setCurrent] = useState(initial);
    return (
        <StrategyLabPanel
            activationDiscountPercent={0}
            commissionPerRoundTrip={0}
            evalDiscountPercent={0}
            fundedHorizonDays={5}
            linkActivationDiscount={false}
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
            plan={defaultCalculatorState().plan}
            resetDiscountPercent={0}
            rungSizing={undefined}
            scenarios={current}
            seed={1}
        />
    );
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

    it('sorts a missing theoretical pass probability after every value', () => {
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
