import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    contracts,
    DayStopRuleKind,
    dollars,
    InstrumentSymbol,
} from '~/lib/prop-calculator';
import {
    DailyProfitCapKind,
    type DayProgress,
    DayStopReason,
    DEFAULT_RULEBOOK,
    type DocumentedSizing,
    EvalLadderRule,
    type EvalRuleContext,
    EvalSizingMode,
    LadderFractionSource,
    NextTradeKind,
    type RulebookParameters,
    RuleSource,
    SizingAssumption,
    SizingConstraint,
    SizingProvenance,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const FAR_TARGET = dollars(1_000_000);
const ROUNDING_STEP = DEFAULT_RULEBOOK.eval.roundingStepCents / 100;

function withEval(
    patch: Partial<RulebookParameters['eval']>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        eval: { ...DEFAULT_RULEBOOK.eval, ...patch },
    };
}

const general = new EvalLadderRule(DEFAULT_RULEBOOK);
const mff = new EvalLadderRule(
    withEval({ ladderFractionSource: LadderFractionSource.MffRapidEodSearch }),
);

function day(
    dayPnL: number,
    runningLoss: number,
    wins: number,
    losses: number,
): DayProgress {
    return {
        dayPnL: dollars(dayPnL),
        losses,
        runningLoss: dollars(runningLoss),
        wins,
    };
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
        remainingProfitToTarget: FAR_TARGET,
        stage: SizingStage.Eval,
        ...overrides,
    };
}

function risks(sizing: DocumentedSizing): number[] {
    return sizing.rungs.map((rung) => rung.risk);
}

function totalLoss(sizing: DocumentedSizing): number {
    return sizing.rungs.reduce((sum, rung) => sum + rung.risk, 0);
}

describe('EvalLadderRule, general derivation (the default)', () => {
    it('sizes a $2,000 cushion as [400, 600, 900, 100] with TP 2 x rung', () => {
        const sizing = general.size(evalContext());

        expect(risks(sizing)).toEqual([400, 600, 900, 100]);
        expect(sizing.rungs.map((rung) => rung.takeProfit)).toEqual([
            800, 1200, 1800, 200,
        ]);
        expect(sizing.rungs.map((rung) => rung.runningLossBefore)).toEqual([
            0, 400, 1000, 1900,
        ]);
        expect(sizing.rungs.map((rung) => rung.runningLossAfter)).toEqual([
            400, 1000, 1900, 2000,
        ]);
        expect(sizing.stopRule).toEqual({ kind: DayStopRuleKind.DayGreen });
        expect(sizing.maxTrades).toBe(4);
        expect(sizing.rewardMultiple).toBe(2);
        expect(sizing.dailyProfitCap).toBeNull();
        expect(sizing.constraints).toEqual([]);
        expect(sizing.sources).toEqual([
            RuleSource.GeneralDerivation,
            RuleSource.HisNumbers,
        ]);
        expect(sizing.provenance).toBe(SizingProvenance.GeneralDerivation);
        expect(sizing.provenance).toBe('General derivation for any plan');
    });

    it('sizes a $1,500 cushion as [300, 450, 650, 100]', () => {
        const sizing = general.size(evalContext({ cushion: dollars(1500) }));

        expect(risks(sizing)).toEqual([300, 450, 650, 100]);
    });

    it('never builds more rungs than the rulebook trades per day', () => {
        const rule = new EvalLadderRule({
            ...DEFAULT_RULEBOOK,
            strategy: { ...DEFAULT_RULEBOOK.strategy, tradesPerDayMax: 3 },
        });

        const sizing = rule.size(evalContext());

        expect(risks(sizing)).toEqual([400, 600, 1000]);
        expect(sizing.maxTrades).toBe(3);
    });

    it('takes the reward multiple from the rulebook rr', () => {
        const rule = new EvalLadderRule({
            ...DEFAULT_RULEBOOK,
            strategy: { ...DEFAULT_RULEBOOK.strategy, rr: 3 },
        });

        const sizing = rule.size(evalContext());

        expect(sizing.rewardMultiple).toBe(3);
        expect(sizing.rungs[0]?.takeProfit).toBe(1200);
    });

    it('states the assumptions behind its rungs', () => {
        expect(general.size(evalContext()).assumptions).toEqual([
            SizingAssumption.NoCommission,
            SizingAssumption.RungsAssumeEarlierLosses,
            SizingAssumption.WinsAddNoLossRoom,
        ]);
    });
});

