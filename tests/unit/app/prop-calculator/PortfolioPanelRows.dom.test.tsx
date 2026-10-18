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
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/calculatorSimInputs';
import PortfolioPanel from '~/app/(app)/prop-calculator/_components/PortfolioPanel';
import { type PortfolioEntry } from '~/app/(app)/prop-calculator/_components/types';
import {
    ALL_FIRMS,
    InstrumentSymbol,
    type PlanOptIns,
} from '~/lib/prop-calculator';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

import {
    dialogControl,
    dialogField,
    isDialogOpen,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import {
    chooseRowAction,
    confirmRowAction,
    openRowActions,
    rowActionLabels,
} from '../../components/rowActionsMenu';
import { pickOption } from './accounts/pickOption';
import { expectDialogFieldGridsOneColumnBelowMd } from './dialogFieldGrids';
import { fieldValidation } from './labelledControl';

const NO_OPT_INS: PlanOptIns = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: false,
};

const state = { ...defaultCalculatorState(), trials: 100 };
const { firm, plan } = state;
const ROW_LABEL = `${firm.displayName} ${plan.label}`;
const ACCOUNTS_LABEL = `Accounts (${firm.displayName} caps at ${firm.maxFundedAccounts(plan)})`;
const STOP_LABEL = 'Stop distance (points)';
const STOP_POINTS_BOUNDS = CALCULATOR_SCALAR_BOUNDS.sp;

const entry: PortfolioEntry = {
    activationDiscountPercent: 0,
    count: 2,
    evalDiscountPercent: 0,
    firmId: firm.id,
    id: 'planner-row',
    instrument: null,
    linkActivationDiscount: false,
    monthlySubscriptionDiscountPercent: 0,
    planId: plan.id,
    resetDiscountPercent: 0,
    stopPoints: null,
};

function flush() {
    for (let round = 0; round < 4; round++) {
        act(() => {
            vi.runOnlyPendingTimers();
        });
    }
}

async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
}

describe('the planner rows end in a row menu with an edit dialog', () => {
    let container: HTMLDivElement;
    let root: Root;
    let onPortfolioChange: Mock<(entries: PortfolioEntry[]) => void>;

    function render(portfolio: PortfolioEntry[]) {
        act(() => {
            root.render(
                <PortfolioPanel
                    baseInputs={buildSimInputs(state)}
                    currentFirm={firm}
                    currentPlan={plan}
                    firms={ALL_FIRMS}
                    onPortfolioChange={onPortfolioChange}
                    planOptIns={NO_OPT_INS}
                    portfolio={portfolio}
                />,
            );
        });
        flush();
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        onPortfolioChange = vi.fn<(entries: PortfolioEntry[]) => void>();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        document.body.replaceChildren();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('keeps form controls out of the rows and names each row by its firm', () => {
        render([entry]);
        const body = container.querySelector('tbody');
        expect(
            body?.querySelectorAll('input, select, [role="combobox"]'),
        ).toHaveLength(0);
        expect(
            [...(body?.querySelectorAll('button') ?? [])].map((button) =>
                button.getAttribute('aria-label'),
            ),
        ).toEqual([`Actions for ${ROW_LABEL}`]);
        expect(body?.querySelector('th[scope="row"]')?.textContent).toBe(
            firm.displayName,
        );
        openRowActions(ROW_LABEL);
        expect(rowActionLabels()).toEqual(['Edit', 'Remove']);
    });

    it('keeps the field grids of its edit dialog one column below md', () => {
        render([entry]);
        chooseRowAction(ROW_LABEL, 'Edit');
        expectDialogFieldGridsOneColumnBelowMd();
    });

    it('removes a row only after the remove is confirmed', () => {
        render([entry]);
        chooseRowAction(ROW_LABEL, 'Remove');
        expect(onPortfolioChange).not.toHaveBeenCalled();
        confirmRowAction('Remove');
        expect(onPortfolioChange).toHaveBeenCalledExactlyOnceWith([]);
    });

    it('saves a new account count from the edit dialog and refuses one above the firm cap', async () => {
        render([entry]);
        chooseRowAction(ROW_LABEL, 'Edit');
        expect(dialogField(ACCOUNTS_LABEL).value).toBe(String(entry.count));
        typeInto(
            dialogField(ACCOUNTS_LABEL),
            String(firm.maxFundedAccounts(plan) + 1),
        );
        await submitDialog('Save', settle);
        expect(onPortfolioChange).not.toHaveBeenCalled();
        expect(isDialogOpen()).toBe(true);
        typeInto(dialogField(ACCOUNTS_LABEL), '3');
        await submitDialog('Save', settle);
        expect(onPortfolioChange).toHaveBeenCalledExactlyOnceWith([
            { ...entry, count: 3 },
        ]);
        expect(isDialogOpen()).toBe(false);
    });

    it('needs a stop before an instrument overrides the global sizing', async () => {
        render([entry]);
        chooseRowAction(ROW_LABEL, 'Edit');
        expect(dialogField(STOP_LABEL).disabled).toBe(true);
        await pickOption(dialogControl('Instrument'), InstrumentSymbol.MNQ);
        expect(dialogField(STOP_LABEL).disabled).toBe(false);
        await submitDialog('Save', settle);
        expect(onPortfolioChange).not.toHaveBeenCalled();
        typeInto(dialogField(STOP_LABEL), '8');
        await submitDialog('Save', settle);
        expect(onPortfolioChange).toHaveBeenCalledExactlyOnceWith([
            { ...entry, instrument: InstrumentSymbol.MNQ, stopPoints: 8 },
        ]);
    });

    it.each(['0', ''])(
        'reports an account count of "%s" on its own field and keeps the dialog open',
        async (text) => {
            render([entry]);
            chooseRowAction(ROW_LABEL, 'Edit');
            typeInto(dialogField(ACCOUNTS_LABEL), text);
            await submitDialog('Save', settle);
            expect(isDialogOpen()).toBe(true);
            expect(fieldValidation(dialogField(ACCOUNTS_LABEL))).toEqual({
                hasError: true,
                isInvalid: true,
            });
            expect(onPortfolioChange).not.toHaveBeenCalled();
        },
    );

    it.each([
        String(STOP_POINTS_BOUNDS.min / 2),
        String(STOP_POINTS_BOUNDS.max * 2),
        '',
    ])(
        'reports a stop of "%s" on its own field and keeps the dialog open',
        async (text) => {
            render([entry]);
            chooseRowAction(ROW_LABEL, 'Edit');
            await pickOption(dialogControl('Instrument'), InstrumentSymbol.MNQ);
            typeInto(dialogField(STOP_LABEL), text);
            await submitDialog('Save', settle);
            expect(isDialogOpen()).toBe(true);
            expect(fieldValidation(dialogField(STOP_LABEL))).toEqual({
                hasError: true,
                isInvalid: true,
            });
            expect(onPortfolioChange).not.toHaveBeenCalled();
        },
    );

    it('adds a firm through the same dialog, with nothing added until it is saved', async () => {
        render([entry]);
        const add = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === '+ Add firm',
        );
        act(() => {
            add?.click();
        });
        expect(isDialogOpen()).toBe(true);
        expect(onPortfolioChange).not.toHaveBeenCalled();
        await submitDialog('Add', settle);
        expect(onPortfolioChange).toHaveBeenCalledExactlyOnceWith([
            entry,
            expect.objectContaining({
                count: 1,
                firmId: firm.id,
                planId: plan.id,
            }),
        ]);
    });
});
