import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    LivePlan,
    points,
    type PositionSizingConfig,
    StaticDrawdown,
    TierBasis,
    TRADING_DAYS_PER_MONTH,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator/core';
import { LIVE_PLAN_BUILDERS } from '~/lib/prop-calculator/firms';
import { buildAlphaFuturesLivePlan } from '~/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive';
import { buildApexLivePlan } from '~/lib/prop-calculator/firms/apex/ApexLive';
import { buildFundedNextLivePlan } from '~/lib/prop-calculator/firms/fundednext/FundedNextLive';
import {
    buildLucidDailyLivePlan,
    buildLucidLivePlan,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms/lucid/LucidLive';
import { buildMffuRapidLivePlan } from '~/lib/prop-calculator/firms/mffu/MffuRapidLive';
import { buildTopStepLivePlan } from '~/lib/prop-calculator/firms/topstep/TopStepLive';
import {
    buildTptLiveDevelopmentPlan,
    buildTptLivePlan,
} from '~/lib/prop-calculator/firms/tpt/TptLive';
import { buildTradeifyLivePlan } from '~/lib/prop-calculator/firms/tradeify/TradeifyLive';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    type LiveDayRunOptions,
    type LiveSimInputs,
    oneOffLiveCredit,
    runLiveDay,
    runLiveHorizon,
    SIM_INPUTS_REFUSAL_PREFIX,
    simulateLiveAccount,
} from '~/lib/prop-calculator/simulator';

import { scriptedRng } from '../scriptedRng';

const alwaysLoses: Rng = () => 0.999;
const alwaysWins: Rng = () => 0;
const alwaysIdle: Rng = () => 0;

const APEX_ONE_NQ_AT_150 = { instrument: InstrumentSymbol.NQ, stopPoints: 7.5 };
const ONE_NQ_AT_100 = { instrument: InstrumentSymbol.NQ, stopPoints: 5 };
const TOPSTEP_ONE_NQ_AT_450 = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 22.5,
};

function positionSizingOf(sizing: {
    instrument: InstrumentSymbol;
    stopPoints: number;
}): PositionSizingConfig {
    return {
        instrument: INSTRUMENTS[sizing.instrument],
        stopPoints: points(sizing.stopPoints),
    };
}

const APEX_NQ_AT_150 = positionSizingOf(APEX_ONE_NQ_AT_150);
const APEX_MNQ_AT_5 = positionSizingOf({
    instrument: InstrumentSymbol.MNQ,
    stopPoints: 2.5,
});
const NQ_AT_100 = positionSizingOf(ONE_NQ_AT_100);
const TOPSTEP_NQ_AT_450 = positionSizingOf(TOPSTEP_ONE_NQ_AT_450);

function nqAt(contractRisk: number): PositionSizingConfig {
    return positionSizingOf({
        instrument: InstrumentSymbol.NQ,
        stopPoints: contractRisk / INSTRUMENTS[InstrumentSymbol.NQ].pointValue,
    });
}

function runDays(
    state: LiveAccountState,
    days: number,
    rng: Rng,
    winrate: number,
    positionSizing: PositionSizingConfig,
    rrRatio = 2,
) {
    let lastResult = { busted: false, traded: false };
    for (let day = 0; day < days; day++) {
        lastResult = runLiveDay({
            commission: dollars(0),
            plan: buildApexLivePlan(),
            positionSizing,
            rng,
            rrRatio,
            state,
            tradesPerDay: 1,
            winrate: fraction(winrate),
        });
    }
    return lastResult;
}

describe('runLiveDay on Apex numbers ($0 start, $3,000 EOD trailing, 5% pre-lock cushion sizing)', () => {
    it('sizes the first trade at exactly 5% of the full $3,000 cushion: $150 risk, 30 MNQ micros at a 2.5 point stop ($5 a micro)', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: APEX_MNQ_AT_5,
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBe(-150);
        expect(state.threshold).toBe(-3000);
        expect(state.thresholdLocked).toBe(false);
    });

    it('caps a live trade to the plan max-mini-contract limit when the position-sizing config implies more contracts than allowed: $150 intended risk on a 0.5pt NQ stop ($10/contract) implies 15 contracts, capped down to $100 (10 contracts)', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: points(0.5),
            },
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBe(-100);
        expect(state.threshold).toBe(-3000);
    });

    it('busts a pure losing streak on day 20 in whole contracts: after day 1, 5% of the shrinking cushion is below one $150 NQ contract, so every day still loses $150 until the $3,000 cushion is gone, where fractional sizing shrank the loss with the cushion and never busted (N-76)', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        const survived = runDays(state, 19, alwaysLoses, 0, APEX_NQ_AT_150);

        expect(survived.busted).toBe(false);
        expect(state.balance).toBe(-2850);
        expect(runDays(state, 1, alwaysLoses, 0, APEX_NQ_AT_150).busted).toBe(
            true,
        );
        expect(state.balance).toBe(state.threshold);
    });

    it('locks the threshold at exactly startingBalance + $100 on the day cumulative profit first reaches $3,100, overriding whatever the EOD ratchet had already trailed it to', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        const result = runDays(state, 21, alwaysWins, 1, APEX_MNQ_AT_5, 1);

        expect(result.busted).toBe(false);
        expect(state.balance).toBeCloseTo(3150, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });

    it('applies the 10% post-lock rate -- double the 5% pre-lock rate -- to the cushion once locked: 61 MNQ micros at $5 place exactly 10% of the $3,050 cushion', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        runDays(state, 21, alwaysWins, 1, APEX_MNQ_AT_5, 1);
        expect(state.thresholdLocked).toBe(true);
        const cushionAtLock = state.balance - state.threshold;

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: APEX_MNQ_AT_5,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(state.balance).toBeCloseTo(3150 + 0.1 * cushionAtLock, 8);
    });
});

describe('runLiveHorizon on Apex numbers', () => {
    it('a full ("withdraw everything") payout only ever drains the account down to the $3,100 payoutFloor safety net, not the $100 drawdown-lock threshold, so the account never busts from an ordinary full withdrawal: in whole $150 NQ contracts (one before the lock, two at 10% of the cushion after it) $650 on day 23, nothing on day 24 ($300 is under the $500 minimum), $600 on day 25', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: undefined,
            plan,
            positionSizing: APEX_NQ_AT_150,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * (650 + 600), 8);
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('a request size small enough for post-lock growth to outpace it never drains the cushion to the floor', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 60,
            payoutRequestSize: 500,
            plan,
            positionSizing: APEX_NQ_AT_150,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.busted).toBe(false);
        expect(result.totalWithdrawn).toBeGreaterThan(0);
    });

    it('a request size that outpaces post-lock growth still never busts the account, because withdrawals are capped at the $3,100 payoutFloor, well above the real $100 bust threshold: a $1,000 request takes the $650 and $600 excess of days 23 and 25 in whole $150 NQ contracts', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: 1000,
            plan,
            positionSizing: APEX_NQ_AT_150,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * (650 + 600), 8);
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('busts on day 20 of a 500-day pure losing streak in whole $150 NQ contracts, the one-contract minimum losing $150 a day from the $3,000 cushion, where fractional percent sizing never reached the floor (N-76)', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan,
            positionSizing: APEX_NQ_AT_150,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(20);
    });
});