describe('EvalLadderRule, MFF Rapid EOD search fractions (opt-in)', () => {
    it('sizes a $2,000 cushion as [400, 600, 800, 200] with the MFF label', () => {
        const sizing = mff.size(evalContext());

        expect(risks(sizing)).toEqual([400, 600, 800, 200]);
        expect(sizing.provenance).toBe(SizingProvenance.MffRapidEodSearch);
        expect(sizing.provenance).toBe(
            'from the MFF Rapid EOD 50K search, extrapolated to this plan',
        );
        expect(sizing.sources).toEqual([
            RuleSource.EvalLadder,
            RuleSource.HisNumbers,
        ]);
        expect(sizing.stopRule).toEqual({ kind: DayStopRuleKind.DayGreen });
    });

    it('sizes a $1,500 cushion as [300, 450, 600, 150]', () => {
        const sizing = mff.size(evalContext({ cushion: dollars(1500) }));

        expect(risks(sizing)).toEqual([300, 450, 600, 150]);
    });

    it('rounds a $1,730 cushion to $50 steps and still sums to the cushion exactly', () => {
        const sizing = mff.size(evalContext({ cushion: dollars(1730) }));
        const rungs = risks(sizing);
        const roundedRungs = rungs.slice(0, -1);

        expect(totalLoss(sizing)).toBe(1730);
        for (const rung of roundedRungs) {
            expect(rung % ROUNDING_STEP).toBe(0);
        }
        expect(rungs).toEqual([300, 500, 650, 280]);
    });
});

describe('EvalLadderRule, cumulative loss room', () => {
    it('rescales the ladder inside a $1,000 day-start DLL room at a $2,000 cushion', () => {
        const sizing = general.size(
            evalContext({ dayStartDllRoom: dollars(1000) }),
        );

        expect(risks(sizing)).toEqual([200, 300, 450, 50]);
        for (const rung of sizing.rungs) {
            expect(rung.runningLossAfter).toBeLessThanOrEqual(1000);
            expect(rung.cappedBy).toEqual([SizingConstraint.DailyLossCap]);
        }
        expect(sizing.constraints).toContain(SizingConstraint.DailyLossCap);
    });

    it('caps the running loss at a $600 personal DLL', () => {
        const sizing = general.size(evalContext({ personalDll: dollars(600) }));

        expect(risks(sizing)).toEqual([100, 150, 200, 150]);
        expect(totalLoss(sizing)).toBe(600);
        expect(sizing.constraints).toEqual([SizingConstraint.PersonalCap]);
    });

    it('names the personal cap, not the DLL, when the personal DLL is tighter', () => {
        const sizing = general.size(
            evalContext({
                dayStartDllRoom: dollars(1000),
                personalDll: dollars(600),
            }),
        );

        expect(totalLoss(sizing)).toBe(600);
        expect(sizing.constraints).toEqual([SizingConstraint.PersonalCap]);
    });
});

