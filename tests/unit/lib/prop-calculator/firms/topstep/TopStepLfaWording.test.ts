import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    DrawdownKind,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    points,
    PolicySizing,
    RungSizing,
    StaticDrawdown,
    StrictlyBelowStaticDrawdown,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    buildTopStepLivePlan,
    computeTopStepLiveStartingBalance,
    LiveApplicabilityKind,
    livePlanApplicability,
    TopStep,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms';
import { runDay } from '~/lib/prop-calculator/simulator/day';
import { runLiveDay } from '~/lib/prop-calculator/simulator/livePhase';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';

import { dayRunOptionsFor } from '../../dayRunOptions';

const FIRM_IDLE_GRACE_DAYS = 30;
const LFA_FLOOR = 1000;
const ONE_CENT_DOLLARS = 0.01;
const ALWAYS_IDLE = () => 0;
const ONE_NQ_AT_450 = {
    instrument: INSTRUMENTS[InstrumentSymbol.NQ],
    stopPoints: points(22.5),
};

function closedForInactivityDay(outcomes: readonly boolean[]): number {
    return outcomes.indexOf(true) + 1;
}

function lfaIdleOutcomes(days: number): boolean[] {
    const plan = buildTopStepLivePlan();
    const state = plan.initialState();
    const outcomes: boolean[] = [];
    for (let day = 0; day < days; day++) {
        const result = runLiveDay({
            commission: dollars(0),
            idleDayProbability: 1,
            plan,
            positionSizing: ONE_NQ_AT_450,
            rng: ALWAYS_IDLE,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(0.5),
        });
        outcomes.push(result.closedForInactivity);
        if (result.busted) break;
    }
    return outcomes;
}

function stateAt(balance: number) {
    return {
        balance,
        startingBalance: 10_000,
        threshold: 1000,
        thresholdLocked: false,
    };
}

function xfaIdleOutcomes(days: number): boolean[] {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep No-fee Standard 50K plan not found');
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const totals = new TradeTotals();
    const stats = newPhaseStats(
        state.startingBalance,
        totals,
        new LossStreak(totals),
    );
    const outcomes: boolean[] = [];
    for (let day = 0; day < days; day++) {
        const result = runDay(
            dayRunOptionsFor(TradingPhase.Funded, {
                commission: dollars(0),
                dayPolicy: {
                    ladder: [500],
                    maxLossesPerDay: null,
                    sizing: PolicySizing.ContractCapped,
                    stopRule: { kind: DayStopRuleKind.None },
                },
                idleDayProbability: 1,
                plan,
                positionSizing: null,
                rng: ALWAYS_IDLE,
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                state,
                stats,
                winrate: fraction(0.4),
            }),
        );
        outcomes.push(result.closedForInactivity);
        if (result.busted) break;
    }
    return outcomes;
}

describe('the strictly-below static floor leaves the shared at-or-below comparison untouched', () => {
    const plain = new StaticDrawdown({ amount: dollars(9000) });
    const strict = new StrictlyBelowStaticDrawdown({ amount: dollars(9000) });

    it('a plain static drawdown still breaches at exactly its threshold', () => {
        expect(plain.initialThreshold(10_000)).toBe(1000);
        expect(plain.isBreached(stateAt(1000))).toBe(true);
    });

    it('the strictly-below floor keeps the same threshold and the static kind, and breaches only below it', () => {
        expect(strict.initialThreshold(10_000)).toBe(1000);
        expect(strict.kind).toBe(DrawdownKind.Static);
        expect(strict.isBreached(stateAt(1000))).toBe(false);
        expect(strict.isBreached(stateAt(1000.01))).toBe(false);
        expect(strict.isBreached(stateAt(1000 - 1e-9))).toBe(false);
        expect(strict.isBreached(stateAt(999.99))).toBe(true);
        expect(strict.isBreached(stateAt(500))).toBe(true);
    });

    it('a TopStep XFA trailing drawdown still breaches at exactly its threshold', () => {
        const plan = new TopStep().findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.NoFeeStandard,
        });
        if (!plan) throw new Error('TopStep No-fee Standard 50K not found');
        const state = plan.initialState();
        state.balance = state.threshold;

        expect(plan.isBust(state, TradingPhase.Funded)).toBe(true);
    });
});

