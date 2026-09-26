import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountRowShapeError,
    AccountStage,
    AccountTracking,
    compareText,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
    type ModeledAccountRow,
    type StoredFirmId,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import {
    costAnalytics,
    diversification,
    fundingTotals,
    type LedgerAccountRow,
    modeledEntries,
    monthlyStatement,
    planCapUsage,
    portfolioRoi,
    realizedNetPerSlot,
    realizedOutcomes,
    replacementStats,
    spendAndPayouts,
    stageFunnel,
} from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from './ledgerFixtures';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';

const MODELED_FIRM_KEY = {
    firmId: EVAL_PLAN.firm.id,
    kind: FirmKeyKind.Modeled,
} as const;

const EXTERNAL_FIRM_KEY = {
    externalFirmId: EXTERNAL_FIRM_ID,
    kind: FirmKeyKind.External,
} as const;

function ledgerOnly(overrides: Partial<LedgerAccountRow> = {}) {
    return account(EVAL_PLAN, {
        accountSize: 150_000,
        planLabel: 'Rapid 150K',
        planSerial: null,
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    });
}

function portfolio() {
    const modeled = account(EVAL_PLAN, { stage: AccountStage.Funded });
    const atModeledFirm = ledgerOnly();
    const atExternalFirm = ledgerOnly({
        externalFirmId: EXTERNAL_FIRM_ID,
        firmId: null,
        planLabel: 'Hola Prime 100K',
    });
    const otherFirm = account(OTHER_FIRM_EVAL_PLAN);
    const book = ledger({
        accounts: [modeled, atModeledFirm, atExternalFirm, otherFirm],
        events: [
            purchased(modeled),
            event(modeled, AccountEventKind.EvalPassed, '2026-09-10'),
            purchased(otherFirm),
        ],
        fees: [
            fee(modeled, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
            fee(atModeledFirm, FeeKind.EvalPurchase, 30_000, '2026-09-01'),
            fee(atModeledFirm, FeeKind.Activation, 15_000, '2026-09-12'),
            fee(atExternalFirm, FeeKind.EvalPurchase, 20_000, '2026-09-02'),
            fee(otherFirm, FeeKind.EvalPurchase, 5000, '2026-09-03'),
        ],
        payouts: [
            payout(modeled, 50_000, { netCents: 40_000 }),
            payout(atModeledFirm, 200_000, { netCents: 180_000 }),
            payout(atExternalFirm, 100_000, { netCents: 80_000 }),
        ],
    });
    return { atExternalFirm, atModeledFirm, book, modeled, otherFirm };
}

describe('ledger-only accounts in the portfolio ledger', () => {
    it('keeps ledger-only accounts out of the modeled entries, the plan groups and the unresolved accounts', () => {
        const { atExternalFirm, atModeledFirm, book, modeled, otherFirm } =
            portfolio();
        expect(modeledEntries(book).map((entry) => entry.row.id)).toEqual([
            modeled.id,
            otherFirm.id,
        ]);
        expect(book.ledgerOnlyAccounts.map((entry) => entry.row.id)).toEqual([
            atModeledFirm.id,
            atExternalFirm.id,
        ]);
        expect(book.unresolvedAccounts).toEqual([]);
        expect(
            book
                .planGroups()
                .flatMap((group) => group.accounts)
                .map((entry) => entry.row.id)
                .toSorted(compareText),
        ).toEqual([modeled.id, otherFirm.id].toSorted(compareText));
        const [first] = modeledEntries(book);
        expectTypeOf(first?.row.firmId).toEqualTypeOf<
            StoredFirmId | undefined
        >();
        expectTypeOf(first?.row.planSerial).toEqualTypeOf<string | undefined>();
        expectTypeOf(first?.row).toExtend<
            ModeledAccountRow<LedgerAccountRow> | undefined
        >();
    });

    it('still counts a genuinely unresolvable modeled row as unresolved', () => {
        const lost = account(EVAL_PLAN, {
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.UnknownPlanSerial,
                },
            ],
        });
        const book = ledger({ accounts: [lost, ledgerOnly()] });
        expect(book.unresolvedAccounts.map((entry) => entry.row.id)).toEqual([
            lost.id,
        ]);
        expect(book.ledgerOnlyAccounts).toHaveLength(1);
    });

    it('fails loud on a row that breaks the tracking shape', () => {
        expect(() =>
            ledger({
                accounts: [
                    account(EVAL_PLAN, {
                        planLabel: null,
                        planSerial: null,
                        tracking: AccountTracking.LedgerOnly,
                    }),
                ],
            }),
        ).toThrow(AccountRowShapeError);
    });
});

