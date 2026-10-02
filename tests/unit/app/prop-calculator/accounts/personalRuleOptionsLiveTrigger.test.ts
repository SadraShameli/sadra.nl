import { describe, expect, it } from 'vitest';

import {
    buildSizingAdvisor,
    personalAdvisorOptionsOf,
    readinessBoardInputsOf,
    readinessOverridesOf,
    SizingAdvisorBuildKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import {
    AccountStatus,
    type FirmPayoutCount,
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts';
import {
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    LiveTriggerCoverage,
    LiveTriggerScope,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../../../lib/prop-accounts/reconstructionFixtures';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function topStepPlan(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K plan missing');
    return found;
}

function withPolicy<T>(
    plan: Plan,
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    const firm = findFirm(plan.id.firm) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy(triggers);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

const FUNDED_SNAPSHOT: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(56_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    firstFundedTradeOn: '2025-12-01',
    fundedOn: '2025-12-01',
    highestEodBalance: dollars(56_000),
    highestIntradayBalance: dollars(56_000),
    payoutsTaken: 0,
    qualifyingDaysSinceLastPayout: 30,
    stage: SizingStage.Funded,
    tradingDays: 40,
};

function payoutDecisionFor(paidPayoutsSinceLastLiveAccount: null | number) {
    const plan = topStepPlan();
    const account = AccountReconstruction.rebuild(FUNDED_SNAPSHOT, plan);
    const build = buildSizingAdvisor(
        account,
        personalAdvisorOptionsOf({
            account,
            measuredRebuyLag: null,
            paidPayoutsSinceLastLiveAccount,
            personalRules: null,
            plan,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: FUNDED_SNAPSHOT.asOf,
            status: AccountStatus.Active,
            today: '2026-03-02',
        }),
    );
    if (build.kind !== SizingAdvisorBuildKind.Ready) {
        throw new Error('expected an advisor');
    }
    return build.advisor.assemble([]).payoutAdvice;
}

describe('personalAdvisorOptionsOf passes the firm payout count to the advisor (PT-36g, F-145)', () => {
    const triggers = [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)];

    it('blocks the payout as one that goes live once the firm count is one under a verified firm-total trigger', () => {
        const advice = withPolicy(topStepPlan(), triggers, () =>
            payoutDecisionFor(9),
        );
        expect(advice?.documented).toMatchObject({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: { payoutsTaken: 9, scope: LiveTriggerScope.Firm },
            },
        });
        expect(advice?.assumptions).toEqual([]);
    });

    it('does not block under the verified firm-total trigger while the count is lower', () => {
        const advice = withPolicy(topStepPlan(), triggers, () =>
            payoutDecisionFor(3),
        );
        expect(advice?.documented.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('says the live triggers were not checked when the firm count is unknown', () => {
        const advice = withPolicy(topStepPlan(), triggers, () =>
            payoutDecisionFor(null),
        );
        expect(advice?.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(advice?.assumptions.length).toBeGreaterThan(0);
    });
});

describe('readinessOverridesOf carries the firm payout count of each account (PT-36g, F-145)', () => {
    const counts: readonly FirmPayoutCount[] = [
        {
            firmId: FirmId.TopStep,
            paidPayoutsSinceLastLiveAccount: 4,
            sinceOn: null,
        },
    ];

    it('looks the count up by the account firm and leaves an unknown firm unset', () => {
        const overrides = readinessOverridesOf(
            [
                { firmId: FirmId.TopStep, id: 'topstep', personalRules: null },
                { firmId: FirmId.Mffu, id: 'mffu', personalRules: null },
                { firmId: null, id: 'external', personalRules: null },
            ],
            counts,
        );
        expect(overrides.get('topstep')?.paidPayoutsSinceLastLiveAccount).toBe(
            4,
        );
        expect(
            overrides.get('mffu')?.paidPayoutsSinceLastLiveAccount,
        ).toBeNull();
        expect(
            overrides.get('external')?.paidPayoutsSinceLastLiveAccount,
        ).toBeNull();
    });
});

describe('readinessBoardInputsOf (PT-36g, F-145 and the PT-19i suspended addendum)', () => {
    const plan = mffProPlan();

    function eligibleEntry(accountId: string) {
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        if (funded.fundedTracker === null) throw new Error('no tracker');
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        return reconstructedEntry(accountId, plan, funded);
    }

    const accounts = [
        {
            firmId: plan.id.firm,
            id: 'active',
            personalRules: null,
            status: AccountStatus.Active,
        },
        {
            firmId: plan.id.firm,
            id: 'suspended',
            personalRules: null,
            status: AccountStatus.Suspended,
        },
    ];
    const states = [eligibleEntry('active'), eligibleEntry('suspended')];

    function boardWith(firmCounts: readonly FirmPayoutCount[]) {
        const inputs = readinessBoardInputsOf(accounts, states, firmCounts);
        return payoutReadinessBoardOf(
            DEFAULT_RULEBOOK,
            inputs.states,
            inputs.overrides,
        );
    }

    it('leaves a suspended account out of the board, rows and not-applicable list alike', () => {
        const board = boardWith([]);
        expect(board.rows.map((row) => row.accountId)).toEqual(['active']);
        expect(board.notApplicable).toEqual([]);
    });

    it('blocks the funded row on the firm-wide count and says so in words when the count is unknown', () => {
        const triggers = [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)];
        const known = withPolicy(plan, triggers, () =>
            boardWith([
                {
                    firmId: plan.id.firm,
                    paidPayoutsSinceLastLiveAccount: 9,
                    sinceOn: null,
                },
            ]),
        );
        expect(known.rows[0]).toMatchObject({
            kind: PayoutReadinessRowKind.Blocked,
            reason: { kind: PayoutBlockReasonKind.WouldTriggerLive },
        });
        const unknown = withPolicy(plan, triggers, () => boardWith([]));
        expect(unknown.rows[0]).toMatchObject({
            kind: PayoutReadinessRowKind.Eligible,
            liveTriggerCoverage: LiveTriggerCoverage.NotChecked,
        });
    });
});
