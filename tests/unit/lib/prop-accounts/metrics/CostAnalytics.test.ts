import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    compareText,
    FeeKind,
    feePrefillCents,
    type FirmKey,
    FirmKeyKind,
    type StoredFirmId,
} from '~/lib/prop-accounts/core';
import {
    costAnalytics,
    type FirmSpend,
    type ModeledFundedCost,
    PendingFeeAttribution,
    type PlanFundedCost,
} from '~/lib/prop-accounts/metrics';
import {
    ALL_FIRMS,
    type FirmId,
    serializePlanId,
} from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    INSTANT_PLAN,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    type PlanEntry,
    purchased,
} from './ledgerFixtures';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';

function economics(costPerFundedAccount: number): ModeledFundedCost {
    return { costPerFundedAccount };
}

function listAttemptPrice(entry: PlanEntry): number {
    const price = feePrefillCents(entry.plan, FeeKind.EvalPurchase);
    if (price === null) throw new Error('the fixture plan has no list price');
    return price;
}

function modeledFirm(firmId: StoredFirmId) {
    return { firmId, kind: FirmKeyKind.Modeled } as const;
}

function planWithoutListPrice(): PlanEntry {
    for (const firm of ALL_FIRMS) {
        for (const plan of firm.plans) {
            if (
                !plan.isInstantFunded &&
                feePrefillCents(plan, FeeKind.EvalPurchase) === null
            ) {
                return { firm, plan, serial: serializePlanId(plan.id) };
            }
        }
    }
    throw new Error('no registry plan lacks a list attempt price');
}

