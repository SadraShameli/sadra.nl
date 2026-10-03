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
    type Advice,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    LiveSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    RuleSource,
} from '~/lib/prop-calculator/advisor';

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const APEX_EOD = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const TOPSTEP = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});
const MFF_RAPID = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
});

const livePlan = buildMffuRapidLivePlan(DEFAULT_RULEBOOK.live.cushionPercent);

const DEVIATING_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    payout: {
        ...DEFAULT_RULEBOOK.payout,
        allowBelowHardRule2: true,
        retainedCushionCents: 100_000,
    },
};

const CUSTOM_HEADLINE = `your custom rule (differs from ${RuleSource.HardRule2})`;
const DOCUMENTED_HEADLINE = 'your documented rule';

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const at = state({
        balance: 52_000,
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
        plan: APEX_EOD,
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
        plan: TOPSTEP,
        resolvedDailyLossLimit: null,
        state: at,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function state(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
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

const COMMON = {
    snapshotAsOf: '2026-09-26',
    substate: null,
    today: '2026-09-26',
};

const ADVICE_OF: readonly (readonly [
    string,
    (rulebook: RulebookParameters) => Advice,
])[] = [
    [
        'eval',
        (rulebook) =>
            new EvalSizingAdvisor({
                ...COMMON,
                account: evalAccount(),
                maxEvalDays: 150,
                rulebook,
            }).assemble([]),
    ],
    [
        'funded',
        (rulebook) =>
            new FundedSizingAdvisor({
                ...COMMON,
                account: fundedAccount(),
                fundedHorizonDays: 252,
                rulebook,
            }).assemble([]),
    ],
    [
        'live',
        (rulebook) =>
            new LiveSizingAdvisor({
                ...COMMON,
                account: {
                    assumptions: [],
                    cushion: 4000,
                    kind: ReconstructedLiveKind.Live,
                    livePlan,
                    plan: MFF_RAPID,
                    state: {
                        ...livePlan.initialState(),
                        balance: 54_000,
                        threshold: 50_000,
                    },
                },
                rulebook,
            }).assemble([]),
    ],
];

describe('the advice headline names the rule it was sized on (PT-104, F-144)', () => {
    it.each(ADVICE_OF)(
        'a %s advice under a rulebook with a retained cushion below the Hard Rule 2 minimum is headlined as a custom rule',
        (_stage, adviceOf) => {
            expect(adviceOf(DEVIATING_RULEBOOK).headline).toBe(CUSTOM_HEADLINE);
        },
    );

    it.each(ADVICE_OF)(
        'a %s advice under the default rulebook is headlined as the documented rule',
        (_stage, adviceOf) => {
            expect(adviceOf(DEFAULT_RULEBOOK).headline).toBe(
                DOCUMENTED_HEADLINE,
            );
        },
    );
});
