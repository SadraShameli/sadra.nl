import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
} from '~/lib/prop-accounts/core';
import {
    RebuyLagBasis,
    rebuyLagDefault,
    replacementStats,
} from '~/lib/prop-accounts/metrics';
import { RebuyLagBasis as AdvisorRebuyLagBasis } from '~/lib/prop-calculator/advisor';
import { meanStandardError } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    meanInterval,
    OTHER_USER_ID,
    purchased,
} from './ledgerFixtures';

function buildRows() {
    const bustedMonday = account(EVAL_PLAN, { status: AccountStatus.Busted });
    const bustedFriday = account(EVAL_PLAN, { status: AccountStatus.Busted });
    const stillOpen = account(EVAL_PLAN);
    const foreign = account(EVAL_PLAN, { userId: OTHER_USER_ID });
    const afterMonday = account(EVAL_PLAN, {
        purchasedOn: '2026-09-10',
        replacesAccountId: bustedMonday.id,
        stage: AccountStage.Funded,
    });
    const afterFriday = account(EVAL_PLAN, {
        purchasedOn: '2026-09-14',
        replacesAccountId: bustedFriday.id,
    });
    const afterOpen = account(EVAL_PLAN, {
        purchasedOn: '2026-09-15',
        replacesAccountId: stillOpen.id,
    });
    const crossUser = account(EVAL_PLAN, {
        purchasedOn: '2026-09-15',
        replacesAccountId: foreign.id,
    });
    return {
        accounts: [
            bustedMonday,
            bustedFriday,
            stillOpen,
            foreign,
            afterMonday,
            afterFriday,
            afterOpen,
            crossUser,
        ],
        events: [
            purchased(bustedMonday),
            event(bustedMonday, AccountEventKind.Busted, '2026-09-07'),
            purchased(bustedFriday),
            event(bustedFriday, AccountEventKind.Busted, '2026-09-11'),
            purchased(stillOpen),
            purchased(foreign),
            event(foreign, AccountEventKind.Busted, '2026-09-02'),
            purchased(afterMonday),
            event(afterMonday, AccountEventKind.EvalPassed, '2026-09-18'),
            purchased(afterFriday),
            purchased(afterOpen),
            purchased(crossUser),
        ],
    };
}

describe('replacementStats', () => {
    it('measures the idle sessions between the replaced account ending and its replacement, per plan, with n and SE', () => {
        const stats = replacementStats(ledger(buildRows()));
        const plan = stats.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.lagSamples).toBe(2);
        const lagSe = meanStandardError(2, 4, 2);
        expect(plan?.lagSessions).toEqual({
            interval: meanInterval(1, lagSe, 2),
            n: 2,
            standardError: lagSe,
            value: 1,
        });
        expect(plan?.unmeasuredReplacements).toBe(2);
        expect(plan?.firmId).toBe(EVAL_PLAN.firm.id);
    });

    it('counts eval attempts per funded account on the plan', () => {
        const stats = replacementStats(ledger(buildRows()));
        const plan = stats.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.attempts).toBe(3);
        expect(plan?.fundedAccounts).toBe(1);
        expect(plan?.attemptsPerFundedAccount).toBe(3);
    });

    it('treats every instant-funded purchase as one attempt and has no ratio without a funded account', () => {
        const instant = account(INSTANT_PLAN);
        const lonely = account(EVAL_PLAN);
        const stats = replacementStats(
            ledger({
                accounts: [instant, lonely],
                events: [purchased(instant), purchased(lonely)],
            }),
        );
        expect(
            stats.perPlan.find((p) => p.planSerial === INSTANT_PLAN.serial),
        ).toMatchObject({
            attempts: 1,
            attemptsPerFundedAccount: 1,
            fundedAccounts: 1,
            lagSamples: 0,
            lagSessions: null,
        });
        expect(
            stats.perPlan.find((p) => p.planSerial === EVAL_PLAN.serial),
        ).toMatchObject({
            attempts: 0,
            attemptsPerFundedAccount: null,
            fundedAccounts: 0,
        });
    });

    it('counts zero idle sessions when the replacement was bought before the old account ended', () => {
        const old = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const early = account(EVAL_PLAN, {
            purchasedOn: '2026-09-03',
            replacesAccountId: old.id,
        });
        const stats = replacementStats(
            ledger({
                accounts: [old, early],
                events: [
                    purchased(old),
                    event(old, AccountEventKind.Busted, '2026-09-08'),
                    purchased(early),
                ],
            }),
        );
        expect(stats.perPlan[0]?.lagSessions).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 0,
        });
    });

    it('dates the end from the bust, not from a later edit or closure', () => {
        const edited = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const closed = account(EVAL_PLAN, { status: AccountStatus.Closed });
        const afterEdited = account(EVAL_PLAN, {
            purchasedOn: '2026-09-21',
            replacesAccountId: edited.id,
        });
        const afterClosed = account(EVAL_PLAN, {
            purchasedOn: '2026-09-21',
            replacesAccountId: closed.id,
        });
        const stats = replacementStats(
            ledger({
                accounts: [edited, closed, afterEdited, afterClosed],
                events: [
                    purchased(edited),
                    event(edited, AccountEventKind.Busted, '2026-09-07'),
                    event(edited, AccountEventKind.Edited, '2026-09-18'),
                    purchased(closed),
                    event(closed, AccountEventKind.Busted, '2026-09-07'),
                    event(closed, AccountEventKind.Closed, '2026-09-14'),
                    purchased(afterEdited),
                    purchased(afterClosed),
                ],
            }),
        );
        expect(stats.perPlan[0]?.lagSessions).toEqual({
            interval: meanInterval(9, 0, 2),
            n: 2,
            standardError: 0,
            value: 9,
        });
        expect(stats.perPlan[0]?.unmeasuredReplacements).toBe(0);
    });

    it('keeps unresolved accounts apart', () => {
        const stats = replacementStats(
            ledger({
                accounts: [account(EVAL_PLAN, { planSerial: 'retired-plan' })],
            }),
        );
        expect(stats.perPlan).toEqual([]);
        expect(stats.unresolvedAccounts).toBe(1);
    });
});

describe('RebuyLagBasis', () => {
    it('is the one enum re-exported from the advisor policy, not a duplicate copy', () => {
        expect(RebuyLagBasis).toBe(AdvisorRebuyLagBasis);
    });
});

describe('rebuyLagDefault', () => {
    it('uses the measured mean lag when the plan has samples and assumes zero otherwise', () => {
        const stats = replacementStats(ledger(buildRows()));
        expect(rebuyLagDefault(stats, EVAL_PLAN.serial)).toEqual({
            basis: RebuyLagBasis.Measured,
            days: 1,
            samples: 2,
        });
        expect(rebuyLagDefault(stats, INSTANT_PLAN.serial)).toEqual({
            basis: RebuyLagBasis.AssumedZero,
            days: 0,
            samples: 0,
        });
    });
});
