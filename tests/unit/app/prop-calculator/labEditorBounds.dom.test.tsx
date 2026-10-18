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
import { CORRELATION_LABEL } from '~/app/(app)/prop-calculator/_components/LabScenarioDialog';
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

import {
    cancelDialog,
    dialogControl,
    dialogField,
    isDialogOpen,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import { chooseRowAction } from '../../components/rowActionsMenu';
import { pickOption } from './accounts/pickOption';
import { fieldValidation } from './labelledControl';
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

enum EditorField {
    Accounts = 'Accounts',
    Groups = 'Groups',
    Mode = 'Mode',
    RewardToRisk = 'Reward to risk',
    RiskPerTrade = 'Risk per trade ($)',
    StopPoints = 'Stop (points)',
    TradesPerDay = 'Trades per day',
    WinRate = 'Win rate (%)',
}

const EDITOR_ATTEMPTS: readonly (readonly [EditorField, readonly string[]])[] =
    [
        [
            EditorField.RiskPerTrade,
            ['0.5', '1', '250', '1000000', '1000001', '5000000'],
        ],
        [EditorField.WinRate, ['4', '5', '50', '95', '96']],
        [EditorField.RewardToRisk, ['0.4', '0.5', '10', '11']],
        [EditorField.TradesPerDay, ['0', '1', '50', '51']],
        [EditorField.StopPoints, ['0.1', '0.2', '0.25', '8', '10000', '20000']],
        [EditorField.Accounts, ['0', '1', '20', '21', '1000']],
    ];

const REJECTED_ATTEMPTS: readonly {
    readonly field: EditorField;
    readonly text: string;
}[] = [
    { field: EditorField.RiskPerTrade, text: String(RISK_BOUNDS.max + 1) },
    { field: EditorField.WinRate, text: String(WINRATE_MAX_PERCENT + 1) },
    {
        field: EditorField.RewardToRisk,
        text: String(CALCULATOR_SCALAR_BOUNDS.rr.min / 2),
    },
    {
        field: EditorField.TradesPerDay,
        text: String(CALCULATOR_SCALAR_BOUNDS.tpd.min - 1),
    },
    { field: EditorField.StopPoints, text: String(STOP_POINTS_BOUNDS.max * 2) },
    { field: EditorField.Accounts, text: String(ACCOUNTS_BOUNDS.max + 1) },
    ...[
        EditorField.RiskPerTrade,
        EditorField.WinRate,
        EditorField.RewardToRisk,
        EditorField.TradesPerDay,
        EditorField.StopPoints,
        EditorField.Accounts,
    ].map((field) => ({ field, text: '' })),
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

function input(field: EditorField): HTMLInputElement {
    if (!isDialogOpen()) chooseRowAction(scenario.label, 'Edit');
    return dialogField(field);
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

async function save(field: EditorField, text: string) {
    typeInto(input(field), text);
    await submitDialog('Save', () => vi.advanceTimersByTimeAsync(0));
    if (isDialogOpen()) cancelDialog();
    flush();
}

describe('StrategyLabPanel editors read CALCULATOR_SCALAR_BOUNDS (PT-53e)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let onUpdate: Mock<LabUpdate>;

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
        expect(Number(input(EditorField.WinRate).min)).toBe(
            WINRATE_MIN_PERCENT,
        );
        expect(Number(input(EditorField.WinRate).max)).toBe(
            WINRATE_MAX_PERCENT,
        );
        expect(Number(input(EditorField.RewardToRisk).min)).toBe(
            CALCULATOR_SCALAR_BOUNDS.rr.min,
        );
        expect(Number(input(EditorField.RewardToRisk).max)).toBe(
            CALCULATOR_SCALAR_BOUNDS.rr.max,
        );
        expect(Number(input(EditorField.TradesPerDay).min)).toBe(
            CALCULATOR_SCALAR_BOUNDS.tpd.min,
        );
        expect(Number(input(EditorField.TradesPerDay).max)).toBe(
            CALCULATOR_SCALAR_BOUNDS.tpd.max,
        );
        expect(Number(input(EditorField.StopPoints).min)).toBe(
            STOP_POINTS_BOUNDS.min,
        );
        expect(Number(input(EditorField.StopPoints).max)).toBe(
            STOP_POINTS_BOUNDS.max,
        );
        expect(Number(input(EditorField.Accounts).min)).toBe(
            ACCOUNTS_BOUNDS.min,
        );
        expect(Number(input(EditorField.Accounts).max)).toBe(
            ACCOUNTS_BOUNDS.max,
        );
        expect(Number(input(EditorField.RiskPerTrade).min)).toBe(
            RISK_BOUNDS.min,
        );
        expect(Number(input(EditorField.RiskPerTrade).max)).toBe(
            RISK_BOUNDS.max,
        );
    });

    it('accepts the stop points bounds and rejects values past them (PT-53f)', async () => {
        await save(EditorField.StopPoints, String(STOP_POINTS_BOUNDS.max));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({ stopPoints: STOP_POINTS_BOUNDS.max }),
        );
        await save(EditorField.StopPoints, String(STOP_POINTS_BOUNDS.min));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({ stopPoints: STOP_POINTS_BOUNDS.min }),
        );
        onUpdate.mockClear();
        await save(EditorField.StopPoints, '0.1');
        await save(EditorField.StopPoints, '20000');
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the account bounds and rejects values past them (PT-53f)', async () => {
        await save(EditorField.Accounts, String(ACCOUNTS_BOUNDS.max));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                accounts: ACCOUNTS_BOUNDS.max,
                groups: scenario.groups,
            }),
        );
        onUpdate.mockClear();
        await save(EditorField.Accounts, String(ACCOUNTS_BOUNDS.max + 1));
        await save(EditorField.Accounts, String(ACCOUNTS_BOUNDS.min - 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the risk per trade bounds and rejects values past them (PT-53f)', async () => {
        await save(EditorField.RiskPerTrade, String(RISK_BOUNDS.max));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({ riskPerTrade: RISK_BOUNDS.max }),
        );
        await save(EditorField.RiskPerTrade, String(RISK_BOUNDS.min));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({ riskPerTrade: RISK_BOUNDS.min }),
        );
        onUpdate.mockClear();
        await save(EditorField.RiskPerTrade, String(RISK_BOUNDS.min / 2));
        await save(EditorField.RiskPerTrade, String(RISK_BOUNDS.max + 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('only produces scenarios that survive a link round trip (PT-53f)', async () => {
        const patches: Partial<LabScenario>[] = [];
        for (const [field, attempts] of EDITOR_ATTEMPTS) {
            for (const text of attempts) await save(field, text);
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

    it('accepts the largest trades per day a shared link may carry and nothing above it', async () => {
        await save(
            EditorField.TradesPerDay,
            String(CALCULATOR_SCALAR_BOUNDS.tpd.max),
        );
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                tradesPerDay: CALCULATOR_SCALAR_BOUNDS.tpd.max,
            }),
        );
        onUpdate.mockClear();
        await save(
            EditorField.TradesPerDay,
            String(CALCULATOR_SCALAR_BOUNDS.tpd.max + 1),
        );
        await save(
            EditorField.TradesPerDay,
            String(CALCULATOR_SCALAR_BOUNDS.tpd.min - 1),
        );
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the win rate bounds and rejects values past them', async () => {
        await save(EditorField.WinRate, String(WINRATE_MAX_PERCENT));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                winrate: CALCULATOR_SCALAR_BOUNDS.wr.max,
            }),
        );
        await save(EditorField.WinRate, String(WINRATE_MIN_PERCENT));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                winrate: CALCULATOR_SCALAR_BOUNDS.wr.min,
            }),
        );
        onUpdate.mockClear();
        await save(EditorField.WinRate, String(WINRATE_MAX_PERCENT + 1));
        await save(EditorField.WinRate, String(WINRATE_MIN_PERCENT - 1));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('accepts the reward:risk bounds and rejects values past them', async () => {
        await save(
            EditorField.RewardToRisk,
            String(CALCULATOR_SCALAR_BOUNDS.rr.max),
        );
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                rrRatio: CALCULATOR_SCALAR_BOUNDS.rr.max,
            }),
        );
        await save(
            EditorField.RewardToRisk,
            String(CALCULATOR_SCALAR_BOUNDS.rr.min),
        );
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                rrRatio: CALCULATOR_SCALAR_BOUNDS.rr.min,
            }),
        );
        onUpdate.mockClear();
        await save(
            EditorField.RewardToRisk,
            String(CALCULATOR_SCALAR_BOUNDS.rr.max + 1),
        );
        await save(
            EditorField.RewardToRisk,
            String(CALCULATOR_SCALAR_BOUNDS.rr.min / 2),
        );
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it.each(REJECTED_ATTEMPTS)(
        'reports $field of "$text" on its own field and keeps the dialog open',
        async ({ field, text }) => {
            typeInto(input(field), text);
            await submitDialog('Save', () => vi.advanceTimersByTimeAsync(0));
            expect(isDialogOpen()).toBe(true);
            expect(fieldValidation(dialogField(field))).toEqual({
                hasError: true,
                isInvalid: true,
            });
            expect(onUpdate).not.toHaveBeenCalled();
        },
    );

    it('reports fewer than one group or more groups than accounts on the groups field', async () => {
        typeInto(input(EditorField.Accounts), '2');
        await pickOption(
            dialogControl(EditorField.Mode),
            CORRELATION_LABEL[CorrelationMode.Grouped],
        );
        for (const text of ['0', '3']) {
            typeInto(dialogField(EditorField.Groups), text);
            await submitDialog('Save', () => vi.advanceTimersByTimeAsync(0));
            expect(fieldValidation(dialogField(EditorField.Groups))).toEqual({
                hasError: true,
                isInvalid: true,
            });
        }
        expect(onUpdate).not.toHaveBeenCalled();
        typeInto(dialogField(EditorField.Groups), '2');
        await submitDialog('Save', () => vi.advanceTimersByTimeAsync(0));
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                accounts: 2,
                correlation: CorrelationMode.Grouped,
                groups: 2,
            }),
        );
    });

    it('keeps the stop empty and required when an instrument is picked for a scenario without one', async () => {
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
                    scenarios={[
                        { ...scenario, instrument: null, stopPoints: null },
                    ]}
                    seed={1}
                />,
            );
        });
        flush();
        expect(input(EditorField.StopPoints).disabled).toBe(true);
        await pickOption(dialogControl('Instrument'), InstrumentSymbol.MNQ);
        expect(input(EditorField.StopPoints).disabled).toBe(false);
        expect(input(EditorField.StopPoints).value).toBe('');
        await submitDialog('Save', () => vi.advanceTimersByTimeAsync(0));
        expect(onUpdate).not.toHaveBeenCalled();
        await save(EditorField.StopPoints, '8');
        expect(onUpdate).toHaveBeenLastCalledWith(
            scenario.id,
            expect.objectContaining({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 8,
            }),
        );
    });
});
