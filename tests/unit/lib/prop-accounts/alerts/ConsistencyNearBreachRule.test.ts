import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    ConsistencyNearBreachRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import {
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    MffuVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedSizingOf,
} from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new ConsistencyNearBreachRule();

function documentedEvalWinOf(
    plan: ReturnType<typeof ftmoEval>,
    profit: number,
    bestDayProfit: number,
): number {
    const account = evalReconstructed(plan, {
        balance: plan.accountSize + profit,
        bestDayProfit,
    });
    const { sizing } = documentedSizingOf(account, DEFAULT_RULEBOOK);
    const rung = sizing.rungs[0];
    if (rung === undefined) throw new Error('expected a documented rung');
    return rung.risk * sizing.rewardMultiple;
}

function evalAlertsOf(
    plan: ReturnType<typeof ftmoEval>,
    profit: number,
    bestDayProfit: number,
) {
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Eval },
    );
    const evalAccount = evalReconstructed(plan, {
        balance: plan.accountSize + profit,
        bestDayProfit,
    });
    return alertsOf(rule, {
        accounts: [account],
        accountStates: [reconstructedEntry(account.id, plan, evalAccount)],
    });
}

function ftmoEval() {
    const plan = findFirm(FirmId.FtmoFutures)?.plans[0];
    if (!plan) throw new Error('FTMO Futures plan missing');
    return plan;
}

function mffBuilder() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder plan missing');
    return plan;
}

function mffPro() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro plan missing');
    return plan;
}

function tptEval() {
    const plan = findFirm(FirmId.Tpt)?.plans[0];
    if (!plan) throw new Error('TPT plan missing');
    return plan;
}

describe('ConsistencyNearBreachRule', () => {
    it('is critical, with the extra cycle profit needed, once the rule is already violated', () => {
        const plan = mffBuilder();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 10_000,
            cycleBestDayProfit: 8000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.ConsistencyNearBreach);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toContain('$6,000');
    });

    it('warns when one documented winning day would break the rule', () => {
        const plan = mffBuilder();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 100,
            cycleBestDayProfit: 40,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            `$${(DEFAULT_RULEBOOK.funded.takeProfitCents / CENTS_PER_DOLLAR).toLocaleString('en-US')}`,
        );
    });

    it('is silent with plenty of room before the rule could break', () => {
        const plan = mffBuilder();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 10_000,
            cycleBestDayProfit: 40,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });

    it('is silent for a plan whose funded stage carries no consistency rule', () => {
        const plan = mffPro();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 10_000,
            cycleBestDayProfit: 8000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });

    describe('an eval account with a consistency rule', () => {
        it('warns when one documented winning eval day would break the rule', () => {
            const plan = ftmoEval();
            const rule40 = plan.evalConsistencyRule();
            const profit = 1000;
            const win = documentedEvalWinOf(plan, profit, 100);
            expect(win).toBeGreaterThan(0);
            const room = rule40?.maxDayProfitBeforeViolation(profit) ?? 0;
            expect(room).toBeLessThan(win);
            const alerts = evalAlertsOf(plan, profit, 100);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.kind).toBe(AlertKind.ConsistencyNearBreach);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
            expect(alerts[0]?.message).toContain(
                `$${win.toLocaleString('en-US')}`,
            );
            expect(alerts[0]?.message).toContain('winning eval day');
        });

        it('is silent when the documented winning eval day fits inside the room left', () => {
            const plan = ftmoEval();
            const profit = 2500;
            const win = documentedEvalWinOf(plan, profit, 100);
            const room =
                plan
                    .evalConsistencyRule()
                    ?.maxDayProfitBeforeViolation(profit) ?? 0;
            expect(room).toBeGreaterThanOrEqual(win);
            expect(evalAlertsOf(plan, profit, 100)).toEqual([]);
        });

        it('is critical with the plain wording when the rule only keeps the eval open', () => {
            const plan = ftmoEval();
            const alerts = evalAlertsOf(plan, 1000, 800);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain(
                'Consistency already violated',
            );
            expect(alerts[0]?.message).toContain('$1,000');
            expect(alerts[0]?.message).not.toContain('more cycle profit');
        });

        it('names the doubled target when a violation raises the eval goal', () => {
            const plan = tptEval();
            const alerts = evalAlertsOf(plan, 1000, 800);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('target doubles');
            expect(alerts[0]?.message).toContain('$1,600');
            expect(alerts[0]?.message).toContain('$600');
            expect(alerts[0]?.message).not.toContain('more cycle profit');
        });

        it('keeps the funded wording for a funded account', () => {
            const plan = mffBuilder();
            const account = accountFor(
                { firmId: plan.id.firm, plan },
                { stage: AccountStage.Funded },
            );
            const funded = fundedReconstructed(plan, {
                balance: plan.accountSize + 10_000,
                cycleBestDayProfit: 8000,
                lastPayoutBalance: plan.accountSize,
                payoutsIssued: 0,
            });
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [reconstructedEntry(account.id, plan, funded)],
            });
            expect(alerts[0]?.message).toContain('more cycle profit needed');
        });
    });
});
