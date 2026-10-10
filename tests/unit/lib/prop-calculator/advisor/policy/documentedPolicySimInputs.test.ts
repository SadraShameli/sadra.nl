import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    type AccountState,
    ApexVariant,
    CENTS_PER_DOLLAR,
    type ComputeRisk,
    DayStopRuleKind,
    dollars,
    effectivePayoutRequest,
    FirmId,
    flatDayPolicy,
    fraction,
    FtmoFuturesVariant,
    InstrumentSymbol,
    isAtOrBelowWithinCentTolerance,
    LucidVariant,
    MffuVariant,
    PayoutRequestPolicy,
    type Plan,
    type PlanId,
    policySizingOf,
    resolveRiskAt,
    RungSizing,
    serializePlanId,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputs,
    simInputsSizingIssue,
    type SimOutputs,
    simulate,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    fundedStopRuleToDayStopRule,
    type RulebookParameters,
    ruleContextAt,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
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
const ftmoPro = registryPlan({
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Pro,
});
const mffPro = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
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

interface OutputPin {
    readonly averageRiskPerTrade: number;
    readonly expectedGrossPayout: number;
    readonly expectedMonthlyNet: number;
    readonly expectedNet: number;
    readonly expectedPayoutCount: number;
    readonly fundedBustProbability: number;
}

function flatFundedReference(
    plan: Plan,
    sizing: Pick<SimInputs, 'instrument' | 'stopPoints'>,
): SimInputs {
    return {
        commissionPerRoundTrip: 0,
        fundedHorizonDays: HORIZON_DAYS,
        fundedRiskPerTrade: 250,
        fundedRrRatio: 2,
        fundedTradesPerDay: 4,
        maxEvalDays: EVAL_DAYS,
        minRetainedCushion: 2000,
        payoutRequestSize: 500,
        plan,
        rebuyLagDays: 0,
        riskPerTrade: 250,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: SEED,
        tradesPerDay: 4,
        trials: TRIALS,
        winrate: 0.4,
        ...sizing,
    };
}

function pinOf(out: SimOutputs): OutputPin {
    return {
        averageRiskPerTrade: out.averageRiskPerTrade,
        expectedGrossPayout: out.expectedGrossPayout,
        expectedMonthlyNet: out.expectedMonthlyNet,
        expectedNet: out.expectedNet,
        expectedPayoutCount: out.expectedPayoutCount,
        fundedBustProbability: out.fundedBustProbability,
    };
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

function withPayout(
    payout: Partial<RulebookParameters['payout']>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, ...payout },
    };
}

const UNSIZED = {} as const;
const NQ_10 = { instrument: InstrumentSymbol.NQ, stopPoints: 10 } as const;
const MNQ_10 = { instrument: InstrumentSymbol.MNQ, stopPoints: 10 } as const;

const INSTANT_FUNDED_PINS: ReadonlyArray<
    readonly [string, Pick<SimInputs, 'instrument' | 'stopPoints'>, OutputPin]
> = [
    [
        'unsized',
        UNSIZED,
        {
            averageRiskPerTrade: 249.9489351476375,
            expectedGrossPayout: 364.5,
            expectedMonthlyNet: 65.75859178541492,
            expectedNet: -150.5,
            expectedPayoutCount: 0.81,
            fundedBustProbability: 0.375,
        },
    ],
    [
        'NQ at 10 points',
        NQ_10,
        {
            averageRiskPerTrade: 199.94524748138414,
            expectedGrossPayout: 378,
            expectedMonthlyNet: 79.39807734323793,
            expectedNet: -137,
            expectedPayoutCount: 0.84,
            fundedBustProbability: 0.31,
        },
    ],
    [
        'MNQ at 10 points',
        MNQ_10,
        {
            averageRiskPerTrade: 239.59751299071877,
            expectedGrossPayout: 344.25,
            expectedMonthlyNet: 52.18562874251497,
            expectedNet: -170.75,
            expectedPayoutCount: 0.765,
            fundedBustProbability: 0.39,
        },
    ],
];

const APEX_EOD_FLAT_EVAL_PIN: OutputPin & {
    readonly evalPassProbability: number;
} = {
    averageRiskPerTrade: 249.91396353518343,
    evalPassProbability: 0.655,
    expectedGrossPayout: 745,
    expectedMonthlyNet: 162.6980198019802,
    expectedNet: 96.05,
    expectedPayoutCount: 1.49,
    fundedBustProbability: 0.285,
};

