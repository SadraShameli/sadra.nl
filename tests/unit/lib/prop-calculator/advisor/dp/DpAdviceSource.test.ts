import { beforeAll, describe, expect, it, vi } from 'vitest';

import { fundedIneligibilityMessage } from '~/cli/commands/prop/optimize/dp/command';
import {
    DEFAULT_RULEBOOK,
    DifferenceReason,
    DpNotValidatedCause,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    buildDpSolverCall,
    type DpAdvice,
    type DpAdviceAccount,
    dpAdviceFor,
    dpConfigKey,
    dpEligibility,
    dpEvalDayIndex,
    DpEvalObjective,
    DpGateFailure,
    type DpSolutionView,
    type DpSolveConfig,
    dpSolveConfigFor,
    type DpSolveConfigInput,
    type DpValidationVerdict,
    EVAL_CUSHION_STEP_DOLLARS_DEFAULT,
    ineligibleDpAdvice,
} from '~/lib/prop-calculator/advisor/dp';
import {
    DP_ADVICE_SOLVER_VERSION,
    DpAdviceGap,
    DpSamplesKind,
    DpSampleStage,
    DpSamplesUnavailableReason,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import {
    ConductCategory,
    type ConductPattern,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    DEFAULT_RUNG_SIZING,
    dollars,
    EodTrailingDrawdown,
    FirmAccountPolicy,
    fraction,
    FundedDpModelGapKind,
    InstrumentSymbol,
    IntradayTrailingDrawdown,
    newFundedCycleTracker,
    PayoutRequestPolicy,
    type Plan,
    PolicySizing,
    PolicySourceKind,
    PolicyVerification,
    resolvePositionSizing,
    resolveRiskAt,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { solveAverageRewardPolicy } from '~/lib/prop-calculator/core/AverageRewardSolver';
import { type RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';
import { fundedDpModelGaps } from '~/lib/prop-calculator/core/FundedDpModelGaps';

import { TOY_FINGERPRINT, toyDpConfig, toyDpPlan } from './dpFixtures';

const RUNG_DOLLARS = 25;
const SLOTS = 2;
const EVAL_DAYS = 3;

const CITATION = {
    date: '2026-10-05',
    file: 'engine-results/2026-10-05-dp-gate.md',
    row: 'toy plan',
};

const VALIDATED: DpValidationVerdict = {
    citation: CITATION,
    evalObjective: DpEvalObjective.CashAtPass,
    ratios: { creditFree: 1.1, creditInclusive: 1.2 },
    validated: true,
};

const NOT_VALIDATED_NO_RUN: DpValidationVerdict = {
    citation: null,
    failure: DpGateFailure.NoGateRun,
    result: null,
    validated: false,
};

const NOT_VALIDATED_BELOW_FLAT: DpValidationVerdict = {
    citation: CITATION,
    failure: DpGateFailure.BelowBestFlat,
    result: '0.99x best flat (credit-inclusive)',
    validated: false,
};

const CONFIRMED_AGGRESSIVE_PATTERN: ConductPattern = {
    category: ConductCategory.InconsistentSizing,
    consequence: 'inconsistent position sizing review',
    source: {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic verified conduct quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.test/policy',
        verification: PolicyVerification.Confirmed,
    },
};

class StubConductPolicy extends FirmAccountPolicy {
    override conductPatterns(): readonly ConductPattern[] {
        return [CONFIRMED_AGGRESSIVE_PATTERN];
    }
}

function configFor(
    plan: Plan,
    overrides: Partial<DpSolveConfigInput> = {},
): ReturnType<typeof dpSolveConfigFor> {
    return dpSolveConfigFor(configInput(plan, overrides));
}

function configInput(
    plan: Plan,
    overrides: Partial<DpSolveConfigInput> = {},
): DpSolveConfigInput {
    return {
        commission: 0,
        copyAccounts: 1,
        discounts: null,
        evalGrid: {},
        fundedGrid: {},
        fundedHorizonDays: 252,
        lifetimePayoutCapOverride: null,
        maxEvalDays: EVAL_DAYS,
        maxSolves: 12,
        objective: SizingObjective.MonthlyNet,
        optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
        personalPayoutRequest: null,
        personalRetainedCushion: null,
        plan,
        planRulesFingerprint: TOY_FINGERPRINT,
        positionSizing: null,
        rateTolerancePerDay: null,
        rebuyLagDays: 0,
        rrRatio: 2,
        rulebook: DEFAULT_RULEBOOK,
        startRatePerDay: null,
        tradesPerDay: SLOTS,
        winrate: 0.5,
        ...overrides,
    };
}

function evalAccount(
    plan: Plan,
    elapsedDays: number | undefined,
    overrides: Partial<ReturnType<Plan['initialState']>> = {},
): DpAdviceAccount {
    const state = { ...plan.initialState(), ...overrides };
    if (elapsedDays === undefined) delete state.elapsedDays;
    else state.elapsedDays = elapsedDays;
    return { fundedTracker: null, kind: TradingPhase.Eval, plan, state };
}

function fundedAccount(plan: Plan): DpAdviceAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return {
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        state,
    };
}

function isChurn(reason: { kind: DifferenceReason }): boolean {
    return reason.kind === DifferenceReason.AggressiveOptimumChurn;
}

function lossOf(
    plan: Plan,
    state: ReturnType<Plan['initialState']>,
    intendedRisk: number,
    positionSizing = null as Parameters<
        typeof resolveRiskAt
    >[0]['positionSizing'],
): number {
    return resolveRiskAt({
        commission: 0,
        intendedRisk,
        phase: TradingPhase.Funded,
        plan,
        positionSizing,
        rungSizing: DEFAULT_RUNG_SIZING,
        sizing: PolicySizing.WholeContracts,
        state,
    }).risk;
}

function rulebookWithPayout(
    payout: Partial<RulebookParameters['payout']>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, ...payout },
    };
}

