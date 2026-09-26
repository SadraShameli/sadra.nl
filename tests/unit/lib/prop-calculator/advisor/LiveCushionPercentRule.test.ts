import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    buildMffuRapidLivePlan,
    createInitialLiveAccountState,
    DayStopRuleKind,
    dollars,
    fraction,
    resolveLiveTradeRisk,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type DocumentedSizing,
    LiveCushionPercentRule,
    type LiveRuleContext,
    NextTradeKind,
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
        contractLimit: null,
        cushion: dollars(4000),
        dayStartDllRoom: null,
        instrument: null,
        liveCushionPercent: null,
        personalDll: null,
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
