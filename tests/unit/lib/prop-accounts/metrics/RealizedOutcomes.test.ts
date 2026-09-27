import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    FirmKeyKind,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
import {
    realizedOutcomes,
    realizedPayoutRates,
} from '~/lib/prop-accounts/metrics';
import {
    binomialStandardError,
    meanStandardError,
    wilsonInterval,
} from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    meanInterval,
    payout,
    purchased,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from './ledgerFixtures';

describe('realizedOutcomes', () => {
    const clean = account(EVAL_PLAN, { stage: AccountStage.Funded });
    const resetThenPass = account(EVAL_PLAN, {
        purchasedOn: '2026-09-07',
        stage: AccountStage.Funded,
        status: AccountStatus.Busted,
    });
    const failed = account(EVAL_PLAN, { status: AccountStatus.Busted });
    const inProgress = account(EVAL_PLAN);
    const rows = {
        accounts: [clean, resetThenPass, failed, inProgress],
        events: [
            purchased(clean),
            event(clean, AccountEventKind.EvalPassed, '2026-09-10'),
            purchased(resetThenPass),
            event(resetThenPass, AccountEventKind.Busted, '2026-09-08'),
            event(resetThenPass, AccountEventKind.Reopened, '2026-09-09'),
            event(resetThenPass, AccountEventKind.EvalPassed, '2026-09-14'),
            event(resetThenPass, AccountEventKind.Busted, '2026-09-25'),
            purchased(failed),
            event(failed, AccountEventKind.Busted, '2026-09-03'),
            purchased(inProgress),
        ],
    };

    it('gives the per-attempt pass rate with its binomial SE, leaving open evals out', () => {
        const plan = realizedOutcomes(ledger(rows)).perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.instantFunded).toBe(false);
        expect(plan?.passRate).toEqual({
            interval: wilsonInterval(2, 4),
            n: 4,
            standardError: binomialStandardError(0.5, 4),
            value: 0.5,
        });
    });

    it('gives sessions from purchase to funded, both ends counted, with the mean SE', () => {
        const plan = realizedOutcomes(ledger(rows)).perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const se = meanStandardError(14, 100, 2);
        expect(plan?.sessionsToFunded).toEqual({
            interval: meanInterval(7, se, 2),
            n: 2,
            standardError: se,
            value: 7,
        });
    });

    it('gives funded survival as the share of funded accounts with no unreversed funded bust', () => {
        const plan = realizedOutcomes(ledger(rows)).perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.fundedSurvival).toEqual({
            interval: wilsonInterval(1, 2),
            n: 2,
            standardError: binomialStandardError(0.5, 2),
            value: 0.5,
        });
        expect(plan?.openFundedAccounts).toBe(1);
    });

    it('ignores edits on a busted eval and edits between a bust and its reversal', () => {
        const bustedEdited = account(EVAL_PLAN, {
            status: AccountStatus.Busted,
        });
        const evalReversed = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const fundedReversed = account(EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const plan = realizedOutcomes(
            ledger({
                accounts: [bustedEdited, evalReversed, fundedReversed],
                events: [
                    purchased(bustedEdited),
                    event(bustedEdited, AccountEventKind.Busted, '2026-09-03'),
                    event(bustedEdited, AccountEventKind.Edited, '2026-09-05'),
                    event(bustedEdited, AccountEventKind.Edited, '2026-09-08'),
                    purchased(evalReversed),
                    event(evalReversed, AccountEventKind.Busted, '2026-09-03'),
                    event(evalReversed, AccountEventKind.Edited, '2026-09-04'),
                    event(
                        evalReversed,
                        AccountEventKind.BustReversed,
                        '2026-09-05',
                    ),
                    event(
                        evalReversed,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                    purchased(fundedReversed),
                    event(
                        fundedReversed,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                    event(
                        fundedReversed,
                        AccountEventKind.Busted,
                        '2026-09-20',
                    ),
                    event(
                        fundedReversed,
                        AccountEventKind.Edited,
                        '2026-09-21',
                    ),
                    event(
                        fundedReversed,
                        AccountEventKind.BustReversed,
                        '2026-09-22',
                    ),
                ],
            }),
        ).perPlan[0];
        expect(plan?.passRate).toEqual({
            interval: wilsonInterval(2, 3),
            n: 3,
            standardError: binomialStandardError(2 / 3, 3),
            value: 2 / 3,
        });
        expect(plan?.fundedSurvival).toEqual({
            interval: wilsonInterval(2, 2),
            n: 2,
            standardError: null,
            value: 1,
        });
        expect(plan?.openFundedAccounts).toBe(2);
    });

    it('has no pass rate or time to funded on an instant-funded plan, and no estimate without a sample', () => {
        const instant = account(INSTANT_PLAN, { status: AccountStatus.Busted });
        const fresh = account(EVAL_PLAN);
        const result = realizedOutcomes(
            ledger({
                accounts: [instant, fresh],
                events: [
                    purchased(instant),
                    event(instant, AccountEventKind.Busted, '2026-09-04'),
                    purchased(fresh),
                ],
            }),
        );
        expect(
            result.perPlan.find((p) => p.planSerial === INSTANT_PLAN.serial),
        ).toEqual({
            firmId: INSTANT_PLAN.firm.id,
            fundedSurvival: {
                interval: wilsonInterval(0, 1),
                n: 1,
                standardError: null,
                value: 0,
            },
            instantFunded: true,
            openFundedAccounts: 0,
            passRate: null,
            planSerial: INSTANT_PLAN.serial,
            sessionsToFunded: null,
        });
        expect(
            result.perPlan.find((p) => p.planSerial === EVAL_PLAN.serial),
        ).toMatchObject({
            fundedSurvival: null,
            passRate: null,
            sessionsToFunded: null,
        });
    });

    it('adds no sessions-to-funded sample for a pass with an unknown date, yet counts that account in the pass rate and survival', () => {
        const known = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const undated = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const undatedLive = account(EVAL_PLAN, { stage: AccountStage.Live });
        const plan = realizedOutcomes(
            ledger({
                accounts: [known, undated, undatedLive],
                events: [
                    purchased(known),
                    event(known, AccountEventKind.EvalPassed, '2026-09-10'),
                    purchased(undatedLive),
                    event(
                        undatedLive,
                        AccountEventKind.MovedLive,
                        '2026-09-20',
                    ),
                ],
            }),
        ).perPlan[0];
        expect(plan?.sessionsToFunded).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 8,
        });
        expect(plan?.passRate).toEqual({
            interval: wilsonInterval(3, 3),
            n: 3,
            standardError: null,
            value: 1,
        });
        expect(plan?.fundedSurvival).toEqual({
            interval: wilsonInterval(3, 3),
            n: 3,
            standardError: null,
            value: 1,
        });
        expect(plan?.openFundedAccounts).toBe(3);
    });

    it('keeps unresolved accounts apart', () => {
        const result = realizedOutcomes(
            ledger({
                accounts: [account(EVAL_PLAN, { planSerial: 'retired-plan' })],
            }),
        );
        expect(result.perPlan).toEqual([]);
        expect(result.unresolvedAccounts).toBe(1);
    });
});

