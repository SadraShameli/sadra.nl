import { describe, expect, it } from 'vitest';

import { AlertKind, AlertSeverity, TierChangeRule } from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import {
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    fraction,
    LivePlan,
    StaticDrawdown,
} from '~/lib/prop-calculator';

import {
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new TierChangeRule();

describe('TierChangeRule', () => {
    it('is silent without a previous snapshot', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan);
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });

    it('is silent when the funded resolved DLL and contract limit are unchanged', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const latest = { ...fundedReconstructed(plan), contractLimit: 5, resolvedDailyLossLimit: 2000 };
        const previous = { ...fundedReconstructed(plan), contractLimit: 5, resolvedDailyLossLimit: 2000 };
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
        });
        expect(alerts).toEqual([]);
    });

    it('fires Info when the funded resolved DLL or contract limit changes', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = { ...fundedReconstructed(plan), contractLimit: 5, resolvedDailyLossLimit: 2000 };
        const latest = { ...fundedReconstructed(plan), contractLimit: 10, resolvedDailyLossLimit: 3000 };
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.TierChange);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
    });

    it('fires Info for a live account whose contract tier moves with profit', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Live },
        );
        const livePlan = tieredLivePlan();
        const previous = liveReconstructed(plan, { livePlan });
        const latest = liveReconstructed(plan, {
            balance: dollars(livePlan.startingBalance + 50_000),
            livePlan,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
    });
});

function tieredLivePlan(): LivePlan {
    return new LivePlan({
        contractLimits: {
            micros: {
                kind: ContractLimitKind.Tiered,
                tiers: [
                    { maxContracts: contracts(5), minBalance: dollars(0) },
                    {
                        maxContracts: contracts(20),
                        minBalance: dollars(50_000),
                    },
                ],
            },
            minis: {
                kind: ContractLimitKind.Tiered,
                tiers: [
                    { maxContracts: contracts(2), minBalance: dollars(0) },
                    {
                        maxContracts: contracts(10),
                        minBalance: dollars(50_000),
                    },
                ],
            },
        },
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Fixture live plan',
        liveDailyLossLimit: {
            kind: DailyLossLimitKind.Tiered,
            tiers: [
                { dailyLossLimit: dollars(1000), maxContracts: contracts(2), minProfit: dollars(0) },
                {
                    dailyLossLimit: dollars(3000),
                    maxContracts: contracts(10),
                    minProfit: dollars(50_000),
                },
            ],
        },
        liveDrawdown: new StaticDrawdown({ amount: dollars(9000) }),
        payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }],
        startingBalance: dollars(10_000),
    });
}
