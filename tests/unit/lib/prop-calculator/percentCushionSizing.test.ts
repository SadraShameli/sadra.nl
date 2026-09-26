import { parseArgs } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TradingInputs } from '~/cli/commands/prop/shared';
import { simArguments, simHeaderLines } from '~/cli/commands/prop/sim/command';
import {
    type AccountState,
    ApexVariant,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    InstrumentSymbol,
    LucidVariant,
    newFundedCycleTracker,
    type Plan,
    PolicySizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { resolvePositionSizing } from '~/lib/prop-calculator/core/PositionSizing';
import { findFirm } from '~/lib/prop-calculator/firms';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { runAccountTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    resolveDayPolicy,
    runDay,
    type SimInputs,
    simInputsSizingIssue,
    simulate,
} from '~/lib/prop-calculator/simulator';
import {
    LossStreak,
    newPhaseStats,
    type PhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';

import { scriptedRng } from './scriptedRng';

const MNQ_CONTRACT_RISK = 20;
const MNQ_FUNDED_LIMIT = 40;
const MAX_ALL_LOSS_DAYS = 50;

function apexEod50k(): Plan {
    const found = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!found) throw new Error('Apex EOD 50K plan not found');
    return found;
}

function freshFundedState(plan: Plan) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const totals = new TradeTotals();
    const stats = newPhaseStats(state.balance, totals, new LossStreak(totals));
    return { state, stats };
}

function lucidProNoDll(): Plan {
    const found = new LucidTrading().findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.ProNoDll,
    });
    if (!found) throw new Error('Lucid Pro no-DLL 50K plan not found');
    return found;
}

function mnqSizing() {
    const sizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
    if (sizing === null) throw new Error('MNQ sizing did not resolve');
    return sizing;
}

function oneFundedTrade(
    isWon: boolean,
    riskPerTrade: number,
    plan: Plan = lucidProNoDll(),
    stopPoints = 10,
) {
    const dayPolicy = resolveDayPolicy(
        percentInputs(plan, 0.25, {
            fundedCushionPercent: undefined,
            riskPerTrade,
            stopPoints,
            tradesPerDay: 1,
        }),
        TradingPhase.Funded,
    );
    const { state, stats } = freshFundedState(plan);
    const startingBalance = state.balance;
    runDay({
        commission: dollars(0),
        dayPolicy,
        fundedCycle: newFundedCycleTracker(state).cycleSnapshot(plan, state),
        phase: TradingPhase.Funded,
        plan,
        positionSizing: resolvePositionSizing(InstrumentSymbol.MNQ, stopPoints),
        rng: scriptedRng([isWon ? 0.01 : 0.99]),
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats,
        winrate: fraction(0.4),
    });
    return state.balance - startingBalance;
}

function percentInputs(
    plan: Plan,
    percent: number,
    overrides: Partial<SimInputs> = {},
): SimInputs {
    return {
        commissionPerRoundTrip: 0,
        fundedCushionPercent: fraction(percent),
        fundedHorizonDays: 252,
        instrument: InstrumentSymbol.MNQ,
        maxEvalDays: 150,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        stopPoints: 10,
        tradesPerDay: 4,
        trials: 2000,
        winrate: 0.4,
        ...overrides,
    };
}

function riskLine(argv: string[], plan?: Plan): string {
    return simHeaderLines(
        TradingInputs.parse(parseArgs<typeof simArguments>(argv, simArguments)),
        plan,
    )[0];
}

