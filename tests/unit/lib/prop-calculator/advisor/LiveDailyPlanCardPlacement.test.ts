import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    buildTopStepLivePlan,
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    liftLiveSizingCushion,
    type LiveAccountState,
    type LivePlan,
    ONE_CENT,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalLadderRule,
    type EvalRuleContext,
    LiveCushionPercentRule,
    type LiveRuleContext,
    LiveSizingAdvisor,
    NextTradeRiskVerdict,
    NO_PERSONAL_CAPS,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { nextTradeRiskCheck } from '~/lib/prop-calculator/advisor/actions';
import { dailyPlanCard } from '~/lib/prop-calculator/advisor/DailyPlanCard';
import { RungPlacement } from '~/lib/prop-calculator/advisor/PlaceableMinimum';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ADVISOR_SOURCE = 'src/lib/prop-calculator/advisor';

const ZERO_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
} as const;

const MNQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.MNQ,
    stopPoints: 20,
} as const;

const live = new LiveCushionPercentRule(DEFAULT_RULEBOOK);

const topStepPlan = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.NoFeeStandard,
});

function advisorFor(
    livePlan: LivePlan,
    state: LiveAccountState,
    positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    },
): LiveSizingAdvisor {
    const account: ReconstructedLiveAccount = {
        assumptions: [],
        cushion: dollars(state.balance - state.threshold),
        kind: ReconstructedLiveKind.Live,
        livePlan,
        plan: topStepPlan,
        state,
    };
    return new LiveSizingAdvisor({
        account,
        positionSizing,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-10-02',
        substate: null,
        today: '2026-10-02',
    });
}

function evalContext(): EvalRuleContext {
    return {
        ceiling: null,
        consistencyDailyCap: null,
        contractLimit: null,
        cushion: dollars(2000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: dollars(0.01),
        remainingProfitToTarget: dollars(4000),
        stage: SizingStage.Eval,
    };
}

function liveContext(): LiveRuleContext {
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
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function stateOnFloor(livePlan: LivePlan): LiveAccountState {
    const state = livePlan.initialState();
    state.balance = state.threshold;
    return state;
}

describe('the live daily plan card places whole contracts at the entered stop (WP62e, N-94)', () => {
    it('carries the risk of one NQ contract at a 20 point stop on a live card', () => {
        const card = dailyPlanCard(live, liveContext(), NQ_AT_20_POINTS);

        expect(card.oneContractRisk).toBe(400);
    });

    it('flags every live rung below one NQ contract', () => {
        const card = dailyPlanCard(live, liveContext(), NQ_AT_20_POINTS);

        expect(card.rungs.length).toBeGreaterThan(0);
        expect(card.rungs[0]?.risk).toBeLessThan(400);
        expect(card.rungPlacements).toStrictEqual(
            card.rungs.map(() => RungPlacement.BelowOneContract),
        );
    });

    it('places the live rungs when one MNQ contract fits inside them', () => {
        const card = dailyPlanCard(live, liveContext(), MNQ_AT_20_POINTS);

        expect(card.oneContractRisk).toBe(40);
        expect(card.rungPlacements).toStrictEqual(
            card.rungs.map(() => RungPlacement.Placeable),
        );
    });

    it('says not checked on a live card when no stop was entered', () => {
        const card = dailyPlanCard(live, liveContext());

        expect(card.oneContractRisk).toBeNull();
        expect(card.rungPlacements).toStrictEqual(
            card.rungs.map(() => RungPlacement.NotChecked),
        );
    });

    it('keeps an evaluation card at not checked with no one-contract risk', () => {
        const card = dailyPlanCard(
            new EvalLadderRule(DEFAULT_RULEBOOK),
            evalContext(),
            NQ_AT_20_POINTS,
        );

        expect(card.oneContractRisk).toBeNull();
        expect(card.rungPlacements).toStrictEqual(
            card.rungs.map(() => RungPlacement.NotChecked),
        );
    });

    it('flags the documented live rung beside the next-trade risk check', () => {
        const result = nextTradeRiskCheck({
            context: liveContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            placement: NQ_AT_20_POINTS,
            proposedRisk: dollars(100),
            rule: live,
        });

        expect(result.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result.documentedRungPlacement).toBe(
            RungPlacement.BelowOneContract,
        );
    });

    it('places the documented live rung when a contract fits inside it', () => {
        const result = nextTradeRiskCheck({
            context: liveContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            placement: MNQ_AT_20_POINTS,
            proposedRisk: dollars(100),
            rule: live,
        });

        expect(result.documentedRungPlacement).toBe(RungPlacement.Placeable);
    });
});

describe('the live sizing advisor feeds its entered instrument and stop to the card and the check (WP62e, N-94)', () => {
    it('puts the one-contract risk and a placeable floor rung on the card of a Topstep LFA on its floor', () => {
        const livePlan = buildTopStepLivePlan();

        const card = advisorFor(livePlan, stateOnFloor(livePlan), {
            instrument: InstrumentSymbol.NQ,
            stopPoints: 22.5,
        }).dailyPlanCard();

        expect(card?.oneContractRisk).toBe(450);
        expect(card?.rungs.map((rung) => rung.risk)).toStrictEqual([450]);
        expect(card?.rungPlacements).toStrictEqual([RungPlacement.Placeable]);
    });

    it('flags a live rung below one contract at the entered stop from the advisor', () => {
        const livePlan = buildTopStepLivePlan();

        const card = advisorFor(livePlan, livePlan.initialState(), {
            instrument: InstrumentSymbol.NQ,
            stopPoints: 100,
        }).dailyPlanCard();

        expect(card?.oneContractRisk).toBe(2000);
        expect(card?.rungPlacements.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toStrictEqual(
            card?.rungs.map(() => RungPlacement.BelowOneContract),
        );
    });

    it('leaves the live card unchecked when no instrument and stop are entered', () => {
        const livePlan = buildTopStepLivePlan();

        const card = advisorFor(
            livePlan,
            livePlan.initialState(),
        ).dailyPlanCard();

        expect(card?.oneContractRisk).toBeNull();
        expect(card?.rungPlacements).toStrictEqual(
            card?.rungs.map(() => RungPlacement.NotChecked),
        );
    });

    it('carries the placement flag on the advisor next-trade risk check', () => {
        const livePlan = buildTopStepLivePlan();

        const result = advisorFor(livePlan, livePlan.initialState(), {
            instrument: InstrumentSymbol.NQ,
            stopPoints: 100,
        }).checkNextTradeRisk(dollars(50), ZERO_DAY);

        expect(result?.documentedRungPlacement).toBe(
            RungPlacement.BelowOneContract,
        );
    });
});

describe('the sizing cushion lift is one named helper in LiveSizing (WP62e)', () => {
    it('keeps a real cushion when no floor trade risk applies', () => {
        expect(liftLiveSizingCushion(2000, 0)).toBe(2000);
    });

    it('lifts a cushion at or below the floor to the floor trade risk', () => {
        expect(liftLiveSizingCushion(0, 450)).toBe(450);
        expect(liftLiveSizingCushion(-1e-10, 450)).toBe(450);
    });

    it('never lowers a cushion above the floor trade risk', () => {
        expect(liftLiveSizingCushion(2000, 450)).toBe(2000);
    });

    it('is not reached through resolveLiveAffordableRoom with null arguments by the live rule', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, ADVISOR_SOURCE, 'LiveCushionPercentRule.ts'),
            'utf8',
        );

        expect(source).not.toContain('resolveLiveAffordableRoom');
        expect(source).toContain('liftLiveSizingCushion');
    });
});
