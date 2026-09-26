import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type ExactRiskStop,
    formatPoints,
    fundedTierOptions,
    normalizePositionSizeInput,
    POSITION_SIZE_INSTRUMENTS,
    POSITION_SIZE_PHASE_LABELS,
    positionSizeFirm,
    positionSizeFor,
    type PositionSizeInput,
    PositionSizeOutcome,
    positionSizePhases,
    type PositionSizeResult,
    positionSizeStatusText,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import { formatGateCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    ALL_INSTRUMENTS,
    contractLimitAt,
    dollars,
    type Dollars,
    formatOneContractRisk,
    fundedStartContractLimit,
    INSTRUMENTS,
    InstrumentSymbol,
    minStopPoints,
    oneContractRisk,
    placedFundedRiskAt,
    type Plan,
    points,
    type Points,
    resolvePositionSizing,
    TierBasis,
    TradingPhase,
    wholeContractCount,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);
const DEFAULT_PLAN = defaultCalculatorState().plan;
const GRID_RISKS = [
    0.01, 1, 14.99, 15, 99.99, 100, 149.99, 150, 250, 333.33, 450, 475, 500.5,
    900, 1234.56, 2500, 10_000,
];
const GRID_STOPS = [0.25, 1, 2.5, 5, 7.5, 7.75, 10, 12.25, 25];

function amountPattern(amount: number): RegExp {
    const text = formatGateCurrency(amount)
        .replaceAll('$', String.raw`\$`)
        .replaceAll('.', String.raw`\.`);
    return new RegExp(`${text}${String.raw`(?![\d,]|\.\d)`}`);
}

function dollarOutputs(result: PositionSizeResult): Dollars[] {
    return [
        result.leftover,
        result.placedRisk,
        result.exactRiskStop?.riskAtTickStop ?? null,
    ].filter((value): value is Dollars => value !== null);
}

function fundedTierBreakpoints(plan: Plan, isMicro: boolean): number[] {
    return Object.values(TierBasis).flatMap((basis) =>
        plan.fundedContractTierBreakpoints(basis, isMicro),
    );
}

function input({
    risk = 450,
    stopPoints = 7.5,
    tierProfit = null,
    ...overrides
}: Partial<Omit<PositionSizeInput, 'risk' | 'stopPoints' | 'tierProfit'>> & {
    risk?: number;
    stopPoints?: number;
    tierProfit?: null | number;
}): PositionSizeInput {
    return {
        instrument: InstrumentSymbol.NQ,
        phase: TradingPhase.Eval,
        plan: DEFAULT_PLAN,
        risk: dollars(risk),
        stopPoints: points(stopPoints),
        tierProfit: tierProfit === null ? null : dollars(tierProfit),
        ...overrides,
    };
}

function planWhere(isMatch: (plan: Plan) => boolean): Plan {
    const plan = ALL_PLANS.find(isMatch);
    if (plan === undefined) throw new Error('no plan matches');
    return plan;
}

function sizing(instrument: InstrumentSymbol, stopPoints: number) {
    const config = resolvePositionSizing(instrument, stopPoints);
    if (config === null) throw new Error('invalid sizing');
    return config;
}

function startFundedCap(plan: Plan, isMicro: boolean): null | number {
    return contractLimitAt(
        plan.contractLimits,
        TradingPhase.Funded,
        isMicro,
        plan.tierProfitContext(plan.initialState()),
    );
}

function tierContext(profit: number) {
    return {
        peakDayCloseProfit: profit,
        peakIntradayProfit: profit,
        profit,
        sessionOpenProfit: profit,
    };
}

const TIERED_PLAN = planWhere(
    (plan) =>
        fundedTierBreakpoints(plan, false).length > 1 && !plan.isInstantFunded,
);
const UNCAPPED_FUNDED_PLAN = planWhere(
    (plan) =>
        plan.contractLimits !== null &&
        startFundedCap(plan, false) === null &&
        startFundedCap(plan, true) === null &&
        !plan.isInstantFunded,
);
const DEFAULT_EVAL_NQ_CAP = contractLimitAt(
    DEFAULT_PLAN.contractLimits,
    TradingPhase.Eval,
    false,
    DEFAULT_PLAN.tierProfitContext(DEFAULT_PLAN.initialState()),
);
const INSTANT_PLAN = planWhere((plan) => plan.isInstantFunded);