function sampledOf(advice: DpAdvice) {
    if (advice.samples.kind !== DpSamplesKind.Sampled) {
        throw new Error(
            `expected sampled advice, got ${advice.samples.reason}`,
        );
    }
    return advice.samples.samples;
}

function validatedEvalAdvice(
    account: DpAdviceAccount,
    config: DpSolveConfig,
    solution: DpSolutionView,
): DpAdvice {
    return dpAdviceFor({
        account,
        config,
        documentedPeakRisk: null,
        documentedRungDollars: RUNG_DOLLARS,
        solution,
        validation: VALIDATED,
    });
}

describe('dpEligibility', () => {
    const plan = toyDpPlan();

    it('is eligible when the plan has an eval phase and both phases are DP-eligible', () => {
        expect(dpEligibility(plan)).toEqual({ eligible: true });
    });

    it('refuses an instant-funded plan with the optimize dp wording: it has no eval rows', () => {
        const instant = plan.withOverrides({ isInstantFunded: true });

        expect(dpEligibility(instant)).toEqual({
            eligible: false,
            reason: `${instant.label} is instant-funded, so there is no eval phase for the DP to solve. Use a fixed funded-phase policy sweep instead (cli prop optimize funded).`,
        });
    });

    it('refuses an intraday-trailing eval with the optimize dp eval wording', () => {
        const intradayEval = plan.withOverrides({
            drawdown: new IntradayTrailingDrawdown({ amount: dollars(100) }),
        });

        expect(dpEligibility(intradayEval)).toEqual({
            eligible: false,
            reason: `${intradayEval.label}: eval phase is not DP-eligible (intraday-trailing drawdown, an eval daily loss limit that scales continuously with peak-day-close profit (PeakProfitShare), or an eval tier keyed on the intraday peak (TierBasis.PeakIntradayProfit), which the eval DP does not track).`,
        });
    });

    it('refuses an intraday-trailing funded phase with the same text optimize dp prints', () => {
        const intradayFunded = plan.withOverrides({
            fundedDrawdown: new IntradayTrailingDrawdown({
                amount: dollars(100),
            }),
        });

        const eligibility = dpEligibility(intradayFunded);

        expect(eligibility).toEqual({
            eligible: false,
            reason: fundedIneligibilityMessage(intradayFunded),
        });
    });

    it('reports the instant-funded refusal before the eval and funded ones, like the command', () => {
        const everything = plan.withOverrides({
            drawdown: new IntradayTrailingDrawdown({ amount: dollars(100) }),
            isInstantFunded: true,
        });

        const eligibility = dpEligibility(everything);

        expect(eligibility.eligible).toBe(false);
        expect(eligibility.eligible ? '' : eligibility.reason).toContain(
            'is instant-funded',
        );
    });
});

