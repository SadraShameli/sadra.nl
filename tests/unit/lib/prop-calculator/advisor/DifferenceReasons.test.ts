import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import {
    DAY_STOP_REASON_TEXT,
    DayStopReason,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    type DifferenceReasonDetail,
    differenceReasonHeadline,
    differenceReasonText,
    DpNotValidatedCause,
    LiveTriggerScope,
    personalPayoutOverrideWarningText,
    RetainedCushionBasis,
    RuleSource,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    SizingAssumption,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

function digitsOf(text: string): string {
    return (text.match(/\d/g) ?? []).join('');
}

describe('differenceReasonHeadline (F-124, PD-32)', () => {
    it('names the documented rule when the rulebook matches every default', () => {
        expect(differenceReasonHeadline(DEFAULT_RULEBOOK)).toBe(
            'your documented rule',
        );
    });

    it('names the custom rule via documentedRuleLabel(rulebookDeviation(...))', () => {
        const custom = {
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 30_000 },
        };
        expect(differenceReasonHeadline(custom)).toBe(
            `your custom rule (differs from ${RuleSource.HardRule5})`,
        );
    });
});

describe('differenceReasonText (F-124, PD-32 sentinel test)', () => {
    it('builds text only from the typed fields: the sentinel numbers appear and no others', () => {
        const text = differenceReasonText({
            gap: dollars(1234.56),
            kind: DifferenceReason.WithinNoise,
            threshold: dollars(7.25),
        });
        expect(digitsOf(text)).toBe('123456725');
    });

    it('says a suspended account is not sized, with no number in the text (PT-19i, F-118)', () => {
        const text = differenceReasonText({ kind: DifferenceReason.Suspended });
        expect(text).toContain('suspended');
        expect(digitsOf(text)).toBe('');
    });

    it('builds the DocumentedLadderNeverFunded text only from the typed simulation count (PT-19i, F-119)', () => {
        const text = differenceReasonText({
            kind: DifferenceReason.DocumentedLadderNeverFunded,
            sims: 4321,
        });
        expect(digitsOf(text)).toBe('4321');
        expect(text).toContain('documented ladder');
        expect(text).toContain('never');
    });

    it('builds the EngineLadderNeverFunded text only from the typed simulation count and names the engine ladder, not the documented one (PT-36h)', () => {
        const text = differenceReasonText({
            kind: DifferenceReason.EngineLadderNeverFunded,
            sims: 654,
        });
        expect(digitsOf(text)).toBe('654');
        expect(text).toContain('engine');
        expect(text).toContain('never');
        expect(text).not.toContain('documented');
    });

    it('builds the DocumentedLadderNotScored text only from the typed simulation count (PT-19i, F-119)', () => {
        const text = differenceReasonText({
            kind: DifferenceReason.DocumentedLadderNotScored,
            sims: 987,
        });
        expect(digitsOf(text)).toBe('987');
        expect(text).toContain('documented ladder');
        expect(text).toContain('not scored');
    });

    it('builds the CeilingCap text only from the typed ceiling field (PT-36b F-154)', () => {
        const text = differenceReasonText({
            ceiling: dollars(9950.5),
            kind: DifferenceReason.CeilingCap,
        });
        expect(digitsOf(text)).toBe('995050');
    });

    it('builds the WouldTriggerLive text only from the typed count, limit and scope fields (PT-36d)', () => {
        const text = differenceReasonText({
            kind: DifferenceReason.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 3,
            },
        });
        expect(text).toBe(
            'This would trigger a live-account transition: 2 of 3 payouts taken on this account.',
        );
        expect(digitsOf(text)).toBe('23');
    });

    it('names the firm scope in the WouldTriggerLive text (PT-36d)', () => {
        const text = differenceReasonText({
            kind: DifferenceReason.WouldTriggerLive,
            trigger: {
                payoutsTaken: 9,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 10,
            },
        });
        expect(text).toContain("across the firm's accounts");
        expect(digitsOf(text)).toBe('910');
    });

    it('says a live account on its still-alive floor is offered one contract at the entered stop, and that any loss breaches the floor, from its typed fields only (PT-73h)', () => {
        const text = differenceReasonText({
            affordableRisk: dollars(450),
            isPlacedAtEnteredStop: true,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: dollars(450),
        });
        expect(text).toContain('one contract at your entered stop');
        expect(text).toContain('$450.00');
        expect(text).toContain('Any loss breaches the live floor');
        expect(digitsOf(text)).toBe('45000');
    });

    it('names the minimum-trade convention and that a live account cannot be repurchased (PT-73h)', () => {
        const text = differenceReasonText({
            affordableRisk: dollars(450),
            isPlacedAtEnteredStop: true,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: dollars(450),
        });
        expect(text).toContain('minimum-trade convention, not a firm rule');
        expect(text).toContain('cannot be repurchased');
        expect(text).toContain('not trading is the alternative');
        expect(text).not.toContain('caps beside it');
    });

    it('says the caps leave less than the minimum trade, with the bounded risk from its typed field (PT-73h)', () => {
        const text = differenceReasonText({
            affordableRisk: dollars(200),
            isPlacedAtEnteredStop: true,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: dollars(450),
        });
        expect(text).toContain('leave only $200.00 of risk');
        expect(digitsOf(text)).toBe('4500020000');
    });

    it('says no trade is offered when the caps leave no room (PT-73h)', () => {
        const text = differenceReasonText({
            affordableRisk: dollars(0),
            isPlacedAtEnteredStop: true,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: dollars(450),
        });
        expect(text).toContain('so no trade is offered');
        expect(digitsOf(text)).toBe('45000');
    });

    it('says the floor trade is one cent when no instrument and stop are entered (PT-73h)', () => {
        const text = differenceReasonText({
            affordableRisk: dollars(0.01),
            isPlacedAtEnteredStop: false,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: dollars(0.01),
        });
        expect(text).toContain('one cent');
        expect(text).toContain('no instrument and stop are entered');
        expect(text).toContain('Any loss breaches the live floor');
        expect(digitsOf(text)).toBe('001');
    });

    it('reports the DpNotValidated cause including SolveCapReached', () => {
        const text = differenceReasonText({
            cause: DpNotValidatedCause.SolveCapReached,
            kind: DifferenceReason.DpNotValidated,
        });
        expect(text.length).toBeGreaterThan(0);
    });

    it('gives every DifferenceReason member a non-empty text', () => {
        const bareDetails: Record<string, DifferenceReasonDetail> = {
            AssumedInputs: { kind: DifferenceReason.AssumedInputs },
            ConsistencyNotEvaluated: {
                kind: DifferenceReason.ConsistencyNotEvaluated,
            },
            DpGridSaturation: { kind: DifferenceReason.DpGridSaturation },
            DpObjectiveMismatch: {
                kind: DifferenceReason.DpObjectiveMismatch,
            },
            DpPayoutPolicyMismatch: {
                kind: DifferenceReason.DpPayoutPolicyMismatch,
            },
            FreshStartApproximation: {
                kind: DifferenceReason.FreshStartApproximation,
            },
            LiveModelApproximation: {
                kind: DifferenceReason.LiveModelApproximation,
            },
            LiveNotModeled: { kind: DifferenceReason.LiveNotModeled },
            LiveTriggersNotChecked: {
                kind: DifferenceReason.LiveTriggersNotChecked,
            },
            NoCushion: { kind: DifferenceReason.NoCushion },
            ObjectiveSpeedVsMonthlyNet: {
                kind: DifferenceReason.ObjectiveSpeedVsMonthlyNet,
            },
            PlanRulesChanged: { kind: DifferenceReason.PlanRulesChanged },
        };
        for (const detail of Object.values(bareDetails)) {
            expect(differenceReasonText(detail).length).toBeGreaterThan(0);
        }
    });
});