function runUntilBust(options: {
    dayPolicy: DayPolicy;
    maxDays: number;
    plan: Plan;
    rng: Rng;
    state: AccountState;
    stats: PhaseStats;
}): null | number {
    const { dayPolicy, maxDays, plan, rng, state, stats } = options;
    const tracker = newFundedCycleTracker(state);
    for (let day = 0; day < maxDays; day++) {
        const { busted } = runDay({
            commission: dollars(0),
            dayPolicy,
            fundedCycle: tracker.cycleSnapshot(plan, state),
            phase: TradingPhase.Funded,
            plan,
            positionSizing: mnqSizing(),
            rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        });
        if (busted) return day;
    }
    return null;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('percent-of-cushion sizing places whole contracts (T33, N-71)', () => {
    it('an all-loss run at 25% of cushion with MNQ at a 10 point stop busts a funded Lucid Pro no-DLL account', () => {
        const plan = lucidProNoDll();
        const inputs = percentInputs(plan, 0.25);
        const dayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
        const { state, stats } = freshFundedState(plan);

        const bustDay = runUntilBust({
            dayPolicy,
            maxDays: MAX_ALL_LOSS_DAYS,
            plan,
            rng: scriptedRng([], 0.99),
            state,
            stats,
        });

        expect(bustDay).not.toBeNull();
    });

    it('places every trade in whole micros within the funded limit, or takes one micro capped at the affordable room', () => {
        const plan = lucidProNoDll();
        const inputs = percentInputs(plan, 0.25);
        const dayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
        const rng = mulberry32(7);
        const affordable: number[] = [];
        const trades: {
            affordable: number;
            isWon: boolean;
            pnl: number;
            risk: number;
        }[] = [];
        const affordableRoom = plan.affordableRoom.bind(plan);
        vi.spyOn(plan, 'affordableRoom').mockImplementation(
            (state, phase, commission) => {
                const room = affordableRoom(state, phase, commission);
                affordable.push(room.room);
                return room;
            },
        );

        for (let account = 0; account < 40; account++) {
            const { state, stats } = freshFundedState(plan);
            const recordTrade = stats.recordTrade.bind(stats);
            vi.spyOn(stats, 'recordTrade').mockImplementation(
                (isWon, pnl, balance, risk) => {
                    trades.push({
                        affordable: affordable.at(-1) ?? NaN,
                        isWon,
                        pnl,
                        risk,
                    });
                    recordTrade(isWon, pnl, balance, risk);
                },
            );
            runUntilBust({ dayPolicy, maxDays: 60, plan, rng, state, stats });
        }

        expect(trades.length).toBeGreaterThan(100);
        for (const trade of trades) {
            const contracts = trade.risk / MNQ_CONTRACT_RISK;
            const isWholeContracts =
                Number.isSafeInteger(contracts) &&
                contracts >= 1 &&
                contracts <= MNQ_FUNDED_LIMIT;
            const isOneMicroOverRoom =
                trade.affordable < MNQ_CONTRACT_RISK &&
                trade.risk === trade.affordable;
            expect(isWholeContracts || isOneMicroOverRoom).toBe(true);
            if (isOneMicroOverRoom && trade.isWon) {
                expect(trade.pnl).toBe(2 * MNQ_CONTRACT_RISK);
            }
        }
    });

    it.each([0.1, 0.25, 0.49])(
        'reports a nonzero funded bust rate at %d of cushion with zero commission',
        (percent) => {
            const out = simulate(percentInputs(lucidProNoDll(), percent));
            expect(out.fundedBustProbability).toBeGreaterThan(0);
        },
    );

    it('has no cliff between 49% and 50% of cushion', () => {
        const plan = lucidProNoDll();
        const at49 = simulate(percentInputs(plan, 0.49));
        const at50 = simulate(percentInputs(plan, 0.5));

        expect(
            Math.abs(at49.fundedBustProbability - at50.fundedBustProbability),
        ).toBeLessThan(0.05);
    });
});

describe('a funded flat risk is placed in whole contracts when a stop is given (T33)', () => {
    it('rounds a $250 funded risk down to 12 MNQ micros ($240) at a 10 point stop', () => {
        expect(oneFundedTrade(false, 250)).toBe(-240);
        expect(oneFundedTrade(true, 250)).toBe(480);
    });

    it('places exactly one MNQ micro for a funded risk of one contract ($20)', () => {
        expect(oneFundedTrade(false, 20)).toBe(-20);
        expect(oneFundedTrade(true, 20)).toBe(40);
    });

    it('takes one MNQ micro when a $250 funded risk meets only $10 of room: the loss stops at the room, the win pays on one micro', () => {
        const plan = lucidProNoDll();
        const dayPolicy = resolveDayPolicy(
            percentInputs(plan, 0.25, {
                fundedCushionPercent: undefined,
                fundedRiskPerTrade: 250,
                tradesPerDay: 1,
            }),
            TradingPhase.Funded,
        );
        const pnlAtThinRoom = (isWon: boolean) => {
            const { state, stats } = freshFundedState(plan);
            state.balance = state.threshold + 10;
            const before = state.balance;
            runDay({
                commission: dollars(0),
                dayPolicy,
                fundedCycle: newFundedCycleTracker(state).cycleSnapshot(
                    plan,
                    state,
                ),
                phase: TradingPhase.Funded,
                plan,
                positionSizing: mnqSizing(),
                rng: scriptedRng([isWon ? 0.01 : 0.99]),
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                state,
                stats,
                winrate: fraction(0.4),
            });
            return state.balance - before;
        };

        expect(pnlAtThinRoom(false)).toBeCloseTo(-10, 9);
        expect(pnlAtThinRoom(true)).toBe(2 * MNQ_CONTRACT_RISK);
    });

    it('rounds a funded risk just under two contracts down to one MNQ micro, never up', () => {
        expect(oneFundedTrade(false, 39.99)).toBe(-20);
    });
});

describe('a funded flat risk below one contract is refused, never rounded up (T33, U18)', () => {
    it('resolveDayPolicy rejects a $12.50 funded risk with MNQ at a 10 point stop, naming the $20 contract risk', () => {
        const inputs = percentInputs(lucidProNoDll(), 0.25, {
            fundedCushionPercent: undefined,
            fundedRiskPerTrade: 12.5,
        });
        expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
            /fundedRiskPerTrade \$12\.5[\s\S]*one MNQ contract[\s\S]*\$20/,
        );
    });

    it('names riskPerTrade when the funded phase inherits a sub-contract risk from it', () => {
        const inputs = percentInputs(lucidProNoDll(), 0.25, {
            fundedCushionPercent: undefined,
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 150,
        });
        expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
            /riskPerTrade \$150[\s\S]*one NQ contract[\s\S]*\$200/,
        );
    });

    it('simulate refuses the same sub-contract funded risk instead of trading a bigger one', () => {
        expect(() =>
            simulate(
                percentInputs(lucidProNoDll(), 0.25, {
                    fundedCushionPercent: undefined,
                    fundedRiskPerTrade: 150,
                    instrument: InstrumentSymbol.NQ,
                    trials: 1,
                }),
            ),
        ).toThrow(/whole contracts/);
    });

    it('keeps a sub-contract eval risk legal, since only funded flat risk is placed in whole contracts', () => {
        const inputs = percentInputs(lucidProNoDll(), 0.25, {
            fundedCushionPercent: undefined,
            fundedRiskPerTrade: 250,
            riskPerTrade: 12.5,
        });
        expect(() => resolveDayPolicy(inputs, TradingPhase.Eval)).not.toThrow();
        expect(() =>
            resolveDayPolicy(inputs, TradingPhase.Funded),
        ).not.toThrow();
    });

    it('does not check the flat risk when percent-of-cushion replaces it in the funded phase', () => {
        const inputs = percentInputs(lucidProNoDll(), 0.25, {
            riskPerTrade: 12.5,
        });
        expect(() =>
            resolveDayPolicy(inputs, TradingPhase.Funded),
        ).not.toThrow();
    });

    it('does not check the flat risk when no stop is given, since the risk is then not placed in contracts', () => {
        const inputs = percentInputs(lucidProNoDll(), 0.25, {
            fundedCushionPercent: undefined,
            fundedRiskPerTrade: 12.5,
            stopPoints: undefined,
        });
        expect(() =>
            resolveDayPolicy(inputs, TradingPhase.Funded),
        ).not.toThrow();
    });
});

