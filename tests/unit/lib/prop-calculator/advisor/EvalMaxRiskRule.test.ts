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
    EvalMaxRiskRule,
    type EvalRuleContext,
    EvalSizingMode,
    NextTradeKind,
    type RulebookParameters,
    RuleSource,
    SizingConstraint,
    SizingProvenance,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const FAR_TARGET = dollars(1_000_000);

function maxRiskRulebook(rr = 2, dailyCapMultiple = 2): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        eval: {
            ...DEFAULT_RULEBOOK.eval,
            maxRiskDailyCapMultiple: dailyCapMultiple,
            mode: EvalSizingMode.MaxRisk,
        },
        strategy: { ...DEFAULT_RULEBOOK.strategy, rr },
    };
}

const maxRisk = new EvalMaxRiskRule(maxRiskRulebook());

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

describe('EvalMaxRiskRule (Hard Rules 3 and 4, opt-in)', () => {
    it('caps risk at the remaining target / rr: $2,000 cushion, $3,000 to go, rr 2 gives $1,500', () => {
        const sizing = maxRisk.size(
            evalContext({ remainingProfitToTarget: dollars(3000) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(1500);
        expect(sizing.rungs[0]?.takeProfit).toBe(3000);
        expect(risks(sizing)).toEqual([1500, 500]);
        expect(sizing.constraints).toContain(
            SizingConstraint.RemainingTargetCap,
        );
        expect(sizing.dailyProfitCap).toEqual({
            ceiling: 3000,
            kind: DailyProfitCapKind.HardCeiling,
        });
        expect(sizing.maxTrades).toBe(4);
        expect(sizing.stopRule).toEqual({
            dollars: 3000,
            kind: DayStopRuleKind.AfterTarget,
        });
        expect(sizing.sources).toEqual([
            RuleSource.HardRule3,
            RuleSource.HardRule4,
            RuleSource.HisNumbers,
        ]);
        expect(sizing.provenance).toBe(SizingProvenance.MaxRisk);
    });

    it('caps risk at a $1,000 day-start DLL room', () => {
        const sizing = maxRisk.size(
            evalContext({ dayStartDllRoom: dollars(1000) }),
        );

        expect(risks(sizing)).toEqual([1000]);
        expect(sizing.constraints).toContain(SizingConstraint.DailyLossCap);
        expect(sizing.dailyProfitCap).toEqual({
            ceiling: 2000,
            kind: DailyProfitCapKind.HardCeiling,
        });
    });

    it('caps risk at half the consistency daily cap: 0.3 x $3,000 = $900 gives $450', () => {
        const sizing = maxRisk.size(
            evalContext({ consistencyDailyCap: dollars(0.3 * 3000) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(450);
        expect(sizing.dailyProfitCap).toEqual({
            ceiling: 900,
            kind: DailyProfitCapKind.HardCeiling,
        });
        expect(sizing.constraints).toContain(SizingConstraint.ConsistencyCap);
    });

    it('sizes $450 at a $1,550 cushion as [450, 450, 450, 200]', () => {
        const sizing = maxRisk.size(
            evalContext({
                consistencyDailyCap: dollars(900),
                cushion: dollars(1550),
            }),
        );

        expect(risks(sizing)).toEqual([450, 450, 450, 200]);
        expect(sizing.rungs.map((rung) => rung.runningLossAfter)).toEqual([
            450, 900, 1350, 1550,
        ]);
        expect(sizing.rungs.map((rung) => rung.cappedBy)).toEqual([
            [SizingConstraint.ConsistencyCap],
            [SizingConstraint.ConsistencyCap],
            [SizingConstraint.ConsistencyCap],
            [SizingConstraint.ConsistencyCap, SizingConstraint.CushionCap],
        ]);
        expect(sizing.constraints).toContain(SizingConstraint.CushionCap);
    });

    it('risks the whole cushion when nothing else binds, one trade', () => {
        const sizing = maxRisk.size(evalContext());

        expect(risks(sizing)).toEqual([2000]);
        expect(sizing.constraints).toEqual([SizingConstraint.CushionCap]);
    });

    it('caps a trade at the personal DLL left after the running loss', () => {
        const sizing = maxRisk.size(
            evalContext({
                consistencyDailyCap: dollars(900),
                personalDll: dollars(1000),
            }),
        );

        expect(risks(sizing)).toEqual([450, 450, 100]);
        expect(sizing.constraints).toContain(SizingConstraint.PersonalCap);
    });

    it('keeps each green-day outcome within the consistency cap at rr 3 with a 3 x daily cap', () => {
        const rule = new EvalMaxRiskRule(maxRiskRulebook(3, 3));

        const sizing = rule.size(
            evalContext({ consistencyDailyCap: dollars(900) }),
        );

        for (const rung of sizing.rungs) {
            expect(3 * rung.risk - rung.runningLossBefore).toBeLessThanOrEqual(
                900,
            );
        }
        expect(sizing.rungs[0]?.risk).toBe(300);
        expect(sizing.dailyProfitCap).toEqual({
            ceiling: 900,
            kind: DailyProfitCapKind.HardCeiling,
        });
        expect(sizing.stopRule).toEqual({
            dollars: 900,
            kind: DayStopRuleKind.AfterTarget,
        });
    });

    it('states the daily cap in whole cents from the placed first trade', () => {
        const rule = new EvalMaxRiskRule(maxRiskRulebook(3, 3));

        const sizing = rule.size(
            evalContext({ remainingProfitToTarget: dollars(1000) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(333.33);
        expect(sizing.dailyProfitCap).toEqual({
            ceiling: 999.99,
            kind: DailyProfitCapKind.HardCeiling,
        });
        expect(sizing.stopRule).toEqual({
            dollars: 999.99,
            kind: DayStopRuleKind.AfterTarget,
        });
    });

    it('refuses an rr above the daily cap multiple (one win would overshoot the cap)', () => {
        expect(() => new EvalMaxRiskRule(maxRiskRulebook(3, 2))).toThrow(
            /Hard Rule 4 needs the daily cap multiple \(2\) to be at least the rr \(3\)/,
        );
    });

    it('refuses a rulebook whose eval mode selects the ladder', () => {
        expect(() => new EvalMaxRiskRule(DEFAULT_RULEBOOK)).toThrow(
            /EvalMaxRiskRule sizes the max-risk eval mode, but this rulebook selects ladder/,
        );
    });

    it('rejects an eval context without a remaining profit to target', () => {
        const withoutTarget = {
            ...evalContext(),
            remainingProfitToTarget: null,
        } as unknown as EvalRuleContext;

        expect(() => maxRisk.size(withoutTarget)).toThrow(ZodError);
    });

    it('reports the contract limit only as minimum stop points, never as a dollar cap', () => {
        const sizing = maxRisk.size(
            evalContext({
                contractLimit: contracts(3),
                instrument: InstrumentSymbol.NQ,
                remainingProfitToTarget: dollars(3000),
            }),
        );

        expect(sizing.rungs[0]?.risk).toBe(1500);
        expect(sizing.minStopPointsAtCap).toBe(1500 / (3 * 20));
    });

    it('builds no trades and names NoCushion at a zero cushion', () => {
        const sizing = maxRisk.size(evalContext({ cushion: dollars(0) }));

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([SizingConstraint.NoCushion]);
        expect(sizing.dailyProfitCap).toBeNull();
    });
});

describe('EvalMaxRiskRule, the next trade after a win', () => {
    it('cuts trade 3 to $225 after L, W at a $900 consistency cap, and a second win ends the day at the cap', () => {
        const context = evalContext({ consistencyDailyCap: dollars(900) });

        const next = maxRisk.nextTrade(context, day(450, 450, 1, 1));

        expect(next).toEqual({
            kind: NextTradeKind.Trade,
            rung: {
                cappedBy: [SizingConstraint.ConsistencyCap],
                risk: 225,
                runningLossAfter: 675,
                runningLossBefore: 450,
                takeProfit: 450,
            },
        });
        expect(maxRisk.nextTrade(context, day(900, 450, 2, 1))).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.StopRule,
        });
    });

    it('cuts trade 3 to $125 after L, W with $500 left to the target', () => {
        const context = evalContext({
            remainingProfitToTarget: dollars(500),
        });

        expect(risks(maxRisk.size(context))).toEqual([250, 250, 250, 250]);

        const next = maxRisk.nextTrade(context, day(250, 250, 1, 1));

        expect(next).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 125, takeProfit: 250 },
        });
    });

    it('cuts trade 2 to $150 after a win at rr 1.5, so W, W ends at the $900 cap', () => {
        const rule = new EvalMaxRiskRule(maxRiskRulebook(1.5, 2));
        const context = evalContext({ consistencyDailyCap: dollars(900) });

        expect(rule.size(context).rungs[0]).toMatchObject({
            risk: 450,
            takeProfit: 675,
        });

        const next = rule.nextTrade(context, day(675, 0, 1, 0));

        expect(next).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 150, takeProfit: 225 },
        });
    });

    it('never lets a win overshoot its own daily cap when rr is below the multiple', () => {
        const rule = new EvalMaxRiskRule(maxRiskRulebook(1.5, 2));
        const context = evalContext({ dayStartDllRoom: dollars(1000) });

        expect(rule.size(context).dailyProfitCap).toEqual({
            ceiling: 2000,
            kind: DailyProfitCapKind.HardCeiling,
        });

        const next = rule.nextTrade(context, day(1500, 0, 1, 0));

        expect(next).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: {
                cappedBy: [
                    SizingConstraint.DailyLossCap,
                    SizingConstraint.DailyProfitCap,
                ],
                risk: 333.33,
            },
        });
    });
});