function alphabetically(a: string, b: string): number {
    return a.localeCompare(b);
}

describe('exhaustive text maps (PT-19 step 8)', () => {
    it('covers every SizingConstraint member with non-empty text', () => {
        expect(
            Object.keys(SIZING_CONSTRAINT_TEXT).toSorted(alphabetically),
        ).toEqual(Object.values(SizingConstraint).toSorted(alphabetically));
        for (const text of Object.values(SIZING_CONSTRAINT_TEXT)) {
            expect(text.length).toBeGreaterThan(0);
        }
    });

    it('covers every DayStopReason member with non-empty text', () => {
        expect(
            Object.keys(DAY_STOP_REASON_TEXT).toSorted(alphabetically),
        ).toEqual(Object.values(DayStopReason).toSorted(alphabetically));
        for (const text of Object.values(DAY_STOP_REASON_TEXT)) {
            expect(text.length).toBeGreaterThan(0);
        }
    });

    it('covers every SizingAssumption member with non-empty text', () => {
        expect(
            Object.keys(SIZING_ASSUMPTION_TEXT).toSorted(alphabetically),
        ).toEqual(Object.values(SizingAssumption).toSorted(alphabetically));
        for (const text of Object.values(SIZING_ASSUMPTION_TEXT)) {
            expect(text.length).toBeGreaterThan(0);
        }
    });
});

