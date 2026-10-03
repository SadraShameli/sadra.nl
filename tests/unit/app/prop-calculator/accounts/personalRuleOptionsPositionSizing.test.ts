import { describe, expect, it } from 'vitest';

import {
    buildSizingAdvisor,
    personalAdvisorOptionsOf,
    SizingAdvisorBuildKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { AccountStatus } from '~/lib/prop-accounts';
import {
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    ReconstructedLiveKind,
    RungPlacement,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const TODAY = '2026-03-02';

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
} as const;

const NQ_AT_500_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 500,
} as const;

const FUNDED_SNAPSHOT: AccountSnapshotInput = {
    asOf: TODAY,
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

const EVAL_SNAPSHOT: AccountSnapshotInput = {
    asOf: TODAY,
    balance: dollars(51_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    highestEodBalance: dollars(51_000),
    highestIntradayBalance: dollars(51_000),
    payoutsTaken: 0,
    purchasedOn: '2026-02-01',
    stage: SizingStage.Eval,
    tradingDays: 10,
};

const LIVE_SNAPSHOT: AccountSnapshotInput = {
    asOf: TODAY,
    balance: dollars(51_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    payoutsTaken: 1,
    stage: SizingStage.Live,
    tradingDays: 12,
};

function optionsFor(
    snapshot: AccountSnapshotInput,
    positionSizing: null | typeof NQ_AT_20_POINTS | typeof NQ_AT_500_POINTS | undefined,
) {
    const plan = topStepPlan();
    const account = AccountReconstruction.rebuild(
        snapshot,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    const options = personalAdvisorOptionsOf({
        account,
        measuredRebuyLag: null,
        paidPayoutsSinceLastLiveAccount: null,
        personalRules: null,
        plan,
        ...(positionSizing !== undefined && { positionSizing }),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: snapshot.asOf,
        status: AccountStatus.Active,
        today: TODAY,
    });
    return { account, options };
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

describe('personalAdvisorOptionsOf passes the entered instrument and stop to a funded advisor (PT-36k, F-154)', () => {
    it('carries the entered position sizing into the advisor options of a funded account', () => {
        const { options } = optionsFor(FUNDED_SNAPSHOT, NQ_AT_20_POINTS);

        expect(options.positionSizing).toEqual(NQ_AT_20_POINTS);
    });

    it('builds a funded advisor whose daily card flags a rung below one contract at the entered stop', () => {
        const { account, options } = optionsFor(
            FUNDED_SNAPSHOT,
            NQ_AT_20_POINTS,
        );
        const build = buildSizingAdvisor(account, options);
        if (build.kind !== SizingAdvisorBuildKind.Ready) {
            throw new Error('expected an advisor');
        }

        const card = build.advisor.dailyPlanCard();

        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toEqual(
            card?.rungs.map(() => RungPlacement.BelowOneContract),
        );
    });

    it('carries no position sizing when none was entered', () => {
        expect(optionsFor(FUNDED_SNAPSHOT, null).options.positionSizing).toBe(
            null,
        );
        expect(
            optionsFor(FUNDED_SNAPSHOT, undefined).options.positionSizing,
        ).toBe(null);
    });

    it('carries the entered position sizing into the advisor options of a live account (PT-73c addendum B)', () => {
        const { account, options } = optionsFor(LIVE_SNAPSHOT, NQ_AT_20_POINTS);

        expect(account.kind).toBe(ReconstructedLiveKind.Live);
        expect(options.positionSizing).toEqual(NQ_AT_20_POINTS);
    });

    it('builds a live advisor whose daily card flags a rung below one contract at the entered stop (PT-73c addendum B)', () => {
        const { account, options } = optionsFor(
            LIVE_SNAPSHOT,
            NQ_AT_500_POINTS,
        );
        const build = buildSizingAdvisor(account, options);
        if (build.kind !== SizingAdvisorBuildKind.Ready) {
            throw new Error('expected an advisor');
        }

        const card = build.advisor.dailyPlanCard();

        expect(card?.oneContractRisk).toBe(10_000);
        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toEqual(
            card?.rungs.map(() => RungPlacement.BelowOneContract),
        );
    });

    it('never passes the entered stop to an evaluation advisor', () => {
        const { options } = optionsFor(EVAL_SNAPSHOT, NQ_AT_20_POINTS);

        expect(options.positionSizing).toBe(null);
    });
});
