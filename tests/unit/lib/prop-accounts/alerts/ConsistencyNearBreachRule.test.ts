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
    EvalSizingMode,
    type RulebookParameters,
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
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
): number {
    const account = evalReconstructed(plan, {
        balance: plan.accountSize + profit,
        bestDayProfit,
    });
    const { sizing } = documentedSizingOf(account, rulebook);
    const rung = sizing.rungs[0];
    if (rung === undefined) throw new Error('expected a documented rung');
    return rung.risk * sizing.rewardMultiple;
}

function evalAlertsOf(
    plan: ReturnType<typeof ftmoEval>,
    profit: number,
    bestDayProfit: number,
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
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
        rulebook,
    });
}

function ftmoEval() {
    const plan = findFirm(FirmId.FtmoFutures)?.plans[0];
    if (!plan) throw new Error('FTMO Futures plan missing');
    return plan;
}

function maxRiskRulebook(): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        eval: { ...DEFAULT_RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
    };
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
        it('warns when a full documented winning eval day lands the best day on an inclusive share at the profit target', () => {
            const plan = tptEval();
            const rulebook = maxRiskRulebook();
            const profit = 1000;
            const win = documentedEvalWinOf(plan, profit, 100, rulebook);
            const rule50 = plan.evalConsistencyRule();
            expect(rule50?.isViolated(win, plan.profitTarget)).toBe(true);
            expect(win).toBeGreaterThan(0);
            expect(profit + win).toBeLessThanOrEqual(plan.profitTarget);
            const alerts = evalAlertsOf(plan, profit, 100, rulebook);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.kind).toBe(AlertKind.ConsistencyNearBreach);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
            expect(alerts[0]?.message).toContain(
                `$${win.toLocaleString('en-US')}`,
            );
            expect(alerts[0]?.message).toContain('winning eval day');
            expect(alerts[0]?.message).toContain('profit target');
        });

        it('is silent for the same documented day on an exclusive share, which the profit target still covers', () => {
            const plan = ftmoEval();
            const rulebook = maxRiskRulebook();
            const win = documentedEvalWinOf(plan, 1000, 100, rulebook);
            expect(win).toBe(
                (plan.evalConsistencyRule()?.maxBestDayShare ?? 1) *
                    plan.profitTarget,
            );
            expect(evalAlertsOf(plan, 1000, 100, rulebook)).toEqual([]);
        });

        it('is silent for a fresh eval with no profit and no best day', () => {
            const plan = ftmoEval();
            expect(documentedEvalWinOf(plan, 0, 0)).toBeGreaterThan(0);
            expect(evalAlertsOf(plan, 0, 0)).toEqual([]);
        });

        it('is silent for a net-losing eval', () => {
            const plan = ftmoEval();
            expect(evalAlertsOf(plan, -500, 0)).toEqual([]);
            expect(evalAlertsOf(plan, -500, 100)).toEqual([]);
        });

        it('is silent while a documented winning day fits inside the share of the profit target', () => {
            const plan = ftmoEval();
            const profit = 1000;
            const win = documentedEvalWinOf(plan, profit, 100);
            const share = plan.evalConsistencyRule()?.maxBestDayShare ?? 1;
            const room =
                plan
                    .evalConsistencyRule()
                    ?.maxDayProfitBeforeViolation(profit) ?? 0;
            expect(room).toBeLessThan(win);
            expect(win).toBeLessThanOrEqual(share * plan.profitTarget);
            expect(evalAlertsOf(plan, profit, 100)).toEqual([]);
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
            expect(alerts[0]?.message).not.toContain('target doubles');
        });

        it('names the profit target when it is above twice the best day', () => {
            const plan = tptEval();
            expect(plan.profitTarget).toBeGreaterThan(2 * 800);
            const alerts = evalAlertsOf(plan, 1000, 800);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('target doubles');
            expect(alerts[0]?.message).toContain('$3,000');
            expect(alerts[0]?.message).toContain('profit target');
            expect(alerts[0]?.message).toContain('$2,000 more');
            expect(alerts[0]?.message).not.toContain('$1,600');
            expect(alerts[0]?.message).not.toContain('more cycle profit');
        });

        it('names twice the best day when it is above the profit target', () => {
            const plan = tptEval();
            expect(2 * 2000).toBeGreaterThan(plan.profitTarget);
            const alerts = evalAlertsOf(plan, 3500, 2000);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('target doubles');
            expect(alerts[0]?.message).toContain('more than $4,000');
            expect(alerts[0]?.message).toContain('twice the $2,000 best day');
            expect(alerts[0]?.message).toContain('$500 more');
            expect(alerts[0]?.message).not.toContain('profit target)');
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
