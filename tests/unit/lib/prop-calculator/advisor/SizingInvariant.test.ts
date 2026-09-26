import { describe, expect, expectTypeOf, it } from 'vitest';
import { ZodError } from 'zod';

import {
    contracts,
    DayStopRuleKind,
    type Dollars,
    dollars,
    fraction,
    InstrumentSymbol,
    type Points,
} from '~/lib/prop-calculator';
import {
    assertSizingInvariant,
    type CappedAmount,
    createDocumentedRule,
    type DailyProfitCap,
    DailyProfitCapKind,
    type DayProgress,
    DayStopReason,
    DEFAULT_RULEBOOK,
    DocumentedRule,
    type DocumentedSizing,
    EvalLadderRule,
    EvalMaxRiskRule,
    type EvalRuleContext,
    EvalSizingMode,
    FundedFixedRiskRule,
    type FundedRuleContext,
    fundedRuleContextSchema,
    hardProfitCeiling,
    LadderFractionSource,
    LiveCushionPercentRule,
    type LiveRuleContext,
    type NextTrade,
    NextTradeKind,
    type RulebookParameters,
    type RuleContext,
    SizingInvariantBreach,
    SizingInvariantError,
    SizingProvenance,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const CENT = 1e-6;

class HandBuiltRule extends DocumentedRule<FundedRuleContext> {
    constructor(
        private readonly sizing: DocumentedSizing,
        private readonly trade: NextTrade,
    ) {
        super(DEFAULT_RULEBOOK, fundedRuleContextSchema);
    }

    protected plannedRisk(): null {
        return null;
    }

    protected sizeWithin(): DocumentedSizing {
        return this.sizing;
    }

    protected tradeAfter(): NextTrade {
        return this.trade;
    }
}

function breachOf(sizing: DocumentedSizing, ruleContext: RuleContext) {
    try {
        assertSizingInvariant(sizing, ruleContext);
    } catch (error) {
        if (error instanceof SizingInvariantError) {
            return { breach: error.breach, rungIndex: error.rungIndex };
        }
        throw error;
    }
    return null;
}

function evalContext(
    overrides: Partial<EvalRuleContext> = {},
): EvalRuleContext {
    return {
        consistencyDailyCap: null,
        contractLimit: null,
        cushion: dollars(2000),
        dayStartDllRoom: null,
        instrument: null,
        personalDll: null,
        remainingProfitToTarget: dollars(1_000_000),
        stage: SizingStage.Eval,
        ...overrides,
    };
}

function fundedContext(
    overrides: Partial<FundedRuleContext> = {},
): FundedRuleContext {
    return {
        contractLimit: null,
        cushion: dollars(2000),
        dayStartDllRoom: null,
        instrument: null,
        personalDll: null,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

function handBuilt(risks: readonly number[]): DocumentedSizing {
    let running = 0;
    const rungs = risks.map((risk) => {
        const before = running;
        running += risk;
        return {
            cappedBy: [],
            risk: dollars(risk),
            runningLossAfter: dollars(running),
            runningLossBefore: dollars(before),
            takeProfit: dollars(2 * risk),
        };
    });
    return {
        assumptions: [],
        constraints: [],
        dailyProfitCap: null,
        maxTrades: 4,
        minStopPointsAtCap: null,
        profitCeiling: null,
        provenance: SizingProvenance.GeneralDerivation,
        rewardMultiple: 2,
        rungs,
        sources: [],
        stopRule: { kind: DayStopRuleKind.DayGreen },
    };
}

function rulebookFor(mode: EvalSizingMode, rr: number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        eval: {
            ...DEFAULT_RULEBOOK.eval,
            maxRiskDailyCapMultiple: Math.max(2, rr),
            mode,
        },
        strategy: { ...DEFAULT_RULEBOOK.strategy, rr },
    };
}

function thrownBreach(act: () => unknown) {
    try {
        act();
    } catch (error) {
        if (error instanceof SizingInvariantError) {
            return { breach: error.breach, rungIndex: error.rungIndex };
        }
        throw error;
    }
    return null;
}

function withDailyCap(
    sizing: DocumentedSizing,
    dailyProfitCap: DailyProfitCap,
): DocumentedSizing {
    return { ...sizing, dailyProfitCap };
}

const CUSHIONS = [0, 30, 200, 900, 1500, 1550, 1730, 2000, 4000, 8000];
const DLL_ROOMS = [null, 0, 300, 600, 1000];
const PERSONAL_DLLS = [null, 600];
const CONSISTENCY_CAPS = [null, 250, 600, 900];
const REMAINING_TARGETS = [0, 500, 3000];
const RRS = [1.5, 2, 3];

interface SweepCase {
    readonly context: RuleContext;
    readonly rule: DocumentedRule;
}

function evalCases(buildRule: (rr: number) => DocumentedRule): SweepCase[] {
    const cases: SweepCase[] = [];
    for (const rr of RRS) {
        const rule = buildRule(rr);
        for (const side of lossSides()) {
            for (const consistency of CONSISTENCY_CAPS) {
                for (const remaining of REMAINING_TARGETS) {
                    cases.push({
                        context: {
                            ...side,
                            consistencyDailyCap: nullableDollars(consistency),
                            remainingProfitToTarget: dollars(remaining),
                            stage: SizingStage.Eval,
                        },
                        rule,
                    });
                }
            }
        }
    }
    return cases;
}

function fundedCases(): SweepCase[] {
    const rule = new FundedFixedRiskRule(DEFAULT_RULEBOOK);
    return lossSides().map((side) => ({
        context: { ...side, stage: SizingStage.Funded },
        rule,
    }));
}

function liveCases(): SweepCase[] {
    const cases: SweepCase[] = [];
    for (const rr of RRS) {
        const rule = new LiveCushionPercentRule(
            rulebookFor(EvalSizingMode.Ladder, rr),
        );
        for (const side of lossSides()) {
            for (const percent of [null, fraction(0.1)]) {
                cases.push({
                    context: {
                        ...side,
                        liveCushionPercent: percent,
                        stage: SizingStage.Live,
                        thresholdLocked: side.cushion > 4000,
                    },
                    rule,
                });
            }
        }
    }
    return cases;
}

function lossSides(): Pick<
    RuleContext,
    | 'contractLimit'
    | 'cushion'
    | 'dayStartDllRoom'
    | 'instrument'
    | 'personalDll'
>[] {
    const sides = [];
    for (const cushion of CUSHIONS) {
        for (const dll of DLL_ROOMS) {
            for (const personal of PERSONAL_DLLS) {
                sides.push({
                    contractLimit: contracts(3),
                    cushion: dollars(cushion),
                    dayStartDllRoom: nullableDollars(dll),
                    instrument: InstrumentSymbol.NQ,
                    personalDll: nullableDollars(personal),
                });
            }
        }
    }
    return sides;
}

function nullableDollars(amount: null | number): Dollars | null {
    return amount === null ? null : dollars(amount);
}

const LOSS_SIDES = CUSHIONS.length * DLL_ROOMS.length * PERSONAL_DLLS.length;
const EVAL_CASES =
    RRS.length *
    LOSS_SIDES *
    CONSISTENCY_CAPS.length *
    REMAINING_TARGETS.length;

const SWEEPS: readonly (readonly [string, () => SweepCase[], number])[] = [
    [
        'general-derivation ladder',
        () =>
            evalCases(
                (rr) =>
                    new EvalLadderRule(rulebookFor(EvalSizingMode.Ladder, rr)),
            ),
        EVAL_CASES,
    ],
    [
        'MFF search ladder',
        () =>
            evalCases(
                (rr) =>
                    new EvalLadderRule({
                        ...rulebookFor(EvalSizingMode.Ladder, rr),
                        eval: {
                            ...rulebookFor(EvalSizingMode.Ladder, rr).eval,
                            ladderFractionSource:
                                LadderFractionSource.MffRapidEodSearch,
                        },
                    }),
            ),
        EVAL_CASES,
    ],
    [
        'max risk',
        () =>
            evalCases(
                (rr) =>
                    new EvalMaxRiskRule(
                        rulebookFor(EvalSizingMode.MaxRisk, rr),
                    ),
            ),
        EVAL_CASES,
    ],
    ['funded fixed risk', fundedCases, LOSS_SIDES],
    ['live percent of cushion', liveCases, RRS.length * LOSS_SIDES * 2],
];

function ceilingOf(context: RuleContext, sizing: DocumentedSizing): number {
    if (context.stage !== SizingStage.Eval) return Infinity;
    const cap = sizing.dailyProfitCap;
    return Math.min(
        context.consistencyDailyCap ?? Infinity,
        context.remainingProfitToTarget,
        cap?.kind === DailyProfitCapKind.HardCeiling ? cap.ceiling : Infinity,
    );
}

function lossRoomOf(context: RuleContext): number {
    return Math.min(
        context.cushion,
        context.dayStartDllRoom ?? Infinity,
        context.personalDll ?? Infinity,
    );
}

function walkEveryPath({ context, rule }: SweepCase): number {
    const sizing = rule.size(context);
    const lossRoom = lossRoomOf(context);
    const ceiling = ceilingOf(context, sizing);
    let paths = 0;
    const explore = (day: DayProgress): void => {
        const trade = rule.nextTrade(context, day);
        if (trade.kind === NextTradeKind.Stop) {
            paths += 1;
            return;
        }
        const { risk, takeProfit } = trade.rung;
        expect(risk).toBeGreaterThan(0);
        expect(day.runningLoss + risk).toBeLessThanOrEqual(lossRoom + CENT);
        expect(day.dayPnL + takeProfit).toBeLessThanOrEqual(ceiling + CENT);
        explore({
            ...day,
            dayPnL: dollars(day.dayPnL + takeProfit),
            wins: day.wins + 1,
        });
        explore({
            dayPnL: dollars(day.dayPnL - risk),
            losses: day.losses + 1,
            runningLoss: dollars(day.runningLoss + risk),
            wins: day.wins,
        });
    };
    explore({
        dayPnL: dollars(0),
        losses: 0,
        runningLoss: dollars(0),
        wins: 0,
    });
    return paths;
}

describe('assertSizingInvariant (PD-33)', () => {
    it.each(SWEEPS)(
        'holds for every %s output and every win/loss path across the context table',
        (_name, cases, expectedCases) => {
            const table = cases();
            let paths = 0;
            for (const sweepCase of table) {
                const sizing = sweepCase.rule.size(sweepCase.context);
                expect(breachOf(sizing, sweepCase.context)).toBeNull();
                paths += walkEveryPath(sweepCase);
            }
            expect(table).toHaveLength(expectedCases);
            expect(paths).toBeGreaterThanOrEqual(table.length);
        },
    );

    it('passes a hand-built ladder that uses the cushion exactly', () => {
        expect(
            breachOf(handBuilt([400, 600, 900, 100]), fundedContext()),
        ).toBeNull();
    });

    it('fails a rung above the cushion left after the running loss', () => {
        expect(
            breachOf(handBuilt([400, 600, 900, 200]), fundedContext()),
        ).toEqual({
            breach: SizingInvariantBreach.RungAboveAffordable,
            rungIndex: 3,
        });
    });

    it('fails a rung above the day-start DLL room left after the running loss', () => {
        const dllContext = fundedContext({ dayStartDllRoom: dollars(1000) });

        expect(breachOf(handBuilt([400, 700]), dllContext)).toEqual({
            breach: SizingInvariantBreach.RungAboveAffordable,
            rungIndex: 1,
        });
    });

    it('fails a running loss above the personal DLL', () => {
        const personalContext = fundedContext({ personalDll: dollars(600) });

        expect(breachOf(handBuilt([400, 600]), personalContext)).toEqual({
            breach: SizingInvariantBreach.RunningLossAboveRoom,
            rungIndex: 1,
        });
    });

    it('fails a win above the consistency cap on the all-loss path', () => {
        const capped = evalContext({ consistencyDailyCap: dollars(600) });

        expect(breachOf(handBuilt([300]), capped)).toBeNull();
        expect(breachOf(handBuilt([400]), capped)).toEqual({
            breach: SizingInvariantBreach.WinAboveCeiling,
            rungIndex: 0,
        });
    });

    it('fails a win above the remaining target after earlier losses', () => {
        const target = evalContext({ remainingProfitToTarget: dollars(500) });

        expect(breachOf(handBuilt([250, 400]), target)).toEqual({
            breach: SizingInvariantBreach.WinAboveCeiling,
            rungIndex: 1,
        });
    });

    it('fails a win above a hard daily profit cap that the context alone allows', () => {
        const open = evalContext();
        const hardCap: DailyProfitCap = {
            ceiling: dollars(500),
            kind: DailyProfitCapKind.HardCeiling,
        };
        const capped = (risks: readonly number[]) =>
            breachOf(withDailyCap(handBuilt(risks), hardCap), open);

        expect(capped([250])).toBeNull();
        expect(capped([300])).toEqual({
            breach: SizingInvariantBreach.WinAboveCeiling,
            rungIndex: 0,
        });
        expect(capped([200, 400])).toEqual({
            breach: SizingInvariantBreach.WinAboveCeiling,
            rungIndex: 1,
        });
    });

    it('never reads a stop trigger as a ceiling', () => {
        const triggered = withDailyCap(handBuilt([300]), {
            kind: DailyProfitCapKind.StopTrigger,
            stopAfter: dollars(500),
        });

        expect(breachOf(triggered, evalContext())).toBeNull();
        expect(breachOf(triggered, fundedContext())).toBeNull();
    });

    it('fails a running-loss column that disagrees with the rungs', () => {
        const sizing = handBuilt([400, 600]);
        const tampered: DocumentedSizing = {
            ...sizing,
            rungs: sizing.rungs.map((rung, index) =>
                index === 1 ? { ...rung, runningLossBefore: dollars(0) } : rung,
            ),
        };

        expect(breachOf(tampered, fundedContext())).toEqual({
            breach: SizingInvariantBreach.RunningLossColumnMismatch,
            rungIndex: 1,
        });
    });

    it.each([0, -50, NaN])('fails a rung of %d', (risk) => {
        expect(breachOf(handBuilt([400, risk]), fundedContext())).toEqual({
            breach: SizingInvariantBreach.InvalidRung,
            rungIndex: 1,
        });
    });

    it('fails any rung at a zero cushion', () => {
        const emptyContext = fundedContext({ cushion: dollars(0) });

        expect(breachOf(handBuilt([50]), emptyContext)).toEqual({
            breach: SizingInvariantBreach.RungAboveAffordable,
            rungIndex: 0,
        });
    });
});

describe('DocumentedRule fails loud instead of returning a breaching sizing', () => {
    const stop: NextTrade = {
        cappedBy: [],
        kind: NextTradeKind.Stop,
        reason: DayStopReason.MaxTrades,
    };

    it('size() throws when a subclass sizes a rung above the cushion', () => {
        const rule = new HandBuiltRule(handBuilt([400, 600, 900, 200]), stop);

        expect(thrownBreach(() => rule.size(fundedContext()))).toEqual({
            breach: SizingInvariantBreach.RungAboveAffordable,
            rungIndex: 3,
        });
    });

    it('nextTrade() throws when a subclass returns a trade above the cushion left', () => {
        const oversized = handBuilt([400, 1700]).rungs[1];
        if (oversized === undefined) throw new Error('missing rung');
        const rule = new HandBuiltRule(handBuilt([400]), {
            kind: NextTradeKind.Trade,
            rung: oversized,
        });

        expect(
            thrownBreach(() =>
                rule.nextTrade(fundedContext(), {
                    dayPnL: dollars(-400),
                    losses: 1,
                    runningLoss: dollars(400),
                    wins: 0,
                }),
            ),
        ).toEqual({
            breach: SizingInvariantBreach.RungAboveAffordable,
            rungIndex: 1,
        });
    });
});

describe('DocumentedRule enforces a hard daily profit cap on the next trade', () => {
    const hardCap: DailyProfitCap = {
        ceiling: dollars(500),
        kind: DailyProfitCapKind.HardCeiling,
    };
    const afterOneLoss: DayProgress = {
        dayPnL: dollars(-100),
        losses: 1,
        runningLoss: dollars(100),
        wins: 0,
    };

    function nextTradeBreach(risks: readonly number[], cap: DailyProfitCap) {
        const rung = handBuilt(risks).rungs.at(-1);
        if (rung === undefined) throw new Error('missing rung');
        const rule = new HandBuiltRule(withDailyCap(handBuilt([100]), cap), {
            kind: NextTradeKind.Trade,
            rung,
        });
        return thrownBreach(() =>
            rule.nextTrade(fundedContext(), afterOneLoss),
        );
    }

    it('throws when a trade would win past the hard cap from where the day stands', () => {
        expect(nextTradeBreach([100, 300], hardCap)).toBeNull();
        expect(nextTradeBreach([100, 400], hardCap)).toEqual({
            breach: SizingInvariantBreach.WinAboveCeiling,
            rungIndex: 1,
        });
    });

    it('lets the same trade through under a stop trigger of the same dollars', () => {
        expect(
            nextTradeBreach([100, 400], {
                kind: DailyProfitCapKind.StopTrigger,
                stopAfter: dollars(500),
            }),
        ).toBeNull();
    });
});

describe('hardProfitCeiling', () => {
    it('reads a number only from a hard ceiling', () => {
        expect(
            hardProfitCeiling({
                ceiling: dollars(900),
                kind: DailyProfitCapKind.HardCeiling,
            }),
        ).toBe(900);
        expect(
            hardProfitCeiling({
                kind: DailyProfitCapKind.StopTrigger,
                stopAfter: dollars(900),
            }),
        ).toBeNull();
        expect(hardProfitCeiling(null)).toBeNull();
    });
});

describe('createDocumentedRule', () => {
    it('builds the general-derivation ladder for the default eval rulebook', () => {
        const rule = createDocumentedRule(SizingStage.Eval, DEFAULT_RULEBOOK);

        expect(rule).toBeInstanceOf(EvalLadderRule);
        expect((rule as EvalLadderRule).fractionSource).toBe(
            LadderFractionSource.GeneralDerivation,
        );
    });

    it('builds the MFF search ladder when the rulebook opts in', () => {
        const rule = createDocumentedRule(SizingStage.Eval, {
            ...DEFAULT_RULEBOOK,
            eval: {
                ...DEFAULT_RULEBOOK.eval,
                ladderFractionSource: LadderFractionSource.MffRapidEodSearch,
            },
        });

        expect(rule).toBeInstanceOf(EvalLadderRule);
        expect((rule as EvalLadderRule).fractionSource).toBe(
            LadderFractionSource.MffRapidEodSearch,
        );
    });

    it('builds the max-risk rule when the rulebook opts in', () => {
        expect(
            createDocumentedRule(
                SizingStage.Eval,
                rulebookFor(EvalSizingMode.MaxRisk, 2),
            ),
        ).toBeInstanceOf(EvalMaxRiskRule);
    });

    it('builds the funded and live rules for their stages', () => {
        expect(
            createDocumentedRule(SizingStage.Funded, DEFAULT_RULEBOOK),
        ).toBeInstanceOf(FundedFixedRiskRule);
        expect(
            createDocumentedRule(SizingStage.Live, DEFAULT_RULEBOOK),
        ).toBeInstanceOf(LiveCushionPercentRule);
    });

    it('binds the rulebook it was built from, so no other rulebook can size through it', () => {
        const rulebook = rulebookFor(EvalSizingMode.MaxRisk, 2);
        const rule = createDocumentedRule(SizingStage.Eval, rulebook);

        expect(rule.rulebook).toBe(rulebook);
        expect(rule.size.length).toBe(1);
    });

    it('refuses to build an eval rule for a rulebook that selects another mode', () => {
        expect(() => new EvalMaxRiskRule(DEFAULT_RULEBOOK)).toThrow(
            /selects ladder/,
        );
        expect(
            () => new EvalLadderRule(rulebookFor(EvalSizingMode.MaxRisk, 2)),
        ).toThrow(/selects max-risk/);
    });

    it('rejects a context for another stage', () => {
        const rule = createDocumentedRule(
            SizingStage.Funded as SizingStage,
            DEFAULT_RULEBOOK,
        );

        expect(() => rule.size(evalContext())).toThrow(ZodError);
    });
});

describe('branded units on the documented output', () => {
    it('types minimum stop points as Points and capped amounts as Dollars', () => {
        expectTypeOf<
            DocumentedSizing['minStopPointsAtCap']
        >().toEqualTypeOf<null | Points>();
        expectTypeOf<CappedAmount['amount']>().toEqualTypeOf<Dollars>();
        expectTypeOf<DayProgress['runningLoss']>().toEqualTypeOf<Dollars>();
        expectTypeOf<LiveRuleContext>().not.toHaveProperty(
            'consistencyDailyCap',
        );
    });

    it('offers no daily profit cap amount until the consumer narrows on its kind', () => {
        expectTypeOf<DailyProfitCap>().not.toHaveProperty('amount');
        expectTypeOf<DailyProfitCap>().not.toHaveProperty('ceiling');
        expectTypeOf<DailyProfitCap>().not.toHaveProperty('stopAfter');
        expectTypeOf<
            Extract<DailyProfitCap, { kind: DailyProfitCapKind.HardCeiling }>
        >()
            .toHaveProperty('ceiling')
            .toEqualTypeOf<Dollars>();
        expectTypeOf<
            Extract<DailyProfitCap, { kind: DailyProfitCapKind.StopTrigger }>
        >()
            .toHaveProperty('stopAfter')
            .toEqualTypeOf<Dollars>();
    });
});
