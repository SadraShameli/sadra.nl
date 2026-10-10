import { describe, expect, it } from 'vitest';

import {
    AccountStateKind,
    type AccountStateResult,
    AccountStateUnavailableKind,
    ExposureBasis,
    type ExposureEntry,
    exposureOf,
    ExposureUnavailableKind,
} from '~/lib/prop-accounts/metrics';
import {
    ApexVariant,
    createInitialState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    SingleDayProfitTrigger,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const SINGLE_DAY_TRIGGER = new SingleDayProfitTrigger(
    dollars(250),
    true,
    false,
    {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic test quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.test/policy',
        verification: PolicyVerification.Confirmed,
    },
);

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function entry(
    accountId: string,
    account: ReconstructedAccount,
    copyGroupId: null | string = null,
    personal: Partial<
        Omit<ExposureEntry, 'accountId' | 'copyGroupId' | 'state'>
    > = {},
): ExposureEntry {
    return {
        accountId,
        copyGroupId,
        state: reconstructed(account),
        ...personal,
    };
}

function evalAccount(): ReconstructedAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: 50_600 - 45_600,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: apexPlan,
        resolvedDailyLossLimit: null,
        state: { ...createInitialState(50_000, 45_600), balance: 50_600 },
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAccount(cushion: number): ReconstructedAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Funded,
        plan: topStepPlan,
        resolvedDailyLossLimit: null,
        state: {
            ...createInitialState(50_000, 50_000),
            balance: 50_000 + cushion,
        },
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function reconstructed(account: ReconstructedAccount): AccountStateResult {
    return {
        kind: AccountStateKind.Reconstructed,
        latest: { asOf: '2026-09-26', reconstructed: account },
        plan: account.plan,
        previous: null,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error('plan missing from the registry');
    return found;
}

const apexPlan = registryPlan(APEX_EOD_ID);
const topStepPlan = registryPlan(TOPSTEP_STANDARD_ID);

describe('exposureOf (PT-26b, F-86)', () => {
    it('reports first-trade risk and the maximum daily loss for a funded account', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(600)),
        ]);

        expect(result.accounts).toHaveLength(1);
        const [account] = result.accounts;
        expect(account?.firstTradeRisk).toBe(250);
        expect(account?.maxDailyLoss).toBe(600);
        expect(account?.cushion).toBe(600);
        expect(account?.shareOfCushionAtRisk).toBe(1);
        expect(account?.basis).toBe(ExposureBasis.DocumentedDollars);
    });

    it('shows the full-ladder day for an eval account, not just the first rung', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', evalAccount()),
        ]);

        const [account] = result.accounts;
        expect(account?.firstTradeRisk).toBe(200);
        expect(account?.maxDailyLoss).toBe(1000);
        expect(account?.shareOfCushionAtRisk).toBeCloseTo(0.2);
    });

    it('passes through an unavailable reconstruction reason', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            {
                accountId: 'a',
                copyGroupId: null,
                state: {
                    kind: AccountStateKind.Unavailable,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            },
        ]);

        expect(result.accounts).toHaveLength(0);
        expect(result.unavailable).toEqual([
            {
                accountId: 'a',
                reason: {
                    kind: ExposureUnavailableKind.Reconstruction,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            },
        ]);
    });

    it('marks a live account as not modeled', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', {
                assumptions: [],
                cushion: null,
                kind: ReconstructedLiveKind.Live,
                livePlan: null,
                plan: topStepPlan,
                state: null,
            }),
        ]);

        expect(result.accounts).toHaveLength(0);
        expect(result.unavailable).toEqual([
            {
                accountId: 'a',
                reason: { kind: ExposureUnavailableKind.LiveNotModeled },
            },
        ]);
    });

    it('treats a copy group as one correlated bet, worst case the sum of its members', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(600), 'group-1'),
            entry('b', fundedAccount(5000), 'group-1'),
            entry('c', fundedAccount(2000), null),
        ]);

        expect(result.groups).toHaveLength(1);
        const [group] = result.groups;
        expect(group?.copyGroupId).toBe('group-1');
        expect(group?.accountIds).toEqual(['a', 'b']);
        expect(group?.maxDailyLoss).toBe(600 + 1000);
        expect(group?.totalCushion).toBe(600 + 5000);
        expect(group?.shareOfCushionAtRisk).toBeCloseTo(1600 / 5600);
    });

    it('applies the account personal daily loss limit to its maximum daily loss and share of cushion', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('capped', fundedAccount(5000), null, {
                personalDll: dollars(300),
            }),
            entry('free', fundedAccount(5000)),
        ]);

        const [capped, free] = result.accounts;
        expect(capped?.maxDailyLoss).toBeLessThanOrEqual(300);
        expect(capped?.maxDailyLoss).toBeGreaterThan(0);
        expect(capped?.firstTradeRisk).toBeLessThanOrEqual(300);
        expect(capped?.shareOfCushionAtRisk).toBeCloseTo(
            (capped?.maxDailyLoss ?? 0) / 5000,
        );
        expect(free?.maxDailyLoss).toBe(1000);
    });

    it('applies a personal daily loss limit to an eval account that has a plan daily loss room', () => {
        const withoutLimit = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', evalAccount()),
        ]);
        const looser = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', evalAccount(), null, {
                personalDll: dollars(5000),
            }),
        ]);
        const tighter = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', evalAccount(), null, {
                personalDll: dollars(300),
            }),
        ]);

        expect(withoutLimit.accounts[0]?.maxDailyLoss).toBe(1000);
        expect(looser.accounts[0]?.maxDailyLoss).toBe(1000);
        expect(tighter.accounts[0]?.maxDailyLoss).toBeLessThanOrEqual(300);
        expect(tighter.accounts[0]?.maxDailyLoss).toBeGreaterThan(0);
    });

    it('applies the personal trades per day cap and the personal risk cap', () => {
        const oneTrade = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(5000), null, {
                personalCaps: { ...NO_PERSONAL_CAPS, maxTradesPerDay: 1 },
            }),
        ]);
        const smallRisk = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(5000), null, {
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    maxRiskPerTrade: dollars(100),
                },
            }),
        ]);

        expect(oneTrade.accounts[0]?.maxDailyLoss).toBe(250);
        expect(smallRisk.accounts[0]?.firstTradeRisk).toBe(100);
        expect(smallRisk.accounts[0]?.maxDailyLoss).toBeLessThan(1000);
    });

    it("applies the firm's verified single-day profit ceiling the way the account sizing does", () => {
        const free = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(5000)),
        ]);
        const priced = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(5000), null, {
                accountPolicy: new StubTriggerPolicy([SINGLE_DAY_TRIGGER]),
                paidPayoutsSinceLastLiveAccount: 0,
            }),
        ]);

        expect(free.accounts[0]?.maxDailyLoss).toBe(1000);
        expect(priced.accounts[0]?.maxDailyLoss).toBeLessThan(1000);
        expect(priced.accounts[0]?.firstTradeRisk).toBeGreaterThan(0);
        expect(priced.accounts[0]?.firstTradeRisk).toBeLessThan(250);
    });

    it('sums the members personal limits into the copy group exposure', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(5000), 'group-1', {
                personalDll: dollars(300),
            }),
            entry('b', fundedAccount(5000), 'group-1'),
        ]);

        const [group] = result.groups;
        const [first] = result.accounts;
        expect(first?.maxDailyLoss).toBeLessThanOrEqual(300);
        expect(group?.maxDailyLoss).toBe((first?.maxDailyLoss ?? 0) + 1000);
    });

    it('names the group members left out because they are unavailable or live', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('ok', fundedAccount(600), 'group-1'),
            entry(
                'live',
                {
                    assumptions: [],
                    cushion: null,
                    kind: ReconstructedLiveKind.Live,
                    livePlan: null,
                    plan: topStepPlan,
                    state: null,
                },
                'group-1',
            ),
            {
                accountId: 'gone',
                copyGroupId: 'group-1',
                state: {
                    kind: AccountStateKind.Unavailable,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            },
            {
                accountId: 'outside',
                copyGroupId: null,
                state: {
                    kind: AccountStateKind.Unavailable,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            },
        ]);

        const [group] = result.groups;
        expect(group?.accountIds).toEqual(['ok']);
        expect(group?.leftOutAccountIds).toEqual(['live', 'gone']);
    });

    it('reports no group row while no member of the group is modeled', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            {
                accountId: 'gone',
                copyGroupId: 'group-1',
                state: {
                    kind: AccountStateKind.Unavailable,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            },
        ]);

        expect(result.groups).toEqual([]);
        expect(result.unavailable.map((row) => row.accountId)).toEqual([
            'gone',
        ]);
    });

    it('leaves no member out of a fully modeled group', () => {
        const result = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(600), 'group-1'),
        ]);

        expect(result.groups[0]?.leftOutAccountIds).toEqual([]);
    });

    it('produces every remaining exposure basis', () => {
        const { accounts } = exposureOf(DEFAULT_RULEBOOK, [
            entry('a', fundedAccount(600)),
            entry('b', evalAccount()),
        ]);
        const produced = new Set(accounts.map((account) => account.basis));

        expect(produced).toEqual(new Set(Object.values(ExposureBasis)));
    });
});