describe('TopStep inactivity: "no trading activity for more than 30 days may be closed" (articles 10657969 and 8284215), N-94 (b)', () => {
    it('keeps the LFA open through idle day 30 and closes it on idle day 31', () => {
        const outcomes = lfaIdleOutcomes(FIRM_IDLE_GRACE_DAYS + 5);

        expect(outcomes[FIRM_IDLE_GRACE_DAYS - 1]).toBe(false);
        expect(outcomes[FIRM_IDLE_GRACE_DAYS]).toBe(true);
        expect(closedForInactivityDay(outcomes)).toBe(FIRM_IDLE_GRACE_DAYS + 1);
    });

    it('keeps the XFA open through idle day 30 and closes it on idle day 31', () => {
        const outcomes = xfaIdleOutcomes(FIRM_IDLE_GRACE_DAYS + 5);

        expect(outcomes[FIRM_IDLE_GRACE_DAYS - 1]).toBe(false);
        expect(outcomes[FIRM_IDLE_GRACE_DAYS]).toBe(true);
        expect(closedForInactivityDay(outcomes)).toBe(FIRM_IDLE_GRACE_DAYS + 1);
    });

    it('discloses on the TopStep notes that the firm says "may be closed", so the closure is the tool assumption, and what a day counts', () => {
        const notes = new TopStep().notes.join('\n');

        expect(notes).toContain('may be closed');
        expect(notes).toContain('tool assumption');
    });

    it('states the inactivity closure once, as 31 sessions, with no stale 30-day wiring sentence', () => {
        const notes = new TopStep().notes.join('\n');

        expect(notes).not.toContain('maxConsecutiveIdleDays: 30');
        expect(notes).not.toContain('(INACTIVITY_CLOSURE_DAYS)');
        expect(notes).toContain('TOPSTEP_INACTIVITY_CLOSURE_DAYS (31)');
    });
});

describe('TopStep Trading Combine carries no inactivity rule, N-94 (b) and WP62b (articles 8284121, 8284197 and 8284215, re-fetched 2026-10-02)', () => {
    const tradingCombinePlans = new TopStep().plans.filter(
        (plan) =>
            plan.id.firm === FirmId.TopStep &&
            plan.id.variant !== TopStepVariant.ProAccount,
    );

    it('builds the eight Combine-and-XFA variants', () => {
        expect(tradingCombinePlans).toHaveLength(8);
    });

    it.each(tradingCombinePlans.map((plan) => [plan.label, plan] as const))(
        'leaves the Combine of %s without an idle limit and keeps the XFA at 31 sessions',
        (_label, plan) => {
            expect(
                plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval),
            ).toBeNull();
            expect(plan.maxConsecutiveIdleDaysFor(TradingPhase.Funded)).toBe(
                FIRM_IDLE_GRACE_DAYS + 1,
            );
        },
    );

    it('never closes a Combine account for inactivity, however long it sits idle', () => {
        const plan = new TopStep().findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.NoFeeStandard,
        });
        if (!plan)
            throw new Error('TopStep No-fee Standard 50K plan not found');
        const state = plan.initialState();
        const totals = new TradeTotals();
        const stats = newPhaseStats(
            state.startingBalance,
            totals,
            new LossStreak(totals),
        );
        for (let day = 0; day < FIRM_IDLE_GRACE_DAYS * 3; day++) {
            const result = runDay(
                dayRunOptionsFor(TradingPhase.Eval, {
                    commission: dollars(0),
                    dayPolicy: {
                        ladder: [500],
                        maxLossesPerDay: null,
                        sizing: PolicySizing.ContractCapped,
                        stopRule: { kind: DayStopRuleKind.None },
                    },
                    idleDayProbability: 1,
                    plan,
                    positionSizing: null,
                    rng: ALWAYS_IDLE,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state,
                    stats,
                    winrate: fraction(0.4),
                }),
            );
            expect(result.closedForInactivity).toBe(false);
            expect(result.busted).toBe(false);
        }
    });

    it('states on the TopStep notes that the Combine has no inactivity closure and the eval idle limit is null, with no open-gap sentence', () => {
        const notes = new TopStep().notes.join('\n');

        expect(notes).toContain('evalMaxConsecutiveIdleDays: null');
        expect(notes).not.toContain('This gap stays open');
        expect(notes).not.toContain('(inaccurately)');
    });
});