describe('costAnalytics', () => {
    const failed = account(EVAL_PLAN, { status: AccountStatus.Busted });
    const funded = account(EVAL_PLAN, {
        purchasedOn: '2026-09-05',
        stage: AccountStage.Funded,
    });
    const inEval = account(OTHER_FIRM_EVAL_PLAN, { purchasedOn: '2026-10-01' });
    const rows = {
        accounts: [failed, funded, inEval],
        events: [
            purchased(failed),
            event(failed, AccountEventKind.Busted, '2026-09-04'),
            purchased(funded),
            event(funded, AccountEventKind.EvalPassed, '2026-09-20'),
            purchased(inEval),
        ],
        fees: [
            fee(failed, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
            fee(funded, FeeKind.EvalPurchase, 10_000, '2026-09-05'),
            fee(funded, FeeKind.Reset, 5000, '2026-09-10'),
            fee(funded, FeeKind.Activation, 13_001, '2026-09-21'),
            fee(funded, FeeKind.Refund, 3000, '2026-09-22'),
            fee(funded, FeeKind.FundedReset, 9000, '2026-10-05'),
            fee(inEval, FeeKind.Subscription, 7000, '2026-10-01'),
        ],
    };

    it('splits spend by kind (refunds negative), firm and month, each summing to net spend', () => {
        const result = costAnalytics(ledger(rows), new Map());
        expect(result.byKind).toEqual({
            [FeeKind.Activation]: 13_001,
            [FeeKind.EvalPurchase]: 20_000,
            [FeeKind.FundedReset]: 9000,
            [FeeKind.Other]: 0,
            [FeeKind.Rebuy]: 0,
            [FeeKind.Refund]: -3000,
            [FeeKind.Reset]: 5000,
            [FeeKind.Subscription]: 7000,
        });
        expect(result.byFirm).toEqual(
            [
                { firmKey: modeledFirm(EVAL_PLAN.firm.id), spend: 44_001 },
                {
                    firmKey: modeledFirm(OTHER_FIRM_EVAL_PLAN.firm.id),
                    spend: 7000,
                },
            ].toSorted((x, y) =>
                compareText(x.firmKey.firmId, y.firmKey.firmId),
            ),
        );
        expect(result.byMonth).toEqual([
            { month: '2026-09', spend: 35_001 },
            { month: '2026-10', spend: 16_000 },
        ]);
    });

    it('gives realized acquisition cost per funded account per plan, net of refunds, without funded resets, with n', () => {
        const result = costAnalytics(ledger(rows), new Map());
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan).toMatchObject({
            acquisitionSpend: 10_000 + 10_000 + 5000 + 13_001 - 3000,
            costPerFundedAccount: 35_001,
            firmId: EVAL_PLAN.firm.id,
            fundedAccounts: 1,
            modeledCostPerFundedAccount: null,
            pendingAcquisitionSpend: 0,
            pendingEvalAccounts: 0,
            realizedMinusModeled: null,
        });
        const unfunded = result.perPlan.find(
            (p) => p.planSerial === OTHER_FIRM_EVAL_PLAN.serial,
        );
        expect(unfunded).toMatchObject({
            acquisitionSpend: 0,
            costPerFundedAccount: null,
            fundedAccounts: 0,
            pendingAcquisitionSpend: 7000,
            pendingEvalAccounts: 1,
        });
    });

    it('keeps the fees of an eval attempt still open out of the cost per funded account and reports them as pending', () => {
        const passed = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const retrying = account(EVAL_PLAN);
        const suspended = account(EVAL_PLAN, {
            status: AccountStatus.Suspended,
        });
        const result = costAnalytics(
            ledger({
                accounts: [passed, retrying, suspended],
                events: [
                    purchased(passed),
                    event(passed, AccountEventKind.EvalPassed, '2026-09-10'),
                    purchased(retrying),
                    event(retrying, AccountEventKind.Busted, '2026-09-02'),
                    event(retrying, AccountEventKind.Reopened, '2026-09-04'),
                    purchased(suspended),
                    event(suspended, AccountEventKind.Suspended, '2026-09-03'),
                ],
                fees: [
                    fee(passed, FeeKind.EvalPurchase, 20_000, '2026-09-01'),
                    fee(retrying, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(retrying, FeeKind.Reset, 5000, '2026-09-04'),
                    fee(suspended, FeeKind.EvalPurchase, 8000, '2026-09-01'),
                ],
            }),
            new Map([[EVAL_PLAN.serial, economics(250)]]),
        );
        expect(result.perPlan[0]).toMatchObject({
            acquisitionSpend: 30_000,
            costPerFundedAccount: 30_000,
            fundedAccounts: 1,
            pendingAcquisitionSpend: 13_000,
            pendingEvalAccounts: 2,
            realizedMinusModeled: 5000,
        });
    });

    it('discloses that open-attempt fees are matched by paid date, the rows carrying no attempt link', () => {
        const result = costAnalytics(ledger(rows), new Map());
        expect(result.pendingFeeAttribution).toBe(
            PendingFeeAttribution.PaidOnOrAfterOpenAttemptStart,
        );
    });

    it('rounds the per-account cost to whole cents', () => {
        const x = account(INSTANT_PLAN);
        const y = account(INSTANT_PLAN);
        const z = account(INSTANT_PLAN);
        const result = costAnalytics(
            ledger({
                accounts: [x, y, z],
                events: [purchased(x), purchased(y), purchased(z)],
                fees: [fee(x, FeeKind.EvalPurchase, 10_000, '2026-09-01')],
            }),
            new Map(),
        );
        expect(result.perPlan[0]?.fundedAccounts).toBe(3);
        expect(result.perPlan[0]?.costPerFundedAccount).toBe(3333);
    });

    it('asks for the measured cost per funded account only, no attempt or day count it cannot know', () => {
        expectTypeOf<ModeledFundedCost>().toEqualTypeOf<{
            readonly costPerFundedAccount: number;
        }>();
        expectTypeOf<Parameters<typeof costAnalytics>[1]>().toEqualTypeOf<
            ReadonlyMap<string, ModeledFundedCost>
        >();
    });

    it('compares against the modeled replacement economics passed in, in cents', () => {
        const result = costAnalytics(
            ledger(rows),
            new Map([
                [EVAL_PLAN.serial, economics(300.505)],
                [OTHER_FIRM_EVAL_PLAN.serial, economics(Infinity)],
            ]),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.modeledCostPerFundedAccount).toBe(30_051);
        expect(plan?.realizedMinusModeled).toBe(35_001 - 30_051);
        const other = result.perPlan.find(
            (p) => p.planSerial === OTHER_FIRM_EVAL_PLAN.serial,
        );
        expect(other?.modeledCostPerFundedAccount).toBeNull();
        expect(other?.realizedMinusModeled).toBeNull();
    });

    it('reports accounts whose plan does not resolve apart from the per-plan rows', () => {
        const lost = account(EVAL_PLAN, { planSerial: 'retired-plan' });
        const result = costAnalytics(
            ledger({
                accounts: [lost],
                fees: [
                    fee(lost, FeeKind.EvalPurchase, 9000, '2026-09-01'),
                    fee(lost, FeeKind.Refund, 1000, '2026-09-03'),
                ],
            }),
            new Map(),
        );
        expect(result.perPlan).toEqual([]);
        expect(result.unresolvedAccounts).toBe(1);
        expect(result.unresolvedSpend).toBe(8000);
        expect(result.byFirm).toEqual([
            { firmKey: modeledFirm(EVAL_PLAN.firm.id), spend: 8000 },
        ]);
    });

    it('counts attempts and cost per attempt per plan, disclosing resets and rebuys separately', () => {
        const attemptFailed = account(EVAL_PLAN, {
            status: AccountStatus.Busted,
        });
        const attemptFunded = account(EVAL_PLAN, {
            purchasedOn: '2026-09-05',
            stage: AccountStage.Funded,
        });
        const result = costAnalytics(
            ledger({
                accounts: [attemptFailed, attemptFunded],
                events: [
                    purchased(attemptFailed),
                    event(attemptFailed, AccountEventKind.Busted, '2026-09-04'),
                    purchased(attemptFunded),
                    event(
                        attemptFunded,
                        AccountEventKind.EvalPassed,
                        '2026-09-20',
                    ),
                ],
                fees: [
                    fee(
                        attemptFailed,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-09-01',
                    ),
                    fee(
                        attemptFunded,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-09-05',
                    ),
                    fee(attemptFunded, FeeKind.Reset, 5000, '2026-09-10'),
                ],
            }),
            new Map(),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan).toMatchObject({
            attempts: 2,
            costPerAttempt: 12_500,
            retryFeeAttempts: 1,
        });
    });

    it('has no cost per attempt while the eval attempt is still open', () => {
        const openEval = account(EVAL_PLAN);
        const result = costAnalytics(
            ledger({
                accounts: [openEval],
                events: [purchased(openEval)],
                fees: [fee(openEval, FeeKind.EvalPurchase, 9000, '2026-09-01')],
            }),
            new Map(),
        );
        expect(result.perPlan[0]).toMatchObject({
            attempts: 0,
            costPerAttempt: null,
            retryFeeAttempts: 0,
        });
    });

    it('groups spend, attempts and cost per attempt by account size', () => {
        const size = EVAL_PLAN.plan.id.accountSize;
        const failed = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const funded = account(EVAL_PLAN, {
            purchasedOn: '2026-09-02',
            stage: AccountStage.Funded,
        });
        const result = costAnalytics(
            ledger({
                accounts: [failed, funded],
                events: [
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-09-04'),
                    purchased(funded),
                    event(funded, AccountEventKind.EvalPassed, '2026-09-10'),
                ],
                fees: [
                    fee(failed, FeeKind.EvalPurchase, 5000, '2026-09-01'),
                    fee(funded, FeeKind.EvalPurchase, 20_000, '2026-09-02'),
                ],
            }),
            new Map(),
        );
        expect(result.byAccountSize).toEqual([
            {
                accountSize: size,
                attempts: 2,
                costPerAttempt: 12_500,
                spend: 25_000,
            },
        ]);
    });

    it('groups attempts and cost per attempt by firm key', () => {
        const a = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const b = account(OTHER_FIRM_EVAL_PLAN, {
            purchasedOn: '2026-09-02',
            stage: AccountStage.Funded,
        });
        const result = costAnalytics(
            ledger({
                accounts: [a, b],
                events: [
                    purchased(a),
                    event(a, AccountEventKind.Busted, '2026-09-04'),
                    purchased(b),
                    event(b, AccountEventKind.EvalPassed, '2026-09-10'),
                ],
                fees: [
                    fee(a, FeeKind.EvalPurchase, 5000, '2026-09-01'),
                    fee(b, FeeKind.EvalPurchase, 8000, '2026-09-02'),
                ],
            }),
            new Map(),
        );
        expect(result.byFirmAttemptCost).toMatchObject(
            [
                {
                    attempts: 1,
                    costPerAttempt: 5000,
                    firmKey: modeledFirm(EVAL_PLAN.firm.id),
                    retryFeeAttempts: 0,
                },
                {
                    attempts: 1,
                    costPerAttempt: 8000,
                    firmKey: modeledFirm(OTHER_FIRM_EVAL_PLAN.firm.id),
                    retryFeeAttempts: 0,
                },
            ].toSorted((x, y) =>
                compareText(x.firmKey.firmId, y.firmKey.firmId),
            ),
        );
    });

    it('excludes fees paid toward a still-open reopened attempt from cost per attempt in every breakdown, not just per plan', () => {
        const retrying = account(EVAL_PLAN);
        const result = costAnalytics(
            ledger({
                accounts: [retrying],
                events: [
                    purchased(retrying),
                    event(retrying, AccountEventKind.Busted, '2026-09-02'),
                    event(retrying, AccountEventKind.Reopened, '2026-09-04'),
                ],
                fees: [
                    fee(retrying, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(retrying, FeeKind.Reset, 5000, '2026-09-04'),
                ],
            }),
            new Map(),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan).toMatchObject({
            attempts: 1,
            costPerAttempt: 10_000,
        });
        expect(result.byAccountSize).toEqual([
            expect.objectContaining({
                attempts: 1,
                costPerAttempt: 10_000,
                spend: 10_000,
            }),
        ]);
        expect(result.byFirmAttemptCost).toEqual([
            expect.objectContaining({ attempts: 1, costPerAttempt: 10_000 }),
        ]);
    });

    it('reports spend at a removed firm under its stored firm id, and per-plan rows only under a modeled firm', () => {
        const removed: StoredFirmId = 'gone-firm';
        const lost = account(EVAL_PLAN, { firmId: removed });
        const result = costAnalytics(
            ledger({
                accounts: [lost],
                fees: [fee(lost, FeeKind.EvalPurchase, 9000, '2026-09-01')],
            }),
            new Map(),
        );
        expect(result.byFirm).toEqual([
            { firmKey: modeledFirm(removed), spend: 9000 },
        ]);
        expect(result.perPlan).toEqual([]);
        expect(result.unresolvedSpend).toBe(9000);
        expectTypeOf<FirmSpend['firmKey']>().toEqualTypeOf<FirmKey>();
        expectTypeOf<PlanFundedCost['firmId']>().toEqualTypeOf<FirmId>();
    });

    it('counts every fee of a decided attempt, funded resets included, and leaves an open attempt fee out', () => {
        const fundedThenBusted = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
        });
        const bustedEval = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const openEval = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const result = costAnalytics(
            ledger({
                accounts: [fundedThenBusted, bustedEval, openEval],
                events: [
                    purchased(fundedThenBusted),
                    event(
                        fundedThenBusted,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    event(
                        fundedThenBusted,
                        AccountEventKind.Busted,
                        '2026-02-01',
                    ),
                    purchased(bustedEval),
                    event(bustedEval, AccountEventKind.Busted, '2026-01-10'),
                    purchased(openEval),
                ],
                fees: [
                    fee(
                        fundedThenBusted,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-01-01',
                    ),
                    fee(
                        fundedThenBusted,
                        FeeKind.FundedReset,
                        4000,
                        '2026-01-20',
                    ),
                    fee(bustedEval, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                    fee(openEval, FeeKind.EvalPurchase, 9000, '2026-08-20'),
                ],
            }),
            new Map(),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan).toMatchObject({
            attempts: 2,
            costPerAttempt: 12_000,
            costPerFundedAccount: 20_000,
            pendingAcquisitionSpend: 9000,
        });
        expect(result.byFirmAttemptCost).toEqual([
            expect.objectContaining({ attempts: 2, costPerAttempt: 12_000 }),
        ]);
        expect(result.byAccountSize).toEqual([
            expect.objectContaining({ attempts: 2, costPerAttempt: 12_000 }),
        ]);
    });

    it('counts a ledger-only account as one attempt under its firm in the per-firm attempt cost', () => {
        const external = account(EVAL_PLAN, {
            externalFirmId: EXTERNAL_FIRM_ID,
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const modeledBusted = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
        });
        const result = costAnalytics(
            ledger({
                accounts: [external, modeledBusted],
                events: [
                    purchased(modeledBusted),
                    event(modeledBusted, AccountEventKind.Busted, '2026-01-10'),
                ],
                fees: [
                    fee(external, FeeKind.EvalPurchase, 20_000, '2026-09-02'),
                    fee(
                        modeledBusted,
                        FeeKind.EvalPurchase,
                        5000,
                        '2026-01-01',
                    ),
                ],
            }),
            new Map(),
        );
        const externalRow = result.byFirmAttemptCost.find(
            (row) => row.firmKey.kind === FirmKeyKind.External,
        );
        expect(externalRow).toMatchObject({
            attempts: 1,
            costPerAttempt: 20_000,
            retryFeeAttempts: 0,
        });
        const modeledRow = result.byFirmAttemptCost.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(modeledRow).toMatchObject({ attempts: 1, costPerAttempt: 5000 });
    });

    it('gives the attempts implied by acquisition spend at the list attempt price, 3.53 against 4 recorded', () => {
        const price = listAttemptPrice(EVAL_PLAN);
        const owners = Array.from({ length: 4 }, () =>
            account(EVAL_PLAN, { purchasedOn: '2026-01-01' }),
        );
        const [first, second, third, fourth] = owners;
        if (
            first === undefined ||
            second === undefined ||
            third === undefined ||
            fourth === undefined
        ) {
            throw new Error('fixture owners missing');
        }
        const result = costAnalytics(
            ledger({
                accounts: owners,
                events: owners.flatMap((owner) => [
                    purchased(owner),
                    event(owner, AccountEventKind.Busted, '2026-01-10'),
                ]),
                fees: [
                    fee(first, FeeKind.EvalPurchase, price, '2026-01-01'),
                    fee(second, FeeKind.EvalPurchase, price, '2026-01-01'),
                    fee(third, FeeKind.EvalPurchase, price, '2026-01-01'),
                    fee(fourth, FeeKind.Reset, 8000, '2026-01-05'),
                ],
            }),
            new Map(),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const expected = (3 * price + 8000) / price;
        expect(plan?.attempts).toBe(4);
        expect(plan?.impliedAttempts).toBeCloseTo(expected, 9);
        const firm = result.byFirmAttemptCost.find(
            (row) =>
                row.firmKey.kind === FirmKeyKind.Modeled &&
                row.firmKey.firmId === EVAL_PLAN.firm.id,
        );
        expect(firm?.impliedAttempts).toBeCloseTo(expected, 9);
        expect(firm?.plansWithoutListPrice).toBe(0);
        expect(firm?.accountsWithoutPlan).toBe(0);
    });

    it('has no implied attempts for a plan without a list price, and counts such plans and plan-less accounts per firm', () => {
        const unpriced = planWithoutListPrice();
        const unpricedOwner = account(unpriced, { purchasedOn: '2026-01-01' });
        const ledgerOnly = account(unpriced, {
            planLabel: 'Ledger only 100K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = costAnalytics(
            ledger({
                accounts: [unpricedOwner, ledgerOnly],
                events: [
                    purchased(unpricedOwner),
                    event(unpricedOwner, AccountEventKind.Busted, '2026-01-10'),
                ],
                fees: [
                    fee(unpricedOwner, FeeKind.Reset, 8000, '2026-01-05'),
                    fee(ledgerOnly, FeeKind.EvalPurchase, 9000, '2026-01-05'),
                ],
            }),
            new Map(),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === unpriced.serial,
        );
        expect(plan?.impliedAttempts).toBeNull();
        const firm = result.byFirmAttemptCost.find(
            (row) =>
                row.firmKey.kind === FirmKeyKind.Modeled &&
                row.firmKey.firmId === unpriced.firm.id,
        );
        expect(firm).toMatchObject({
            accountsWithoutPlan: 1,
            impliedAttempts: 0,
            plansWithoutListPrice: 1,
        });
    });
});
