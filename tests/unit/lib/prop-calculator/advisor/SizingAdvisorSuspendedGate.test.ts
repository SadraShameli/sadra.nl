import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    buildMffuRapidLivePlan,
    dollars,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    type LiveAccountState,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountSubstate,
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';

const ZERO_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const MFF_RAPID_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
};

const TOPSTEP_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const evalPlan = registryPlan(APEX_EOD_ID);
const fundedPlan = registryPlan(TOPSTEP_ID);
const livePlanOwner = registryPlan(MFF_RAPID_ID);
const liveRulePlan = buildMffuRapidLivePlan(
    DEFAULT_RULEBOOK.live.cushionPercent,
);

function evalAccount(): ReconstructedAccount {
    const state = evalState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: evalPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function evalState(): AccountState {
    return {
        ...fundedState(),
        balance: 52_000,
        elapsedDays: 0,
        qualifyingDays: 0,
        threshold: 50_000,
        tradingDays: 0,
    };
}

function fundedAccount(): ReconstructedAccount {
    const state = fundedState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: fundedTracker(state),
        kind: TradingPhase.Funded,
        plan: fundedPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedState(): AccountState {
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
    };
}

function fundedTracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

function liveAccount(): ReconstructedAccount {
    const state = liveState();
    return {
        assumptions: [],
        cushion: state.balance - state.threshold,
        kind: ReconstructedLiveKind.Live,
        livePlan: liveRulePlan,
        plan: livePlanOwner,
        state,
    };
}

function liveState(): LiveAccountState {
    return {
        ...liveRulePlan.initialState(),
        balance: 54_000,
        threshold: 50_000,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const STAGES: readonly {
    readonly account: () => ReconstructedAccount;
    readonly label: string;
}[] = [
    { account: evalAccount, label: 'eval' },
    { account: fundedAccount, label: 'funded' },
    { account: liveAccount, label: 'live' },
];

function advisorFor(
    account: ReconstructedAccount,
    substate: AccountSubstate.Suspended | null = null,
): SizingAdvisor {
    return createSizingAdvisor(account, {
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        sims: 50,
        snapshotAsOf: '2026-09-26',
        substate,
        today: '2026-09-26',
        trials: 20,
    });
}

describe('createSizingAdvisor substate gate for every stage (PT-19h, F-118)', () => {
    for (const { account, label } of STAGES) {
        describe(label, () => {
            it('gives a Suspended account no sizing, no daily card, no risk check and no payout advice', () => {
                const advisor = advisorFor(
                    account(),
                    AccountSubstate.Suspended,
                );

                const advice = advisor.assemble([]);

                expect(advisor.documented()).toBeNull();
                expect(advisor.dailyPlanCard()).toBeNull();
                expect(
                    advisor.checkNextTradeRisk(dollars(100), ZERO_DAY),
                ).toBeNull();
                expect(advice.documented).toBeNull();
                expect(advice.dailyPlanCard).toBeNull();
                expect(advice.payoutAdvice).toBeNull();
            });

            it('gives a Suspended account zero affordable risk and runs no engine request', () => {
                const advisor = advisorFor(
                    account(),
                    AccountSubstate.Suspended,
                );

                expect(advisor.caps().affordable).toBe(0);
                expect(advisor.optimumRequests()).toEqual([]);
                expect(advisor.assemble([]).requests).toEqual([]);
            });

            it('still sizes the same account when no substate is given', () => {
                const advisor = advisorFor(account());

                const advice = advisor.assemble([]);

                expect(advice.documented).not.toBeNull();
                expect(advisor.caps().affordable).toBeGreaterThan(0);
                expect(
                    advice.differenceReasons.some(
                        (reason) => reason.kind === DifferenceReason.Suspended,
                    ),
                ).toBe(false);
            });

            it('says why as one bare Suspended reason with readable text, not a refusal with free text', () => {
                const advice = advisorFor(
                    account(),
                    AccountSubstate.Suspended,
                ).assemble([]);

                expect(advice.differenceReasons).toEqual([
                    { kind: DifferenceReason.Suspended },
                ]);
                expect(
                    differenceReasonText({ kind: DifferenceReason.Suspended }),
                ).toContain('suspended');
            });
        });
    }

    it('proves the funded fixture would otherwise carry payout advice and optimum requests', () => {
        const advisor = advisorFor(fundedAccount());

        expect(advisor.assemble([]).payoutAdvice).not.toBeNull();
        expect(advisor.optimumRequests().length).toBeGreaterThan(0);
        expect(advisorFor(evalAccount()).optimumRequests().length).toBe(1);
    });
});
