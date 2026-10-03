import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    buildMffuRapidLivePlan,
    createInitialLiveAccountState,
    DayStopRuleKind,
    dollars,
    fraction,
    ONE_CENT,
    resolveLiveTradeRisk,
} from '~/lib/prop-calculator';
import {
    type DayProgress,
    DayStopReason,
    DEFAULT_RULEBOOK,
    type DocumentedSizing,
    LiveCushionPercentRule,
    type LiveRuleContext,
    NextTradeKind,
    NO_PERSONAL_CAPS,
    RuleSource,
    SizingAssumption,
    SizingConstraint,
    SizingProvenance,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const live = new LiveCushionPercentRule(DEFAULT_RULEBOOK);
const livePlan = buildMffuRapidLivePlan(DEFAULT_RULEBOOK.live.cushionPercent);

function liveContext(
    overrides: Partial<LiveRuleContext> = {},
): LiveRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(4000),
        dayStartDllRoom: null,
        floorTradeRisk: dollars(0),
        instrument: null,
        liveCushionPercent: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: ONE_CENT,
        stage: SizingStage.Live,
        thresholdLocked: false,
        ...overrides,
    };
}

function resolvedPercent(isLocked: boolean) {
    const state = createInitialLiveAccountState(50_000, 48_000);
    return livePlan.cushionPercentFor({ ...state, thresholdLocked: isLocked });
}

function risks(sizing: DocumentedSizing): number[] {
    return sizing.rungs.map((rung) => rung.risk);
}

describe('LiveCushionPercentRule (live account, not replaceable)', () => {
    it('risks 5% of a $4,000 unlocked cushion through the live plan percent: $200', () => {
        const sizing = live.size(
            liveContext({ liveCushionPercent: resolvedPercent(false) }),
        );

        expect(sizing.rungs[0]?.risk).toBe(200);
        expect(sizing.rungs[0]?.risk).toBe(
            resolveLiveTradeRisk(4000, resolvedPercent(false)),
        );
        expect(sizing.rungs[0]?.takeProfit).toBe(400);
        expect(sizing.rewardMultiple).toBe(DEFAULT_RULEBOOK.strategy.rr);
        expect(sizing.sources).toEqual([
            RuleSource.LiveSizing,
            RuleSource.HisNumbers,
        ]);
        expect(sizing.provenance).toBe(SizingProvenance.LiveCushionPercent);
        expect(sizing.stopRule).toEqual({ kind: DayStopRuleKind.None });
        expect(sizing.maxTrades).toBe(
            DEFAULT_RULEBOOK.strategy.tradesPerDayMax,
        );
    });

    it('flags the undocumented live day policy and the missing profit ceiling', () => {
        expect(live.size(liveContext()).assumptions).toEqual([
            SizingAssumption.NoCommission,
            SizingAssumption.RungsAssumeEarlierLosses,
            SizingAssumption.WinsAddNoLossRoom,
            SizingAssumption.LiveDayPolicyUndocumented,
            SizingAssumption.NoProfitCeiling,
        ]);
    });

    it('risks 10% of an $8,000 locked cushion through the live plan percent: $800', () => {
        const sizing = live.size(
            liveContext({
                cushion: dollars(8000),
                liveCushionPercent: resolvedPercent(true),
                thresholdLocked: true,
            }),
        );

        expect(sizing.rungs[0]?.risk).toBe(800);
    });

    it('re-applies the percent to the cushion left after each loss, as the engine does', () => {
        const sizing = live.size(
            liveContext({ liveCushionPercent: fraction(0.05) }),
        );

        expect(risks(sizing)).toEqual([200, 190, 180.5, 171.47]);
    });

    it.each([
        { cushion: 4000, expected: 200, isLocked: false },
        { cushion: 8000, expected: 800, isLocked: true },
    ])(
        'without a live builder (E8, FTMO) selects the rulebook percent by the lock flag: cushion $cushion gives $expected',
        ({ cushion, expected, isLocked }) => {
            const sizing = live.size(
                liveContext({
                    cushion: dollars(cushion),
                    liveCushionPercent: null,
                    thresholdLocked: isLocked,
                }),
            );

            expect(sizing.rungs[0]?.risk).toBe(expected);
        },
    );

    it('caps the running loss at the day-start DLL room', () => {
        const sizing = live.size(
            liveContext({ dayStartDllRoom: dollars(300) }),
        );

        expect(risks(sizing)).toEqual([200, 100]);
        expect(sizing.constraints).toEqual([SizingConstraint.DailyLossCap]);
    });

    it('builds no trades and names NoCushion at a zero cushion', () => {
        const sizing = live.size(liveContext({ cushion: dollars(0) }));

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([SizingConstraint.NoCushion]);
    });

    it('sizes the next trade on the cushion net of losses only, not on the win', () => {
        const next = live.nextTrade(liveContext(), {
            dayPnL: dollars(400),
            losses: 0,
            runningLoss: dollars(0),
            wins: 1,
        });

        expect(next).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 200 },
        });
    });

    it('rejects a remaining profit to target or consistency cap it would not apply', () => {
        for (const extra of [
            { remainingProfitToTarget: dollars(500) },
            { consistencyDailyCap: dollars(600) },
        ]) {
            const withCeiling = {
                ...liveContext(),
                ...extra,
            } as LiveRuleContext;

            expect(() => live.size(withCeiling)).toThrow(ZodError);
        }
    });
});