describe('dpSolveConfigFor', () => {
    const plan = toyDpPlan();

    it('passes the rulebook retained cushion into fundedGrid.minRetainedCushion, never the plan default', () => {
        const config = dpSolveConfigFor(
            configInput(plan, {
                rulebook: rulebookWithPayout({ retainedCushionCents: 345_678 }),
            }),
        );

        expect(config.fundedGrid.minRetainedCushion).toBe(3456.78);
    });

    it('holds the Hard Rule 2 floor unless the rulebook allows going below it', () => {
        const floored = configFor(plan, {
            rulebook: rulebookWithPayout({
                allowBelowHardRule2: false,
                retainedCushionCents: 50_000,
            }),
        });
        const allowed = configFor(plan, {
            rulebook: rulebookWithPayout({
                allowBelowHardRule2: true,
                retainedCushionCents: 50_000,
            }),
        });

        expect(floored.fundedGrid.minRetainedCushion).toBe(2000);
        expect(allowed.fundedGrid.minRetainedCushion).toBe(500);
    });

    it('lets a personal retained cushion above the rulebook win', () => {
        const config = configFor(plan, { personalRetainedCushion: 4200 });

        expect(config.fundedGrid.minRetainedCushion).toBe(4200);
    });

    it('sends the effective payout request under FullRequestOnly', () => {
        const withMinimum = plan.withOverrides({
            minPayoutRequest: dollars(750),
        });
        const rulebook = rulebookWithPayout({ requestCents: 50_000 });

        const config = configFor(withMinimum, { rulebook });
        const personal = configFor(plan, {
            personalPayoutRequest: 900,
            rulebook,
        });

        expect(config.fundedGrid.payoutRequestSize).toBe(750);
        expect(config.fundedGrid.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(personal.fundedGrid.payoutRequestSize).toBe(900);
    });

    it('never passes the documented stop rule: the funded DP cannot model one', () => {
        const config = dpSolveConfigFor(configInput(plan));

        expect(config.fundedGrid).not.toHaveProperty('stopRule');
        expect(config.evalGrid).not.toHaveProperty('stopRule');
        expect(
            buildDpSolverCall(config, plan).fundedGrid?.stopRule,
        ).toBeUndefined();
    });

    it('keys the plan by its serial, opt-ins and fingerprint, and keeps the caller grids', () => {
        const config = dpSolveConfigFor(
            configInput(plan, {
                fundedGrid: { actionStepMultiple: 0.5 },
                optIns: {
                    takesFundedReset: true,
                    takesOneTimeEarlyWithdrawal: false,
                },
            }),
        );

        expect(config.planSerial).toBe(serializePlanId(plan.id));
        expect(config.optIns.takesFundedReset).toBe(true);
        expect(config.planRulesFingerprint).toBe(TOY_FINGERPRINT);
        expect(config.fundedGrid.actionStepMultiple).toBe(0.5);
        expect(dpConfigKey(config)).toHaveLength(64);
    });
});

describe('dpEvalDayIndex', () => {
    it('maps the sessions already closed one to one onto the DP day index', () => {
        const plan = toyDpPlan();

        expect(dpEvalDayIndex(evalAccount(plan, 0).state)).toBe(0);
        expect(dpEvalDayIndex(evalAccount(plan, 7).state)).toBe(7);
    });

    it('has no day index without elapsed sessions, and none for a fractional or negative count', () => {
        const plan = toyDpPlan();

        expect(dpEvalDayIndex(evalAccount(plan, undefined).state)).toBeNull();
        expect(dpEvalDayIndex(evalAccount(plan, 1.5).state)).toBeNull();
        expect(dpEvalDayIndex(evalAccount(plan, -1).state)).toBeNull();
    });
});

describe('dpAdviceFor on a toy plan solved once', () => {
    const plan = toyDpPlan();
    const config = toyDpConfig(plan, {
        fundedGrid: {
            actionStepMultiple: 0.5,
            cushionStepMultiple: 0.5,
            maxActionMultiple: 0.5,
        },
        maxEvalDays: EVAL_DAYS,
        tradesPerDay: SLOTS,
    });
    let solution: DpSolutionView & {
        readonly status: RateSearchStatus;
    };

    beforeAll(() => {
        solution = solveAverageRewardPolicy(buildDpSolverCall(config, plan));
    }, 30_000);

    function fundedAdvice(
        overrides: Partial<Parameters<typeof dpAdviceFor>[0]> = {},
    ) {
        return dpAdviceFor({
            account: fundedAccount(plan),
            config,
            documentedPeakRisk: null,
            documentedRungDollars: RUNG_DOLLARS,
            solution,
            validation: NOT_VALIDATED_NO_RUN,
            ...overrides,
        });
    }

    describe('funded samples', () => {
        it('samples every trade slot of the all-loss path at the rebuilt state and at plus or minus one and two documented rungs, each equal to computeRisk with the rebuilt cycle snapshot', () => {
            const account = fundedAccount(plan);
            const cycle = account.fundedTracker?.cycleSnapshot(
                plan,
                account.state,
            );
            const { computeRisk } = solution.fundedResult.dayPolicy;
            if (computeRisk === undefined || cycle === undefined) {
                throw new Error('the toy solve has no computeRisk');
            }

            const samples = sampledOf(fundedAdvice({ account }));

            expect(
                [
                    ...new Set(samples.map((sample) => sample.rungOffset)),
                ].toSorted((a, b) => a - b),
            ).toEqual([-2, -1, 0, 1, 2]);
            expect(
                samples.filter((sample) => sample.rungOffset === 0),
            ).toHaveLength(SLOTS);
            for (const rungOffset of [-2, -1, 0, 1, 2]) {
                const start = {
                    ...account.state,
                    balance: account.state.balance + rungOffset * RUNG_DOLLARS,
                };
                const first = samples.find(
                    (sample) =>
                        sample.rungOffset === rungOffset &&
                        sample.tradeIndex === 0,
                );
                const intendedFirst = computeRisk(start, 0, cycle);
                expect(first?.riskCents).toBe(Math.round(intendedFirst * 100));
                expect(first?.cushionCents).toBe(
                    Math.round((start.balance - start.threshold) * 100),
                );
                const loss = lossOf(plan, start, intendedFirst);
                const afterLoss = {
                    ...start,
                    balance: start.balance - loss,
                    todayPnL: start.todayPnL - loss,
                };
                const second = samples.find(
                    (sample) =>
                        sample.rungOffset === rungOffset &&
                        sample.tradeIndex === 1,
                );
                if (afterLoss.balance > afterLoss.threshold) {
                    expect(second?.riskCents).toBe(
                        Math.round(computeRisk(afterLoss, 1, cycle) * 100),
                    );
                } else {
                    expect(second).toBeUndefined();
                }
            }
        });

        it('hands computeRisk the rebuilt cycle snapshot, the regime and reset layer included, on every call', () => {
            const account = fundedAccount(plan);
            const cycle = account.fundedTracker?.cycleSnapshot(
                plan,
                account.state,
            );
            const real = solution.fundedResult.dayPolicy.computeRisk;
            if (real === undefined) throw new Error('no computeRisk');
            const spy = vi.fn(real);
            const spied: DpSolutionView = {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    dayPolicy: {
                        ...solution.fundedResult.dayPolicy,
                        computeRisk: spy,
                    },
                },
            };

            fundedAdvice({ account, solution: spied });

            expect(spy).toHaveBeenCalled();
            for (const call of spy.mock.calls) {
                expect(call[2]).toEqual(cycle);
            }
        });

        it('stores integer cents and no placed risk when the DP solved in continuous dollars, and says so', () => {
            const advice = fundedAdvice();
            const samples = sampledOf(advice);

            expect(
                samples.every((sample) => sample.placedRiskCents === null),
            ).toBe(true);
            expect(
                samples.every((sample) =>
                    Number.isSafeInteger(sample.riskCents),
                ),
            ).toBe(true);
            expect(advice.gaps).toContainEqual({
                kind: DpAdviceGap.ContinuousRiskAssumed,
            });
        });

        it('turns a computeRisk throw for an unreachable level into a typed reason', () => {
            const throwing: DpSolutionView = {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    dayPolicy: {
                        ...solution.fundedResult.dayPolicy,
                        computeRisk: () => {
                            throw new Error(
                                `${plan.label}: FundedStateValue computeRisk was asked for a locked state after 1 payout(s), which this plan can never reach (the account concludes there, or a payout always locks it), so no policy was solved for it`,
                            );
                        },
                    },
                },
            };

            expect(fundedAdvice({ solution: throwing }).samples).toEqual({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.FundedLevelUnreachable,
                stage: DpSampleStage.Funded,
            });
        });

        it('turns the real count-validation throw into a typed reason', () => {
            const account = fundedAccount(plan);
            const corrupt = {
                ...account,
                fundedTracker: {
                    cycleSnapshot: () => ({
                        cycleBestDayProfit: 0,
                        dayGateProgress: 0,
                        fundedResetsUsed: -1,
                        lastPayoutBalance: 1000,
                        payoutsIssued: 0,
                    }),
                } as unknown as DpAdviceAccount['fundedTracker'],
            };

            expect(fundedAdvice({ account: corrupt }).samples).toEqual({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.FundedCycleCountsInvalid,
                stage: DpSampleStage.Funded,
            });
        });

        it('lets an unknown computeRisk failure through instead of hiding it', () => {
            const broken: DpSolutionView = {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    dayPolicy: {
                        ...solution.fundedResult.dayPolicy,
                        computeRisk: () => {
                            throw new Error('something else entirely');
                        },
                    },
                },
            };

            expect(() => fundedAdvice({ solution: broken })).toThrow(
                'something else entirely',
            );
        });
    });

    describe('gaps', () => {
        it('lists the plan model gaps and the day stop rule the funded DP cannot model, with no consistency-grid gap for a plan without the rule', () => {
            const advice = fundedAdvice();

            for (const gap of fundedDpModelGaps(plan)) {
                expect(advice.gaps).toContainEqual(gap);
            }
            expect(advice.gaps).toContainEqual({
                kind: DpAdviceGap.DayStopRuleNotModeled,
            });
            expect(
                advice.gaps.some(
                    (gap) => gap.kind === DpAdviceGap.ConsistencyGridTruncates,
                ),
            ).toBe(false);
        });

        it('reports a state at the grid top exactly when the solved grid says it is saturated there', () => {
            const account = fundedAccount(plan);
            const cycle = account.fundedTracker?.cycleSnapshot(
                plan,
                account.state,
            );

            expect(
                fundedAdvice({ account }).gaps.some(
                    (gap) => gap.kind === DpAdviceGap.StateAtGridTop,
                ),
            ).toBe(solution.fundedResult.isGridSaturated(account.state, cycle));
        });

        it('adds the consistency-grid truncation with the locked grid top in cents for a plan with a funded consistency rule', () => {
            const consistent = plan.withOverrides({
                fundedConsistency: {
                    kind: 'set',
                    rule: new ConsistencyRule(
                        ConsistencyScope.Funded,
                        fraction(0.4),
                    ),
                },
            });
            const advice = fundedAdvice({ account: fundedAccount(consistent) });

            expect(advice.gaps).toContainEqual({
                kind: DpAdviceGap.ConsistencyGridTruncates,
                lockedTopCents: Math.round(
                    solution.fundedResult.cushionGrid.lockedTopDollars * 100,
                ),
            });
        });

        it('marks a state at the grid top as a gap and a saturation reason', () => {
            const saturated: DpSolutionView = {
                ...solution,
                fundedResult: {
                    ...solution.fundedResult,
                    isGridSaturated: () => true,
                },
            };

            const advice = fundedAdvice({ solution: saturated });

            expect(advice.gaps).toContainEqual({
                kind: DpAdviceGap.StateAtGridTop,
            });
            expect(advice.reasons).toContainEqual({
                kind: DifferenceReason.DpGridSaturation,
            });
        });

        it('carries a lifetime dollar cap gap from the model gaps through unchanged', () => {
            const capped = plan.withOverrides({
                maxLifetimePayoutDollars: dollars(90_000),
            });

            expect(
                fundedAdvice({ account: fundedAccount(capped) }).gaps,
            ).toContainEqual({
                kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
                maxLifetimePayoutDollars: 90_000,
            });
        });
    });

    describe('validation and reasons', () => {
        it('marks a funded row not validated with the no-run cause and no validation reference, and still samples it', () => {
            const advice = fundedAdvice();

            expect(advice.validated).toBe(false);
            expect(advice.validationRef).toBeNull();
            expect(advice.notValidated).toEqual({
                citation: null,
                failure: DpGateFailure.NoGateRun,
                result: null,
            });
            expect(advice.reasons).toContainEqual({
                cause: DpNotValidatedCause.NoGateRun,
                kind: DifferenceReason.DpNotValidated,
            });
            expect(advice.samples.kind).toBe(DpSamplesKind.Sampled);
        });

        it('names the gate result and cites the ledger row for a run below the best flat, without borrowing a wrong cause', () => {
            const advice = fundedAdvice({
                validation: NOT_VALIDATED_BELOW_FLAT,
            });

            expect(advice.notValidated).toEqual({
                citation: CITATION,
                failure: DpGateFailure.BelowBestFlat,
                result: '0.99x best flat (credit-inclusive)',
            });
            expect(
                advice.reasons.some(
                    (reason) => reason.kind === DifferenceReason.DpNotValidated,
                ),
            ).toBe(false);
        });

        it('validates a funded row from a passing gate and cites its ledger file and row', () => {
            const advice = fundedAdvice({ validation: VALIDATED });

            expect(advice.validated).toBe(true);
            expect(advice.notValidated).toBeNull();
            expect(advice.validationRef).toBe(
                `${CITATION.file}#${CITATION.row}`,
            );
            expect(
                advice.reasons.some(
                    (reason) => reason.kind === DifferenceReason.DpNotValidated,
                ),
            ).toBe(false);
        });

        it('carries the config key, the objective and the pinned solver version', () => {
            const advice = fundedAdvice();

            expect(advice.configKey).toBe(dpConfigKey(config));
            expect(advice.objective).toBe(SizingObjective.MonthlyNet);
            expect(advice.solverVersion).toBe(DP_ADVICE_SOLVER_VERSION);
        });

        it('pins the toy solve samples to the solver version: a changed value means bumping DP_ADVICE_SOLVER_VERSION', () => {
            const samples = sampledOf(fundedAdvice()).filter(
                (sample) => sample.rungOffset === 0,
            );

            expect(
                {
                    samples: samples.map(
                        ({ cushionCents, riskCents, tradeIndex }) => [
                            tradeIndex,
                            cushionCents,
                            riskCents,
                        ],
                    ),
                    solverVersion: DP_ADVICE_SOLVER_VERSION,
                },
                'the funded DP samples on the toy plan changed: bump DP_ADVICE_SOLVER_VERSION in DpAdviceRow.ts, then update this pin',
            ).toEqual({
                samples: [
                    [0, 10_000, 5000],
                    [1, 5000, 5000],
                ],
                solverVersion: 1,
            });
        });

        it('attaches AggressiveOptimumChurn with the verified pattern when the DP peak risk exceeds the documented peak', () => {
            const advice = fundedAdvice({
                accountPolicy: new StubConductPolicy(),
                documentedPeakRisk: 1,
            });

            expect(advice.reasons).toContainEqual({
                kind: DifferenceReason.AggressiveOptimumChurn,
                pattern: CONFIRMED_AGGRESSIVE_PATTERN,
            });
        });

        it('stays silent about churn without a verified pattern source or a documented peak', () => {
            expect(
                fundedAdvice({ documentedPeakRisk: 1 }).reasons.some(isChurn),
            ).toBe(false);
            expect(
                fundedAdvice({
                    accountPolicy: new StubConductPolicy(),
                    documentedPeakRisk: null,
                }).reasons.some(isChurn),
            ).toBe(false);
            expect(
                fundedAdvice({
                    accountPolicy: new StubConductPolicy(),
                    documentedPeakRisk: 1_000_000,
                }).reasons.some(isChurn),
            ).toBe(false);
        });
    });

    describe('eval rows', () => {
        it('are suppressed without a validated gate: no samples, a DpNotValidated reason', () => {
            const advice = dpAdviceFor({
                account: evalAccount(plan, 0),
                config,
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: NOT_VALIDATED_NO_RUN,
            });

            expect(advice.samples).toEqual({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.EvalRowsSuppressed,
                stage: DpSampleStage.Eval,
            });
            expect(advice.reasons).toContainEqual({
                cause: DpNotValidatedCause.NoGateRun,
                kind: DifferenceReason.DpNotValidated,
            });
            expect(advice.validated).toBe(false);
        });

        it('are suppressed with DpObjectiveMismatch when the gate verdict was solved for pass probability', () => {
            const advice = dpAdviceFor({
                account: evalAccount(plan, 0),
                config,
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: {
                    ...VALIDATED,
                    evalObjective: DpEvalObjective.PassProbability,
                },
            });

            expect(advice.samples).toMatchObject({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.EvalRowsSuppressed,
            });
            expect(advice.reasons).toContainEqual({
                kind: DifferenceReason.DpObjectiveMismatch,
            });
        });

        it('sample the reached state with riskAtReachedState once validated under the cash objective', () => {
            const account = evalAccount(plan, 1);
            const advice = dpAdviceFor({
                account,
                config,
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: VALIDATED,
            });
            const samples = sampledOf(advice);
            const base = samples.find(
                (sample) => sample.rungOffset === 0 && sample.tradeIndex === 0,
            );

            expect(base?.riskCents).toBe(
                Math.round(
                    (solution.evalResult.riskAtReachedState(account.state, 0) ??
                        NaN) * 100,
                ),
            );
            expect(advice.validated).toBe(true);
            expect(advice.samples).toMatchObject({ stage: DpSampleStage.Eval });
        });

        it('give DpStateUnreached with the day when the elapsed sessions are past the eval-days horizon', () => {
            const advice = dpAdviceFor({
                account: evalAccount(plan, EVAL_DAYS),
                config,
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: VALIDATED,
            });

            expect(advice.samples).toEqual({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.EvalDayPastHorizon,
                stage: DpSampleStage.Eval,
            });
            expect(advice.reasons).toContainEqual({
                day: EVAL_DAYS,
                kind: DifferenceReason.DpStateUnreached,
            });
        });

        it('give DpStateUnreached when riskAtReachedState says the state was never reached (the last close already passed)', () => {
            const passed = evalAccount(plan, 1, { balance: 1100 });
            const advice = dpAdviceFor({
                account: passed,
                config,
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: VALIDATED,
            });

            expect(advice.samples).toEqual({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.EvalStateUnreached,
                stage: DpSampleStage.Eval,
            });
            expect(advice.reasons).toContainEqual({
                day: 1,
                kind: DifferenceReason.DpStateUnreached,
            });
        });

        it('say so when the snapshot has no elapsed sessions to map onto a DP day', () => {
            const advice = dpAdviceFor({
                account: evalAccount(plan, undefined),
                config,
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: VALIDATED,
            });

            expect(advice.samples).toEqual({
                kind: DpSamplesKind.Unavailable,
                reason: DpSamplesUnavailableReason.EvalElapsedDaysMissing,
                stage: DpSampleStage.Eval,
            });
        });

        it('flag a drawdown that is not a multiple of the cushion step as informational DpGridMisaligned, and stay quiet when aligned', () => {
            const misaligned = dpAdviceFor({
                account: evalAccount(plan, 0),
                config: { ...config, evalGrid: { cushionStepDollars: 30 } },
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: VALIDATED,
            });
            const aligned = dpAdviceFor({
                account: evalAccount(plan, 0),
                config: { ...config, evalGrid: { cushionStepDollars: 50 } },
                documentedPeakRisk: null,
                documentedRungDollars: RUNG_DOLLARS,
                solution,
                validation: VALIDATED,
            });

            expect(misaligned.gaps).toContainEqual({
                drawdownCents: 10_000,
                kind: DpAdviceGap.EvalGridMisaligned,
                stepCents: 3000,
            });
            expect(misaligned.reasons).toContainEqual({
                drawdown: 100,
                kind: DifferenceReason.DpGridMisaligned,
                step: 30,
            });
            expect(
                aligned.gaps.some(
                    (gap) => gap.kind === DpAdviceGap.EvalGridMisaligned,
                ),
            ).toBe(false);
        });

        it('use the default cushion step when the config sets none', () => {
            expect(EVAL_CUSHION_STEP_DOLLARS_DEFAULT).toBe(100);
            const defaultStep = { ...config, evalGrid: {} };
            const oddDrawdown = plan.withOverrides({
                drawdown: new EodTrailingDrawdown({ amount: dollars(175) }),
            });
            const aligned = validatedEvalAdvice(
                evalAccount(plan, 0),
                defaultStep,
                solution,
            );
            const misaligned = validatedEvalAdvice(
                evalAccount(oddDrawdown, 0),
                defaultStep,
                solution,
            );

            expect(
                aligned.gaps.some(
                    (gap) => gap.kind === DpAdviceGap.EvalGridMisaligned,
                ),
            ).toBe(false);
            expect(misaligned.gaps).toContainEqual({
                drawdownCents: 17_500,
                kind: DpAdviceGap.EvalGridMisaligned,
                stepCents: 10_000,
            });
        });
    });

    describe('ineligible plans', () => {
        it('become a row with the reason, no samples and no validation', () => {
            const advice = ineligibleDpAdvice({
                config,
                reason: 'not DP-eligible for a test reason',
                stage: DpSampleStage.Funded,
            });

            expect(advice).toMatchObject({
                configKey: dpConfigKey(config),
                gaps: [],
                objective: SizingObjective.MonthlyNet,
                samples: {
                    kind: DpSamplesKind.Unavailable,
                    reason: DpSamplesUnavailableReason.NotEligible,
                    stage: DpSampleStage.Funded,
                },
                solverVersion: DP_ADVICE_SOLVER_VERSION,
                validated: false,
                validationRef: null,
            });
            expect(advice.reasons).toEqual([
                {
                    kind: DifferenceReason.DpIneligible,
                    reason: 'not DP-eligible for a test reason',
                },
            ]);
        });
    });
});