function peakTierLivePlan(): LivePlan {
    return new LivePlan({
        contractLimits: {
            micros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(10),
            },
            minis: {
                kind: ContractLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: [
                    { maxContracts: contracts(1), minBalance: dollars(0) },
                    { maxContracts: contracts(3), minBalance: dollars(1000) },
                ],
            },
        },
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Peak Tier Live',
        liveDailyLossLimit: null,
        liveDrawdown: new StaticDrawdown({ amount: dollars(10_000) }),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('runLiveDay records the peak day-close profit for PeakSessionCloseProfit tiers (N-23)', () => {
    it('keeps the 3-mini tier after a losing day: +$1,500 on day 1 (ten $50 MNQ micros, 5% of the $10,000 cushion, at 1:3), -$575 on day 2 to a $925 close (ten $57.50 MNQ micros, 5% of the $11,500 cushion), then a 1pt NQ loss on day 3 is capped at 3 minis ($60), not 1 ($20)', () => {
        const plan = peakTierLivePlan();
        const state = plan.initialState();
        const dayOptions = {
            commission: dollars(0),
            plan,
            state,
            tradesPerDay: 1,
        };

        runLiveDay({
            ...dayOptions,
            positionSizing: positionSizingOf({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 25,
            }),
            rng: alwaysWins,
            rrRatio: 3,
            winrate: fraction(1),
        });
        expect(state.balance).toBe(1500);
        expect(state.peakDayCloseProfit).toBe(1500);

        runLiveDay({
            ...dayOptions,
            positionSizing: positionSizingOf({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 28.75,
            }),
            rng: alwaysLoses,
            rrRatio: 1,
            winrate: fraction(0),
        });
        expect(state.balance).toBe(925);
        expect(state.peakDayCloseProfit).toBe(1500);

        runLiveDay({
            ...dayOptions,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: points(1),
            },
            rng: alwaysLoses,
            rrRatio: 1,
            winrate: fraction(0),
        });
        expect(state.balance).toBe(865);
    });
});

function apexSessionAt(openProfit: number): LiveAccountState {
    const state = buildApexLivePlan().initialState();
    state.balance = openProfit;
    state.peakDayCloseProfit = openProfit;
    state.threshold = 100;
    state.thresholdLocked = true;
    return state;
}

function runOneApexLosingDay(
    state: LiveAccountState,
    symbol: InstrumentSymbol,
    stopPoints: number,
    tradesPerDay = 1,
) {
    return runLiveDay({
        commission: dollars(0),
        plan: buildApexLivePlan(),
        positionSizing: {
            instrument: INSTRUMENTS[symbol],
            stopPoints: points(stopPoints),
        },
        rng: alwaysLoses,
        rrRatio: 1,
        state,
        tradesPerDay,
        winrate: fraction(0),
    });
}

describe('runLiveDay on the Apex Live levels (pasted Live Prop Trading Program FAQ)', () => {
    it('sizes MNQ up to 100 micros at Level 1: $150 intended risk on a 0.5pt MNQ stop ($1/contract) is 150 micros, capped to 100 for a $100 loss', () => {
        const state = buildApexLivePlan().initialState();

        runOneApexLosingDay(state, InstrumentSymbol.MNQ, 0.5);

        expect(state.balance).toBe(-100);
    });

    it('sizes NQ up to 25 minis at Level 2 ($12,000 prior close): 10% of the $11,900 cushion is $1,190, or 59.5 contracts at $20/contract, capped to 25 for a $500 loss', () => {
        const state = apexSessionAt(12_000);

        runOneApexLosingDay(state, InstrumentSymbol.NQ, 1);

        expect(state.balance).toBe(11_500);
    });

    it('stops the Level 2 day at the $5,000 daily loss limit: ten capped $500 losses from $12,000, then no more trades', () => {
        const state = apexSessionAt(12_000);

        const result = runOneApexLosingDay(state, InstrumentSymbol.NQ, 1, 20);

        expect(result.busted).toBe(false);
        expect(state.todayPnL).toBe(-5000);
        expect(state.balance).toBe(7000);
    });

    it('drops back to 10 minis the session after a payout takes the close from $10,500 to $9,500: $200 loss instead of $500', () => {
        const withoutPayout = apexSessionAt(10_500);
        runOneApexLosingDay(withoutPayout, InstrumentSymbol.NQ, 1);
        expect(withoutPayout.balance).toBe(10_000);

        const afterPayout = apexSessionAt(10_500);
        buildApexLivePlan().withdraw(afterPayout, 1000);
        runOneApexLosingDay(afterPayout, InstrumentSymbol.NQ, 1);
        expect(afterPayout.balance).toBe(9300);
    });
});

describe('runLiveHorizon and the Apex $500 minimum live payout request', () => {
    it('waits past the $50 day-21 and $350 day-22 excess over the $3,100 safety net in whole $150 NQ contracts and first withdraws $650 on day 23', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 23,
            payoutRequestSize: undefined,
            plan: buildApexLivePlan(),
            positionSizing: APEX_NQ_AT_150,
            retainedCushion: dollars(3000),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 650, 8);
    });

    it('rejects a request size below the minimum at the runLiveHorizon boundary instead of silently paying $0', () => {
        expect(() =>
            runLiveHorizon({
                commission: dollars(0),
                horizonDays: 60,
                payoutRequestSize: 400,
                plan: buildApexLivePlan(),
                positionSizing: APEX_NQ_AT_150,
                retainedCushion: dollars(3000),
                rng: alwaysWins,
                rrRatio: 1,
                tradesPerDay: 1,
                winrate: fraction(1),
            }),
        ).toThrow(
            'Apex Live: a payout request of $400 is below the $500 minimum payout request, so it could never be paid',
        );
    });

    it('rejects a NaN request size at the simulateLiveAccount boundary on a plan with no minimum', () => {
        expect(() =>
            simulateLiveAccount({
                ...ONE_NQ_AT_100,
                horizonDays: 10,
                payoutRequestSize: NaN,
                plan: buildTradeifyLivePlan(),
                rrRatio: 1,
                seed: 42,
                tradesPerDay: 1,
                trials: 1,
                winrate: 1,
            }),
        ).toThrow(
            'Tradeify Elite Live: payoutRequestSize must be a finite number > 0 or omitted, got NaN',
        );
    });

    it('rejects a request size below the plan minimum at the simulateLiveAccount boundary', () => {
        expect(() =>
            simulateLiveAccount({
                ...APEX_ONE_NQ_AT_150,
                horizonDays: 10,
                payoutRequestSize: 400,
                plan: buildApexLivePlan(),
                rrRatio: 1,
                seed: 42,
                tradesPerDay: 1,
                trials: 1,
                winrate: 1,
            }),
        ).toThrow(
            'Apex Live: a payout request of $400 is below the $500 minimum payout request, so it could never be paid',
        );
    });
});

describe('runLiveHorizon on MFFU Rapid Live numbers (D4 retained cushion)', () => {
    it('keeps one full $2,000 drawdown of cushion: in whole $100 NQ contracts, no pre-lock withdrawal, day 21 excess of $200 is under the $250 live minimum, so it withdraws $400 every second day from day 22, 0.9 x 10 x 400 = $3,600 over 40 days with no bust', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 40,
            payoutRequestSize: undefined,
            plan: buildMffuRapidLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(2000),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
        expect(result.daysToFirstWithdrawal).toBe(22);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 10 * 400, 6);
    });
});

describe('runLiveDay contract caps branch on mini vs micro', () => {
    it('caps TPT PRO+ Development MNQ at its 20-micro limit, not its 2-mini limit: $62.50 intended risk on a 1pt MNQ stop is capped at 20 x $2 = $40', () => {
        const plan = buildTptLiveDevelopmentPlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
                stopPoints: points(1),
            },
            rng: alwaysLoses,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBeCloseTo(-40, 10);
    });

    it('caps MFFU Rapid Live NQ at its confirmed 3-mini limit: $100 intended risk on a 1pt NQ stop ($20/contract) is capped at $60', () => {
        const plan = buildMffuRapidLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: points(1),
            },
            rng: alwaysLoses,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBeCloseTo(-60, 10);
    });

    it('caps Alpha Futures Live MNQ at 20 micros before the scale-up: $100 intended risk on a 1pt MNQ stop is capped at $40', () => {
        const plan = buildAlphaFuturesLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
                stopPoints: points(1),
            },
            rng: alwaysLoses,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBeCloseTo(-40, 10);
    });

    it('caps Lucid Live MNQ at 20 micros on the first tier: $100 intended risk on a 1pt MNQ stop is capped at $40', () => {
        const plan = buildLucidLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
                stopPoints: points(1),
            },
            rng: alwaysLoses,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBeCloseTo(-40, 10);
    });
});

describe('runLiveHorizon on FundedNext numbers (negative lock offset + staged payout split)', () => {
    it('does not lock yet at day 10 (cumulative profit $1,000, half of the $2,000 starting-balance trigger)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 10; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: NQ_AT_100,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.balance).toBeCloseTo(3000, 8);
        expect(state.thresholdLocked).toBe(false);
    });

    it('locks the threshold $1,000 below the $2,000 starting balance on the day cumulative profit first reaches the $2,000 starting balance itself, unlike every positive-offset firm', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 20; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: NQ_AT_100,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.balance).toBeCloseTo(4000, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(1000);
    });

    it('tracks cumulative lifetime withdrawals across many separate payout events, correctly crossing from the 100% tier into the 90% tier instead of resetting the tier math on every request', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 120,
            payoutRequestSize: 100,
            plan: buildFundedNextLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(20);
        expect(result.totalWithdrawn).toBeCloseTo(5000 + 0.9 * 5100, 6);
    });
});