function evalDay(
    inputs: SimInputs,
    state: AccountState,
    rngValue: number,
): { busted: boolean; risks: number[] } {
    const policy = inputs.evalDayPolicy;
    const computeRisk = policy?.computeRisk;
    if (policy === undefined || computeRisk === undefined) {
        throw new Error('expected a computed eval day policy');
    }
    const risks: number[] = [];
    const totals = new TradeTotals();
    const stats = newPhaseStats(
        state.startingBalance,
        totals,
        new LossStreak(totals),
    );
    const result = runDay(
        dayRunOptionsFor(TradingPhase.Eval, {
            commission: dollars(inputs.commissionPerRoundTrip ?? 0),
            dayPolicy: {
                ...policy,
                computeRisk: (current, index, cycle) => {
                    const risk = computeRisk(current, index, cycle);
                    risks.push(risk);
                    return risk;
                },
            },
            plan: apexIntraday,
            positionSizing: null,
            rng: () => rngValue,
            rrRatio: inputs.rrRatio,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(inputs.winrate),
        }),
    );
    return { busted: result.busted, risks };
}

describe('step 1 pins (PD-31, captured from the working tree on 2026-09-26)', () => {
    it.each(INSTANT_FUNDED_PINS)(
        'instant-funded Lucid Direct, funded flat 250 dollars at rr 2, 4 a day, %s',
        (_label, sizing, pin) => {
            const reference = flatFundedReference(lucidDirect, sizing);

            expect(pinOf(simulate(reference))).toEqual(pin);
        },
    );

    it('Apex EOD 50K flat eval guard', () => {
        const out = simulate({
            ...flatFundedReference(apexEod, UNSIZED),
            fundedRiskPerTrade: undefined,
            fundedRrRatio: undefined,
            fundedTradesPerDay: undefined,
        });

        expect({
            ...pinOf(out),
            evalPassProbability: out.evalPassProbability,
        }).toEqual(APEX_EOD_FLAT_EVAL_PIN);
    });
});

describe('toSimInputs: funded flat policy (PT-48a, F-148)', () => {
    it('declares the funded day policy exactly as resolveDayPolicy builds it from fundedRiskPerTrade', () => {
        const inputs = toSimInputs(lucidDirect, specOf());
        const { funded } = DEFAULT_RULEBOOK;

        expect(inputs.fundedDayPolicy).toEqual(
            flatDayPolicy(
                funded.riskCents / CENTS_PER_DOLLAR,
                funded.tradesPerDayMax,
                fundedStopRuleToDayStopRule(funded.stopRule),
                policySizingOf(TradingPhase.Funded),
            ),
        );
        expect(inputs.fundedRrRatio).toBe(
            funded.takeProfitCents / funded.riskCents,
        );
        expect(inputs).not.toHaveProperty('fundedRiskPerTrade');
        expect(inputs).not.toHaveProperty('fundedTradesPerDay');
        expect(inputs).not.toHaveProperty('fundedCushionPercent');
    });

    it('carries the rulebook funded stop rule into the declared policy', () => {
        const rulebook: RulebookParameters = {
            ...DEFAULT_RULEBOOK,
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 50_000,
                },
            },
        };

        expect(
            toSimInputs(lucidDirect, specOf({}, rulebook)).fundedDayPolicy
                ?.stopRule,
        ).toEqual({ dollars: 500, kind: DayStopRuleKind.AfterTarget });
    });

    it.each(INSTANT_FUNDED_PINS)(
        'simulate(toSimInputs) on an instant-funded plan deep-equals the flat reference and its pin, %s',
        (_label, sizing, pin) => {
            const documented = simulate(
                toSimInputs(lucidDirect, specOf(sizing)),
            );

            expect(documented).toEqual(
                simulate(flatFundedReference(lucidDirect, sizing)),
            );
            expect(pinOf(documented)).toEqual(pin);
        },
    );

    it('places $250 as 1 NQ contract ($200) and 12 MNQ micros ($240) at 10 points (T33)', () => {
        const nq = simulate(toSimInputs(lucidDirect, specOf(NQ_10)));
        const mnq = simulate(toSimInputs(lucidDirect, specOf(MNQ_10)));

        expect(nq.averageRiskPerTrade).toBeLessThanOrEqual(200);
        expect(nq.averageRiskPerTrade).toBeGreaterThan(195);
        expect(mnq.averageRiskPerTrade).toBeLessThanOrEqual(240);
        expect(mnq.averageRiskPerTrade).toBeGreaterThan(235);
    });

    it('refuses a funded risk below one contract ($150 at NQ 10 points) with the simulator refusal text', () => {
        const rulebook: RulebookParameters = {
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 15_000 },
        };
        const issue = simInputsSizingIssue({
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 150,
            stopPoints: 10,
        });

        expect(issue).not.toBeNull();
        expect(() => toSimInputs(lucidDirect, specOf(NQ_10, rulebook))).toThrow(
            `${SIM_INPUTS_REFUSAL_PREFIX}${issue}`,
        );
    });
});

