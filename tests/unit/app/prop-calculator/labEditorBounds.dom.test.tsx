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

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import StrategyLabPanel from '~/app/(app)/prop-calculator/_components/StrategyLabPanel';
import {
    LabLinkStatus,
    type LabScenario,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeLabLink,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    CorrelationMode,
    DayStopRuleKind,
    InstrumentSymbol,
} from '~/lib/prop-calculator';
import {
    CALCULATOR_SCALAR_BOUNDS,
    LAB_SCENARIO_BOUNDS,
    MAX_LAB_SCENARIOS,
} from '~/lib/schemas/url';

import { InlineToolsWorker } from './labWorkerFixtures';

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const scenario: LabScenario = {
    accounts: 1,
    correlation: CorrelationMode.Copy,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 1,
    id: 'bounds',
    instrument: InstrumentSymbol.MNQ,
    label: 'Bounds',
    riskPerTrade: 250,
    rrRatio: 2,
    stopPoints: 8,
    tradesPerDay: 1,
    winrate: 0.4,
};

type LabUpdate = (id: string, patch: Partial<LabScenario>) => void;

const PERCENT = 100;
const WINRATE_MIN_PERCENT = Math.round(
    CALCULATOR_SCALAR_BOUNDS.wr.min * PERCENT,
);
const WINRATE_MAX_PERCENT = Math.round(
    CALCULATOR_SCALAR_BOUNDS.wr.max * PERCENT,
);
const STOP_POINTS_BOUNDS = CALCULATOR_SCALAR_BOUNDS.sp;
const ACCOUNTS_BOUNDS = LAB_SCENARIO_BOUNDS.accounts;
const RISK_BOUNDS = LAB_SCENARIO_BOUNDS.riskPerTrade;

const EDITOR_ATTEMPTS: readonly (readonly [string, readonly string[]])[] = [
    ['Risk $', ['0.5', '1', '250', '1000000', '1000001', '5000000']],
    ['WR %', ['4', '5', '50', '95', '96']],
    ['RR', ['0.4', '0.5', '10', '11']],
    ['Tr/day', ['0', '1', '50', '51']],
    ['Stop pts', ['0.1', '0.2', '0.25', '8', '10000', '20000']],
    ['Accts', ['0', '1', '20', '21', '1000']],
];

function addButton(container: HTMLElement): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find((node) =>
        node.textContent.includes('Add scenario'),
    );
}

function flush() {
    for (let round = 0; round < 4; round++) {
        act(() => {
            vi.runOnlyPendingTimers();
        });
    }
}

function renderNothing(): null {
    return null;
}

function roundTrip(patched: LabScenario) {
    return decodeLabLink(
        encodeState({
            ...defaultCalculatorState(),
            labScenarios: [patched],
        }),
        [],
    );
}