describe('LiveCushionPercentRule, personal caps and ceilings (PT-19 step 2, F-62, F-154)', () => {
    it('drops NoProfitCeiling and reports the ceiling as CeilingCap once a ceiling is set', () => {
        const sizing = live.size(liveContext({ ceiling: dollars(60) }));

        expect(sizing.assumptions).not.toContain(
            SizingAssumption.NoProfitCeiling,
        );
        expect(sizing.assumptions).toContain(
            SizingAssumption.LiveDayPolicyUndocumented,
        );
        expect(sizing.profitCeiling).toEqual({
            amount: 60,
            constraint: SizingConstraint.CeilingCap,
        });
        expect(sizing.rungs[0]).toMatchObject({
            cappedBy: [SizingConstraint.CeilingCap],
            risk: 30,
            takeProfit: 60,
        });
    });

    it('caps the next trade at a personal max risk per trade', () => {
        const context = liveContext({
            personalCaps: {
                dailyProfitCap: null,
                maxRiskPerTrade: dollars(50),
                maxTradesPerDay: null,
            },
        });

        expect(
            live.nextTrade(context, {
                dayPnL: dollars(0),
                losses: 0,
                runningLoss: dollars(0),
                wins: 0,
            }),
        ).toEqual({
            kind: NextTradeKind.Trade,
            rung: {
                cappedBy: [SizingConstraint.PersonalCap],
                risk: 50,
                runningLossAfter: 50,
                runningLossBefore: 0,
                takeProfit: 100,
            },
        });
    });

    it('stops at a personal max trades per day tighter than the rulebook', () => {
        const context = liveContext({
            personalCaps: {
                dailyProfitCap: null,
                maxRiskPerTrade: null,
                maxTradesPerDay: 2,
            },
        });

        expect(
            live.nextTrade(context, {
                dayPnL: dollars(0),
                losses: 1,
                runningLoss: dollars(200),
                wins: 1,
            }),
        ).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.MaxTrades,
        });
    });

    it('tightens the ceiling with a personal daily profit cap, tagged PersonalCap', () => {
        const context = liveContext({
            personalCaps: {
                dailyProfitCap: dollars(100),
                maxRiskPerTrade: null,
                maxTradesPerDay: null,
            },
        });

        expect(
            live.nextTrade(context, {
                dayPnL: dollars(0),
                losses: 0,
                runningLoss: dollars(0),
                wins: 0,
            }),
        ).toEqual({
            kind: NextTradeKind.Trade,
            rung: {
                cappedBy: [SizingConstraint.PersonalCap],
                risk: 50,
                runningLossAfter: 50,
                runningLossBefore: 0,
                takeProfit: 100,
            },
        });
    });

    it('stops with NoLossRoom below a custom placeable minimum, where the default ONE_CENT would still trade', () => {
        const tinyCushion = liveContext({ cushion: dollars(0.5) });
        const day = {
            dayPnL: dollars(0),
            losses: 0,
            runningLoss: dollars(0),
            wins: 0,
        };

        expect(live.nextTrade(tinyCushion, day)).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 0.02 },
        });
        expect(
            live.nextTrade(
                { ...tinyCushion, placeableMinimum: dollars(1) },
                day,
            ),
        ).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.NoLossRoom,
        });
    });

    it('reports CeilingReached, not NoLossRoom, when the ceiling room falls below a custom placeable minimum', () => {
        const context = liveContext({
            ceiling: dollars(0.5),
            placeableMinimum: dollars(1),
        });
        const day = {
            dayPnL: dollars(0),
            losses: 0,
            runningLoss: dollars(0),
            wins: 0,
        };

        expect(live.nextTrade(context, day)).toEqual({
            cappedBy: [SizingConstraint.CeilingCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.CeilingReached,
        });
    });
});

