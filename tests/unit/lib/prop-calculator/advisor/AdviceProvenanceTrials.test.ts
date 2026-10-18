import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    buildMffuRapidLivePlan,
    findFirm,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    LiveSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
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

const MFF_RAPID_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
};

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const at = state({
        balance: 52_000,
        elapsedDays: 0,
        qualifyingDays: 0,
        threshold: 50_000,
        tradingDays: 0,
    });
    return {
        assumptions: [],
        contractLimit: null,
        cushion: at.balance - at.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(APEX_EOD_ID),
        resolvedDailyLossLimit: null,
        state: at,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const at = state();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: at.balance - at.threshold,
        fundedTracker: newFundedCycleTracker({
            ...at,
            balance: at.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan: registryPlan(TOPSTEP_STANDARD_ID),
        resolvedDailyLossLimit: null,
        state: at,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function state(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
        ...overrides,
    };
}

const FRESH = {
    rulebook: DEFAULT_RULEBOOK,
    snapshotAsOf: '2026-09-26',
    substate: null,
    today: '2026-09-26',
};

const STALE = { ...FRESH, snapshotAsOf: '2026-01-01' };

describe('advice provenance carries the trials and seed of its engine requests (PT-104, F-126)', () => {
    it('reports the trials and seed of a funded advice built with 1,000 trials at seed 42', () => {
        const advisor = new FundedSizingAdvisor({
            ...FRESH,
            account: fundedAccount(),
            fundedHorizonDays: 252,
            seed: 42,
            trials: 1000,
        });

        const { provenance } = advisor.assemble([]);

        expect(provenance.trials).toBe(1000);
        expect(provenance.seed).toBe(42);
        expect(provenance.solverVersion).toBeNull();
    });

    it('reports the requested seed, not the default one', () => {
        const advisor = new FundedSizingAdvisor({
            ...FRESH,
            account: fundedAccount(),
            fundedHorizonDays: 252,
            seed: 7,
            trials: 300,
        });

        const { provenance } = advisor.assemble([]);

        expect(provenance.trials).toBe(300);
        expect(provenance.seed).toBe(7);
    });

    it('reports the default trials and seed when none were given', () => {
        const advisor = new FundedSizingAdvisor({
            ...FRESH,
            account: fundedAccount(),
            fundedHorizonDays: 252,
        });

        const { provenance } = advisor.assemble([]);

        expect(provenance.trials).toBeGreaterThan(0);
        expect(provenance.seed).not.toBeNull();
    });

    it("reports an eval advice's ladder request sims and seed", () => {
        const advisor = new EvalSizingAdvisor({
            ...FRESH,
            account: evalAccount(),
            maxEvalDays: 150,
            seed: 11,
            sims: 600,
        });

        const { provenance } = advisor.assemble([]);

        expect(provenance.trials).toBe(600);
        expect(provenance.seed).toBe(11);
    });

    it('reports null for a stale advice, which sends no engine request', () => {
        const funded = new FundedSizingAdvisor({
            ...STALE,
            account: fundedAccount(),
            fundedHorizonDays: 252,
            seed: 42,
            trials: 1000,
        }).assemble([]);
        const evalAdvice = new EvalSizingAdvisor({
            ...STALE,
            account: evalAccount(),
            maxEvalDays: 150,
            seed: 11,
            sims: 600,
        }).assemble([]);

        for (const advice of [funded, evalAdvice]) {
            expect(advice.provenance.trials).toBeNull();
            expect(advice.provenance.seed).toBeNull();
        }
    });

    it('reports null for a live advice, which has no engine request', () => {
        const livePlan = buildMffuRapidLivePlan(
            DEFAULT_RULEBOOK.live.cushionPercent,
        );
        const advice = new LiveSizingAdvisor({
            ...FRESH,
            account: {
                assumptions: [],
                cushion: 4000,
                kind: ReconstructedLiveKind.Live,
                livePlan,
                plan: registryPlan(MFF_RAPID_ID),
                state: {
                    ...livePlan.initialState(),
                    balance: 54_000,
                    threshold: 50_000,
                },
            },
        }).assemble([]);

        expect(advice.provenance.trials).toBeNull();
        expect(advice.provenance.seed).toBeNull();
    });
});
