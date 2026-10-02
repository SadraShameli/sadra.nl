import { describe, expect, it } from 'vitest';

import {
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    overviewPlanOptInsOf,
    type OverviewRequest,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { valueSpecOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import {
    accountFromStateRequestOf,
    personalAccountRequestOf,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { usdCents } from '~/lib/prop-accounts';
import {
    type AccountState,
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    buildEnginePolicy,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { valueAtState } from '~/lib/prop-calculator/advisor/value';

function adviceOf(account: ReconstructedFundedOrEvalAccount) {
    return new EvalSizingAdvisor({
        account,
        maxEvalDays: 30,
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).assemble([]);
}

function apexEod(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex Eod 50K plan missing');
    return plan;
}

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 52_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion: 2000,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: apexEod(),
        resolvedDailyLossLimit: null,
        state,
    };
}

function requestOf(): OverviewRequest {
    return {
        firmId: FirmId.Apex,
        kind: OverviewRequestKind.AccountFromState,
        optIns: overviewPlanOptInsOf(apexEod()),
        planSerial: serializePlanId(apexEod().id),
        spec: specOf(),
    };
}

function specOf(): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 40,
        plan: apexEod(),
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        enginePolicy: policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 30, seed: 1, trials: 10 },
    };
}

const PERSONAL_RULES = {
    dailyLossLimitCents: usdCents(60_000),
    dailyProfitCapCents: usdCents(50_000),
    maxTradesPerDay: 2,
};

const FUNDED: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(52_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    firstFundedTradeOn: '2026-01-05',
    highestEodBalance: dollars(52_000),
    highestIntradayBalance: dollars(52_000),
    payoutsTaken: 0,
    stage: SizingStage.Funded,
    tradingDays: 12,
};