describe('the portfolio timeline places funded flat risk in whole contracts like simulate (T33, R2)', () => {
    it('loses 12 MNQ micros ($240) per funded loss in the timeline, the same as simulate for the same inputs, while its eval phase keeps the $250 contract-capped risk', () => {
        const plan = lucidProNoDll();
        const losses: Record<TradingPhase, Set<number>> = {
            [TradingPhase.Eval]: new Set<number>(),
            [TradingPhase.Funded]: new Set<number>(),
        };
        let tradePhase: TradingPhase | undefined;
        const affordableRoom = plan.affordableRoom.bind(plan);
        vi.spyOn(plan, 'affordableRoom').mockImplementation(
            (state, phase, commission) => {
                tradePhase = phase;
                return affordableRoom(state, phase, commission);
            },
        );
        const drawdowns = new Set(
            [TradingPhase.Eval, TradingPhase.Funded].map((phase) =>
                plan.drawdownFor(phase),
            ),
        );
        for (const drawdown of drawdowns) {
            const onTrade = drawdown.onTrade.bind(drawdown);
            vi.spyOn(drawdown, 'onTrade').mockImplementation(
                (state, pnl, peakPnL) => {
                    if (tradePhase !== undefined && pnl < 0) {
                        losses[tradePhase].add(Math.round(-pnl * 100) / 100);
                    }
                    onTrade(state, pnl, peakPnL);
                },
            );
        }

        runAccountTimeline({
            commissionPerRoundTrip: 0,
            dayBudget: 250,
            instrument: InstrumentSymbol.MNQ,
            maxEvalDays: 60,
            plan,
            riskPerTrade: 250,
            rng: mulberry32(3),
            rrRatio: 2,
            stopPoints: 10,
            tradesPerDay: 1,
            winrate: 0.6,
        });

        expect(losses[TradingPhase.Funded].has(240)).toBe(true);
        expect(losses[TradingPhase.Funded].has(250)).toBe(false);
        expect(losses[TradingPhase.Eval].has(250)).toBe(true);
        expect(oneFundedTrade(false, 250)).toBe(-240);
    });

    it('refuses a funded flat risk below one contract at the given stop, with the same text simulate refuses it with', () => {
        const plan = lucidProNoDll();
        const issue = simInputsSizingIssue({
            instrument: InstrumentSymbol.MNQ,
            riskPerTrade: 12.5,
            stopPoints: 10,
        });
        expect(issue).not.toBeNull();
        expect(() =>
            runAccountTimeline({
                instrument: InstrumentSymbol.MNQ,
                maxEvalDays: 60,
                plan,
                riskPerTrade: 12.5,
                rng: mulberry32(3),
                rrRatio: 2,
                stopPoints: 10,
                tradesPerDay: 1,
                winrate: 0.6,
            }),
        ).toThrow(issue ?? '');
    });
});

