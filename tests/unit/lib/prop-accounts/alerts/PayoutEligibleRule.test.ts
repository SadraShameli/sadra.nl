import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    PayoutEligibleRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    formatUsdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts/metrics';
import { dollars, minimumPayoutRequest } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf, personalPoliciesFor } from './alertFixtures';

const rule = new PayoutEligibleRule();

function boardRowFor(
    accountId: string,
    entry: ReturnType<typeof reconstructedEntry>,
    personalRequestOverride: number,
    personalRetainedCushion: number,
) {
    const [row] = payoutReadinessBoardOf(
        DEFAULT_RULEBOOK,
        [entry],
        new Map([
            [accountId, { personalRequestOverride, personalRetainedCushion }],
        ]),
    ).rows;
    return row;
}

function eligibleFixtures() {
    const plan = mffProPlan();
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + 20_000,
        cumulativePayout: 0,
        cycleBestDayProfit: 20_000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) {
        throw new Error('expected a funded tracker');
    }
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return {
        account,
        entry: reconstructedEntry(account.id, plan, funded),
    };
}

describe('PayoutEligibleRule', () => {
    it('is info-only when the account is eligible for its effective payout request', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PayoutEligible);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
    });

    it('is silent on any blocking gate, including a pending payout', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const freshlyFunded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, freshlyFunded),
            ],
        });
        expect(alerts).toEqual([]);
    });

    it('is silent for an eval account (no funded payout to be eligible for)', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Eval },
        );
        const evalAccount = evalReconstructed(plan);
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, evalAccount)],
        });
        expect(alerts).toEqual([]);
    });

    it('discloses that live triggers are not checked when a live account is eligible', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Live },
        );
        const probe = liveReconstructed(plan);
        if (probe.state === null) throw new Error('expected a live state');
        const live = liveReconstructed(plan, {
            balance: probe.state.startingBalance + 50_000,
        });
        if (live.state === null) throw new Error('expected a live state');
        live.state.qualifyingDays = 5;
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, live)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
    });

    it('names the firm minimum payout request when it raises the request above the personal target', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            payout: { ...DEFAULT_RULEBOOK.payout, requestCents: 100 },
        };
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
            rulebook,
        });
        expect(alerts).toHaveLength(1);
        const minimum = formatUsdCents(
            usdCentsFromDollars(minimumPayoutRequest(plan)),
        );
        const target = formatUsdCents(usdCentsFromDollars(1));
        expect(alerts[0]?.message).toContain(`Eligible to request ${minimum}`);
        expect(alerts[0]?.message).toContain(`firm's minimum payout request`);
        expect(alerts[0]?.message).toContain(target);
    });

    it('discloses that live triggers were not checked for a funded account whose firm has no verified trigger', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
    });

    describe('an account with personal payout rules', () => {
        it('requests the same amount as the readiness board for a personal override and retained cushion', () => {
            const { account, entry } = eligibleFixtures();
            const row = boardRowFor(account.id, entry, 2000, 3000);
            if (row?.kind !== PayoutReadinessRowKind.Eligible) {
                throw new Error('expected an eligible board row');
            }
            const requested = formatUsdCents(row.requestedAmountCents);
            expect(requested).toBe(formatUsdCents(usdCentsFromDollars(2000)));
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                personalPolicies: personalPoliciesFor(account, {
                    payoutRequestOverride: dollars(2000),
                    retainedCushionRequest: dollars(3000),
                }),
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).toContain(
                `Eligible to request ${requested}`,
            );
            expect(alerts[0]?.message).toContain(
                'your personal payout request',
            );
            expect(alerts[0]?.message).toContain(
                `retaining ${formatUsdCents(usdCentsFromDollars(3000))} as your personal retained cushion`,
            );
        });

        it('names no personal rule when the account has no personal policy', () => {
            const { account, entry } = eligibleFixtures();
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).not.toContain('personal');
        });

        it('names only the personal request when the cushion is not personal', () => {
            const { account, entry } = eligibleFixtures();
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                personalPolicies: personalPoliciesFor(account, {
                    payoutRequestOverride: dollars(2000),
                }),
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).toContain(
                'your personal payout request',
            );
            expect(alerts[0]?.message).not.toContain('retained cushion');
        });

        it('stays silent when the personal retained cushion blocks the board row', () => {
            const { account, entry } = eligibleFixtures();
            const row = boardRowFor(account.id, entry, 2000, 30_000);
            expect(row?.kind).toBe(PayoutReadinessRowKind.Blocked);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                personalPolicies: personalPoliciesFor(account, {
                    payoutRequestOverride: dollars(2000),
                    retainedCushionRequest: dollars(30_000),
                }),
            });
            expect(alerts).toEqual([]);
        });

        it('keeps the rulebook amount for an account with no personal policy', () => {
            const { account, entry } = eligibleFixtures();
            const other = accountFor(
                { firmId: mffProPlan().id.firm, plan: mffProPlan() },
                { stage: AccountStage.Funded },
            );
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                personalPolicies: personalPoliciesFor(other, {
                    payoutRequestOverride: dollars(2000),
                }),
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).not.toContain(
                formatUsdCents(usdCentsFromDollars(2000)),
            );
        });

        it('applies the personal override to a live account', () => {
            const plan = mffProPlan();
            const account = accountFor(
                { firmId: plan.id.firm, plan },
                { stage: AccountStage.Live },
            );
            const probe = liveReconstructed(plan);
            if (probe.state === null) throw new Error('expected a live state');
            const live = liveReconstructed(plan, {
                balance: probe.state.startingBalance + 50_000,
            });
            if (live.state === null) throw new Error('expected a live state');
            live.state.qualifyingDays = 5;
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [reconstructedEntry(account.id, plan, live)],
                personalPolicies: personalPoliciesFor(account, {
                    payoutRequestOverride: dollars(2000),
                }),
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).toContain(
                `Eligible to request ${formatUsdCents(usdCentsFromDollars(2000))}`,
            );
        });
    });
});
