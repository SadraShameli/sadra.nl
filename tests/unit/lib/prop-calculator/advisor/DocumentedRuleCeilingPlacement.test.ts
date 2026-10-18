import { describe, expect, it } from 'vitest';

import { dollars, ONE_CENT } from '~/lib/prop-calculator';
import {
    type DayProgress,
    DayStopReason,
    DEFAULT_RULEBOOK,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NextTradeKind,
    NO_PERSONAL_CAPS,
    SizingConstraint,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const rule = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

const MNQ_CONTRACT_AT_20_POINTS = dollars(40);
const NQ_CONTRACT_AT_20_POINTS = dollars(400);

function context(overrides: Partial<FundedRuleContext>): FundedRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(3000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: ONE_CENT,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

function freshDay(): DayProgress {
    return {
        dayPnL: dollars(0),
        losses: 0,
        runningLoss: dollars(0),
        wins: 0,
    };
}

describe('a ceiling-capped rung is placed in whole contracts (PT-36f, step 2)', () => {
    it('rounds $100 of ceiling room at a $40 contract down to $80, never $100', () => {
        const trade = rule.nextTrade(
            context({
                ceiling: dollars(200),
                placeableMinimum: MNQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade.kind).toBe(NextTradeKind.Trade);
        if (trade.kind !== NextTradeKind.Trade) return;
        expect(trade.rung.risk).toBe(80);
        expect(trade.rung.takeProfit).toBe(160);
        expect(trade.rung.cappedBy).toContain(SizingConstraint.CeilingCap);
    });

    it('keeps a ceiling room that is an exact number of contracts', () => {
        const trade = rule.nextTrade(
            context({
                ceiling: dollars(160),
                placeableMinimum: MNQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 80 },
        });
    });

    it('leaves a ceiling-capped rung at whole cents when no contract unit applies', () => {
        const trade = rule.nextTrade(
            context({ ceiling: dollars(200), placeableMinimum: ONE_CENT }),
            freshDay(),
        );

        expect(trade).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 100 },
        });
    });

    it('stops for today when the ceiling room is below one contract', () => {
        const trade = rule.nextTrade(
            context({
                ceiling: dollars(70),
                placeableMinimum: MNQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade).toEqual({
            cappedBy: [SizingConstraint.CeilingCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.CeilingReached,
        });
    });

    it('rounds every capped rung of the sized ladder to whole contracts and leaves an uncapped rung at the flat risk', () => {
        const sizing = rule.size(
            context({
                ceiling: dollars(200),
                placeableMinimum: MNQ_CONTRACT_AT_20_POINTS,
            }),
        );

        expect(sizing.rungs.map((rung) => rung.risk)).toStrictEqual([
            80, 120, 200, 250,
        ]);
    });
});

describe('the placeable minimum applies only to a rung that a cap squeezed (PT-36f, step 1)', () => {
    it('keeps the flat rung when one contract costs more and no cap binds', () => {
        const trade = rule.nextTrade(
            context({
                ceiling: dollars(10_000),
                placeableMinimum: NQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade.kind).toBe(NextTradeKind.Trade);
        if (trade.kind !== NextTradeKind.Trade) return;
        expect(trade.rung.risk).toBe(250);
        expect(trade.rung.cappedBy).not.toContain(SizingConstraint.CeilingCap);
    });

    it('never reports no loss room for a flat rung that nothing squeezed', () => {
        const sizing = rule.size(
            context({
                ceiling: dollars(10_000),
                placeableMinimum: NQ_CONTRACT_AT_20_POINTS,
            }),
        );

        expect(sizing.rungs.length).toBeGreaterThan(0);
    });

    it('still reports no loss room when the cushion squeezes the rung below one contract', () => {
        const trade = rule.nextTrade(
            context({
                cushion: dollars(30),
                placeableMinimum: MNQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade).toEqual({
            cappedBy: [SizingConstraint.CushionCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.NoLossRoom,
        });
    });
});

describe('the smallest flat rung (PT-36f)', () => {
    it('keeps a one-cent flat rung that nothing squeezed, the smallest rung the rule can place', () => {
        const zeroRisk = new FundedFixedRiskRule({
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 1 },
        });
        const trade = zeroRisk.nextTrade(
            context({
                ceiling: dollars(10_000),
                placeableMinimum: NQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade).toMatchObject({
            kind: NextTradeKind.Trade,
            rung: { risk: 0.01 },
        });
    });

    it('refuses a flat rung below one contract when no ceiling governs the day, as the simulator always has', () => {
        const trade = rule.nextTrade(
            context({ placeableMinimum: NQ_CONTRACT_AT_20_POINTS }),
            freshDay(),
        );

        expect(trade).toEqual({
            cappedBy: [],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.NoLossRoom,
        });
    });
});
