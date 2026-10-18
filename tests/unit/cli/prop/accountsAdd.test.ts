import { describe, expect, it } from 'vitest';

import {
    type AccountFeeInput,
    type AccountImportRows,
    type AccountsAddPort,
    type AccountsAddRequest,
    addAccounts,
    FeeChoiceKind,
    nextAccountLabels,
    NoListPriceError,
    readFeeChoice,
} from '~/cli/commands/prop/accounts/add/AccountsAdd';
import { AccountStage, FeeKind, usdCents } from '~/lib/prop-accounts/core';
import {
    dollars,
    findFirm,
    FirmId,
    type Plan,
    TradeifyVariant,
} from '~/lib/prop-calculator';

class RecordingPort implements AccountsAddPort {
    readonly fees: AccountFeeInput[] = [];
    readonly imports: AccountImportRows[] = [];

    constructor(private readonly labels: readonly string[]) {}

    createFee(input: AccountFeeInput): Promise<void> {
        this.fees.push(input);
        return Promise.resolve();
    }

    existingLabels(): Promise<readonly string[]> {
        return Promise.resolve(this.labels);
    }

    importAccounts(rows: AccountImportRows) {
        this.imports.push(rows);
        return Promise.resolve(
            rows.map((row, index) => ({
                id: `account-${String(index + 1)}`,
                label: row.label,
                planSerial: 'planSerial' in row ? row.planSerial : null,
                stage: row.stage,
            })),
        );
    }
}

function requestFor(
    overrides: Partial<AccountsAddRequest> = {},
): AccountsAddRequest {
    return {
        count: 2,
        fee: { kind: FeeChoiceKind.List },
        fundedOn: null,
        label: 'Tradeify Select',
        plan: selectFlexPlan(),
        purchasedOn: '2026-10-15',
        stage: AccountStage.Eval,
        ...overrides,
    };
}

function selectFlexPlan(): Plan {
    const plan = findFirm(FirmId.Tradeify)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.SelectFlex,
    });
    if (!plan) throw new Error('Tradeify Select Flex 50K plan not found');
    return plan;
}

describe('prop accounts add', () => {
    it('numbers new labels after the ones the user already has', () => {
        expect(
            nextAccountLabels(
                'Lucid Pro',
                3,
                new Set(['Lucid Pro 1', 'Lucid Pro 3']),
            ),
        ).toEqual(['Lucid Pro 2', 'Lucid Pro 4', 'Lucid Pro 5']);
    });

    it('reads list, none and a dollar amount as the fee choice, and refuses anything else', () => {
        expect(readFeeChoice('list')).toEqual({ kind: FeeChoiceKind.List });
        expect(readFeeChoice('None')).toEqual({ kind: FeeChoiceKind.None });
        expect(readFeeChoice('149.5')).toEqual({
            cents: usdCents(14_950),
            kind: FeeChoiceKind.Amount,
        });
        expect(() => readFeeChoice('-1')).toThrow(/--fee/);
        expect(() => readFeeChoice('cheap')).toThrow(/--fee/);
    });

    it('imports one modeled eval row per account in one call, then a list-price purchase fee per account on the purchase day', async () => {
        const port = new RecordingPort(['Tradeify Select 1']);

        const added = await addAccounts(port, requestFor());

        expect(port.imports).toHaveLength(1);
        expect(port.imports[0]).toEqual([
            expect.objectContaining({
                accountSize: 50_000,
                firmId: FirmId.Tradeify,
                label: 'Tradeify Select 2',
                planSerial: 'tradeify-50000-select-flex',
                purchasedOn: '2026-10-15',
                stage: AccountStage.Eval,
            }),
            expect.objectContaining({ label: 'Tradeify Select 3' }),
        ]);
        expect(port.fees).toEqual([
            {
                accountId: 'account-1',
                amountCents: usdCents(16_500),
                kind: FeeKind.EvalPurchase,
                paidOn: '2026-10-15',
            },
            {
                accountId: 'account-2',
                amountCents: usdCents(16_500),
                kind: FeeKind.EvalPurchase,
                paidOn: '2026-10-15',
            },
        ]);
        expect(added.map((account) => account.label)).toEqual([
            'Tradeify Select 2',
            'Tradeify Select 3',
        ]);
    });

    it('adds no fee rows with --fee none, and the paid amount with --fee <dollars>', async () => {
        const none = new RecordingPort([]);
        await addAccounts(
            none,
            requestFor({ fee: { kind: FeeChoiceKind.None } }),
        );
        const paid = new RecordingPort([]);
        await addAccounts(
            paid,
            requestFor({
                count: 1,
                fee: { cents: usdCents(9900), kind: FeeChoiceKind.Amount },
            }),
        );

        expect(none.fees).toEqual([]);
        expect(paid.fees.map((fee) => fee.amountCents)).toEqual([
            usdCents(9900),
        ]);
    });

    it('refuses a list-price fee for a plan with no list price before creating any account', async () => {
        const plan = selectFlexPlan().withOverrides({
            fees: {
                activation: dollars(0),
                monthlySubscription: dollars(0),
                oneTimeEval: dollars(0),
                reset: dollars(0),
            },
        });
        const port = new RecordingPort([]);

        await expect(addAccounts(port, requestFor({ plan }))).rejects.toThrow(
            NoListPriceError,
        );
        expect(port.imports).toEqual([]);
    });
});