describe('EvalLadderRule, profit ceilings', () => {
    it('keeps every green-day outcome within a $600 consistency cap (0.3 x $2,000)', () => {
        const dailyCap = 0.3 * 2000;
        const sizing = general.size(
            evalContext({ consistencyDailyCap: dollars(dailyCap) }),
        );

        for (const rung of sizing.rungs) {
            expect(2 * rung.risk - rung.runningLossBefore).toBeLessThanOrEqual(
                dailyCap,
            );
        }
        expect(risks(sizing)).toEqual([300, 450, 650, 600]);
        expect(sizing.rungs.map((rung) => rung.cappedBy)).toEqual([
            [SizingConstraint.ConsistencyCap],
            [],
            [],
            [],
        ]);
        expect(sizing.dailyProfitCap).toEqual({
            ceiling: dailyCap,
            kind: DailyProfitCapKind.HardCeiling,
        });
        expect(sizing.profitCeiling).toEqual({
            amount: dailyCap,
            constraint: SizingConstraint.ConsistencyCap,
        });
        expect(sizing.constraints).toEqual([SizingConstraint.ConsistencyCap]);
    });

    it('caps each rung at (remaining target + running loss) / rr with $500 left', () => {
        const remaining = 500;
        const sizing = general.size(
            evalContext({ remainingProfitToTarget: dollars(remaining) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(250);
        for (const rung of sizing.rungs) {
            expect(rung.risk).toBeLessThanOrEqual(
                (remaining + rung.runningLossBefore) / 2,
            );
        }
        expect(risks(sizing)).toEqual([250, 350, 500, 800]);
        expect(sizing.constraints).toEqual([
            SizingConstraint.RemainingTargetCap,
        ]);
    });

    it('applies the tighter of the consistency cap and the remaining target', () => {
        const sizing = general.size(
            evalContext({
                consistencyDailyCap: dollars(600),
                remainingProfitToTarget: dollars(300),
            }),
        );

        expect(sizing.rungs[0]?.risk).toBe(150);
        for (const rung of sizing.rungs) {
            expect(2 * rung.risk - rung.runningLossBefore).toBeLessThanOrEqual(
                300,
            );
        }
        expect(sizing.constraints).toContain(
            SizingConstraint.RemainingTargetCap,
        );
    });

    it('builds no rungs once the remaining profit to target is zero', () => {
        const sizing = general.size(
            evalContext({ remainingProfitToTarget: dollars(0) }),
        );

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([
            SizingConstraint.RemainingTargetCap,
        ]);
    });
});

describe('EvalLadderRule, the next trade on a mixed path', () => {
    it('matches the documented rung on the all-loss path', () => {
        const context = evalContext({ consistencyDailyCap: dollars(600) });
        const sizing = general.size(context);

        for (const [index, rung] of sizing.rungs.entries()) {
            const before: number = rung.runningLossBefore;
            const next = general.nextTrade(
                context,
                day(-before, before, 0, index),
            );

            expect(next).toEqual({ kind: NextTradeKind.Trade, rung });
        }
    });

    it('cuts trade 4 to $125 after L, L, W leaves a $300 budget flat under a $250 cap', () => {
        const context = evalContext({
            consistencyDailyCap: dollars(250),
            cushion: dollars(300),
        });

        expect(risks(general.size(context))).toEqual([50, 50, 50, 150]);

        const next = general.nextTrade(context, day(0, 100, 1, 2));

        expect(next).toEqual({
            kind: NextTradeKind.Trade,
            rung: {
                cappedBy: [SizingConstraint.ConsistencyCap],
                risk: 125,
                runningLossAfter: 225,
                runningLossBefore: 100,
                takeProfit: 250,
            },
        });
        expect(general.nextTrade(context, day(250, 100, 2, 2))).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.MaxTrades,
        });
    });

    it('stops the day once a win turns it green', () => {
        expect(general.nextTrade(evalContext(), day(800, 0, 1, 0))).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.StopRule,
        });
    });

    it('stops for today once the ceiling is reached', () => {
        const targetReached = evalContext({
            remainingProfitToTarget: dollars(0),
        });

        expect(general.nextTrade(targetReached, day(0, 0, 0, 0))).toEqual({
            cappedBy: [SizingConstraint.RemainingTargetCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.CeilingReached,
        });
    });

    it('says the ladder ran out, not that loss room did, when a win leaves room after the last rung', () => {
        const context = evalContext({ cushion: dollars(120) });

        expect(risks(general.size(context))).toEqual([50, 50, 20]);
        expect(general.nextTrade(context, day(-60, 100, 1, 2))).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.LadderExhausted,
        });
    });

    it('still says no loss room once the last rung spent the whole budget', () => {
        const context = evalContext({ cushion: dollars(120) });

        expect(general.nextTrade(context, day(-120, 120, 0, 3))).toEqual({
            cappedBy: [SizingConstraint.CushionCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.NoLossRoom,
        });
    });

    it('rejects a day that is down more than its running loss', () => {
        const context = evalContext();
        const downTooFar = day(-500, 100, 0, 1);

        expect(() => general.nextTrade(context, downTooFar)).toThrow(ZodError);
    });
});