describe('the personal limits reach the engine policy of every request the panel and the lists send (PT-68f, F-V16)', () => {
    it('carries the personal caps and the personal daily loss limit through personalAccountRequestOf', () => {
        const request = personalAccountRequestOf(
            requestOf(),
            PERSONAL_RULES,
            dollars(150),
        );

        expect(request.spec.enginePolicy.personalCaps).toEqual({
            dailyProfitCap: 500,
            maxRiskPerTrade: 150,
            maxTradesPerDay: 2,
        });
        expect(request.spec.enginePolicy.personalDll).toBe(600);
    });

    it('carries the personal max risk alone when the rules set nothing else', () => {
        const request = personalAccountRequestOf(requestOf(), {}, dollars(150));

        expect(request.spec.enginePolicy.personalCaps).toEqual({
            ...NO_PERSONAL_CAPS,
            maxRiskPerTrade: 150,
        });
        expect('personalDll' in request.spec.enginePolicy).toBe(false);
    });

    it('still returns the request unchanged when there are no personal limits at all', () => {
        const request = requestOf();

        expect(personalAccountRequestOf(request, {}, null)).toBe(request);
        expect(personalAccountRequestOf(request, null, null)).toBe(request);
    });

    it('carries the limits through accountFromStateRequestOf', () => {
        const request = accountFromStateRequestOf({
            account: FUNDED,
            measuredRebuyLag: null,
            personalMaxRiskPerTrade: dollars(150),
            personalRules: PERSONAL_RULES,
            plan: apexEod(),
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(request?.spec.enginePolicy.personalCaps?.maxRiskPerTrade).toBe(
            150,
        );
        expect(request?.spec.enginePolicy.personalDll).toBe(600);
    });

    it('withPersonalPolicy merges explicit limits and stays the identity without them', () => {
        const spec = specOf();
        const merged = withPersonalPolicy(spec, {
            payoutRequestOverride: null,
            personalCaps: { ...NO_PERSONAL_CAPS, maxTradesPerDay: 3 },
            personalDll: dollars(400),
            retainedCushionRequest: null,
        });

        expect(merged.enginePolicy.personalCaps?.maxTradesPerDay).toBe(3);
        expect(merged.enginePolicy.personalDll).toBe(400);
        expect(
            withPersonalPolicy(spec, {
                payoutRequestOverride: null,
                personalCaps: NO_PERSONAL_CAPS,
                personalDll: null,
                retainedCushionRequest: null,
            }),
        ).toBe(spec);
    });
});

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const plan = apexEod();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance += 2500;
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function fundedValueSpec(
    rulebook: RulebookParameters,
    personalCaps: PersonalCaps,
) {
    const account = fundedAccount();
    return valueSpecOf({
        account,
        advice: new FundedSizingAdvisor({
            account,
            fundedHorizonDays: 40,
            rulebook,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        }).assemble([]),
        personalCaps,
        personalDll: null,
        plan: apexEod(),
        rulebook,
    });
}

function valueSpec(
    personalCaps: Parameters<typeof valueSpecOf>[0]['personalCaps'],
    personalDll: Parameters<typeof valueSpecOf>[0]['personalDll'] = null,
) {
    const account = evalAccount();
    return valueSpecOf({
        account,
        advice: adviceOf(account),
        personalCaps,
        personalDll,
        plan: apexEod(),
        rulebook: DEFAULT_RULEBOOK,
    });
}

describe('valueSpecOf simulates the value figures at the personal limits (PT-68f, F-V16)', () => {
    it('puts the caps and the personal daily loss limit on the value spec', () => {
        const spec = valueSpec(
            { ...NO_PERSONAL_CAPS, maxRiskPerTrade: dollars(150) },
            dollars(600),
        );

        expect(spec.enginePolicy.personalCaps?.maxRiskPerTrade).toBe(150);
        expect(spec.enginePolicy.personalDll).toBe(600);
    });

    it('prices an eval account at the capped rungs: a cap above every rung changes nothing, a cap of $150 does', () => {
        const account = evalAccount();
        const uncapped = valueAtState(account, valueSpec(NO_PERSONAL_CAPS));
        const loose = valueAtState(
            account,
            valueSpec({ ...NO_PERSONAL_CAPS, maxRiskPerTrade: dollars(5000) }),
        );
        const capped = valueAtState(
            account,
            valueSpec({ ...NO_PERSONAL_CAPS, maxRiskPerTrade: dollars(150) }),
        );

        expect(loose).toEqual(uncapped);
        expect(capped).not.toEqual(uncapped);
    });

    it('prices a funded account exactly as a $100 rulebook funded risk when the personal max risk is $100', () => {
        const account = fundedAccount();
        const hundredRulebook = {
            ...DEFAULT_RULEBOOK,
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                riskCents: 10_000,
                takeProfitCents: 20_000,
            },
        };
        const capped = valueAtState(
            account,
            fundedValueSpec(DEFAULT_RULEBOOK, {
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(100),
            }),
        );
        const handCapped = valueAtState(
            account,
            fundedValueSpec(hundredRulebook, NO_PERSONAL_CAPS),
        );
        const uncapped = valueAtState(
            account,
            fundedValueSpec(DEFAULT_RULEBOOK, NO_PERSONAL_CAPS),
        );

        expect(capped).toEqual(handCapped);
        expect(capped).not.toEqual(uncapped);
    });

    it('prices a funded account with a max risk above the rulebook risk exactly as the account with no limit', () => {
        const account = fundedAccount();
        const loose = valueAtState(
            account,
            fundedValueSpec(DEFAULT_RULEBOOK, {
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(5000),
                maxTradesPerDay: 99,
            }),
        );
        const plain = valueAtState(
            account,
            fundedValueSpec(DEFAULT_RULEBOOK, NO_PERSONAL_CAPS),
        );

        expect(loose).toEqual(plain);
    });
});

function workerRequestOf(spec: DocumentedPolicySpec): AdvisorWorkerRequest {
    return {
        firmId: FirmId.Apex,
        optIns: overviewPlanOptInsOf(apexEod()),
        planSerial: serializePlanId(apexEod().id),
        requests: [],
        values: {
            candidateRiskGrid: [100],
            payoutStake: null,
            rr: 2,
            rungs: [{ risk: 100, rr: 2 }],
            spec,
            start: { phase: TradingPhase.Eval, state: evalAccount().state },
        },
    };
}

describe('the advisor worker cache key includes the personal limits (PT-68f, F-V16)', () => {
    it('keys a capped request differently from the uncapped one, and each limit differently', () => {
        const base = specOf();
        const variants = [
            base,
            withPersonalPolicy(base, {
                payoutRequestOverride: null,
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    maxRiskPerTrade: dollars(150),
                },
                retainedCushionRequest: null,
            }),
            withPersonalPolicy(base, {
                payoutRequestOverride: null,
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    dailyProfitCap: dollars(500),
                },
                retainedCushionRequest: null,
            }),
            withPersonalPolicy(base, {
                payoutRequestOverride: null,
                personalCaps: { ...NO_PERSONAL_CAPS, maxTradesPerDay: 2 },
                retainedCushionRequest: null,
            }),
            withPersonalPolicy(base, {
                payoutRequestOverride: null,
                personalDll: dollars(600),
                retainedCushionRequest: null,
            }),
        ].map((spec) => advisorWorkerCacheKey(workerRequestOf(spec)));

        expect(new Set(variants).size).toBe(variants.length);
    });
});