describe('runLiveHorizon on Lucid Live numbers (payout request locks the $100 MLL early)', () => {
    it('makes its first withdrawal on day 2, long before live profit reaches the $2,000 starting drawdown, because Lucid locks the Max Loss Limit at $100 the moment a payout is requested and the withdrawable cushion is measured against that $100 lock target instead of the -$1,800 trailing floor: one $100 NQ contract a day (10% of the cushion above the lock stays below one contract) pays the $50 request on each of days 2 to 10, 0.9 x 9 x $50 = $405', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 10,
            payoutRequestSize: 50,
            plan: buildLucidLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(2);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 9 * 50, 6);
    });

    it('day 1 produces nothing withdrawable at all: $100 of profit sits exactly at the $100 lock target the request would move the floor to, so the trader cannot pull a cent before day 2', () => {
        const plan = buildLucidLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: NQ_AT_100,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(state.balance).toBe(100);
        expect(state.threshold).toBe(-1900);
        expect(state.thresholdLocked).toBe(false);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(0);
    });

    it('does not bust once the early lock has pinned the floor at $100, even though a flat $50 request outruns 10% post-lock growth on the shrinking cushion: the withdrawal stops one cent above the locked Max Loss Limit instead of landing on it', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 10,
            payoutRequestSize: 50,
            plan: buildLucidLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('still withdraws on day 2 rather than after $2,000 of profit when the trader withdraws everything, taking $99.99 so the balance stays one cent above the freshly locked $100 floor, and does not bust on day 3, when one $100 NQ contract on the one-cent cushion (T33) wins and $100 more is withdrawn', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildLucidLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(2);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * (99.99 + 100), 6);
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('still locks at $100 via the other trigger -- live profit reaching the $2,000 starting drawdown -- after 20 winning days with no payout request at all', () => {
        const plan = buildLucidLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 20; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: NQ_AT_100,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.balance).toBeCloseTo(2000, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });
});

describe('runLiveHorizon drain-to-floor (retainedCushion 0) never forces a bust', () => {
    it('Tradeify locks at $100 on day 21 and withdraws $1,999.99, leaving one cent above the Max Loss Limit, so days 22 to 25 still trade one $100 NQ contract each (T33) and withdraw $100 a day instead of busting on a zero cushion', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: undefined,
            plan: buildTradeifyLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(21);
        expect(result.totalWithdrawn).toBeCloseTo(0.8 * (1999.99 + 4 * 100), 6);
    });

    it('FundedNext locks $1,000 below its $2,000 start on day 20 and withdraws $1,999.99, leaving one cent above the $2,000 deposit a withdrawal may not reach (N-81), with no bust on days 21 and 22, which each win one $100 NQ contract (T33) and withdraw it at the 100% tier', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 22,
            payoutRequestSize: undefined,
            plan: buildFundedNextLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(20);
        expect(result.totalWithdrawn).toBeCloseTo(1999.99 + 2 * 100, 6);
    });

    it('Lucid withdraws $99.99 on day 2 and survives the rest of a 20-day horizon on the one-cent cushion', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 20,
            payoutRequestSize: undefined,
            plan: buildLucidLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(2);
    });
});

describe('runLiveHorizon ignores floating-point dust withdrawals', () => {
    it('reports no withdrawal for MFFU Rapid Live at the default cushion before the lock, even when an EOD ratchet leaves an ulp-sized residue above the floor', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildMffuRapidLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(2000),
            rng: alwaysWins,
            rrRatio: 1.1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBeNull();
        expect(result.totalWithdrawn).toBe(0);
    });
});

describe('runLiveHorizon at the D4 default cushion pays out for every live plan', () => {
    it.each([...LIVE_PLAN_BUILDERS])(
        'withdraws a positive amount within 60 winning days with no bust, for %s',
        (_firm, build) => {
            const plan = build({
                postLock: fraction(0.1),
                preLock: fraction(0.05),
            });
            const result = runLiveHorizon({
                commission: dollars(0),
                horizonDays: 60,
                payoutRequestSize: undefined,
                plan,
                positionSizing: NQ_AT_100,
                retainedCushion: plan.resolveRetainedCushion(undefined),
                rng: alwaysWins,
                rrRatio: 1,
                tradesPerDay: 1,
                winrate: fraction(1),
            });

            expect(result.busted).toBe(false);
            expect(result.totalWithdrawn).toBeGreaterThan(0);
        },
    );
});

describe("runLiveHorizon with a transitionPayout (LucidDaily's one-time capped sim-profit-above-buffer credit)", () => {
    it("pays the capped credit out before day 1 has even traded -- it is already-earned sim profit released at the moment of transition, not capital the trader still has to win -- so 90% of $15,000 is $13,500 withdrawn at daysToFirstWithdrawal 0, while day 1's own $100 of live profit sits exactly on the $100 lock target and stays unwithdrawable", () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 1,
            payoutRequestSize: undefined,
            plan: buildLucidDailyLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(13_500, 6);
    });

    it("layers day 2's ordinary $99.99 full withdrawal on top of the seeded credit as a $89.991 increment rather than re-paying the transition amount, and does not bust on day 3, which withdraws the $100 of one NQ contract, exactly as the same plan without a credit", () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildLucidDailyLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(
            13_500 + 0.9 * (99.99 + 100),
            6,
        );
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('clamps any sim profit above the buffer to the flat $15,000 cap, which does not scale with account size or count: "whether you have one 25k account or five 150k accounts, the maximum sim profit paid out on the move to live is $15,000"', () => {
        expect(buildLucidDailyLivePlan().transitionPayout).toBe(15_000);
        expect(
            buildLucidDailyLivePlan(
                LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
                dollars(30_000),
            ).transitionPayout,
        ).toBe(15_000);
    });

    it('passes a sub-cap amount through unclamped and splits it 90/10 like any other withdrawal, because $15,000 is a ceiling on the credit, not a guaranteed grant: $5,000 of profit above the buffer pays $4,500', () => {
        const plan = buildLucidDailyLivePlan(
            LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
            dollars(5000),
        );

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 1,
            payoutRequestSize: undefined,
            plan,
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(plan.transitionPayout).toBe(5000);
        expect(result.totalWithdrawn).toBeCloseTo(4500, 6);
    });

    it('starts the credited account at the same $0 balance and -$2,000 floor as a LucidPro-originated live account, since the funded buffer funds the starting live drawdown and the credit is paid out instead of traded', () => {
        const state = buildLucidDailyLivePlan().initialState();

        expect(state.balance).toBe(0);
        expect(state.startingBalance).toBe(0);
        expect(state.threshold).toBe(-2000);
    });

    it('leaves every plan without a credit untouched: the shared Lucid builder and Apex both report no withdrawal at all through day 5, not a phantom day-0 payout', () => {
        expect(buildLucidLivePlan().transitionPayout).toBe(0);

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildApexLivePlan(),
            positionSizing: APEX_NQ_AT_150,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBeNull();
        expect(result.totalWithdrawn).toBe(0);
    });
});