describe('EvalLadderRule floors to the rounding step in whole cents, not with a cents epsilon read as a step fraction (N-69)', () => {
    it('floors a profit-ceiling room four thousandths of a cent under $100 to the $50 step, never up to $100', () => {
        const sizing = general.size(
            evalContext({ remainingProfitToTarget: dollars(199.99992) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(50);
        expect(sizing.rungs[0]?.takeProfit).toBe(100);
        expect(sizing.rungs[0]?.cappedBy).toEqual([
            SizingConstraint.RemainingTargetCap,
        ]);
    });

    it('floors a profit-ceiling room a tenth of a cent under $2,000 to the $1,000 step, never up to $2,000', () => {
        const rule = new EvalLadderRule(
            withEval({ roundingStepCents: 100_000 }),
        );

        const sizing = rule.size(
            evalContext({
                cushion: dollars(20_000),
                remainingProfitToTarget: dollars(3999.998),
            }),
        );

        expect(sizing.rungs[0]?.risk).toBe(1000);
        for (const rung of sizing.rungs) {
            expect(
                rung.takeProfit - rung.runningLossBefore,
            ).toBeLessThanOrEqual(3999.998);
        }
    });

    it('floors a rung target a hair under two $50 steps to one step', () => {
        const sizing = general.size(
            evalContext({ cushion: dollars(499.99975) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(ROUNDING_STEP);
    });

    it('still reaches the step multiple when the room is short of it only by float drift', () => {
        const sizing = general.size(
            evalContext({
                remainingProfitToTarget: dollars(200 - 1e-10),
            }),
        );

        expect(sizing.rungs[0]?.risk).toBe(100);
    });
});

describe('EvalLadderRule, edges', () => {
    it.each([0, -150])('builds no rungs at a cushion of %d', (cushion) => {
        const sizing = general.size(evalContext({ cushion: dollars(cushion) }));

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([SizingConstraint.NoCushion]);
    });

    it('uses one rung of the whole cushion below the first rounding step', () => {
        const sizing = general.size(evalContext({ cushion: dollars(30) }));

        expect(risks(sizing)).toEqual([30]);
        expect(sizing.rungs[0]?.cappedBy).toEqual([
            SizingConstraint.CushionCap,
        ]);
    });

    it('builds no rungs when the day-start DLL room is used up', () => {
        const sizing = general.size(
            evalContext({ dayStartDllRoom: dollars(0) }),
        );

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([SizingConstraint.DailyLossCap]);
    });

    it('reports the contract limit only as minimum stop points at the largest rung', () => {
        const withLimit = general.size(
            evalContext({
                contractLimit: contracts(3),
                instrument: InstrumentSymbol.NQ,
            }),
        );
        const withoutLimit = general.size(evalContext());

        expect(risks(withLimit)).toEqual(risks(withoutLimit));
        expect(withLimit.minStopPointsAtCap).toBe(900 / (3 * 20));
        expect(withoutLimit.minStopPointsAtCap).toBeNull();
    });

    it.each([
        { field: 'cushion', overrides: { cushion: dollars(NaN) } },
        { field: 'personalDll', overrides: { personalDll: dollars(-1) } },
        {
            field: 'consistencyDailyCap',
            overrides: { consistencyDailyCap: dollars(-1) },
        },
        {
            field: 'remainingProfitToTarget',
            overrides: { remainingProfitToTarget: null },
        },
    ])('rejects a context with an invalid $field', ({ overrides }) => {
        expect(() =>
            general.size(evalContext(overrides as Partial<EvalRuleContext>)),
        ).toThrow(ZodError);
    });

    it('rejects a context built for another stage', () => {
        const fundedShaped = {
            ...evalContext(),
            stage: SizingStage.Funded,
        } as unknown as EvalRuleContext;

        expect(() => general.size(fundedShaped)).toThrow(ZodError);
    });

    it('refuses a rulebook whose eval mode selects max risk', () => {
        expect(
            () =>
                new EvalLadderRule(withEval({ mode: EvalSizingMode.MaxRisk })),
        ).toThrow(/EvalLadderRule sizes the ladder eval mode/);
    });
});