describe('StrategyLabPanel editors read CALCULATOR_SCALAR_BOUNDS (PT-53e)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let onUpdate: Mock<LabUpdate>;

    function input(header: string): HTMLInputElement {
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (node) => node.textContent.trim(),
        );
        const index = headers.indexOf(header);
        const node = container
            .querySelector<HTMLTableRowElement>(':scope tbody tr')
            ?.cells[index]?.querySelector('input');
        if (!(node instanceof HTMLInputElement))
            throw new TypeError(`no ${header} input`);
        return node;
    }

    function typeInto(header: string, text: string) {
        const node = input(header);
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', text, node);
            node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        flush();
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
        onUpdate = vi.fn<LabUpdate>();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
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
                    onUpdate={onUpdate}
                    payoutRequestSize={undefined}
                    plan={defaultCalculatorState().plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={[scenario]}
                    seed={1}
                />,
            );
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

    it('sets each editor min and max from the shared bounds', () => {
        expect(Number(input('WR %').min)).toBe(WINRATE_MIN_PERCENT);
        expect(Number(input('WR %').max)).toBe(WINRATE_MAX_PERCENT);
        expect(Number(input('RR').min)).toBe(CALCULATOR_SCALAR_BOUNDS.rr.min);
        expect(Number(input('RR').max)).toBe(CALCULATOR_SCALAR_BOUNDS.rr.max);
        expect(Number(input('Tr/day').min)).toBe(
            CALCULATOR_SCALAR_BOUNDS.tpd.min,
        );
        expect(Number(input('Tr/day').max)).toBe(
            CALCULATOR_SCALAR_BOUNDS.tpd.max,
        );
        expect(Number(input('Stop pts').min)).toBe(STOP_POINTS_BOUNDS.min);
        expect(Number(input('Stop pts').max)).toBe(STOP_POINTS_BOUNDS.max);
        expect(Number(input('Accts').min)).toBe(ACCOUNTS_BOUNDS.min);
        expect(Number(input('Accts').max)).toBe(ACCOUNTS_BOUNDS.max);
        expect(Number(input('Risk $').min)).toBe(RISK_BOUNDS.min);
        expect(Number(input('Risk $').max)).toBe(RISK_BOUNDS.max);
    });

    it('accepts the stop points bounds and rejects values past them (PT-53f)', () => {
        typeInto('Stop pts', String(STOP_POINTS_BOUNDS.max));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            stopPoints: STOP_POINTS_BOUNDS.max,
        });
        typeInto('Stop pts', String(STOP_POINTS_BOUNDS.min));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            stopPoints: STOP_POINTS_BOUNDS.min,
        });
        onUpdate.mockClear();
        typeInto('Stop pts', '0.1');
        typeInto('Stop pts', '20000');
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the account bounds and rejects values past them (PT-53f)', () => {
        typeInto('Accts', String(ACCOUNTS_BOUNDS.max));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            accounts: ACCOUNTS_BOUNDS.max,
            groups: scenario.groups,
        });
        onUpdate.mockClear();
        typeInto('Accts', String(ACCOUNTS_BOUNDS.max + 1));
        typeInto('Accts', String(ACCOUNTS_BOUNDS.min - 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the risk per trade bounds and rejects values past them (PT-53f)', () => {
        typeInto('Risk $', String(RISK_BOUNDS.max));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            riskPerTrade: RISK_BOUNDS.max,
        });
        typeInto('Risk $', String(RISK_BOUNDS.min));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            riskPerTrade: RISK_BOUNDS.min,
        });
        onUpdate.mockClear();
        typeInto('Risk $', String(RISK_BOUNDS.min / 2));
        typeInto('Risk $', String(RISK_BOUNDS.max + 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('only produces scenarios that survive a link round trip (PT-53f)', () => {
        const patches: Partial<LabScenario>[] = [];
        for (const [header, attempts] of EDITOR_ATTEMPTS) {
            for (const text of attempts) typeInto(header, text);
        }
        for (const [, patch] of onUpdate.mock.calls) patches.push(patch);
        expect(patches.length).toBeGreaterThan(0);
        for (const patch of patches) {
            const patched = { ...scenario, ...patch };
            expect({ patch, status: roundTrip(patched).status }).toEqual({
                patch,
                status: LabLinkStatus.Accepted,
            });
            expect(roundTrip(patched).scenarios).toEqual([patched]);
        }
    });

    it('offers no Add scenario once the lab holds the most scenarios a link may carry (PT-53f)', () => {
        expect(addButton(container)?.disabled).toBe(false);
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
                    onUpdate={onUpdate}
                    payoutRequestSize={undefined}
                    plan={defaultCalculatorState().plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={Array.from(
                        { length: MAX_LAB_SCENARIOS },
                        (_, index) => ({ ...scenario, id: String(index) }),
                    )}
                    seed={1}
                />,
            );
        });
        expect(addButton(container)?.disabled).toBe(true);
    });

    it('accepts the largest trades per day a shared link may carry and nothing above it', () => {
        typeInto('Tr/day', String(CALCULATOR_SCALAR_BOUNDS.tpd.max));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            tradesPerDay: CALCULATOR_SCALAR_BOUNDS.tpd.max,
        });
        onUpdate.mockClear();
        typeInto('Tr/day', String(CALCULATOR_SCALAR_BOUNDS.tpd.max + 1));
        typeInto('Tr/day', String(CALCULATOR_SCALAR_BOUNDS.tpd.min - 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the win rate bounds and rejects values past them', () => {
        typeInto('WR %', String(WINRATE_MAX_PERCENT));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            winrate: CALCULATOR_SCALAR_BOUNDS.wr.max,
        });
        typeInto('WR %', String(WINRATE_MIN_PERCENT));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            winrate: CALCULATOR_SCALAR_BOUNDS.wr.min,
        });
        onUpdate.mockClear();
        typeInto('WR %', String(WINRATE_MAX_PERCENT + 1));
        typeInto('WR %', String(WINRATE_MIN_PERCENT - 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the reward:risk bounds and rejects values past them', () => {
        typeInto('RR', String(CALCULATOR_SCALAR_BOUNDS.rr.max));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            rrRatio: CALCULATOR_SCALAR_BOUNDS.rr.max,
        });
        typeInto('RR', String(CALCULATOR_SCALAR_BOUNDS.rr.min));
        expect(onUpdate).toHaveBeenLastCalledWith(scenario.id, {
            rrRatio: CALCULATOR_SCALAR_BOUNDS.rr.min,
        });
        onUpdate.mockClear();
        typeInto('RR', String(CALCULATOR_SCALAR_BOUNDS.rr.max + 1));
        typeInto('RR', String(CALCULATOR_SCALAR_BOUNDS.rr.min / 2));
        expect(onUpdate).not.toHaveBeenCalled();
    });
});
