import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    NearFloorRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import { documentedFundedRiskOf } from '~/lib/prop-accounts/metrics';
import { TradingPhase } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new NearFloorRule();

describe('NearFloorRule', () => {
    it('fires for a funded account below the near-floor risk multiple', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const probe = fundedReconstructed(plan, { balance: plan.accountSize });
        const threshold = probe.state.threshold;
        const multiple = DEFAULT_RULEBOOK.alerts.fundedNearFloorRiskMultiple;
        const funded = fundedReconstructed(plan, {
            balance: threshold + documentedRisk * multiple * 0.5,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({
            kind: AlertKind.NearFloor,
            severity: AlertSeverity.Warning,
        });
    });

    it('does not fire for a funded account near the rulebook risk floor when its smaller personal max risk per trade is not breached', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const personalMaxRiskPerTrade = documentedRisk / 4;
        const multiple = DEFAULT_RULEBOOK.alerts.fundedNearFloorRiskMultiple;
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const probe = fundedReconstructed(plan, { balance: plan.accountSize });
        const threshold = probe.state.threshold;
        const funded = {
            ...fundedReconstructed(plan, {
                balance: threshold + documentedRisk * multiple * 0.5,
            }),
            personalMaxRiskPerTrade,
        };
        expect(funded.cushion / personalMaxRiskPerTrade).toBeGreaterThan(
            multiple,
        );
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });

    it('fires against the personal max risk per trade and names it in the message when it is the smaller basis', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const personalMaxRiskPerTrade = documentedRisk / 4;
        const multiple = DEFAULT_RULEBOOK.alerts.fundedNearFloorRiskMultiple;
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const probe = fundedReconstructed(plan, { balance: plan.accountSize });
        const threshold = probe.state.threshold;
        const funded = {
            ...fundedReconstructed(plan, {
                balance: threshold + personalMaxRiskPerTrade * multiple * 0.5,
            }),
            personalMaxRiskPerTrade,
        };
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('the personal max risk per trade');
    });

    it('does not fire for a funded account exactly at the near-floor multiple', () => {
        const plan = mffProPlan();
        const documentedRisk = documentedFundedRiskOf(DEFAULT_RULEBOOK);
        const multiple = DEFAULT_RULEBOOK.alerts.fundedNearFloorRiskMultiple;
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const probe = fundedReconstructed(plan, { balance: plan.accountSize });
        const threshold = probe.state.threshold;
        const exact = fundedReconstructed(plan, {
            balance: threshold + documentedRisk * multiple,
        });
        expect(exact.cushion / documentedRisk).toBeCloseTo(multiple, 6);
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, exact)],
        });
        expect(alerts).toEqual([]);
    });

    it('fires for an eval account below the near-floor drawdown fraction', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Eval },
        );
        const evalDrawdown = plan.drawdownFor(TradingPhase.Eval).amount;
        const probe = evalReconstructed(plan, { balance: plan.accountSize });
        const threshold = probe.state.threshold;
        const fraction = DEFAULT_RULEBOOK.alerts.evalNearFloorDrawdownFraction;
        const evalAccount = evalReconstructed(plan, {
            balance: threshold + evalDrawdown * fraction * 0.5,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, evalAccount)],
        });
        expect(alerts).toHaveLength(1);
    });

    it('fires for a live account below its retained cushion', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Live },
        );
        const live = liveReconstructed(plan);
        const belowRetained = {
            ...live,
            cushion: (live.livePlan?.defaultRetainedCushion() ?? 0) - 1,
        };
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, belowRetained),
            ],
        });
        expect(alerts).toHaveLength(1);
    });

    it('is silent when the account state is not reconstructed', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [],
        });
        expect(alerts).toEqual([]);
    });
});
