import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
} from '~/lib/prop-accounts/core';
import { realizedOutcomes } from '~/lib/prop-accounts/metrics';
import {
    binomialStandardError,
    meanStandardError,
} from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    purchased,
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
            n: 4,
            standardError: binomialStandardError(0.5, 4),
            value: 0.5,
        });
    });

    it('gives sessions from purchase to funded, both ends counted, with the mean SE', () => {
        const plan = realizedOutcomes(ledger(rows)).perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.sessionsToFunded).toEqual({
            n: 2,
            standardError: meanStandardError(14, 100, 2),
            value: 7,
        });
    });

    it('gives funded survival as the share of funded accounts with no unreversed funded bust', () => {
        const plan = realizedOutcomes(ledger(rows)).perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.fundedSurvival).toEqual({
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
            n: 3,
            standardError: binomialStandardError(2 / 3, 3),
            value: 2 / 3,
        });
        expect(plan?.fundedSurvival).toEqual({
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
            fundedSurvival: { n: 1, standardError: null, value: 0 },
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
            n: 1,
            standardError: null,
            value: 8,
        });
        expect(plan?.passRate).toEqual({ n: 3, standardError: null, value: 1 });
        expect(plan?.fundedSurvival).toEqual({
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
