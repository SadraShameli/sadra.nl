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
    FundedFixedRiskRule,
    type FundedRuleContext,
    NextTradeKind,
    type RulebookParameters,
    RuleSource,
    SizingAssumption,
    SizingConstraint,
    SizingProvenance,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const funded = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

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

function fundedContext(
    overrides: Partial<FundedRuleContext> = {},
): FundedRuleContext {
    return {
        contractLimit: null,
        cushion: dollars(3000),
        dayStartDllRoom: null,
        instrument: null,
        personalDll: null,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

function risks(sizing: DocumentedSizing): number[] {
    return sizing.rungs.map((rung) => rung.risk);
}

function withFunded(
    patch: Partial<RulebookParameters['funded']>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        funded: { ...DEFAULT_RULEBOOK.funded, ...patch },
    };
}

describe('FundedFixedRiskRule (Hard Rule 5)', () => {
    it('risks a flat $250 with a $500 TP, trades per day and stop rule from the rulebook', () => {
        const sizing = funded.size(fundedContext());

        expect(risks(sizing)).toEqual([250, 250, 250, 250]);
        expect(sizing.rungs.map((rung) => rung.takeProfit)).toEqual([
            500, 500, 500, 500,
        ]);
        expect(sizing.maxTrades).toBe(4);
        expect(sizing.rewardMultiple).toBe(2);
        expect(sizing.stopRule).toEqual({ kind: DayStopRuleKind.None });
        expect(sizing.dailyProfitCap).toBeNull();
        expect(sizing.profitCeiling).toBeNull();
        expect(sizing.constraints).toEqual([]);
        expect(sizing.sources).toEqual([
            RuleSource.HardRule5,
            RuleSource.HisNumbers,
        ]);
        expect(sizing.provenance).toBe(SizingProvenance.FundedFixedRisk);
    });

    it('says it applies no profit ceiling, next to the shared assumptions', () => {
        expect(funded.size(fundedContext()).assumptions).toEqual([
            SizingAssumption.NoCommission,
            SizingAssumption.RungsAssumeEarlierLosses,
            SizingAssumption.WinsAddNoLossRoom,
            SizingAssumption.NoProfitCeiling,
        ]);
    });

    it('follows an edited rulebook: 3 trades, stop after a $600 target, $200 risk with a $500 TP', () => {
        const rule = new FundedFixedRiskRule(
            withFunded({
                riskCents: 20_000,
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 60_000,
                },
                takeProfitCents: 50_000,
                tradesPerDayMax: 3,
            }),
        );

        const sizing = rule.size(fundedContext());

        expect(risks(sizing)).toEqual([200, 200, 200]);
        expect(sizing.rungs.map((rung) => rung.takeProfit)).toEqual([
            500, 500, 500,
        ]);
        expect(sizing.rewardMultiple).toBe(2.5);
        expect(sizing.maxTrades).toBe(3);
        expect(sizing.stopRule).toEqual({
            dollars: 600,
            kind: DayStopRuleKind.AfterTarget,
        });
        expect(sizing.dailyProfitCap).toEqual({
            kind: DailyProfitCapKind.StopTrigger,
            stopAfter: 600,
        });
    });

    it('ends the all-loss rungs where an after-k-losses stop rule ends the day', () => {
        const rule = new FundedFixedRiskRule(
            withFunded({
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            }),
        );

        const sizing = rule.size(fundedContext());

        expect(risks(sizing)).toEqual([250, 250]);
    });

    it('caps a $200 cushion at $200 with a $400 TP and names CushionCap', () => {
        const sizing = funded.size(fundedContext({ cushion: dollars(200) }));

        expect(risks(sizing)).toEqual([200]);
        expect(sizing.rungs[0]?.takeProfit).toBe(400);
        expect(sizing.constraints).toEqual([SizingConstraint.CushionCap]);
    });

    it('sizes a $900 cushion as [250, 250, 250, 150]', () => {
        const sizing = funded.size(fundedContext({ cushion: dollars(900) }));

        expect(risks(sizing)).toEqual([250, 250, 250, 150]);
        expect(sizing.constraints).toEqual([SizingConstraint.CushionCap]);
    });

    it('caps trade 3 at $100 inside a $600 day-start DLL room and names the DLL on that trade only', () => {
        const sizing = funded.size(
            fundedContext({ dayStartDllRoom: dollars(600) }),
        );

        expect(risks(sizing)).toEqual([250, 250, 100]);
        expect(sizing.rungs.map((rung) => rung.cappedBy)).toEqual([
            [],
            [],
            [SizingConstraint.DailyLossCap],
        ]);
        expect(sizing.constraints).toEqual([SizingConstraint.DailyLossCap]);
    });

    it('names PersonalCap when the personal DLL is the tighter room', () => {
        const sizing = funded.size(
            fundedContext({
                dayStartDllRoom: dollars(1000),
                personalDll: dollars(600),
            }),
        );

        expect(risks(sizing)).toEqual([250, 250, 100]);
        expect(sizing.constraints).toEqual([SizingConstraint.PersonalCap]);
    });

    it('reports the contract limit only as minimum stop points', () => {
        const sizing = funded.size(
            fundedContext({
                contractLimit: contracts(2),
                instrument: InstrumentSymbol.ES,
            }),
        );

        expect(risks(sizing)).toEqual([250, 250, 250, 250]);
        expect(sizing.minStopPointsAtCap).toBe(250 / (2 * 50));
    });

    it('builds no trades and names NoCushion at a zero cushion', () => {
        const sizing = funded.size(fundedContext({ cushion: dollars(0) }));

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([SizingConstraint.NoCushion]);
    });

    it('rejects a consistency cap or remaining target it would not apply', () => {
        for (const extra of [
            { consistencyDailyCap: dollars(600) },
            { remainingProfitToTarget: dollars(500) },
        ]) {
            const withCeiling = {
                ...fundedContext(),
                ...extra,
            } as FundedRuleContext;

            expect(() => funded.size(withCeiling)).toThrow(ZodError);
        }
    });
});

describe('FundedFixedRiskRule, the next trade', () => {
    it('keeps the full $250 on trade 3 after W, L inside a $600 DLL room', () => {
        const next = funded.nextTrade(
            fundedContext({ dayStartDllRoom: dollars(600) }),
            day(250, 250, 1, 1),
        );

        expect(next).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { cappedBy: [], risk: 250, takeProfit: 500 },
        });
    });

    it('stops after the rulebook trades per day', () => {
        expect(funded.nextTrade(fundedContext(), day(500, 250, 2, 2))).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.MaxTrades,
        });
    });

    it('stops with the DLL named once the room is used', () => {
        const context = fundedContext({ dayStartDllRoom: dollars(500) });

        expect(funded.nextTrade(context, day(-500, 500, 0, 2))).toEqual({
            cappedBy: [SizingConstraint.DailyLossCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.NoLossRoom,
        });
    });
});
