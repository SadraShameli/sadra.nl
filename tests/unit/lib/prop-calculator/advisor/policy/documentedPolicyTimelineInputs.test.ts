import { readFileSync } from 'node:fs';
import path from 'node:path';
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
    InstrumentSymbol,
    LucidVariant,
    PayoutRequestPolicy,
    type Plan,
    type PlanId,
    points,
    RungSizing,
    serializePlanId,
    SIM_INPUTS_REFUSAL_PREFIX,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    NO_PERSONAL_CAPS,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    applicableTimelineGaps,
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

        expect(topStep.resolveRetainedCushion(inputs.minRetainedCushion)).toBe(
            2000,
        );
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
        expect(documentedPolicyTimelineInputs(apexEod, specOf(), 1).plan).toBe(
            apexEod,
        );
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
            expect(
                DOCUMENTED_POLICY_TIMELINE_GAP_TEXT[gap].length,
            ).toBeGreaterThan(0);
        }
    });

    it('lists no gap for a policy and rulebook the timeline honours in full', () => {
        expect(applicableTimelineGaps(specOf())).toEqual([]);
    });

    it('lists the intraday path steps and the rebuy lag only when the policy sets them', () => {
        expect(
            applicableTimelineGaps(specOf({ intradayPathStepsPerR: 10 })),
        ).toEqual([DocumentedPolicyTimelineGap.IntradayPathStepsPerR]);
        expect(
            applicableTimelineGaps(
                specOf({
                    rebuyLagBasis: RebuyLagBasis.Measured,
                    rebuyLagDays: 4,
                }),
            ),
        ).toEqual([DocumentedPolicyTimelineGap.RebuyLagDays]);
    });

    it('lists a funded reward-to-risk that differs from the strategy one, and ignores a float-noise difference', () => {
        const { funded, strategy } = DEFAULT_RULEBOOK;
        const differs = {
            ...DEFAULT_RULEBOOK,
            funded: { ...funded, takeProfitCents: funded.riskCents * 3 },
            strategy: { ...strategy, rr: 1 },
        };
        expect(applicableTimelineGaps(specOf({}, differs))).toEqual([
            DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr,
        ]);
        const noise = {
            ...DEFAULT_RULEBOOK,
            strategy: {
                ...strategy,
                rr: funded.takeProfitCents / funded.riskCents + 1e-12,
            },
        };
        expect(applicableTimelineGaps(specOf({}, noise))).toEqual([]);
    });

    it('lists every applicable gap in the declared order', () => {
        const { funded, strategy } = DEFAULT_RULEBOOK;
        const differs = {
            ...DEFAULT_RULEBOOK,
            funded: { ...funded, takeProfitCents: funded.riskCents * 3 },
            liveTransfer: {
                hazardPerPaidPayoutByFirm: { [FirmId.Mffu]: 0.3 },
            },
            strategy: { ...strategy, rr: 1 },
        };
        expect(
            applicableTimelineGaps(
                specOf(
                    {
                        intradayPathStepsPerR: 10,
                        rebuyLagBasis: RebuyLagBasis.Measured,
                        rebuyLagDays: 4,
                    },
                    differs,
                ),
            ),
        ).toEqual(DOCUMENTED_POLICY_TIMELINE_GAPS);
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

function cappedSpec(
    maxRiskPerTrade: ReturnType<typeof dollars>,
    sizing: Partial<EnginePolicy> = {},
) {
    return specOf({
        ...sizing,
        personalCaps: { ...NO_PERSONAL_CAPS, maxRiskPerTrade },
    });
}

describe('documentedPolicyTimelineInputs sizes the funded phase at the personal max risk (PT-68g, F-V16)', () => {
    it('sets the timeline risk per trade to the capped funded risk, the same one toSimInputs simulates', () => {
        const spec = cappedSpec(dollars(100));
        const timeline = documentedPolicyTimelineInputs(apexEod, spec, 1);

        expect(timeline.riskPerTrade).toBe(100);
        expect(timeline.riskPerTrade).toBe(
            toSimInputs(apexEod, spec).riskPerTrade,
        );
    });

    it('keeps the rulebook funded risk when no personal cap is set or the cap sits above it', () => {
        const plain = documentedPolicyTimelineInputs(apexEod, specOf(), 1);
        const loose = documentedPolicyTimelineInputs(
            apexEod,
            cappedSpec(dollars(5000)),
            1,
        );
        const rulebookRisk =
            DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;

        expect(plain.riskPerTrade).toBe(rulebookRisk);
        expect(loose.riskPerTrade).toBe(rulebookRisk);
    });

    it('refuses a personal max risk of $30 at a $40 one-contract stop with the reason the simulator gives', () => {
        const spec = cappedSpec(dollars(30), {
            instrument: InstrumentSymbol.MNQ,
            stopPoints: points(20),
        });
        let simulatorReason = '';
        try {
            toSimInputs(apexEod, spec);
        } catch (error) {
            simulatorReason = error instanceof Error ? error.message : '';
        }
        const build = () => documentedPolicyTimelineInputs(apexEod, spec, 1);

        expect(simulatorReason.startsWith(SIM_INPUTS_REFUSAL_PREFIX)).toBe(
            true,
        );
        expect(build).toThrow(simulatorReason);
    });

    it('still builds the timeline when the capped risk places at least one contract at the stop', () => {
        const spec = cappedSpec(dollars(40), {
            instrument: InstrumentSymbol.MNQ,
            stopPoints: points(20),
        });

        expect(
            documentedPolicyTimelineInputs(apexEod, spec, 1).riskPerTrade,
        ).toBe(40);
    });
});

describe('the timeline inputs size the funded risk through the shared helper (PT-68g)', () => {
    it('reads the funded risk from documentedSizedFundedRisk, never from the rulebook cents directly', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'lib',
                'prop-calculator',
                'advisor',
                'policy',
                'documentedPolicyTimelineInputs.ts',
            ),
            'utf8',
        );

        expect(source).toContain('documentedSizedFundedRisk(');
        expect(source).not.toContain('CENTS_PER_DOLLAR');
    });
});
