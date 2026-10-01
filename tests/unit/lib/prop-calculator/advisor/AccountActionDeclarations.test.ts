import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import {
    AccountAction,
    AccountSubstate,
    dailyPlanCard,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NextTradeRiskVerdict,
    NO_PERSONAL_CAPS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

describe('Addendum to PT-19 (PD-42 type declarations, PT-74b)', () => {
    it('declares every AccountAction member exactly once', () => {
        expect(Object.keys(AccountAction).toSorted((a, b) => a.localeCompare(b))).toEqual(
            [
                'EnterSnapshot',
                'NotModeled',
                'RequestPayout',
                'Retire',
                'StopForToday',
                'Trade',
            ].toSorted((a, b) => a.localeCompare(b)),
        );
        const values = Object.values(AccountAction);
        expect(new Set(values).size).toBe(values.length);
    });

    it('declares every AccountSubstate member exactly once', () => {
        expect(
            Object.keys(AccountSubstate).toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(
            [
                'Fresh',
                'InProfit',
                'NearFloor',
                'PayoutReady',
                'PostPayout',
                'Suspended',
            ].toSorted((a, b) => a.localeCompare(b)),
        );
        const values = Object.values(AccountSubstate);
        expect(new Set(values).size).toBe(values.length);
    });

    it('declares every NextTradeRiskVerdict member exactly once', () => {
        expect(
            Object.keys(NextTradeRiskVerdict).toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(
            ['AboveDocumented', 'AboveDp', 'WithinPlan'].toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
        const values = Object.values(NextTradeRiskVerdict);
        expect(new Set(values).size).toBe(values.length);
    });

    it('builds DifferenceReason.FlatRiskIgnoresState text only from its typed fields', () => {
        const text = differenceReasonText({
            documentedFlatRisk: dollars(250),
            fromStateOptimum: dollars(913.5),
            gapInCombinedSEs: 4.2,
            kind: DifferenceReason.FlatRiskIgnoresState,
        });
        expect(text.length).toBeGreaterThan(0);
        expect(text).toContain('250');
        expect(text).toContain('913.5');
        expect(text).toContain('4.2');
    });

    it('gives DailyPlanCard nullable valueNow, valueAfterWin and valueAfterLoss fields, unfilled today', () => {
        const rule = new FundedFixedRiskRule(DEFAULT_RULEBOOK);
        const context: FundedRuleContext = {
            ceiling: null,
            contractLimit: null,
            cushion: dollars(3000),
            dayStartDllRoom: null,
            instrument: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            placeableMinimum: dollars(0.01),
            stage: SizingStage.Funded,
        };
        const card = dailyPlanCard(rule, context);
        expect(card.valueNow).toBeNull();
        expect(card.valueAfterWin).toBeNull();
        expect(card.valueAfterLoss).toBeNull();
    });
});
