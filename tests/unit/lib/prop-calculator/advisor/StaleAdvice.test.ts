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
    AdviceStalenessKind,
    AdviceStalenessReason,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    LiveSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type PlanRulesFingerprintCheck,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';

const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';
const WEDNESDAY = '2026-09-23';

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

const livePlan = buildMffuRapidLivePlan(DEFAULT_RULEBOOK.live.cushionPercent);

function evalAdvisor(
    snapshotAsOf: string,
    planRulesFingerprint?: PlanRulesFingerprintCheck,
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: evalAccount(),
        maxEvalDays: 150,
        planRulesFingerprint,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf,
        substate: null,
        today: WEDNESDAY,
    });
}

function fundedAdvisor(
    snapshotAsOf: string,
    planRulesFingerprint?: PlanRulesFingerprintCheck,
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        fundedHorizonDays: 252,
        planRulesFingerprint,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf,
        substate: null,
        today: WEDNESDAY,
        trials: 20,
    });
}

function liveAdvisor(
    snapshotAsOf: string,
    planRulesFingerprint?: PlanRulesFingerprintCheck,
): LiveSizingAdvisor {
    return new LiveSizingAdvisor({
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
        planRulesFingerprint,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf,
        substate: null,
        today: WEDNESDAY,
    });
}

const SESSION_STALE_ADVISORS: readonly (readonly [string, SizingAdvisor])[] = [
    ['eval', evalAdvisor(MONDAY)],
    ['live', liveAdvisor(MONDAY)],
];

function reasonKinds(advice: Advice): readonly DifferenceReason[] {
    return advice.differenceReasons.map((reason) => reason.kind);
}

describe('a stale advice is StaleAdvice and carries no amount (PT-104, F-141)', () => {
    it.each(SESSION_STALE_ADVISORS)(
        'a %s snapshot from Monday is stale on Wednesday with no documented sizing, card or payout advice',
        (_stage, advisor) => {
            const advice = advisor.assemble([]);

            expect(advisor.documented()).toBeNull();
            expect(advisor.dailyPlanCard()).toBeNull();
            expect(reasonKinds(advice)).toContain(DifferenceReason.StaleAdvice);
            expect(advice.documented).toBeNull();
            expect(advice.dailyPlanCard).toBeNull();
            expect(advice.payoutAdvice).toBeNull();
            expect(advice.requests).toStrictEqual([]);
            expect(advice.optima).toStrictEqual([]);
        },
    );

    it('a funded snapshot past the funded stale days sends no payout advice and no requests', () => {
        const advisor = fundedAdvisor('2026-09-01');
        expect(advisor.optimumRequests().length).toBeGreaterThan(0);

        const advice = advisor.assemble([]);

        expect(reasonKinds(advice)).toContain(DifferenceReason.StaleAdvice);
        expect(advice.payoutAdvice).toBeNull();
        expect(advice.documented).toBeNull();
        expect(advice.dailyPlanCard).toBeNull();
        expect(advice.requests).toStrictEqual([]);
    });

    it('the StaleAdvice reason names the snapshot date it is stale from', () => {
        const advice = evalAdvisor(MONDAY).assemble([]);

        expect(advice.differenceReasons).toContainEqual({
            kind: DifferenceReason.StaleAdvice,
            snapshotDate: MONDAY,
        });
    });

    it.each([
        ['eval', () => evalAdvisor(TUESDAY)],
        ['funded', () => fundedAdvisor(TUESDAY)],
        ['live', () => liveAdvisor(TUESDAY)],
    ])('a %s snapshot from Tuesday is fresh on Wednesday', (_stage, make) => {
        const advice = make().assemble([]);

        expect(reasonKinds(advice)).not.toContain(DifferenceReason.StaleAdvice);
        expect(advice.documented).not.toBeNull();
    });

    it('a funded advice that is fresh still carries payout advice and its engine requests', () => {
        const advice = fundedAdvisor(TUESDAY).assemble([]);

        expect(advice.payoutAdvice).not.toBeNull();
        expect(advice.requests.length).toBeGreaterThan(0);
    });
});

describe('a changed plan-rules fingerprint marks every stage stale (PT-104, F-98)', () => {
    const changed = { atAdvice: 'old-hash', current: 'new-hash' };
    const unchanged = { atAdvice: 'same-hash', current: 'same-hash' };
    const dbFree = { atAdvice: null, current: 'new-hash' };

    it.each([
        [
            'eval',
            (check: PlanRulesFingerprintCheck) => evalAdvisor(TUESDAY, check),
        ],
        [
            'funded',
            (check: PlanRulesFingerprintCheck) => fundedAdvisor(TUESDAY, check),
        ],
        [
            'live',
            (check: PlanRulesFingerprintCheck) => liveAdvisor(TUESDAY, check),
        ],
    ])(
        'a %s advice with two different fingerprints is stale and says the plan rules changed',
        (_stage, make) => {
            const advisor = make(changed);
            const staleness = advisor.staleness();

            const advice = advisor.assemble([]);

            expect(staleness.kind).toBe(AdviceStalenessKind.Stale);
            if (staleness.kind !== AdviceStalenessKind.Stale) return;
            expect(staleness.reasons).toStrictEqual([
                AdviceStalenessReason.PlanRulesChanged,
            ]);
            expect(reasonKinds(advice)).toContain(
                DifferenceReason.PlanRulesChanged,
            );
            expect(reasonKinds(advice)).toContain(DifferenceReason.StaleAdvice);
            expect(advice.payoutAdvice).toBeNull();
            expect(advice.provenance.planRulesFingerprint).toBe('new-hash');
        },
    );

    it.each([
        [
            'eval',
            (check: PlanRulesFingerprintCheck) => evalAdvisor(TUESDAY, check),
        ],
        [
            'funded',
            (check: PlanRulesFingerprintCheck) => fundedAdvisor(TUESDAY, check),
        ],
        [
            'live',
            (check: PlanRulesFingerprintCheck) => liveAdvisor(TUESDAY, check),
        ],
    ])(
        'a %s advice never goes stale on an equal fingerprint or one with no fingerprint at advice time',
        (_stage, make) => {
            for (const check of [unchanged, dbFree]) {
                const advisor = make(check);

                const advice = advisor.assemble([]);

                expect(advisor.staleness().kind).toBe(
                    AdviceStalenessKind.Fresh,
                );
                expect(reasonKinds(advice)).not.toContain(
                    DifferenceReason.PlanRulesChanged,
                );
                expect(advice.provenance.planRulesFingerprint).toBe(
                    check.current,
                );
            }
        },
    );
});