describe('positionSizeFor: contracts, leftover and the exact-risk stop (F-26)', () => {
    it('puts $450 on 3 NQ at a 7.5 point stop with nothing left over and 7.5 points as the exact stop', () => {
        const result = positionSizeFor(input({}));
        expect(result.outcome).toBe(PositionSizeOutcome.Placed);
        expect(result.contracts).toBe(3);
        expect(result.fittingContracts).toBe(3);
        expect(result.placedRisk).toBe(450);
        expect(result.leftover).toBe(0);
        expect(result.exactRiskStop).toEqual({
            exactPoints: 7.5,
            isTickAligned: true,
            riskAtTickStop: 450,
            tickPoints: 7.5,
        });
        expect(result.refusal).toBeNull();
    });

    it('puts $475 at 7.5 points on 3 NQ with $25 left over, and rounds the exact stop down to the tick at 7.75 points risking $465', () => {
        const result = positionSizeFor(input({ risk: 475 }));
        expect(result.contracts).toBe(3);
        expect(result.leftover).toBe(25);
        expect(result.placedRisk).toBe(450);
        const stop = result.exactRiskStop;
        expect(stop?.exactPoints).toBeCloseTo(475 / 60, 12);
        expect(stop?.tickPoints).toBe(7.75);
        expect(stop?.riskAtTickStop).toBe(465);
        expect(stop?.isTickAligned).toBe(false);
    });

    it('shows the exact off-tick stop as a note beside the tick-aligned one', () => {
        const notes = positionSizeFor(input({ risk: 475 })).notes.join(' ');
        expect(notes).toContain('7.9167');
        expect(notes).toContain('7.75');
        expect(notes).toContain('$465');
        expect(positionSizeFor(input({})).notes.join(' ')).not.toContain(
            'rounded down',
        );
    });

    it('computes the leftover in whole cents', () => {
        const result = positionSizeFor(
            input({
                instrument: InstrumentSymbol.MNQ,
                risk: 100.37,
                stopPoints: 7.5,
            }),
        );
        expect(result.contracts).toBe(6);
        expect(result.placedRisk).toBe(90);
        expect(result.leftover).toBe(10.37);
    });

    it('matches wholeContractCount and oneContractRisk on every instrument, stop and risk of the grid', () => {
        for (const spec of ALL_INSTRUMENTS) {
            for (const stopPoints of GRID_STOPS) {
                for (const risk of GRID_RISKS) {
                    const result = positionSizeFor(
                        input({
                            instrument: spec.symbol,
                            phase: TradingPhase.Funded,
                            plan: UNCAPPED_FUNDED_PLAN,
                            risk,
                            stopPoints,
                        }),
                    );
                    const config = sizing(spec.symbol, stopPoints);
                    const fitting = wholeContractCount(risk, config);
                    expect(result.fittingContracts).toBe(fitting);
                    expect(result.contracts).toBe(fitting);
                    const leftoverCents =
                        Math.round(risk * 100) -
                        Math.round(fitting * oneContractRisk(config) * 100);
                    expect(result.leftover).toBe(leftoverCents / 100);
                    expect(
                        Number.isSafeInteger(
                            Math.round((result.leftover ?? 0) * 100),
                        ),
                    ).toBe(true);
                    expect(result.leftover).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });

    it('never risks more than the entered risk at the tick-aligned stop, and lands within one tick of the exact stop', () => {
        for (const spec of ALL_INSTRUMENTS) {
            for (const stopPoints of GRID_STOPS) {
                for (const risk of GRID_RISKS) {
                    const result = positionSizeFor(
                        input({
                            instrument: spec.symbol,
                            phase: TradingPhase.Funded,
                            plan: UNCAPPED_FUNDED_PLAN,
                            risk,
                            stopPoints,
                        }),
                    );
                    const stop = result.exactRiskStop;
                    if (result.contracts === 0) {
                        expect(stop).toBeNull();
                        continue;
                    }
                    expect(stop).not.toBeNull();
                    if (stop === null) continue;
                    expect(stop.exactPoints).toBe(
                        minStopPoints(risk, result.contracts, spec.pointValue),
                    );
                    expect(stop.riskAtTickStop).toBeLessThanOrEqual(risk);
                    expect(stop.tickPoints).toBeLessThanOrEqual(
                        stop.exactPoints + 1e-9,
                    );
                    expect(stop.tickPoints).toBeGreaterThan(
                        stop.exactPoints - spec.tickSize,
                    );
                    expect(
                        Number.isSafeInteger(
                            Math.round(
                                (stop.tickPoints / spec.tickSize) * 1e6,
                            ) / 1e6,
                        ),
                    ).toBe(true);
                    expect(stop.riskAtTickStop).toBeCloseTo(
                        stop.tickPoints * result.contracts * spec.pointValue,
                        9,
                    );
                    expect(stop.tickPoints).toBeGreaterThanOrEqual(
                        stopPoints - spec.tickSize,
                    );
                }
            }
        }
    });

    it('offers every modeled instrument', () => {
        expect(POSITION_SIZE_INSTRUMENTS.map((spec) => spec.symbol)).toEqual(
            ALL_INSTRUMENTS.map((spec) => spec.symbol),
        );
    });
});

describe('positionSizeFor: below one contract', () => {
    it('gives 0 contracts and the one-contract risk, and says the funded engine refuses the risk', () => {
        const values = input({
            phase: TradingPhase.Funded,
            risk: 100,
        });
        const result = positionSizeFor(values);
        const expectedRefusal = simInputsSizingIssue({
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 100,
            stopPoints: 7.5,
        });
        expect(expectedRefusal).not.toBeNull();
        expect(result.outcome).toBe(
            PositionSizeOutcome.BelowOneContractRefused,
        );
        expect(result.contracts).toBe(0);
        expect(result.exactRiskStop).toBeNull();
        expect(result.oneContractRiskText).toBe(
            formatOneContractRisk(sizing(InstrumentSymbol.NQ, 7.5)),
        );
        expect(result.oneContractRiskText).toBe('$150');
        expect(result.refusal).toBe(expectedRefusal);
    });

    it('follows the eval ContractCapped sizing: no refusal, and a note that the eval keeps the dollar risk', () => {
        const result = positionSizeFor(input({ risk: 100 }));
        expect(result.outcome).toBe(PositionSizeOutcome.BelowOneContractEval);
        expect(result.contracts).toBe(0);
        expect(result.refusal).toBeNull();
        const notes = result.notes.join(' ');
        expect(notes).toContain('$150');
        expect(notes).toContain('$100');
        expect(notes).toMatch(/eval/i);
        expect(notes).toMatch(/not rounded to whole contracts/);
    });

    it('treats one cent below one contract as below one contract and exactly one contract as placeable', () => {
        expect(
            positionSizeFor(input({ phase: TradingPhase.Funded, risk: 149.99 }))
                .outcome,
        ).toBe(PositionSizeOutcome.BelowOneContractRefused);
        const one = positionSizeFor(
            input({ phase: TradingPhase.Funded, risk: 150 }),
        );
        expect(one.outcome).toBe(PositionSizeOutcome.Placed);
        expect(one.contracts).toBe(1);
        expect(one.refusal).toBeNull();
    });
});

describe('positionSizeFor: the phase and tier contract cap', () => {
    it('caps eval contracts at the plan eval limit, flags it and reports the minimum stop at the cap', () => {
        const cap = contractLimitAt(
            DEFAULT_PLAN.contractLimits,
            TradingPhase.Eval,
            false,
            DEFAULT_PLAN.tierProfitContext(DEFAULT_PLAN.initialState()),
        );
        expect(cap).not.toBeNull();
        const capCount = cap ?? 0;
        const risk = (capCount + 2) * 100;
        const result = positionSizeFor(input({ risk, stopPoints: 5 }));
        expect(result.cap).toBe(capCount);
        expect(result.fittingContracts).toBe(capCount + 2);
        expect(result.contracts).toBe(capCount);
        expect(result.outcome).toBe(PositionSizeOutcome.Capped);
        expect(result.minStopAtCap).toBe(minStopPoints(risk, capCount, 20));
        expect(result.exactRiskStop?.exactPoints).toBe(result.minStopAtCap);
        expect(result.exactRiskStop?.riskAtTickStop).toBeLessThanOrEqual(risk);
    });

    it('uses the micro limit for a micro instrument', () => {
        const limits = DEFAULT_PLAN.contractLimits;
        const startContext = DEFAULT_PLAN.tierProfitContext(
            DEFAULT_PLAN.initialState(),
        );
        const result = positionSizeFor(
            input({ instrument: InstrumentSymbol.MNQ }),
        );
        expect(result.cap).toBe(
            contractLimitAt(limits, TradingPhase.Eval, true, startContext),
        );
    });

    it('reports the minimum stop at the cap even when the cap does not bind', () => {
        const result = positionSizeFor(input({}));
        expect(result.outcome).toBe(PositionSizeOutcome.Placed);
        expect(result.cap).not.toBeNull();
        expect(result.minStopAtCap).toBe(
            minStopPoints(450, result.cap ?? 0, 20),
        );
    });

    it('has no cap when the plan has no limit for the phase and instrument', () => {
        const result = positionSizeFor(
            input({
                phase: TradingPhase.Funded,
                plan: UNCAPPED_FUNDED_PLAN,
                risk: 100_000,
                stopPoints: 1,
            }),
        );
        expect(result.cap).toBeNull();
        expect(result.minStopAtCap).toBeNull();
        expect(result.outcome).toBe(PositionSizeOutcome.Placed);
        expect(result.contracts).toBe(5000);
    });

    it('lists the funded tiers from Plan.fundedContractTierBreakpoints and caps at each tier', () => {
        const breakpoints = fundedTierBreakpoints(TIERED_PLAN, false);
        expect(breakpoints.length).toBeGreaterThan(1);
        expect(fundedTierOptions(TIERED_PLAN, InstrumentSymbol.NQ)).toEqual(
            breakpoints,
        );
        for (const tierProfit of breakpoints) {
            const result = positionSizeFor(
                input({
                    phase: TradingPhase.Funded,
                    plan: TIERED_PLAN,
                    risk: 100_000,
                    stopPoints: 1,
                    tierProfit,
                }),
            );
            expect(result.cap).toBe(
                contractLimitAt(
                    TIERED_PLAN.contractLimits,
                    TradingPhase.Funded,
                    false,
                    tierContext(tierProfit),
                ),
            );
            expect(result.contracts).toBe(result.cap);
            expect(result.outcome).toBe(PositionSizeOutcome.Capped);
        }
    });

    it('has no tiers on a flat or missing funded limit', () => {
        expect(fundedTierOptions(DEFAULT_PLAN, InstrumentSymbol.ES)).toEqual(
            fundedTierBreakpoints(DEFAULT_PLAN, false),
        );
        expect(
            fundedTierOptions(UNCAPPED_FUNDED_PLAN, InstrumentSymbol.NQ),
        ).toEqual([]);
    });

    it('reads the funded tiers through Plan.fundedContractTierBreakpoints for the instrument size', () => {
        const spy = vi.spyOn(TIERED_PLAN, 'fundedContractTierBreakpoints');
        try {
            fundedTierOptions(TIERED_PLAN, InstrumentSymbol.MNQ);
            expect(spy.mock.calls).toEqual(
                Object.values(TierBasis).map((basis) => [basis, true]),
            );
            spy.mockClear();
            fundedTierOptions(TIERED_PLAN, InstrumentSymbol.NQ);
            expect(spy.mock.calls).toEqual(
                Object.values(TierBasis).map((basis) => [basis, false]),
            );
        } finally {
            spy.mockRestore();
        }
    });

    it('tells a capped trader where the stop lands at the cap, never a lower bound to widen from', () => {
        expect(DEFAULT_EVAL_NQ_CAP).not.toBeNull();
        const cap = DEFAULT_EVAL_NQ_CAP ?? 0;
        const tickRisk = cap * 20 * 7.75;
        const risk = tickRisk + 1;
        const result = positionSizeFor(input({ risk, stopPoints: 5 }));
        expect(result.outcome).toBe(PositionSizeOutcome.Capped);
        expect(result.fittingContracts).toBeGreaterThan(cap);
        expect(result.exactRiskStop?.tickPoints).toBe(7.75);
        expect(result.exactRiskStop?.riskAtTickStop).toBe(tickRisk);
        const notes = result.notes.join(' ');
        expect(notes).not.toMatch(/at least/);
        expect(notes).toContain(formatPoints(result.minStopAtCap ?? 0));
        expect(notes).toContain('7.75 points');
        expect(notes).toContain(formatGateCurrency(tickRisk));
        expect(notes).toMatch(/wider stop/);
        expect(
            result.notes.filter((note) => note.includes('7.75 points')),
        ).toHaveLength(1);
    });

    it('never words a binding cap as a minimum stop across the grid', () => {
        for (const plan of ALL_PLANS) {
            for (const phase of positionSizePhases(plan)) {
                for (const spec of ALL_INSTRUMENTS) {
                    for (const stopPoints of GRID_STOPS) {
                        for (const risk of GRID_RISKS) {
                            const result = positionSizeFor(
                                input({
                                    instrument: spec.symbol,
                                    phase,
                                    plan,
                                    risk,
                                    stopPoints,
                                }),
                            );
                            if (result.outcome !== PositionSizeOutcome.Capped) {
                                continue;
                            }
                            const notes = result.notes.join(' ');
                            expect(notes).not.toMatch(/at least/);
                            const stop = result.exactRiskStop;
                            if (stop === null) continue;
                            expect(notes).toContain(
                                `${formatPoints(stop.tickPoints)} points`,
                            );
                            expect(notes).toContain(
                                formatGateCurrency(stop.riskAtTickStop),
                            );
                        }
                    }
                }
            }
        }
    });

    it('matches placedFundedRiskAt at the funded start tier on every plan, instrument, stop and risk of the grid', () => {
        for (const plan of ALL_PLANS) {
            for (const spec of ALL_INSTRUMENTS) {
                for (const stopPoints of GRID_STOPS) {
                    for (const risk of GRID_RISKS) {
                        const config = sizing(spec.symbol, stopPoints);
                        const placed = placedFundedRiskAt(risk, config, plan);
                        const result = positionSizeFor(
                            input({
                                instrument: spec.symbol,
                                phase: TradingPhase.Funded,
                                plan,
                                risk,
                                stopPoints,
                            }),
                        );
                        expect(result.cap).toBe(
                            fundedStartContractLimit(plan, config),
                        );
                        expect(result.contracts).toBe(placed.contracts);
                        expect(
                            result.outcome === PositionSizeOutcome.Capped,
                        ).toBe(placed.isCapped);
                        if (!placed.isCapped) {
                            expect(result.placedRisk).toBe(placed.risk);
                        }
                    }
                }
            }
        }
    });
});

describe('positionSizeFor never converts a contract cap into a dollar suggestion (PD-25)', () => {
    it("reports a binding cap as contracts and a stop, never as the cap times one contract at today's stop", () => {
        for (const plan of ALL_PLANS) {
            for (const phase of positionSizePhases(plan)) {
                for (const spec of ALL_INSTRUMENTS) {
                    for (const stopPoints of GRID_STOPS) {
                        for (const risk of GRID_RISKS) {
                            const result = positionSizeFor(
                                input({
                                    instrument: spec.symbol,
                                    phase,
                                    plan,
                                    risk,
                                    stopPoints,
                                }),
                            );
                            for (const amount of dollarOutputs(result)) {
                                expect(amount).toBeLessThanOrEqual(risk);
                            }
                            if (result.outcome !== PositionSizeOutcome.Capped) {
                                continue;
                            }
                            const capDollars =
                                (result.cap ?? 0) *
                                oneContractRisk(
                                    sizing(spec.symbol, stopPoints),
                                );
                            const cap = result.cap ?? 0;
                            const tickStep = cap * spec.tickValue;
                            const atTick =
                                result.exactRiskStop?.riskAtTickStop ?? null;
                            expect(result.placedRisk).toBeNull();
                            expect(result.leftover).toBeNull();
                            expect(dollarOutputs(result)).toEqual(
                                atTick === null ? [] : [atTick],
                            );
                            if (atTick !== null) {
                                expect(atTick).toBeGreaterThan(
                                    risk - tickStep - 1e-9,
                                );
                            }
                            const notes = result.notes.join(' ');
                            if (capDollars !== atTick && capDollars > 0) {
                                expect(notes).not.toMatch(
                                    amountPattern(capDollars),
                                );
                            }
                        }
                    }
                }
            }
        }
    });
});

describe('positionSizePhases and normalizePositionSizeInput', () => {
    it('offers eval and funded on an eval plan and only funded on an instant-funded plan', () => {
        expect(positionSizePhases(DEFAULT_PLAN)).toEqual([
            TradingPhase.Eval,
            TradingPhase.Funded,
        ]);
        expect(positionSizePhases(INSTANT_PLAN)).toEqual([TradingPhase.Funded]);
    });

    it('moves an instant-funded plan to the funded phase', () => {
        expect(
            normalizePositionSizeInput(
                input({ phase: TradingPhase.Eval, plan: INSTANT_PLAN }),
            ).phase,
        ).toBe(TradingPhase.Funded);
    });

    it('keeps a funded tier only when the plan and instrument offer it', () => {
        const [, second] = fundedTierOptions(TIERED_PLAN, InstrumentSymbol.NQ);
        expect(second).toBeDefined();
        const kept = normalizePositionSizeInput(
            input({
                phase: TradingPhase.Funded,
                plan: TIERED_PLAN,
                tierProfit: second ?? null,
            }),
        );
        expect(kept.tierProfit).toBe(second);
        expect(
            normalizePositionSizeInput(
                input({
                    phase: TradingPhase.Funded,
                    plan: TIERED_PLAN,
                    tierProfit: 123.45,
                }),
            ).tierProfit,
        ).toBeNull();
        expect(
            normalizePositionSizeInput(
                input({
                    phase: TradingPhase.Eval,
                    plan: TIERED_PLAN,
                    tierProfit: second ?? null,
                }),
            ).tierProfit,
        ).toBeNull();
        expect(
            normalizePositionSizeInput(
                input({
                    phase: TradingPhase.Funded,
                    plan: UNCAPPED_FUNDED_PLAN,
                    tierProfit: second ?? null,
                }),
            ).tierProfit,
        ).toBeNull();
    });

    it('leaves a valid input unchanged', () => {
        const values = input({ risk: 475 });
        expect(normalizePositionSizeInput(values)).toEqual(values);
    });

    it('uses the instrument point value and tick of the INSTRUMENTS table', () => {
        const result = positionSizeFor(
            input({
                instrument: InstrumentSymbol.ES,
                risk: 500,
                stopPoints: 5,
            }),
        );
        expect(result.positionSizing.instrument).toBe(
            INSTRUMENTS[InstrumentSymbol.ES],
        );
        expect(result.contracts).toBe(2);
        expect(result.exactRiskStop?.tickPoints).toBe(5);
    });
});

describe('positionSizeStatusText: one live summary sentence', () => {
    it('summarises a placed trade with its leftover and exact-risk stop', () => {
        const values = input({ risk: 475 });
        expect(positionSizeStatusText(values, positionSizeFor(values))).toBe(
            '3 NQ, $25 left over; the stop for the exact risk is 7.75 points, risking $465.',
        );
    });

    it('summarises a capped trade without a leftover', () => {
        const cap = DEFAULT_EVAL_NQ_CAP ?? 0;
        const values = input({ risk: cap * 155 + 1, stopPoints: 5 });
        expect(positionSizeStatusText(values, positionSizeFor(values))).toBe(
            `${cap} NQ, held to the eval contract limit; the stop for the exact risk is 7.75 points, risking ${formatGateCurrency(cap * 155)}.`,
        );
    });

    it('summarises below one contract in eval and in funded', () => {
        const evalValues = input({ risk: 100 });
        expect(
            positionSizeStatusText(evalValues, positionSizeFor(evalValues)),
        ).toBe('No whole NQ contract fits: one contract risks $150.');
        const fundedValues = input({ phase: TradingPhase.Funded, risk: 100 });
        expect(
            positionSizeStatusText(fundedValues, positionSizeFor(fundedValues)),
        ).toBe(
            'No whole NQ contract fits: one contract risks $150, and the funded simulation refuses this risk.',
        );
    });
});

describe('position-size units', () => {
    it('brands every dollar field as Dollars and every point field as Points', () => {
        expectTypeOf<PositionSizeInput['risk']>().toEqualTypeOf<Dollars>();
        expectTypeOf<PositionSizeInput['stopPoints']>().toEqualTypeOf<Points>();
        expectTypeOf<
            PositionSizeInput['tierProfit']
        >().toEqualTypeOf<Dollars | null>();
        expectTypeOf<
            PositionSizeResult['leftover']
        >().toEqualTypeOf<Dollars | null>();
        expectTypeOf<
            PositionSizeResult['placedRisk']
        >().toEqualTypeOf<Dollars | null>();
        expectTypeOf<
            PositionSizeResult['minStopAtCap']
        >().toEqualTypeOf<null | Points>();
        expectTypeOf<ExactRiskStop['exactPoints']>().toEqualTypeOf<Points>();
        expectTypeOf<ExactRiskStop['tickPoints']>().toEqualTypeOf<Points>();
        expectTypeOf<
            ExactRiskStop['riskAtTickStop']
        >().toEqualTypeOf<Dollars>();
        expectTypeOf(fundedTierOptions).returns.toEqualTypeOf<
            readonly Dollars[]
        >();
    });
});

describe('positionSizeFirm and POSITION_SIZE_PHASE_LABELS', () => {
    it('finds the firm that offers each plan', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                expect(positionSizeFirm(plan)).toBe(firm);
            }
        }
    });

    it('labels both phases', () => {
        expect(POSITION_SIZE_PHASE_LABELS).toEqual({
            [TradingPhase.Eval]: 'Eval',
            [TradingPhase.Funded]: 'Funded',
        });
    });
});