describe('differenceReasonText: FlatRiskIgnoresState (PT-67b step 4)', () => {
    const text = differenceReasonText({
        documentedFlatRisk: dollars(250),
        fromStateOptimum: dollars(913.5),
        gapInCombinedSEs: 4.2,
        kind: DifferenceReason.FlatRiskIgnoresState,
    });

    it('never calls a one-step grid point an optimum, funded or eval', () => {
        expect(text.toLowerCase()).not.toContain('optimum');
    });

    it('names the one-step comparison and says the documented sizing follows it', () => {
        expect(text).toContain(
            'a one-step comparison favours $913.50 over the documented $250.00',
        );
        expect(text).toContain('documented sizing afterwards');
    });

    it('keeps the measured gap, or states an exact difference when there is no uncertainty', () => {
        expect(text).toContain('4.2 combined SEs apart');
        expect(
            differenceReasonText({
                documentedFlatRisk: dollars(250),
                fromStateOptimum: dollars(913.5),
                gapInCombinedSEs: null,
                kind: DifferenceReason.FlatRiskIgnoresState,
            }),
        ).toContain('an exact difference with no measured uncertainty');
    });

    it('builds the text only from its typed fields: the sentinel numbers appear and no others', () => {
        expect(digitsOf(text)).toBe('25000913502500042');
    });
});

describe('personalPayoutOverrideWarningText (PT-19i review, one text for every surface)', () => {
    const warning = {
        horizonDays: 252,
        optimumBustProbability: 0.12,
        optimumMonthlyNet: 4321,
        optimumRequestSize: 2000,
        overrideBustProbability: 0.34,
        overrideMonthlyNet: 1234,
        overrideRequestSize: 750,
        retainedCushion: 2750,
        retainedCushionBasis: RetainedCushionBasis.RulebookSize,
    };

    it('names both request sizes, the funded horizon, both figures and the retained cushion with its basis', () => {
        const text = personalPayoutOverrideWarningText(warning);
        expect(text).toContain('payout-size sweep over 252 funded days');
        expect(text).toContain('$1,234 at a $750 request');
        expect(text).toContain('$4,321 at $2,000');
        expect(text).toContain('34.0% against 12.0%');
        expect(text).toContain(
            "retaining $2,750 (your rulebook's retained cushion)",
        );
    });

    it('names Hard Rule 2 and the personal override as the basis in their own words', () => {
        expect(
            personalPayoutOverrideWarningText({
                ...warning,
                retainedCushionBasis: RetainedCushionBasis.HardRule2Default,
            }),
        ).toContain("(Hard Rule 2's minimum)");
        expect(
            personalPayoutOverrideWarningText({
                ...warning,
                retainedCushionBasis: RetainedCushionBasis.PersonalOverride,
            }),
        ).toContain('(your personal override)');
    });

    it('builds the text only from its typed fields: the sentinel numbers appear and no others', () => {
        expect(digitsOf(personalPayoutOverrideWarningText(warning))).toBe(
            '2521234750432120003401202750',
        );
    });
});