describe('dpAdviceFor with position sizing and a funded tier limit', () => {
    const base = toyDpPlan();
    const plan = base.withOverrides({
        contractLimits: {
            evalMicros: contracts(10),
            evalMinis: contracts(10),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(1),
            },
            fundedMinis: null,
        },
    });
    const positionSizing = {
        instrument: InstrumentSymbol.MNQ,
        stopPoints: 10,
    } as const;
    const config = toyDpConfig(plan, {
        evalGrid: {
            actionStepDollars: 50,
            cushionStepDollars: 50,
            maxActionDollars: 100,
            profitStepDollars: 50,
        },
        fundedGrid: {
            actionStepMultiple: 1,
            cushionStepMultiple: 1,
            maxActionMultiple: 1,
        },
        positionSizing,
        tradesPerDay: SLOTS,
    });
    let solution: DpSolutionView;

    beforeAll(() => {
        solution = solveAverageRewardPolicy(buildDpSolverCall(config, plan));
    }, 30_000);

    it('stores the placed whole-contract risk under the tier limit beside the DP action, in integer cents, and no continuous-risk gap', () => {
        const account = fundedAccount(plan);
        const advice = dpAdviceFor({
            account,
            config,
            documentedPeakRisk: null,
            documentedRungDollars: RUNG_DOLLARS,
            solution,
            validation: NOT_VALIDATED_NO_RUN,
        });
        if (advice.samples.kind !== DpSamplesKind.Sampled) {
            throw new Error('expected sampled advice');
        }
        const { samples } = advice.samples;
        const first = samples.find(
            (sample) => sample.rungOffset === 0 && sample.tradeIndex === 0,
        );
        const { computeRisk } = solution.fundedResult.dayPolicy;
        if (computeRisk === undefined) throw new Error('no computeRisk');
        const cycle = account.fundedTracker?.cycleSnapshot(plan, account.state);
        const expectedPlaced = resolveRiskAt({
            commission: 0,
            intendedRisk: computeRisk(account.state, 0, cycle),
            phase: TradingPhase.Funded,
            plan,
            positionSizing: resolvePositionSizing(
                positionSizing.instrument,
                positionSizing.stopPoints,
            ),
            rungSizing: DEFAULT_RUNG_SIZING,
            sizing: PolicySizing.WholeContracts,
            state: account.state,
        });

        expect(first?.placedRiskCents).not.toBeNull();
        expect(Number.isSafeInteger(first?.placedRiskCents)).toBe(true);
        expect(first?.placedRiskCents ?? 0).toBeLessThanOrEqual(5000);
        expect(expectedPlaced.rewardRisk * 100).toBe(first?.placedRiskCents);
        expect(
            advice.gaps.some(
                (gap) => gap.kind === DpAdviceGap.ContinuousRiskAssumed,
            ),
        ).toBe(false);
    });
});