describe('simInputsSizingIssue is the one sizing check simulate and its callers share (T33)', () => {
    it('returns null for inputs the engine places without refusal', () => {
        const plan = lucidProNoDll();
        expect(simInputsSizingIssue(percentInputs(plan, 0.25))).toBeNull();
        expect(
            simInputsSizingIssue(
                percentInputs(plan, 0.25, {
                    fundedCushionPercent: undefined,
                    riskPerTrade: 20,
                }),
            ),
        ).toBeNull();
        expect(
            simInputsSizingIssue(
                percentInputs(plan, 0.25, {
                    fundedCushionPercent: undefined,
                    riskPerTrade: 12.5,
                    stopPoints: undefined,
                }),
            ),
        ).toBeNull();
        expect(
            simInputsSizingIssue(
                percentInputs(plan, 0.25, {
                    fundedCushionPercent: undefined,
                    fundedDayPolicy: {
                        ladder: [12.5],
                        maxLossesPerDay: null,
                        sizing: PolicySizing.ContractCapped,
                        stopRule: { kind: DayStopRuleKind.None },
                    },
                }),
            ),
        ).toBeNull();
    });

    it('names the missing stop for a percent policy without one', () => {
        const issue = simInputsSizingIssue(
            percentInputs(lucidProNoDll(), 0.25, { stopPoints: undefined }),
        );
        expect(issue).toMatch(/fundedCushionPercent needs position sizing/);
        expect(issue).toMatch(/stopPoints/);
    });

    it('names the one-contract risk for a funded flat risk below it', () => {
        const issue = simInputsSizingIssue(
            percentInputs(lucidProNoDll(), 0.25, {
                fundedCushionPercent: undefined,
                fundedRiskPerTrade: 12.5,
            }),
        );
        expect(issue).toMatch(
            /fundedRiskPerTrade \$12\.5[\s\S]*one MNQ contract[\s\S]*\$20/,
        );
    });

    it('is exactly the text resolveDayPolicy refuses with', () => {
        for (const inputs of [
            percentInputs(lucidProNoDll(), 0.25, { stopPoints: undefined }),
            percentInputs(lucidProNoDll(), 0.25, {
                fundedCushionPercent: undefined,
                fundedRiskPerTrade: 12.5,
            }),
        ]) {
            const issue = simInputsSizingIssue(inputs);
            expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
                `Invalid SimInputs: ${issue ?? ''}`,
            );
        }
    });
});