describe('ledger-only accounts in cash, firm and funnel metrics', () => {
    it('counts their fees and paid payouts in spend, payouts, net and ROI', () => {
        const { book } = portfolio();
        const cash = spendAndPayouts(book).allTime;
        expect(cash.spend).toBe(10_000 + 30_000 + 15_000 + 20_000 + 5000);
        expect(cash.payouts).toBe(40_000 + 180_000 + 80_000);
        expect(cash.net).toBe(300_000 - 80_000);
        expect(cash.paidPayouts).toBe(3);
        const roi = portfolioRoi(book, '2026-09-30');
        expect(roi.net).toBe(220_000);
        expect(roi.netSpend).toBe(80_000);
        const september = monthlyStatement(book, '2026-09-30', {
            monthlyPayoutTargetCents: null,
            targetMonthlyMultiple: null,
        }).months.find((month) => month.month === '2026-09');
        expect(september?.net).toBe(220_000);
    });

    it('splits spend per firm key, the ledger-only account at a modeled firm under that firm and the external one under its own key', () => {
        const { book } = portfolio();
        const byFirm = costAnalytics(book, new Map()).byFirm;
        const spendOf = (id: string) =>
            byFirm.find((row) => firmKeyId(row.firmKey) === id)?.spend;
        expect(spendOf(firmKeyId(MODELED_FIRM_KEY))).toBe(10_000 + 45_000);
        expect(spendOf(firmKeyId(EXTERNAL_FIRM_KEY))).toBe(20_000);
        expect(
            spendOf(
                firmKeyId({
                    firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
                    kind: FirmKeyKind.Modeled,
                }),
            ),
        ).toBe(5000);
    });

    it('shares paid payouts and funded nominal per firm key', () => {
        const { book } = portfolio();
        const result = diversification(book);
        const payoutsOf = (id: string) =>
            result.payouts.find((row) => firmKeyId(row.firmKey) === id)?.cents;
        expect(payoutsOf(firmKeyId(MODELED_FIRM_KEY))).toBe(220_000);
        expect(payoutsOf(firmKeyId(EXTERNAL_FIRM_KEY))).toBe(80_000);
        const funding = fundingTotals(book);
        const externalFunding = funding.byFirm.find(
            (row) => firmKeyId(row.firmKey) === firmKeyId(EXTERNAL_FIRM_KEY),
        );
        expect(externalFunding?.byStage[AccountStage.Funded]).toEqual({
            accounts: 1,
            nominal: 15_000_000,
        });
        expect(funding.fundedNominal).toBe(
            EVAL_PLAN.plan.id.accountSize * 100 + 30_000_000,
        );
    });

    it('counts them in the funnel under their own firm keys from their stored stage, never with more first payouts than funded accounts', () => {
        const { book } = portfolio();
        const funnel = stageFunnel(book);
        const rowOf = (id: string) =>
            funnel.byFirm.find((row) => firmKeyId(row.firmKey) === id);
        expect(rowOf(firmKeyId(MODELED_FIRM_KEY))).toMatchObject({
            firstPayout: 2,
            funded: 2,
            movedLive: 0,
            passed: 1,
            purchased: 2,
        });
        expect(rowOf(firmKeyId(EXTERNAL_FIRM_KEY))).toMatchObject({
            firstPayout: 1,
            funded: 1,
            movedLive: 0,
            passed: 0,
            purchased: 1,
        });
        for (const row of funnel.byFirm) {
            expect(row.firstPayout).toBeLessThanOrEqual(row.funded);
            expect(row.movedLive).toBeLessThanOrEqual(row.funded);
        }
        expect(funnel.ledgerOnlyAccounts).toBe(2);
        expect(funnel.unresolvedAccounts).toBe(0);
    });

    it('reads funded and moved live for a ledger-only account from its stored stage and paid payouts', () => {
        const live = ledgerOnly({ stage: AccountStage.Live });
        const evalWithPayout = ledgerOnly({ stage: AccountStage.Eval });
        const openEval = ledgerOnly({ stage: AccountStage.Eval });
        const book = ledger({
            accounts: [live, evalWithPayout, openEval],
            payouts: [payout(evalWithPayout, 10_000, { netCents: 9000 })],
        });
        const [row] = stageFunnel(book).byFirm;
        expect(stageFunnel(book).byFirm).toHaveLength(1);
        expect(row).toMatchObject({
            firstPayout: 1,
            funded: 2,
            movedLive: 1,
            passed: 0,
            purchased: 3,
        });
    });
});