describe('realizedPayoutRates', () => {
    const AS_OF = '2026-02-01';
    const HORIZON_DAYS = 30;

    it('counts a young open account with a payout within the horizon as a success, excludes one without, and treats an old open account that reached the horizon and an ended account as failures', () => {
        const youngPaid = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const youngUnpaid = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const endedNoPayout = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Busted,
        });
        const oldReachedHorizon = account(EVAL_PLAN, {
            purchasedOn: '2025-12-01',
        });
        const result = realizedPayoutRates(
            ledger({
                accounts: [
                    youngPaid,
                    youngUnpaid,
                    endedNoPayout,
                    oldReachedHorizon,
                ],
                events: [
                    purchased(youngPaid),
                    event(youngPaid, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(youngUnpaid),
                    event(
                        youngUnpaid,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    purchased(endedNoPayout),
                    event(
                        endedNoPayout,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    event(endedNoPayout, AccountEventKind.Busted, '2026-01-10'),
                    purchased(oldReachedHorizon),
                    event(
                        oldReachedHorizon,
                        AccountEventKind.EvalPassed,
                        '2025-12-20',
                    ),
                ],
                payouts: [
                    payout(youngPaid, 40_000, {
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            AS_OF,
            HORIZON_DAYS,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.openAccounts).toBe(1);
        expect(plan?.payoutRate).toEqual({
            interval: wilsonInterval(1, 3),
            n: 3,
            standardError: binomialStandardError(1 / 3, 3),
            value: 1 / 3,
        });
    });

    it('merges a copy group bought on the same date into one independent sample', () => {
        const first = account(EVAL_PLAN, {
            copyGroupId: 'group-1',
            purchasedOn: '2026-01-01',
        });
        const second = account(EVAL_PLAN, {
            copyGroupId: 'group-1',
            purchasedOn: '2026-01-01',
        });
        const result = realizedPayoutRates(
            ledger({
                accounts: [first, second],
                events: [
                    purchased(first),
                    event(first, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(second),
                    event(second, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(first, 40_000, {
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(second, 40_000, {
                        paidOn: '2026-01-11',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            AS_OF,
            HORIZON_DAYS,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.payoutRate?.n).toBe(1);
    });

    it('resolves a copy group with divergent outcomes by majority vote, not by array order', () => {
        const paidFirst = account(EVAL_PLAN, {
            copyGroupId: 'group-2',
            purchasedOn: '2026-01-01',
        });
        const paidSecond = account(EVAL_PLAN, {
            copyGroupId: 'group-2',
            purchasedOn: '2026-01-01',
        });
        const busted = account(EVAL_PLAN, {
            copyGroupId: 'group-2',
            purchasedOn: '2026-01-01',
            status: AccountStatus.Busted,
        });
        const result = realizedPayoutRates(
            ledger({
                accounts: [busted, paidFirst, paidSecond],
                events: [
                    purchased(busted),
                    event(busted, AccountEventKind.EvalPassed, '2026-01-05'),
                    event(busted, AccountEventKind.Busted, '2026-01-08'),
                    purchased(paidFirst),
                    event(
                        paidFirst,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    purchased(paidSecond),
                    event(
                        paidSecond,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                ],
                payouts: [
                    payout(paidFirst, 40_000, {
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(paidSecond, 40_000, {
                        paidOn: '2026-01-11',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            AS_OF,
            HORIZON_DAYS,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.payoutRate).toEqual({
            interval: wilsonInterval(1, 1),
            n: 1,
            standardError: null,
            value: 1,
        });
    });

    it('resolves a tied copy group (equal successes and failures) as a failure, never overstating the rate', () => {
        const paid = account(EVAL_PLAN, {
            copyGroupId: 'group-3',
            purchasedOn: '2026-01-01',
        });
        const busted = account(EVAL_PLAN, {
            copyGroupId: 'group-3',
            purchasedOn: '2026-01-01',
            status: AccountStatus.Busted,
        });
        const result = realizedPayoutRates(
            ledger({
                accounts: [paid, busted],
                events: [
                    purchased(paid),
                    event(paid, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(busted),
                    event(busted, AccountEventKind.EvalPassed, '2026-01-05'),
                    event(busted, AccountEventKind.Busted, '2026-01-08'),
                ],
                payouts: [
                    payout(paid, 40_000, {
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            AS_OF,
            HORIZON_DAYS,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.payoutRate).toEqual({
            interval: wilsonInterval(0, 1),
            n: 1,
            standardError: null,
            value: 0,
        });
    });

    it('pools successes and n across a firm rollup instead of averaging per-plan rates', () => {
        const planAWin = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const planALoss = account(EVAL_PLAN, {
            purchasedOn: '2025-12-01',
        });
        const planBLoss1 = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            purchasedOn: '2025-12-01',
        });
        const planBLoss2 = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            purchasedOn: '2025-12-01',
        });
        const planBLoss3 = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            purchasedOn: '2025-12-01',
        });
        const result = realizedPayoutRates(
            ledger({
                accounts: [
                    planAWin,
                    planALoss,
                    planBLoss1,
                    planBLoss2,
                    planBLoss3,
                ],
                events: [
                    purchased(planAWin),
                    event(
                        planAWin,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    purchased(planALoss),
                    event(
                        planALoss,
                        AccountEventKind.EvalPassed,
                        '2025-12-20',
                    ),
                    purchased(planBLoss1),
                    event(
                        planBLoss1,
                        AccountEventKind.EvalPassed,
                        '2025-12-20',
                    ),
                    purchased(planBLoss2),
                    event(
                        planBLoss2,
                        AccountEventKind.EvalPassed,
                        '2025-12-20',
                    ),
                    purchased(planBLoss3),
                    event(
                        planBLoss3,
                        AccountEventKind.EvalPassed,
                        '2025-12-20',
                    ),
                ],
                payouts: [
                    payout(planAWin, 40_000, {
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            AS_OF,
            HORIZON_DAYS,
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm?.payoutRate).toEqual({
            interval: wilsonInterval(1, 5),
            n: 5,
            standardError: binomialStandardError(1 / 5, 5),
            value: 1 / 5,
        });
        expect(firm?.payoutRate?.value).not.toBe(0.25);
    });
});