describe('runLiveHorizon on TopStep numbers ($1,000 auto-liquidation floor, Reserve releases, DailyLossLimit-tiered risk)', () => {
    it('sizes off the $9,000 distance to the $1,000 auto-liquidation floor: 5% is $450 risk (N-44)', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: TOPSTEP_NQ_AT_450,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(state.balance).toBe(10_450);
        expect(state.threshold).toBe(1000);
        expect(state.thresholdLocked).toBe(false);
    });

    it('waits for 5 winning days of $150+ before the first LFA payout, then drains 50% of the $12,250 balance, seed included: one $450 NQ contract a day wins $2,250 in 5 days, and the $6,125 drain pays $5,512.50 (N-44)', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(5);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 6125, 8);
    });

    it('keeps the seed at the default one-drawdown cushion: day 5 withdraws only the $2,250 of profit from five $450 NQ contracts, paying $2,025', () => {
        const plan = buildTopStepLivePlan();
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan,
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(5);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 2250, 8);
    });

    it('adds a released $10,000 Reserve increment to the tradable balance but holds it out of payouts until all four are out: over 20 winning days two releases (days 12 and 17) feed the position size, two $450 NQ contracts from day 13 and three from day 18, and the default cushion pays the $2,250, $2,250, $3,600 and $5,850 of profit taken on days 5, 10, 15 and 20', () => {
        const plan = buildTopStepLivePlan();
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 20,
            payoutRequestSize: undefined,
            plan,
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.capitalReturned).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(
            0.9 * (2250 + 2250 + 3600 + 5850),
            6,
        );
    });

    it('returns the whole $40,000 Reserve once all four increments are out, as capital, never as recurring income: over 60 winning days in whole $450 NQ contracts the default debits $44,550 of trading profit ($31,050 by day 30, when the 30-winning-day gate lifts and $49,000 drains, then $450 a day) and $40,000 of released Reserve, and the 60-day annual rate carries only the profit', () => {
        const horizonDays = 60;
        const profitDebitedByDay30 = 2250 + 2250 + 3600 + 5850 + 8100 + 9000;
        const profitDebited = profitDebitedByDay30 + 30 * 450;
        const plan = buildTopStepLivePlan();
        const out = simulateLiveAccount({
            ...TOPSTEP_ONE_NQ_AT_450,
            horizonDays,
            plan,
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });
        const horizon = runLiveHorizon({
            commission: dollars(0),
            horizonDays,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: {
                instrument: INSTRUMENTS[TOPSTEP_ONE_NQ_AT_450.instrument],
                stopPoints: points(TOPSTEP_ONE_NQ_AT_450.stopPoints),
            },
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(profitDebited).toBe(44_550);
        expect(horizon.daysToFirstWithdrawal).toBe(5);
        expect(horizon.recurringWithdrawn).toBeCloseTo(0.9 * profitDebited, 6);
        expect(horizon.capitalReturned).toBeCloseTo(0.9 * 40_000, 6);
        expect(horizon.totalWithdrawn).toBeCloseTo(
            0.9 * (profitDebited + 40_000),
            6,
        );
        expect(out.expectedCapitalReturned).toBeCloseTo(0.9 * 40_000, 6);
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            ((0.9 * profitDebited) / horizonDays) * TRADING_DAYS_PER_YEAR,
            6,
        );
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            (horizon.recurringWithdrawn / horizonDays) * TRADING_DAYS_PER_YEAR,
            6,
        );
        expect(out.cumulativeWithdrawalsAtHorizon[0]).toBeCloseTo(
            horizon.recurringWithdrawn + 0.9 * 40_000,
            6,
        );
        expect(out.expectedLiquidationPayout).toBe(0);
    });

    it.each([
        {
            capital: 0,
            days: 29,
            description:
                'in whole $450 NQ contracts debits $22,050 of profit and no Reserve by day 29, with days 28 and 29 at 4 contracts ($1,800 under the $2,000 base limit), not 5, because the $2,500 tier needs 10 Active Trading Days at $15,000 first (N-59)',
            profitDebited: 22_050,
        },
        {
            capital: 40_000,
            days: 30,
            description:
                'in whole $450 NQ contracts debits $31,050 of profit and the $40,000 Reserve by day 30, when the 30-winning-day gate lifts, with days 28 to 30 at 4 contracts ($1,800), not 5, because the $2,500 tier needs 10 Active Trading Days at $15,000 first (N-59)',
            profitDebited: 31_050,
        },
    ])('$description', ({ capital, days, profitDebited }) => {
        const plan = buildTopStepLivePlan();
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: days,
            payoutRequestSize: undefined,
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[TOPSTEP_ONE_NQ_AT_450.instrument],
                stopPoints: points(TOPSTEP_ONE_NQ_AT_450.stopPoints),
            },
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.recurringWithdrawn).toBeCloseTo(0.9 * profitDebited, 6);
        expect(result.capitalReturned).toBeCloseTo(0.9 * capital, 6);
    });

    it('reports a Reserve return only when the assumed transferred XFA balance leaves a Reserve: with no Reserve the 60-day run returns no capital', () => {
        const withoutReserve = buildTopStepLivePlan(undefined, dollars(10_000));
        const out = simulateLiveAccount({
            ...TOPSTEP_ONE_NQ_AT_450,
            horizonDays: 60,
            plan: withoutReserve,
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(withoutReserve.seedReserve.amount).toBe(0);
        expect(out.expectedCapitalReturned).toBe(0);
        expect(out.expectedAnnualWithdrawalRate).toBeGreaterThan(0);
    });

    it('caps one losing trade at the $2,000 base Daily Loss Limit after all four Reserve releases, although 5% of the $61,000 cushion, released Reserve included, is $3,050: five $400 NQ contracts fit the $2,000 room', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (const pnl of [
            3000, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 3000, 0, 0, 0,
            0, 0, 0,
        ]) {
            state.todayPnL = pnl;
            state.balance += pnl;
            plan.recordDayClose(state, pnl !== 0);
        }
        state.todayPnL = 0;

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: nqAt(400),
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.startingBalance).toBe(50_000);
        expect(state.balance).toBeCloseTo(60_000, 9);
        expect(state.todayPnL).toBeCloseTo(-2000, 9);
    });

    it('closes the account at the $1,000 auto-liquidation floor: one $450 NQ contract and a $10 commission lose $460 a day, so the day-20 loss busts it', () => {
        const result = runLiveHorizon({
            commission: dollars(10),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(20);
        expect(result.recurringWithdrawn).toBe(0);
        expect(result.liquidationPayout).toBeGreaterThan(0);
        expect(result.totalWithdrawn).toBe(result.liquidationPayout);
    });

    it('restarts the winning-day count after each LFA payout: over 10 winning days it withdraws only on days 5 and 10', () => {
        const withdrawalDays: number[] = [];
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (let day = 1; day <= 10; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: TOPSTEP_NQ_AT_450,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
            const debited = plan.payoutRequestAmount(
                state,
                dollars(0),
                undefined,
            );
            if (debited <= 0) continue;
            plan.withdraw(state, debited);
            withdrawalDays.push(day);
        }

        expect(withdrawalDays).toStrictEqual([5, 10]);
    });

    it('does not count a winning day under $150 toward the LFA payout gate: 1% of the cushion is below one $100 NQ contract, so one contract earns $100 a day and never unlocks a payout', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 20,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan({
                postLock: fraction(0.01),
                preLock: fraction(0.01),
            }),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBeNull();
        expect(result.totalWithdrawn).toBe(0);
    });

    it('reaches the $1,000 floor on day 20 of a commission-free loss streak: the one-contract minimum loses $450 a day from the $9,000 cushion, where fractional sizing shrank each loss to 5% of the distance and never reached it (N-76)', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(20);
        expect(result.liquidationPayout).toBeCloseTo(0.9 * 1000, 9);
    });

    it('locks the trading day out for the rest of the day once losses reach the current Daily Loss Limit tier: five one-contract $400 NQ losses reach -$2,000', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        const result = runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: nqAt(400),
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 100,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(state.todayPnL).toBe(-2000);
    });
});

interface TopStepSizedDay {
    readonly closedLimit: null | number;
    readonly debited: number;
    readonly pnl: number;
    readonly profitAboveStart: number;
    readonly startingBalance: number;
}

function repeated(value: number, count: number): number[] {
    return Array.from({ length: count }, () => value);
}

function topStepSizedDefaultTrace(days: number): TopStepSizedDay[] {
    const plan = buildTopStepLivePlan();
    const state = plan.initialState();
    const retainedCushion = plan.resolveRetainedCushion(undefined);
    const trace: TopStepSizedDay[] = [];
    for (let day = 0; day < days; day++) {
        runLiveDay({
            commission: dollars(0),
            idleDayProbability: 0,
            plan,
            positionSizing: TOPSTEP_NQ_AT_450,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });
        const closedLimit = plan.dailyLossLimitFor(state);
        const profitAboveStart = state.balance - state.startingBalance;
        const debited = plan.payoutRequestAmount(
            state,
            retainedCushion,
            undefined,
        );
        if (debited > 0) plan.withdraw(state, debited);
        trace.push({
            closedLimit,
            debited,
            pnl: state.todayPnL,
            profitAboveStart,
            startingBalance: state.startingBalance,
        });
    }
    return trace;
}

describe('the TopStep LFA 60-day Reserve run on the sized path, traced day by day in whole $450 NQ contracts at the default one-drawdown cushion (WP44b, N-76)', () => {
    const trace = topStepSizedDefaultTrace(30);

    it('places one contract through day 12, two from day 13 after the day-12 release, three from day 18 after the day-17 release and four from day 23, where 5% of the cushion passes $1,800 but the $2,000 room holds five out', () => {
        expect(trace.map((day) => day.pnl)).toStrictEqual([
            ...repeated(450, 12),
            ...repeated(900, 5),
            ...repeated(1350, 5),
            ...repeated(1800, 8),
        ]);
        expect(trace.map((day) => day.startingBalance)).toStrictEqual([
            ...repeated(10_000, 11),
            ...repeated(20_000, 5),
            ...repeated(30_000, 5),
            ...repeated(40_000, 5),
            ...repeated(50_000, 4),
        ]);
    });

    it('debits the profit anchor of the 60-day test: $2,250 on days 5 and 10, $3,600 on day 15, $5,850 on day 20, $8,100 on day 25 and $49,000 on day 30 ($9,000 of profit and the $40,000 Reserve once the 30-winning-day gate lifts), nothing on any other day', () => {
        const debits = new Map([
            [5, 2250],
            [10, 2250],
            [15, 3600],
            [20, 5850],
            [25, 8100],
            [30, 49_000],
        ]);

        expect(trace.map((day) => day.debited)).toStrictEqual(
            trace.map((_day, index) => debits.get(index + 1) ?? 0),
        );
        expect(trace.reduce((sum, day) => sum + day.debited, 0) - 40_000).toBe(
            2250 + 2250 + 3600 + 5850 + 8100 + 9000,
        );
    });

    it('counts withdrawals in the tier profit (N-57): trading profit reaches $15,300 on day 21 while the balance is only $1,350 above the running starting balance, and the $2,500 tier unlocks at the day-30 close, the 10th Active Trading Day since, although the balance never closes $15,000 above its start', () => {
        const day21 = trace[20];

        expect(trace.slice(0, 21).reduce((sum, day) => sum + day.pnl, 0)).toBe(
            15_300,
        );
        expect(day21?.profitAboveStart).toBe(1350);
        expect(trace[28]?.closedLimit).toBe(2000);
        expect(trace[29]?.closedLimit).toBe(2500);
        expect(Math.max(...trace.map((day) => day.profitAboveStart))).toBe(
            9000,
        );
    });
});

