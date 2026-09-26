import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    CENTS_PER_DOLLAR,
    type DayPolicy,
    dollars,
    effectivePayoutRequest,
    FirmId,
    fraction,
    LucidVariant,
    PayoutRequestPolicy,
    type Plan,
    type PlanId,
    RungSizing,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    DOCUMENTED_POLICY_TIMELINE_GAP_TEXT,
    DOCUMENTED_POLICY_TIMELINE_GAPS,
    type DocumentedPolicySpec,
    DocumentedPolicyTimelineGap,
    documentedPolicyTimelineInputs,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { simulatePortfolioTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { dayRunOptionsFor } from '../../dayRunOptions';

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const lucidDirect = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Direct,
});
const apexEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const apexIntraday = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});
const topStep = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const SEED = 42;
const TRIALS = 200;
const HORIZON_DAYS = 60;
const EVAL_DAYS = 60;

const POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: HORIZON_DAYS,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

function evalDayRisks(
    plan: Plan,
    dayPolicy: DayPolicy | undefined,
    rrRatio: number,
    state: AccountState,
): number[] {
    const computeRisk = dayPolicy?.computeRisk;
    if (dayPolicy === undefined || computeRisk === undefined) {
        throw new Error('expected a computed eval day policy');
    }
    const risks: number[] = [];
    const totals = new TradeTotals();
    const stats = newPhaseStats(
        state.startingBalance,
        totals,
        new LossStreak(totals),
    );
    runDay(
        dayRunOptionsFor(TradingPhase.Eval, {
            commission: dollars(0),
            dayPolicy: {
                ...dayPolicy,
                computeRisk: (current, index, cycle) => {
                    const risk = computeRisk(current, index, cycle);
                    risks.push(risk);
                    return risk;
                },
            },
            plan,
            positionSizing: null,
            rng: () => 0.99,
            rrRatio,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        }),
    );
    return risks;
}

function specOf(
    policy: Partial<EnginePolicy> = {},
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
): DocumentedPolicySpec {
    return {
        enginePolicy: { ...POLICY, ...policy },
        rulebook,
        run: { maxEvalDays: EVAL_DAYS, seed: SEED, trials: TRIALS },
    };
}

describe('documentedPolicyTimelineInputs (PT-48b, F-148)', () => {
    it('gives the same eval computeRisk values as toSimInputs at trade 0 and after k losses', () => {
        const spec = specOf();
        const simInputs = toSimInputs(apexIntraday, spec);
        const timelineInputs = documentedPolicyTimelineInputs(
            apexIntraday,
            spec,
            1,
        );

        const simRisks = evalDayRisks(
            apexIntraday,
            simInputs.evalDayPolicy,
            simInputs.rrRatio,
            apexIntraday.initialState(),
        );
        const timelineRisks = evalDayRisks(
            apexIntraday,
            timelineInputs.evalDayPolicy,
            timelineInputs.rrRatio,
            apexIntraday.initialState(),
        );

        expect(timelineRisks).toEqual(simRisks);
        expect(timelineRisks).toEqual([400, 600, 900, 100]);
    });

    it('gives the same funded day policy as toSimInputs', () => {
        const spec = specOf();

        expect(
            documentedPolicyTimelineInputs(apexIntraday, spec, 1)
                .fundedDayPolicy,
        ).toEqual(toSimInputs(apexIntraday, spec).fundedDayPolicy);
    });

    it("carries the rulebook retained cushion, effective request and FullRequestOnly (TopStep's $2,000)", () => {
        const spec = specOf();
        const inputs = documentedPolicyTimelineInputs(topStep, spec, 1);

        expect(
            topStep.resolveRetainedCushion(inputs.minRetainedCushion),
        ).toBe(2000);
        expect(inputs.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(inputs.payoutRequestSize).toBe(
            effectivePayoutRequest(
                topStep,
                DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR,
            ),
        );
    });

    it('applies a verified lifetime payout cap override with withMaxLifetimePayouts', () => {
        const inputs = documentedPolicyTimelineInputs(
            lucidDirect,
            specOf({
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.VerifiedCountTrigger,
                lifetimePayoutCapOverride: 3,
            }),
            1,
        );

        expect(inputs.plan).not.toBe(lucidDirect);
        expect(inputs.plan.maxLifetimePayouts).toBe(3);
        expect(inputs.plan.id).toEqual(lucidDirect.id);
    });

    it('keeps the same plan instance without a lifetime cap override', () => {
        expect(
            documentedPolicyTimelineInputs(apexEod, specOf(), 1).plan,
        ).toBe(apexEod);
    });

    it('names every EnginePolicy field the timeline cannot honour', () => {
        expect(DOCUMENTED_POLICY_TIMELINE_GAPS).toEqual(
            Object.values(DocumentedPolicyTimelineGap),
        );
        expect(DOCUMENTED_POLICY_TIMELINE_GAPS).toContain(
            DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr,
        );
        expect(DOCUMENTED_POLICY_TIMELINE_GAPS).toContain(
            DocumentedPolicyTimelineGap.IntradayPathStepsPerR,
        );
        expect(DOCUMENTED_POLICY_TIMELINE_GAPS).toContain(
            DocumentedPolicyTimelineGap.RebuyLagDays,
        );
        for (const gap of DOCUMENTED_POLICY_TIMELINE_GAPS) {
            expect(DOCUMENTED_POLICY_TIMELINE_GAP_TEXT[gap].length).toBeGreaterThan(
                0,
            );
        }
    });

    it('runs simulatePortfolioTimeline on the built inputs without error', () => {
        const inputs = documentedPolicyTimelineInputs(apexEod, specOf(), 3);

        expect(() => simulatePortfolioTimeline(inputs)).not.toThrow();
    });

    it('throws on a plan serial mismatch', () => {
        expect(() =>
            documentedPolicyTimelineInputs(
                apexEod,
                {
                    ...specOf(),
                    planSerial: serializePlanId(apexIntraday.id),
                },
                1,
            ),
        ).toThrow(/apex-50000-intraday/);
    });
});