describe('toSimInputs: documented eval policy', () => {
    it('declares a computed eval policy with the rulebook trades per day, no stop kind and eval sizing', () => {
        const inputs = toSimInputs(apexIntraday, specOf());
        const policy = inputs.evalDayPolicy;

        expect(policy?.computeRisk).toBeTypeOf('function');
        expect(policy?.ladder).toHaveLength(
            DEFAULT_RULEBOOK.strategy.tradesPerDayMax,
        );
        expect(policy?.stopRule).toEqual({ kind: DayStopRuleKind.None });
        expect(policy?.sizing).toBe(policySizingOf(TradingPhase.Eval));
        expect(policy?.maxLossesPerDay).toBeNull();
    });

    it('computeRisk at a day-start state equals the rule first rung ($400 at a $2,000 cushion)', () => {
        const inputs = toSimInputs(apexIntraday, specOf());

        expect(
            inputs.evalDayPolicy?.computeRisk?.(apexIntraday.initialState(), 0),
        ).toBe(400);
    });

    it('runDay on an all-loss day trades the documented rungs until the cushion is gone', () => {
        const inputs = toSimInputs(apexIntraday, specOf());
        const day = evalDay(inputs, apexIntraday.initialState(), 0.99);

        expect(day.risks).toEqual([400, 600, 900, 100]);
        expect(day.busted).toBe(true);
    });

    it('runDay ends the day once the max-risk day reaches 2 x the day-start risk', () => {
        const rulebook: RulebookParameters = {
            ...DEFAULT_RULEBOOK,
            eval: { ...DEFAULT_RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
        };
        const inputs = toSimInputs(apexIntraday, specOf({}, rulebook));
        const state: AccountState = {
            ...apexIntraday.initialState(),
            threshold: 49_000,
        };
        const day = evalDay(inputs, state, 0);

        expect(day.risks).toEqual([1000, 0]);
        expect(state.todayPnL).toBe(
            rulebook.eval.maxRiskDailyCapMultiple * 1000,
        );
    });

    it('runs a documented eval plus funded simulation end to end', () => {
        const out = simulate(toSimInputs(apexEod, specOf()));

        expect(out.evalPassProbability).toBeGreaterThan(0);
        expect(out.evalPassProbability).toBeLessThan(1);
    });

    it.each([
        ['ladder', DEFAULT_RULEBOOK],
        [
            'max risk',
            {
                ...DEFAULT_RULEBOOK,
                eval: {
                    ...DEFAULT_RULEBOOK.eval,
                    mode: EvalSizingMode.MaxRisk,
                },
            },
        ],
    ] as const)(
        'still passes evals at a $4.50 commission, close to the zero-commission run, %s',
        (_label, rulebook) => {
            const free = simulate(toSimInputs(apexEod, specOf({}, rulebook)));
            const charged = simulate(
                toSimInputs(
                    apexEod,
                    specOf({ commissionPerRoundTrip: 4.5 }, rulebook),
                ),
            );

            expect(free.evalPassProbability).toBeGreaterThan(0);
            expect(charged.evalPassProbability).toBeGreaterThan(0);
            expect(
                Math.abs(
                    charged.evalPassProbability - free.evalPassProbability,
                ),
            ).toBeLessThan(0.1);
        },
    );

    it('simulates a contract-capped eval at a stop off the cent grid without a sizing invariant error', () => {
        const rulebook: RulebookParameters = {
            ...DEFAULT_RULEBOOK,
            eval: { ...DEFAULT_RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
        };
        const inputs = toSimInputs(
            apexIntraday,
            specOf(
                { instrument: InstrumentSymbol.NQ, stopPoints: 10.1234 },
                rulebook,
            ),
        );

        expect(() => simulate(inputs)).not.toThrow();
    });
});

describe('toSimInputs: money fields', () => {
    it('takes the commission from the engine policy', () => {
        expect(
            toSimInputs(apexEod, specOf({ commissionPerRoundTrip: 4.5 }))
                .commissionPerRoundTrip,
        ).toBe(4.5);
    });

    it('requests the rulebook retained cushion in dollars', () => {
        const inputs = toSimInputs(apexEod, specOf());

        expect(inputs.minRetainedCushion).toBe(
            DEFAULT_RULEBOOK.payout.retainedCushionCents / CENTS_PER_DOLLAR,
        );
    });

    it('lets the engine resolve the retained cushion: the drawdown floor wins over a smaller request', () => {
        const rulebook = withPayout({
            allowBelowHardRule2: true,
            retainedCushionCents: 50_000,
        });
        const inputs = toSimInputs(apexEod, specOf({}, rulebook));

        expect(inputs.minRetainedCushion).toBe(500);
        expect(apexEod.resolveRetainedCushion(inputs.minRetainedCushion)).toBe(
            apexEod.fundedDrawdown.amount,
        );
    });

    it('carries $2,000 on TopStep, whose own floor is $0, and $2,000 on FTMO Pro, whose floor is its $2,000 override', () => {
        const topStepInputs = toSimInputs(topStep, specOf());
        const ftmoInputs = toSimInputs(ftmoPro, specOf());

        expect(
            topStep.resolveRetainedCushion(topStepInputs.minRetainedCushion),
        ).toBe(2000);
        expect(
            ftmoPro.resolveRetainedCushion(ftmoInputs.minRetainedCushion),
        ).toBe(2000);
    });

    it('uses a retained cushion request from the engine policy over the rulebook value', () => {
        expect(
            toSimInputs(apexEod, specOf({ retainedCushionRequest: 2500 }))
                .minRetainedCushion,
        ).toBe(2500);
    });

    it('requests the rulebook payout size in dollars unless a personal override is set', () => {
        expect(toSimInputs(apexEod, specOf()).payoutRequestSize).toBe(
            DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR,
        );
        expect(
            toSimInputs(apexEod, specOf({ payoutRequestOverride: 1000 }))
                .payoutRequestSize,
        ).toBe(1000);
    });
});

describe('toSimInputs: payout request policy (PT-48b, F-148, PD-40)', () => {
    it("raises the rulebook $500 request to MFF Pro's $1,000 minimum via effectivePayoutRequest", () => {
        const inputs = toSimInputs(mffPro, specOf());

        expect(DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR).toBe(
            500,
        );
        expect(inputs.payoutRequestSize).toBe(1000);
        expect(inputs.payoutRequestSize).toBe(
            effectivePayoutRequest(mffPro, 500),
        );
    });

    it('never lowers a request already above the plan minimum', () => {
        expect(toSimInputs(apexEod, specOf()).payoutRequestSize).toBe(500);
    });

    it('raises a personal override below the plan minimum too', () => {
        const inputs = toSimInputs(
            mffPro,
            specOf({ payoutRequestOverride: 200 }),
        );

        expect(inputs.payoutRequestSize).toBe(1000);
    });

    it('always declares the engine payout policy as FullRequestOnly', () => {
        expect(toSimInputs(apexEod, specOf()).payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(toSimInputs(mffPro, specOf()).payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
    });
});

describe('toSimInputs: lifetime payout cap', () => {
    it('keeps the same plan instance without an override', () => {
        expect(toSimInputs(apexEod, specOf()).plan).toBe(apexEod);
    });

    it('applies a verified count trigger with withMaxLifetimePayouts', () => {
        const inputs = toSimInputs(
            lucidDirect,
            specOf({
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.VerifiedCountTrigger,
                lifetimePayoutCapOverride: 3,
            }),
        );

        expect(inputs.plan).not.toBe(lucidDirect);
        expect(inputs.plan.maxLifetimePayouts).toBe(3);
        expect(inputs.plan.id).toEqual(lucidDirect.id);
    });
});

describe('toSimInputs: pass-through', () => {
    it('passes the engine policy, rulebook strategy and run fields through', () => {
        const inputs = toSimInputs(apexIntraday, {
            enginePolicy: {
                ...POLICY,
                fundedHorizonDays: 90,
                instrument: InstrumentSymbol.MNQ,
                intradayPathStepsPerR: 10,
                rebuyLagBasis: RebuyLagBasis.Measured,
                rebuyLagDays: 2,
                stopPoints: 12,
            },
            rulebook: DEFAULT_RULEBOOK,
            run: { maxAttempts: 3, maxEvalDays: 30, seed: 7, trials: 50 },
        });

        expect(inputs).toMatchObject({
            fundedHorizonDays: 90,
            instrument: InstrumentSymbol.MNQ,
            intradayPathStepsPerR: 10,
            maxAttempts: 3,
            maxEvalDays: 30,
            rebuyLagDays: 2,
            riskPerTrade: DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR,
            rrRatio: DEFAULT_RULEBOOK.strategy.rr,
            rungSizing: RungSizing.CapToCushion,
            seed: 7,
            stopPoints: 12,
            tradesPerDay: DEFAULT_RULEBOOK.funded.tradesPerDayMax,
            trials: 50,
            winrate: DEFAULT_RULEBOOK.strategy.winrate,
        });
    });

    it('leaves the optional engine assumptions unset when the policy omits them', () => {
        const inputs = toSimInputs(apexIntraday, specOf());

        expect(inputs.instrument).toBeUndefined();
        expect(inputs.stopPoints).toBeUndefined();
        expect(inputs.intradayPathStepsPerR).toBeUndefined();
        expect(inputs.maxAttempts).toBeUndefined();
    });
});

describe('toSimInputs: boundary checks', () => {
    it('accepts a matching plan serial', () => {
        expect(() =>
            toSimInputs(apexEod, {
                ...specOf(),
                planSerial: serializePlanId(apexEod.id),
            }),
        ).not.toThrow();
    });

    it('throws on a plan serial mismatch', () => {
        expect(() =>
            toSimInputs(apexEod, {
                ...specOf(),
                planSerial: serializePlanId(apexIntraday.id),
            }),
        ).toThrow(/apex-50000-intraday/);
    });

    it('parses the spec, so a malformed worker message never reaches simulate', () => {
        expect(() =>
            toSimInputs(apexEod, specOf({ commissionPerRoundTrip: -1 })),
        ).toThrow(ZodError);
    });
});

describe("PD-33 invariant (PT-48b): documented risk stays inside resolveRiskAt's room", () => {
    it('holds across a seeded 200-trial Apex EOD eval plus funded run', () => {
        const inputs = toSimInputs(apexEod, specOf());
        const evalDayPolicy = inputs.evalDayPolicy;
        const computeRisk = evalDayPolicy?.computeRisk;
        if (evalDayPolicy === undefined || computeRisk === undefined) {
            throw new Error('expected a computed eval day policy');
        }
        let dayStartState: AccountState | null = null;
        let checked = 0;
        const wrapped: ComputeRisk = (state, index, cycle) => {
            if (index === 0) dayStartState = { ...state };
            const startedDay = dayStartState;
            if (startedDay === null) {
                throw new Error('missing day-start state');
            }
            const risk = computeRisk(state, index, cycle);
            if (risk > 0) {
                checked += 1;
                const resolved = resolveRiskAt({
                    commission: dollars(inputs.commissionPerRoundTrip ?? 0),
                    intendedRisk: risk,
                    phase: TradingPhase.Eval,
                    plan: apexEod,
                    positionSizing: null,
                    rungSizing: RungSizing.CapToCushion,
                    sizing: policySizingOf(TradingPhase.Eval),
                    state,
                });
                expect(
                    isAtOrBelowWithinCentTolerance(risk, resolved.affordable),
                ).toBe(true);
                const dayStartContext = ruleContextAt(
                    apexEod,
                    SizingStage.Eval,
                    startedDay,
                    { instrument: null, personalDll: null },
                );
                const room =
                    dayStartContext.dayStartDllRoom === null
                        ? dayStartContext.cushion
                        : Math.min(
                              dayStartContext.cushion,
                              dayStartContext.dayStartDllRoom,
                          );
                const runningLoss = -state.todayPnL;
                expect(isAtOrBelowWithinCentTolerance(runningLoss, room)).toBe(
                    true,
                );
            }
            return risk;
        };
        const wrappedEvalDayPolicy = { ...evalDayPolicy, computeRisk: wrapped };

        expect(() =>
            simulate({ ...inputs, evalDayPolicy: wrappedEvalDayPolicy }),
        ).not.toThrow();
        expect(checked).toBeGreaterThan(0);
    });
});