function topStepDrainRun(horizonDays: number) {
    return runLiveHorizon({
        commission: dollars(0),
        horizonDays,
        payoutRequestSize: undefined,
        plan: buildTopStepLivePlan(),
        positionSizing: TOPSTEP_NQ_AT_450,
        retainedCushion: dollars(0),
        rng: alwaysWins,
        rrRatio: 1,
        tradesPerDay: 1,
        winrate: fraction(1),
    });
}

const TOPSTEP_SIZED_FIVE_DAY_PROFIT = 5 * 450;
const TOPSTEP_SIZED_FIVE_DAY_DRAIN =
    (10_000 + TOPSTEP_SIZED_FIVE_DAY_PROFIT) / 2;

describe('WP18f R-5: a withdrawal from below the running starting balance is capital, a one-off that is never annualized', () => {
    it('splits the day-5 LFA drain of $6,125 (50% of the $12,250 balance after five $450 NQ wins) into $2,250 of trading profit, paid as recurring income, and $3,875 of seed, paid as capital, both at the 90/10 split', () => {
        const result = topStepDrainRun(5);

        expect(result.recurringWithdrawn).toBeCloseTo(
            0.9 * TOPSTEP_SIZED_FIVE_DAY_PROFIT,
            8,
        );
        expect(result.capitalReturned).toBeCloseTo(
            0.9 *
                (TOPSTEP_SIZED_FIVE_DAY_DRAIN - TOPSTEP_SIZED_FIVE_DAY_PROFIT),
            8,
        );
        expect(result.totalWithdrawn).toBeCloseTo(
            0.9 * TOPSTEP_SIZED_FIVE_DAY_DRAIN,
            8,
        );
    });

    it('counts profit earned after a seed withdrawal as profit again: after the $6,125 day-5 drain, one $450 NQ contract a day (5% of the $5,125 cushion is below one) wins $2,250 by day 10, whose drain of 50% of $8,375, $4,187.50, is that $2,250 of profit and $1,937.50 of seed', () => {
        const result = topStepDrainRun(10);

        expect(result.recurringWithdrawn).toBeCloseTo(0.9 * (2250 + 2250), 8);
        expect(result.capitalReturned).toBeCloseTo(0.9 * (3875 + 1937.5), 8);
        expect(result.totalWithdrawn).toBeCloseTo(
            0.9 * (TOPSTEP_SIZED_FIVE_DAY_DRAIN + 4187.5),
            8,
        );
    });

    it('annualizes only the profit part in simulateLiveAccount and reports the seed as expectedCapitalReturned: one $450 NQ contract a day wins $2,250 in 5 days, and the day-5 drain of 50% of the $12,250 balance, $6,125, is $2,250 of profit and $3,875 of seed', () => {
        const out = simulateLiveAccount({
            ...TOPSTEP_ONE_NQ_AT_450,
            horizonDays: 5,
            plan: buildTopStepLivePlan(),
            retainedCushion: 0,
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            ((0.9 * TOPSTEP_SIZED_FIVE_DAY_PROFIT) / 5) * TRADING_DAYS_PER_YEAR,
            6,
        );
        expect(out.expectedCapitalReturned).toBeCloseTo(
            0.9 *
                (TOPSTEP_SIZED_FIVE_DAY_DRAIN - TOPSTEP_SIZED_FIVE_DAY_PROFIT),
            8,
        );
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(
            0.9 * TOPSTEP_SIZED_FIVE_DAY_DRAIN,
            8,
        );
    });

    it('reports no capital for a plan that only ever pays profit', () => {
        const out = simulateLiveAccount({
            ...APEX_ONE_NQ_AT_150,
            horizonDays: 25,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.expectedCapitalReturned).toBe(0);
        expect(out.expectedLiquidationPayout).toBe(0);
    });
});

function bustByCommission(positionSizing: PositionSizingConfig): {
    balanceAtBust: number;
    daysToBust: number;
} {
    const plan = buildTopStepLivePlan();
    const state = plan.initialState();
    for (let day = 1; day <= 500; day++) {
        const { busted } = runLiveDay({
            commission: dollars(10),
            plan,
            positionSizing,
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });
        if (busted) return { balanceAtBust: state.balance, daysToBust: day };
    }
    throw new Error('the commission loss streak never busted');
}

describe('WP18f R-12: an auto-liquidation pays the remaining balance as a final payout (help.topstep.com article 10657969: "The remaining balance would then be sent as a final Payout.")', () => {
    it('pays 90% of the balance left at the $1,000 floor bust on day 20 as a one-off liquidation payout: one $450 NQ contract and $10 a day lose $460, and the day-20 loss stops at the floor, whose commission leaves $990', () => {
        const { balanceAtBust, daysToBust } =
            bustByCommission(TOPSTEP_NQ_AT_450);
        const result = runLiveHorizon({
            commission: dollars(10),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(daysToBust).toBe(20);
        expect(balanceAtBust).toBeCloseTo(990, 9);
        expect(result.liquidationPayout).toBeCloseTo(0.9 * balanceAtBust, 9);
        expect(result.recurringWithdrawn).toBe(0);
        expect(result.capitalReturned).toBe(0);
    });

    it('reports the liquidation payout as its own one-off in simulateLiveAccount, outside the annual rate: one $450 NQ contract a day loses $460 with commission until the day-20 loss stops at the $1,000 floor and its commission leaves $990', () => {
        const { balanceAtBust, daysToBust } =
            bustByCommission(TOPSTEP_NQ_AT_450);
        const out = simulateLiveAccount({
            ...TOPSTEP_ONE_NQ_AT_450,
            commissionPerRoundTrip: 10,
            horizonDays: 100,
            plan: buildTopStepLivePlan(),
            retainedCushion: 0,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });

        expect(daysToBust).toBe(20);
        expect(balanceAtBust).toBeCloseTo(990, 9);
        expect(out.liveBustProbability).toBe(1);
        expect(out.medianDaysToBust).toBe(20);
        expect(out.expectedLiquidationPayout).toBeCloseTo(
            0.9 * balanceAtBust,
            9,
        );
        expect(out.expectedAnnualWithdrawalRate).toBe(0);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(
            0.9 * balanceAtBust,
            9,
        );
    });

    it('pays nothing at an inactivity closure, which the source does not describe as a liquidation ("Live Funded Accounts with no trading activity for more than 30 days may be closed")', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 40,
            idleDayProbability: 1,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: TOPSTEP_NQ_AT_450,
            retainedCushion: dollars(0),
            rng: alwaysIdle,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.closedForInactivity).toBe(true);
        expect(result.daysToBust).toBe(30);
        expect(result.liquidationPayout).toBe(0);
        expect(result.totalWithdrawn).toBe(0);
    });
});

describe('WP18f R-3: no single trade loses more than the remaining Daily Loss Limit, and released Reserve stays tradable', () => {
    it('cuts the third loss at a 10% pre-lock cushion from three $250 NQ contracts ($750, 10% of the $7,500 cushion) to the two that fit the $500 left of the $2,000 limit, so the day ends at exactly -$2,000, not -$2,250', () => {
        const plan = buildTopStepLivePlan({
            postLock: fraction(0.1),
            preLock: fraction(0.1),
        });
        const state = plan.initialState();

        const result = runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: nqAt(250),
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 100,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(state.todayPnL).toBeCloseTo(-2000, 9);
        expect(state.balance).toBeCloseTo(8000, 9);
    });

    it('counts the commission in the loss: with a $30 round trip on $240 NQ contracts, two losses of three contracts leave $500 of the $2,000 limit, and the third trade takes one contract, not the two that fit without its commission ($480 + $30 = $510), so the day ends at -$1,770 with $230 left, under one contract and its commission', () => {
        const plan = buildTopStepLivePlan({
            postLock: fraction(0.1),
            preLock: fraction(0.1),
        });
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(30),
            plan,
            positionSizing: nqAt(240),
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 100,
            winrate: fraction(0),
        });

        expect(state.todayPnL).toBeCloseTo(-1770, 9);
    });

    it('keeps trading after losses reach into a released Reserve increment: the day after a -$12,000 day risks 5% of the $10,000 cushion, one $500 NQ contract, instead of stalling', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (const pnl of [3000, 0, 0, 0, 0, 0, 0, -12_000]) {
            state.todayPnL = pnl;
            state.balance += pnl;
            plan.recordDayClose(state, pnl !== 0);
        }
        state.todayPnL = 0;

        const result = runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: nqAt(500),
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.startingBalance).toBe(20_000);
        expect(result.traded).toBe(true);
        expect(state.todayPnL).toBeCloseTo(-500, 9);
    });

    it('never closes a TopStep LFA for inactivity when the trader never idles, even with a $30 round-trip commission at a 36% win rate (was 47.8% of 400 trials)', () => {
        const out = simulateLiveAccount({
            ...TOPSTEP_ONE_NQ_AT_450,
            commissionPerRoundTrip: 30,
            horizonDays: TRADING_DAYS_PER_YEAR,
            plan: buildTopStepLivePlan(),
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 400,
            winrate: 0.36,
        });

        expect(out.liveInactivityClosureProbability).toBe(0);
    });
});