describe('prop sim prints the placed funded risk next to the requested one (T33)', () => {
    it('shows $250 placed as 12 MNQ micros ($240) at a 10 point stop', () => {
        expect(
            riskLine(
                ['--stop-points', '10', '--instrument', 'MNQ'],
                lucidProNoDll(),
            ),
        ).toContain('funded flat $250 (placed $240: 12 MNQ at 10 pt)');
    });

    it('shows the placed risk for a separate funded risk in whole contracts when the funded limit does not bind', () => {
        expect(
            riskLine(
                [
                    '--funded-risk',
                    '450',
                    '--stop-points',
                    '10',
                    '--instrument',
                    'NQ',
                ],
                lucidProNoDll(),
            ),
        ).toContain('funded flat $450 (placed $400: 2 NQ at 10 pt)');
    });

    it('caps the placed risk at the plan funded contract limit, the figure the engine loses on a full-cushion funded loss', () => {
        const argv = ['--stop-points', '2', '--instrument', 'MNQ'];
        expect(riskLine(argv, lucidProNoDll())).toContain(
            'funded flat $250 (placed $160: 40 MNQ at 2 pt, capped at the funded contract limit at the start tier)',
        );
        expect(oneFundedTrade(false, 250, lucidProNoDll(), 2)).toBe(-160);
    });

    it('caps a tiered funded limit at the start tier: Apex EOD 50K starts funded at 20 micros', () => {
        const argv = ['--stop-points', '2', '--instrument', 'MNQ'];
        expect(riskLine(argv, apexEod50k())).toContain(
            'funded flat $250 (placed $80: 20 MNQ at 2 pt, capped at the funded contract limit at the start tier)',
        );
        expect(oneFundedTrade(false, 250, apexEod50k(), 2)).toBe(-80);
    });

    it('prints the placed risk in whole cents at a stop whose contract risk is not exact in binary', () => {
        expect(
            riskLine(
                [
                    '--funded-risk',
                    '80',
                    '--stop-points',
                    '12.3',
                    '--instrument',
                    'MNQ',
                ],
                lucidProNoDll(),
            ),
        ).toContain('funded flat $80 (placed $73.80: 3 MNQ at 12.3 pt)');
    });

    it('says no contract limit was applied when the header has no plan', () => {
        expect(
            riskLine(['--stop-points', '2', '--instrument', 'MNQ']),
        ).toContain(
            'funded flat $250 (placed $248: 62 MNQ at 2 pt, before any contract limit)',
        );
    });

    it('prints no placed risk without --stop-points, since the risk is then not placed in contracts', () => {
        expect(riskLine([], lucidProNoDll())).not.toContain('placed');
    });
});

describe('percent-of-cushion sizing needs position sizing (T33)', () => {
    it('resolveDayPolicy rejects fundedCushionPercent without a stop, naming stopPoints', () => {
        const inputs = percentInputs(lucidProNoDll(), 0.25, {
            instrument: undefined,
            stopPoints: undefined,
        });
        expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
            /stopPoints/,
        );
    });

    it('simulate rejects fundedCushionPercent with an instrument but no stop', () => {
        expect(() =>
            simulate(
                percentInputs(lucidProNoDll(), 0.25, {
                    stopPoints: undefined,
                    trials: 1,
                }),
            ),
        ).toThrow(/stopPoints/);
    });

    it('accepts fundedCushionPercent once the stop and instrument are set', () => {
        expect(() =>
            resolveDayPolicy(
                percentInputs(lucidProNoDll(), 0.25),
                TradingPhase.Funded,
            ),
        ).not.toThrow();
    });
});