describe('TopStep LFA start under a $10,000 capped balance (article 13747178, dateModified 2026-09-29), N-94 (c)', () => {
    it('starts at the capped amount when it is under $10,000, since Topstep "supplements from that same capped amount"', () => {
        expect(
            computeTopStepLiveStartingBalance(dollars(6000), dollars(50_000)),
        ).toBe(6000);
    });

    it('still starts at $10,000 once the capped amount reaches it, and never above the capped amount', () => {
        expect(
            computeTopStepLiveStartingBalance(dollars(10_000), dollars(50_000)),
        ).toBe(10_000);
        expect(
            computeTopStepLiveStartingBalance(dollars(49_999), dollars(50_000)),
        ).toBe(10_000);
        expect(
            computeTopStepLiveStartingBalance(
                dollars(9999.99),
                dollars(50_000),
            ),
        ).toBe(9999.99);
    });

    it('builds a $6,000 LFA with no Reserve from a $6,000 capped XFA balance, floor $1,000 under the start', () => {
        const plan = buildTopStepLivePlan(undefined, dollars(6000));
        const state = plan.initialState();

        expect(plan.startingBalance).toBe(6000);
        expect(state.balance).toBe(6000);
        expect(state.threshold).toBe(1000);
        expect(plan.seedReserve.amount).toBe(0);
    });

    it('reports the lowest documented start through the same formula, below $10,000', () => {
        const applicability = livePlanApplicability({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (applicability.kind !== LiveApplicabilityKind.Builder) {
            throw new Error('TopStep must map to a live builder');
        }
        const range = applicability.documentedStart?.(dollars(50_000));

        expect(range?.highest).toBe(10_000);
        expect(range?.lowest).toBe(
            computeTopStepLiveStartingBalance(
                dollars(LFA_FLOOR + ONE_CENT_DOLLARS),
                dollars(50_000),
            ),
        );
        expect(range?.lowest).toBeLessThan(10_000);
    });
});

describe('TopStep LFA start never sits at or under the $1,000 liquidation floor, N-94 (c)', () => {
    it.each([0, 500, LFA_FLOOR])(
        "rejects a capped XFA balance of $%d as the tool's conservative bound, since a start at or under the floor has no cushion",
        (capped) => {
            expect(() =>
                buildTopStepLivePlan(undefined, dollars(capped)),
            ).toThrow(/liquidation floor/);
        },
    );

    it('builds a live LFA from a capped balance one cent over the floor, alive at day 0', () => {
        const plan = buildTopStepLivePlan(
            undefined,
            dollars(LFA_FLOOR + ONE_CENT_DOLLARS),
        );

        expect(plan.startingBalance).toBe(LFA_FLOOR + ONE_CENT_DOLLARS);
        expect(plan.isBust(plan.initialState())).toBe(false);
    });

    it('reports a documented lowest start the plan can run with, above the floor and alive at day 0', () => {
        const applicability = livePlanApplicability({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (applicability.kind !== LiveApplicabilityKind.Builder) {
            throw new Error('TopStep must map to a live builder');
        }
        const lowest = applicability.documentedStart?.(dollars(50_000)).lowest;
        if (lowest === undefined) throw new Error('missing documented start');
        const plan = applicability.builder(
            TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
            dollars(lowest),
        );

        expect(lowest).toBeGreaterThan(LFA_FLOOR);
        expect(plan.startingBalance).toBe(lowest);
        expect(plan.isBust(plan.initialState())).toBe(false);
    });
});

describe('TopStep LFA note cites the 2026-10-01 revision of article 10657969, N-94 (d)', () => {
    it('names the current dateModified and drops the stale one', () => {
        const notes = new TopStep().notes.join('\n');

        expect(notes).toContain('dateModified 2026-10-01');
        expect(notes).not.toContain('dateModified 2026-09-17, re-fetched');
    });
});

describe("TopStep LFA note discloses the liquidation wording conflict and states the start bound as the tool's own", () => {
    it('names the may and will wordings of the same $1,000 trigger and calls the certain liquidation the tool assumption', () => {
        const notes = new TopStep().notes.join('\n');

        expect(notes).toContain("'may be' in the callout");
        expect(notes).toContain("'will be liquidated immediately");
        expect(notes).toContain(
            'Do not let your Account Balance reach or go below $0',
        );
        expect(notes).toContain(
            "the engine treats the liquidation at the $1,000 floor as certain, which is the tool's assumption",
        );
    });

    it('describes the rejected start at or under the floor as a conservative bound, not an LFA the page says opens liquidated', () => {
        const notes = new TopStep().notes.join('\n');

        expect(notes).toContain(
            "rejected by buildTopStepLivePlan as the tool's conservative bound",
        );
        expect(notes).not.toContain('already liquidated');
    });
});