describe('runLiveDay on TPT PRO+ numbers (no buffer-zone withdrawal gate + weekly idle-day closure)', () => {
    it('is withdrawable pre-lock with no buffer, but only the $500 of positive balance above the $0 start, never the $2,000 drawdown allowance below it ("the PRO+ account will begin with a $0 balance")', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();
        state.balance = 500;

        expect(state.thresholdLocked).toBe(false);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(500);
    });

    it('withdraws only positive profit from day 1 under drain-to-floor and never busts, instead of paying out the drawdown allowance on day 1 and busting on day 2: one $100 NQ contract a day (5% of the $1,900 cushion after a drain is below one) is withdrawn each day', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildTptLivePlan(),
            positionSizing: NQ_AT_100,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(1);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 3 * 100, 6);
    });

    it('does not close for inactivity with the default idleDayProbability of 0, even across many consecutive days, since no day is ever rolled idle', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        let result = {
            busted: false,
            closedForInactivity: false,
            traded: false,
        };
        for (let day = 0; day < 30; day++) {
            result = runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: NQ_AT_100,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(result.closedForInactivity).toBe(false);
        expect(state.consecutiveIdleDays).toBe(0);
    });

    it('sets no rolling maxConsecutiveIdleDays, since PRO+ follows the same 5-session calendar-week rule as PRO (N-80)', () => {
        expect(buildTptLivePlan().maxConsecutiveIdleDays).toBeNull();
        expect(
            buildTptLivePlan().calendarWeekInactivity?.sessionsPerWeek,
        ).toBe(5);
    });

    it('closes for inactivity at the end of an empty 5-session calendar week, not the 7th consecutive idle day', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        let result = {
            busted: false,
            closedForInactivity: false,
            traded: false,
        };
        for (let day = 0; day < 5; day++) {
            result = runLiveDay({
                commission: dollars(0),
                idleDayProbability: 1,
                plan,
                positionSizing: NQ_AT_100,
                rng: alwaysIdle,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
            if (day < 4) expect(result.busted).toBe(false);
        }

        expect(result.busted).toBe(true);
        expect(result.closedForInactivity).toBe(true);
    });

    it('never closes a rolling 7-session idle gap spanning two calendar weeks, as long as each week has one traded session', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();
        const tradedSessions = new Set([1, 9]);

        for (let session = 1; session <= 10; session++) {
            const isTraded = tradedSessions.has(session);
            const result = runLiveDay({
                commission: dollars(0),
                idleDayProbability: isTraded ? 0 : 1,
                plan,
                positionSizing: NQ_AT_100,
                rng: isTraded ? alwaysWins : alwaysIdle,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
            expect(result.busted).toBe(false);
        }

        expect(state.consecutiveIdleDays).toBe(1);
    });

    it('resets the idle-day counter to 0 on any traded day, so an interrupted idle streak never accumulates toward closure', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 6; day++) {
            runLiveDay({
                commission: dollars(0),
                idleDayProbability: 1,
                plan,
                positionSizing: NQ_AT_100,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }
        expect(state.consecutiveIdleDays).toBe(6);

        const tradedDay = runLiveDay({
            commission: dollars(0),
            idleDayProbability: 0,
            plan,
            positionSizing: NQ_AT_100,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(tradedDay.traded).toBe(true);
        expect(state.consecutiveIdleDays).toBe(0);
        expect(tradedDay.closedForInactivity).toBe(false);
    });
});

function baseLiveSimInputs() {
    return {
        horizonDays: 60,
        instrument: InstrumentSymbol.MNQ,
        plan: buildApexLivePlan(),
        rrRatio: 2,
        seed: 42,
        stopPoints: 10,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.45,
    };
}

describe('simulateLiveAccount', () => {
    it('is deterministic for the same seed', () => {
        const a = simulateLiveAccount(baseLiveSimInputs());
        const b = simulateLiveAccount(baseLiveSimInputs());

        expect(a.liveBustProbability).toBe(b.liveBustProbability);
        expect(a.cumulativeWithdrawalsP50).toBe(b.cumulativeWithdrawalsP50);
    });

    it('exposes one cumulative-withdrawal value per trial as a plain output field, for a deferred v2 vault calc to consume without re-deriving the base simulation', () => {
        const inputs = baseLiveSimInputs();
        const out = simulateLiveAccount(inputs);

        expect(out.cumulativeWithdrawalsAtHorizon).toHaveLength(inputs.trials);
        for (const value of out.cumulativeWithdrawalsAtHorizon) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(value)).toBe(true);
        }
    });

    it('keeps every output finite and every probability within [0,1]', () => {
        const out = simulateLiveAccount(baseLiveSimInputs());

        expect(out.liveBustProbability).toBeGreaterThanOrEqual(0);
        expect(out.liveBustProbability).toBeLessThanOrEqual(1);
        expect(Number.isFinite(out.expectedAnnualWithdrawalRate)).toBe(true);
        expect(Number.isFinite(out.medianDaysToBust)).toBe(true);
        expect(Number.isFinite(out.medianDaysToFirstWithdrawal)).toBe(true);
    });

    it('hand-verifies the full aggregation pipeline end-to-end on a worked Apex run in whole $150 NQ contracts (trials: 1, winrate 1 makes the seed irrelevant since rng() < 1 is always true): $150 a day locks on day 21 at $3,150, then 10% of the cushion places two contracts, $3,450 on day 22 and $3,750 on day 23, which withdraws the $650 above the $3,100 safety net, paying $585', () => {
        const out = simulateLiveAccount({
            ...APEX_ONE_NQ_AT_150,
            horizonDays: 23,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        const expectedWithdrawn = 0.9 * 650;
        expect(out.cumulativeWithdrawalsAtHorizon).toHaveLength(1);
        expect(out.cumulativeWithdrawalsAtHorizon[0]).toBeCloseTo(
            expectedWithdrawn,
            8,
        );
        expect(out.cumulativeWithdrawalsP5).toBeCloseTo(expectedWithdrawn, 8);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(expectedWithdrawn, 8);
        expect(out.cumulativeWithdrawalsP95).toBeCloseTo(expectedWithdrawn, 8);
        expect(out.liveBustProbability).toBe(0);
        expect(out.medianDaysToBust).toBe(0);
        expect(out.medianDaysToFirstWithdrawal).toBe(23);
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            (expectedWithdrawn / 23) * TRADING_DAYS_PER_MONTH * 12,
            8,
        );
    });

    it('hand-verifies a zero-commission 25-day Apex run in whole $150 NQ contracts under the $500 minimum request: $150/day pre-lock locks on day 21 at $3,150, two contracts post-lock give $3,450 on day 22, $3,750 on day 23 (withdraws $650), $3,400 on day 24 (under the minimum), $3,700 on day 25 (withdraws $600), paying 0.9 x $1,250 = $1,125', () => {
        const out = simulateLiveAccount({
            ...APEX_ONE_NQ_AT_150,
            commissionPerRoundTrip: 0,
            horizonDays: 25,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(1125, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(23);
        expect(out.liveBustProbability).toBe(0);
    });

    it('hand-verifies a $10 round-trip commission on the same run: $140/day pre-lock locks on day 23 at $3,220 ($120 is under the $500 minimum), two contracts net $290 for $3,510 on day 24 ($410, still under), $3,800 on day 25 (withdraws $700), paying $630', () => {
        const out = simulateLiveAccount({
            ...APEX_ONE_NQ_AT_150,
            commissionPerRoundTrip: 10,
            horizonDays: 25,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(630, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(25);
        expect(out.liveBustProbability).toBe(0);
    });

    it('defaults MFFU Rapid Live to one full drawdown of retained cushion: in whole $100 NQ contracts the Max Loss Limit locks at $0 on day 20, the $200 excess of day 21 is under the $250 live minimum, and it withdraws $400 every second day from day 22, 0.9 x 10 x $400 = $3,600 over 40 days with no bust', () => {
        const out = simulateLiveAccount({
            ...ONE_NQ_AT_100,
            horizonDays: 40,
            plan: buildMffuRapidLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.liveBustProbability).toBe(0);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(3600, 6);
        expect(out.medianDaysToFirstWithdrawal).toBe(22);
    });

    it('drains MFFU Rapid Live to its $0 floor with an explicit retainedCushion of 0: the $100 and $200 of days 1 and 2 are under the $250 live minimum, so the first withdrawal is $300 on day 3; each drain leaves a cushion whose 5% is below one $100 NQ contract, so one contract is still placed, and 13 drains of $300 pay 0.9 x $3,900 = $3,510 over 40 days, no bust', () => {
        const out = simulateLiveAccount({
            ...ONE_NQ_AT_100,
            horizonDays: 40,
            plan: buildMffuRapidLivePlan(),
            retainedCushion: 0,
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.liveBustProbability).toBe(0);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(3510, 6);
        expect(out.medianDaysToFirstWithdrawal).toBe(3);
    });

    it('annualizes over the whole horizon, counting the days after a bust as $0 (N-24): at a 1:0.05 reward the ten $100 NQ contracts win $50 less a $10 commission on day 1, the $1,039.99 withdrawn before a bust on day 2 (one contract wins $5 less the $10 commission against a one-cent cushion) of a 10-day horizon holds $40 of profit, annualized as 40 / 10 x 252 = $1,008, not 40 / 2 x 252, and the $999.99 taken from below the $0 start is capital (R-5)', () => {
        const fullPayout = {
            thresholdProfit: dollars(0),
            traderShare: fraction(1),
        };
        const allIn = fraction(1);
        const plan = new LivePlan({
            cushionPercent: { postLock: allIn, preLock: allIn },
            label: 'Bust On Day 2 Live',
            liveDailyLossLimit: null,
            liveDrawdown: new StaticDrawdown({ amount: dollars(1000) }),
            payoutTiers: [fullPayout],
            requiresLockForWithdrawal: false,
        });
        const out = simulateLiveAccount({
            ...ONE_NQ_AT_100,
            commissionPerRoundTrip: 10,
            horizonDays: 10,
            plan,
            retainedCushion: 0,
            rrRatio: 0.05,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.liveBustProbability).toBe(1);
        expect(out.medianDaysToBust).toBe(2);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(1039.99, 8);
        expect(out.expectedCapitalReturned).toBeCloseTo(999.99, 8);
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            (40 / 10) * TRADING_DAYS_PER_MONTH * 12,
            6,
        );
    });

    it('rejects a negative retainedCushion', () => {
        expect(() =>
            simulateLiveAccount({
                ...baseLiveSimInputs(),
                retainedCushion: -1,
            }),
        ).toThrow(/retainedCushion must be a finite number >= 0/);
    });
});

describe('N-13: simulateLiveAccount fails loud on a trial count or horizon that is not a positive safe integer', () => {
    it.each([0, -3, 1.5, NaN, Infinity, 2 ** 53])(
        'rejects trials %s instead of reporting a run of zeros',
        (trials) => {
            expect(() =>
                simulateLiveAccount({ ...baseLiveSimInputs(), trials }),
            ).toThrow(/trials must be a positive safe integer/);
        },
    );

    it.each([0, -10, 2.5, NaN, Infinity])(
        'rejects horizonDays %s instead of reporting a zero annual rate',
        (horizonDays) => {
            expect(() =>
                simulateLiveAccount({ ...baseLiveSimInputs(), horizonDays }),
            ).toThrow(/horizonDays must be a positive safe integer/);
        },
    );

    it('still runs one trial over a one-day horizon', () => {
        const out = simulateLiveAccount({
            ...baseLiveSimInputs(),
            horizonDays: 1,
            trials: 1,
        });
        expect(out.cumulativeWithdrawalsAtHorizon).toHaveLength(1);
    });
});

function lucidRun(plan: LivePlan) {
    return simulateLiveAccount({
        ...ONE_NQ_AT_100,
        horizonDays: 25,
        plan,
        retainedCushion: 0,
        rrRatio: 1,
        seed: 42,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
    });
}

describe('N-46: a one-off live transition credit is never annualized', () => {
    const withCredit = lucidRun(buildLucidDailyLivePlan());
    const withoutCredit = lucidRun(buildLucidLivePlan());

    it('prices the LucidDaily credit at 90% of the $15,000 cap', () => {
        expect(oneOffLiveCredit(buildLucidDailyLivePlan())).toBeCloseTo(
            13_500,
            9,
        );
        expect(oneOffLiveCredit(buildLucidLivePlan())).toBe(0);
        expect(oneOffLiveCredit(buildApexLivePlan())).toBe(0);
    });

    it('still counts the credit in the cumulative withdrawals at the horizon', () => {
        expect(withCredit.cumulativeWithdrawalsP50).toBeCloseTo(
            withoutCredit.cumulativeWithdrawalsP50 + 13_500,
            6,
        );
    });

    it('annualizes only the recurring withdrawals: a 25-day run has the same annual rate with or without the $13,500 credit, not about 10x the credit more', () => {
        expect(withoutCredit.expectedAnnualWithdrawalRate).toBeGreaterThan(0);
        expect(withCredit.expectedAnnualWithdrawalRate).toBeCloseTo(
            withoutCredit.expectedAnnualWithdrawalRate,
            6,
        );
        expect(withCredit.expectedAnnualWithdrawalRate).toBeCloseTo(
            ((withCredit.cumulativeWithdrawalsP50 - 13_500) / 25) *
                TRADING_DAYS_PER_YEAR,
            6,
        );
    });
});

describe('TRADING_DAYS_PER_YEAR', () => {
    it('is twelve 21-day trading months, 252 days', () => {
        expect(TRADING_DAYS_PER_YEAR).toBe(TRADING_DAYS_PER_MONTH * 12);
        expect(TRADING_DAYS_PER_YEAR).toBe(252);
    });
});

const TOPSTEP_FULL_CUSHION = { postLock: fraction(1), preLock: fraction(1) };

function closeActiveTopStepSessions(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    count: number,
): void {
    for (let session = 0; session < count; session++) {
        state.todayPnL = 0;
        plan.recordDayClose(state, true);
    }
}

function closeTopStepSessions(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    dailyPnL: readonly number[],
): void {
    for (const pnl of dailyPnL) {
        state.todayPnL = pnl;
        state.balance += pnl;
        plan.recordDayClose(state, pnl !== 0);
    }
    state.todayPnL = 0;
}

const NQ_STOP_AT_500 = 25;

function loseOneTopStepTrade(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    stopPoints: number,
): void {
    runLiveDay({
        commission: dollars(0),
        plan,
        positionSizing: positionSizingOf({
            instrument: InstrumentSymbol.NQ,
            stopPoints,
        }),
        rng: alwaysLoses,
        rrRatio: 2,
        state,
        tradesPerDay: 1,
        winrate: fraction(0),
    });
}

describe('WP18g: the TopStep LFA per-trade loss cap follows net trading profit and the Daily Loss Limit Safeguard (N-57, N-58, help.topstep.com article 11748475)', () => {
    it('caps one losing trade at the $2,500 tier after the $40,000 Reserve is returned on $15,000 of trading profit, not at the $2,000 base tier: 100% of the $24,000 cushion places five $500 NQ contracts, the lot cap and the $2,500 room, not the four of the base tier', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();
        closeTopStepSessions(
            plan,
            state,
            [
                3000, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 3000, 0,
                0, 0, 0, 0, 0, 3000,
            ],
        );
        closeActiveTopStepSessions(plan, state, 9);
        plan.withdraw(state, 40_000);

        loseOneTopStepTrade(plan, state, NQ_STOP_AT_500);

        expect(state.todayPnL).toBeCloseTo(-2500, 9);
        expect(state.balance).toBeCloseTo(22_500, 9);
    });

    it('caps one losing trade at the $1,000 Safeguard limit after a session closes at $4,500, although the $3,500 above the floor is at risk: two $500 NQ contracts, under the three lots the Safeguard allows', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();
        closeTopStepSessions(plan, state, [-5500]);

        loseOneTopStepTrade(plan, state, NQ_STOP_AT_500);

        expect(state.todayPnL).toBeCloseTo(-1000, 9);
        expect(state.balance).toBeCloseTo(3500, 9);
    });

    it('caps a fresh LFA at 5 NQ lots: a 10-point stop risks at most 5 x $200 = $1,000, under the $2,000 limit', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();

        loseOneTopStepTrade(plan, state, 10);

        expect(state.todayPnL).toBeCloseTo(-1000, 9);
    });

    it('caps at 3 NQ lots under the $5,000 Safeguard: a 10-point stop risks at most $600', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();
        closeTopStepSessions(plan, state, [-5500]);

        loseOneTopStepTrade(plan, state, 10);

        expect(state.todayPnL).toBeCloseTo(-600, 9);
    });
});

describe('WP18h: the TopStep LFA per-trade loss cap moves to a higher tier only at a session close after 10 Active Trading Days (N-59, help.topstep.com article 11748475: "Your Daily Loss Limit increases at end of day after 10 Active Trading Days in the new Tier.")', () => {
    it('caps one losing trade at the $2,000 base tier on the first session after profit reaches $15,000: four $500 NQ contracts', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();
        closeTopStepSessions(plan, state, [15_000]);

        loseOneTopStepTrade(plan, state, NQ_STOP_AT_500);

        expect(state.todayPnL).toBeCloseTo(-2000, 9);
        expect(state.balance).toBeCloseTo(23_000, 9);
    });

    it('caps it at the $2,500 tier on the session after the 10th Active Trading Day at $15,000: five $500 NQ contracts', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();
        closeTopStepSessions(plan, state, [15_000]);
        closeActiveTopStepSessions(plan, state, 9);

        loseOneTopStepTrade(plan, state, NQ_STOP_AT_500);

        expect(state.todayPnL).toBeCloseTo(-2500, 9);
    });

    it('never raises the cap within a session: four $500 NQ contracts (the $2,000 room) win $15,000 at 1:7.5, and the losing trades that follow, at most five contracts each, take the day down to the -$2,000 base limit, not the -$2,500 of the tier live profit has reached', () => {
        const plan = buildTopStepLivePlan(TOPSTEP_FULL_CUSHION);
        const state = plan.initialState();
        let draw = 0;
        const winThenLose: Rng = () => (draw++ < 1 ? 0 : 0.999);

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: nqAt(500),
            rng: winThenLose,
            rrRatio: 7.5,
            state,
            tradesPerDay: 8,
            winrate: fraction(0.5),
        });

        expect(state.todayPnL).toBeCloseTo(-2000, 9);
    });
});

function apexLiveTrade(
    state: LiveAccountState,
    isWon: boolean,
    stopPoints: number,
): number {
    const before = state.balance;
    runLiveDay({
        commission: dollars(0),
        plan: buildApexLivePlan(),
        positionSizing: {
            instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
            stopPoints: points(stopPoints),
        },
        rng: isWon ? alwaysWins : alwaysLoses,
        rrRatio: 2,
        state,
        tradesPerDay: 1,
        winrate: fraction(isWon ? 1 : 0),
    });
    return state.balance - before;
}

describe('runLiveDay places live percent-of-cushion risk in whole contracts like the funded phase (T33, R8)', () => {
    it('rounds 5% of the $3,000 Apex Live cushion ($150) down to 18 MNQ micros at a 4 point stop: a $144 loss or a $288 win, never the fractional $150', () => {
        expect(
            apexLiveTrade(buildApexLivePlan().initialState(), false, 4),
        ).toBe(-144);
        expect(apexLiveTrade(buildApexLivePlan().initialState(), true, 4)).toBe(
            288,
        );
    });

    it('takes one MNQ micro when it exceeds the $5 room left above the liquidation level: the loss stops at the room, the win pays on one micro', () => {
        const losing = apexSessionAt(105);
        const result = runLiveDay({
            commission: dollars(0),
            plan: buildApexLivePlan(),
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
                stopPoints: points(4),
            },
            rng: alwaysLoses,
            rrRatio: 2,
            state: losing,
            tradesPerDay: 1,
            winrate: fraction(0),
        });
        expect(losing.balance).toBe(100);
        expect(result.busted).toBe(true);

        expect(apexLiveTrade(apexSessionAt(105), true, 4)).toBe(16);
    });
});

