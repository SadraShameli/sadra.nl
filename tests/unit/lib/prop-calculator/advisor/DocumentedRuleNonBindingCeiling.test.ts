import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    FirmId,
    InstrumentSymbol,
    ONE_CENT,
    type Plan,
} from '~/lib/prop-calculator';
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
import {
    documentedDayRisk,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const rule = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

const NQ_CONTRACT_AT_20_POINTS = dollars(400);
const FLAT_RUNG = DEFAULT_RULEBOOK.funded.riskCents / 100;

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

function ladderUnder(ceiling: number): number[] {
    return rule
        .size(
            context({
                ceiling: dollars(ceiling),
                placeableMinimum: NQ_CONTRACT_AT_20_POINTS,
            }),
        )
        .rungs.map((rung) => rung.risk);
}

function registryPlan(): Plan {
    const plan = ALL_FIRMS.find((firm) => firm.id === FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('registry plan missing');
    return plan;
}

describe('a ceiling room between the flat rung and one contract keeps the flat rung (PT-36f review)', () => {
    it.each([500, 600, 700, 800])(
        'trades the flat rung under a $%d ceiling at a 400 dollar contract',
        (ceiling) => {
            const trade = rule.nextTrade(
                context({
                    ceiling: dollars(ceiling),
                    placeableMinimum: NQ_CONTRACT_AT_20_POINTS,
                }),
                freshDay(),
            );

            expect(trade.kind).toBe(NextTradeKind.Trade);
            if (trade.kind !== NextTradeKind.Trade) return;
            expect(trade.rung.risk).toBe(FLAT_RUNG);
            expect(trade.rung.cappedBy).not.toContain(
                SizingConstraint.CeilingCap,
            );
        },
    );

    it('sizes the same ladder under a $600 ceiling as under a $10,000 one', () => {
        const underCeiling = ladderUnder(600);

        expect(underCeiling).toStrictEqual(ladderUnder(10_000));
        expect(underCeiling.length).toBeGreaterThan(0);
    });

    it('still stops with the ceiling when the ceiling room is below the flat rung and below one contract', () => {
        const trade = rule.nextTrade(
            context({
                ceiling: dollars(400),
                placeableMinimum: NQ_CONTRACT_AT_20_POINTS,
            }),
            freshDay(),
        );

        expect(trade).toEqual({
            cappedBy: [SizingConstraint.CeilingCap],
            kind: NextTradeKind.Stop,
            reason: DayStopReason.CeilingReached,
        });
    });

    it('keeps a one-cent flat ceiling stop when the ceiling room is under a cent', () => {
        const trade = rule.nextTrade(
            context({ ceiling: dollars(0.01), placeableMinimum: ONE_CENT }),
            freshDay(),
        );

        expect(trade).toMatchObject({
            kind: NextTradeKind.Stop,
            reason: DayStopReason.CeilingReached,
        });
    });
});

describe('the simulator keeps refusing a flat rung below one contract (PT-36f review)', () => {
    const policy = {
        commissionPerRoundTrip: 0,
        fundedHorizonDays: 60,
        lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        lifetimePayoutCapOverride: null,
        payoutRequestOverride: null,
        rebuyLagBasis: RebuyLagBasis.AssumedZero,
        rebuyLagDays: 0,
        retainedCushionRequest: null,
    } as const;

    it('places no trade for a $250 flat rung at an NQ 20-point stop, as before the ceiling floor existed', () => {
        const plan = registryPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const risk = documentedDayRisk(
            plan,
            SizingStage.Funded,
            DEFAULT_RULEBOOK,
            {
                ...policy,
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            },
        );

        expect(risk(state, 0)).toBe(0);
    });

    it('trades the $250 flat rung at an MNQ 20-point stop where one contract costs $40', () => {
        const plan = registryPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const risk = documentedDayRisk(
            plan,
            SizingStage.Funded,
            DEFAULT_RULEBOOK,
            {
                ...policy,
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 20,
            },
        );

        expect(risk(state, 0)).toBe(FLAT_RUNG);
    });
});