describe('ledger-only accounts in plan-keyed metrics', () => {
    it('leaves them out of cost per funded, realized outcomes, replacement and cap usage, with the count disclosed', () => {
        const { book, modeled } = portfolio();
        const cost = costAnalytics(book, new Map());
        expect(
            cost.perPlan.map((plan) => plan.planSerial).toSorted(compareText),
        ).toEqual(
            [EVAL_PLAN.serial, OTHER_FIRM_EVAL_PLAN.serial].toSorted(
                compareText,
            ),
        );
        expect(
            cost.perPlan.find((plan) => plan.planSerial === EVAL_PLAN.serial)
                ?.acquisitionSpend,
        ).toBe(10_000);
        expect(cost.ledgerOnlyAccounts).toBe(2);
        expect(cost.ledgerOnlySpend).toBe(30_000 + 15_000 + 20_000);
        expect(cost.unresolvedAccounts).toBe(0);
        const outcomes = realizedOutcomes(book);
        expect(outcomes.ledgerOnlyAccounts).toBe(2);
        expect(outcomes.unresolvedAccounts).toBe(0);
        expect(
            outcomes.perPlan.find(
                (plan) => plan.planSerial === EVAL_PLAN.serial,
            )?.fundedSurvival?.n,
        ).toBe(1);
        const replacement = replacementStats(book);
        expect(replacement.ledgerOnlyAccounts).toBe(2);
        expect(
            replacement.perPlan.find(
                (plan) => plan.planSerial === EVAL_PLAN.serial,
            )?.fundedAccounts,
        ).toBe(1);
        const caps = planCapUsage(book);
        expect(caps.ledgerOnlyAccounts).toBe(2);
        expect(
            caps.plans.find((plan) => plan.planSerial === EVAL_PLAN.serial)
                ?.used,
        ).toBe(1);
        expect(modeled.tracking).toBe(AccountTracking.Modeled);
    });

    it('leaves them out of the realized net per slot, with the count disclosed', () => {
        const { book } = portfolio();
        const perSlot = realizedNetPerSlot(book, '2026-09-30');
        expect(perSlot.ledgerOnlyAccounts).toBe(2);
        expect(perSlot.unresolvedAccounts).toBe(0);
        const modeledNet = 40_000 - 10_000 - 5000;
        expect(
            perSlot.months.reduce((sum, month) => sum + month.net, 0) +
                perSlot.unallocatedNet +
                perSlot.unmeasuredNet,
        ).toBe(modeledNet);
    });
});