function lockoutDllLiveDay(state: LiveAccountState, draws: readonly number[]) {
    return runLiveDay({
        commission: dollars(0),
        idleDayProbability: 0,
        plan: lockoutDllLivePlan(),
        positionSizing: {
            instrument: INSTRUMENTS[InstrumentSymbol.NQ],
            stopPoints: points(20),
        },
        rng: scriptedRng(draws),
        rrRatio: 2,
        state,
        tradesPerDay: 2,
        winrate: fraction(0.5),
    });
}

function lockoutDllLivePlan(): LivePlan {
    return new LivePlan({
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Lockout DLL Live',
        liveDailyLossLimit: {
            amount: dollars(500),
            kind: DailyLossLimitKind.Flat,
        },
        liveDrawdown: new StaticDrawdown({ amount: dollars(10_000) }),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('runLiveDay skips a whole-contract trade whose live lockout DLL room is below one contract (N-74, U21)', () => {
    it('ends the day after one $400 NQ loss: the $100 left under the $500 live limit cannot fit one $400 NQ, so the would-be win never trades', () => {
        const state = lockoutDllLivePlan().initialState();
        const result = lockoutDllLiveDay(state, [0.99, 0.01]);
        expect(state.todayPnL).toBe(-400);
        expect(result.busted).toBe(false);
    });

    it('keeps T33 when the room is the drawdown cushion: $100 above liquidation under a $500 limit takes one NQ, the loss stops at $100 and the win pays on the full contract', () => {
        const losing = lockoutDllLivePlan().initialState();
        losing.balance = losing.threshold + 100;
        const lost = lockoutDllLiveDay(losing, [0.99]);
        expect(losing.todayPnL).toBe(-100);
        expect(lost.busted).toBe(true);

        const winning = lockoutDllLivePlan().initialState();
        winning.balance = winning.threshold + 100;
        lockoutDllLiveDay(winning, [0.01, 0.99]);
        expect(winning.todayPnL).toBe(800 - 400);
    });
});

const LIVE_SIZING_REFUSAL = `${SIM_INPUTS_REFUSAL_PREFIX}live cushionPercent needs position sizing: set stopPoints (a positive stop distance in points) and instrument, so percent-of-cushion risk is placed in whole contracts, at least one and at most the live contract limit.`;

function mnqApexLiveInputs(plan: LivePlan, stopPoints: number) {
    return {
        horizonDays: 60,
        instrument: InstrumentSymbol.MNQ,
        plan,
        rrRatio: 2,
        seed: 42,
        stopPoints,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.45,
    };
}

describe('N-76: simulateLiveAccount refuses percent-of-cushion live risk without position sizing, as simulate() refuses a percent policy without a stop (T33)', () => {
    it.each([0, -5, NaN, Infinity])(
        'refuses a %s point stop with the shared SimInputs refusal before any trial starts',
        (stopPoints) => {
            const plan = buildApexLivePlan();
            const initialState = vi.spyOn(plan, 'initialState');

            expect(() =>
                simulateLiveAccount(mnqApexLiveInputs(plan, stopPoints)),
            ).toThrow(LIVE_SIZING_REFUSAL);
            expect(initialState).not.toHaveBeenCalled();
        },
    );

    it('requires an instrument and a stop in LiveSimInputs, so the compiler refuses a live run without them (WP44b)', () => {
        expectTypeOf<
            LiveSimInputs['instrument']
        >().toEqualTypeOf<InstrumentSymbol>();
        expectTypeOf<LiveSimInputs['stopPoints']>().toEqualTypeOf<number>();
    });

    it('takes non-null position sizing in runLiveDay and runLiveHorizon, so no live trade can be sized fractionally (WP44b)', () => {
        expectTypeOf<
            LiveDayRunOptions['positionSizing']
        >().toEqualTypeOf<PositionSizingConfig>();
        expectTypeOf<
            Parameters<typeof runLiveHorizon>[0]['positionSizing']
        >().toEqualTypeOf<PositionSizingConfig>();
    });

    it('places Apex Live risk at 5% / 10% of the cushion in whole MNQ micros with the one-contract minimum at a 10 point stop, so an all-losing run busts every trial instead of shrinking forever', () => {
        const out = simulateLiveAccount({
            ...mnqApexLiveInputs(buildApexLivePlan(), 10),
            horizonDays: 500,
            trials: 1,
            winrate: 0,
        });

        expect(out.liveBustProbability).toBe(1);
    });
});