describe('LiveCushionPercentRule at a strictly-below floor still alive (WP62d, N-94)', () => {
    const DAY: DayProgress = {
        dayPnL: dollars(0),
        losses: 0,
        runningLoss: dollars(0),
        wins: 0,
    };

    it('offers the floor trade risk as the one rung at a cushion of 0, with no NoCushion flag', () => {
        const sizing = live.size(
            liveContext({
                cushion: dollars(0),
                floorTradeRisk: dollars(450),
            }),
        );

        expect(risks(sizing)).toEqual([450]);
        expect(sizing.constraints).not.toContain(SizingConstraint.NoCushion);
    });

    it('offers it through float residue under a cent of cushion either side of 0', () => {
        for (const cushion of [-1e-10, 1e-10]) {
            const sizing = live.size(
                liveContext({
                    cushion: dollars(cushion),
                    floorTradeRisk: dollars(450),
                }),
            );

            expect(risks(sizing)).toEqual([450]);
        }
    });

    it('stops after the floor loss, since that loss takes the account through the floor', () => {
        const context = liveContext({
            cushion: dollars(0),
            floorTradeRisk: dollars(450),
        });

        expect(live.nextTrade(context, DAY)).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 450, runningLossAfter: 450 },
        });
        expect(
            live.nextTrade(context, {
                dayPnL: dollars(-450),
                losses: 1,
                runningLoss: dollars(450),
                wins: 0,
            }),
        ).toMatchObject({ kind: NextTradeKind.Stop });
    });

    it('still bounds the floor rung by the day-start DLL room and a personal max risk', () => {
        const dll = live.size(
            liveContext({
                cushion: dollars(0),
                dayStartDllRoom: dollars(200),
                floorTradeRisk: dollars(450),
            }),
        );
        const personal = live.nextTrade(
            liveContext({
                cushion: dollars(0),
                floorTradeRisk: dollars(450),
                personalCaps: {
                    dailyProfitCap: null,
                    maxRiskPerTrade: dollars(50),
                    maxTradesPerDay: null,
                },
            }),
            DAY,
        );

        expect(risks(dll)).toEqual([200]);
        expect(personal).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 50 },
        });
    });

    it('ends the ladder after a floor rung that a personal max risk capped below the floor trade risk', () => {
        for (const maxRiskPerTrade of [50, 200]) {
            const sizing = live.size(
                liveContext({
                    cushion: dollars(0),
                    floorTradeRisk: dollars(450),
                    personalCaps: {
                        dailyProfitCap: null,
                        maxRiskPerTrade: dollars(maxRiskPerTrade),
                        maxTradesPerDay: null,
                    },
                }),
            );

            expect(risks(sizing)).toEqual([maxRiskPerTrade]);
        }
    });

    it('stops after a capped floor rung on the next trade too', () => {
        const context = liveContext({
            cushion: dollars(0),
            floorTradeRisk: dollars(450),
            personalCaps: {
                dailyProfitCap: null,
                maxRiskPerTrade: dollars(50),
                maxTradesPerDay: null,
            },
        });

        expect(
            live.nextTrade(context, {
                dayPnL: dollars(-50),
                losses: 1,
                runningLoss: dollars(50),
                wins: 0,
            }),
        ).toMatchObject({ kind: NextTradeKind.Stop });
    });

    it('offers nothing at a cushion of 0 with no floor trade risk (a plain floor), flagging NoCushion', () => {
        const sizing = live.size(liveContext({ cushion: dollars(0) }));

        expect(sizing.rungs).toEqual([]);
        expect(sizing.constraints).toEqual([SizingConstraint.NoCushion]);
    });

    it('rejects a floor trade risk on a real cushion, which only exists at a cushion of 0', () => {
        expect(() =>
            live.size(
                liveContext({
                    cushion: dollars(4000),
                    floorTradeRisk: dollars(450),
                }),
            ),
        ).toThrow(ZodError);
    });

    it('rejects a negative floor trade risk', () => {
        expect(() =>
            live.size(
                liveContext({
                    cushion: dollars(0),
                    floorTradeRisk: dollars(-1),
                }),
            ),
        ).toThrow(ZodError);
    });
});
