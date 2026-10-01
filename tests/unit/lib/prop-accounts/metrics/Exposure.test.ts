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
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

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
): ExposureEntry {
    return {
        accountId,
        copyGroupId,
        state: reconstructed(account),
    };
}

function evalAccount(threshold: number): ReconstructedAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: 50_600 - threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: apexPlan,
        resolvedDailyLossLimit: null,
        state: { ...createInitialState(50_000, threshold), balance: 50_600 },
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
            entry('a', evalAccount(45_600)),
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
});
