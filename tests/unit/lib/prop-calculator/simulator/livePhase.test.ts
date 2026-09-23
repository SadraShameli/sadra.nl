import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    contracts,
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    LivePlan,
    points,
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
    oneOffLiveCredit,
    runLiveDay,
    runLiveHorizon,
    simulateLiveAccount,
} from '~/lib/prop-calculator/simulator';

const alwaysLoses: Rng = () => 0.999;
const alwaysWins: Rng = () => 0;
const alwaysIdle: Rng = () => 0;

function runDays(
    state: LiveAccountState,
    days: number,
    rng: Rng,
    winrate: number,
    rrRatio = 2,
) {
    let lastResult = { busted: false, traded: false };
    for (let day = 0; day < days; day++) {
        lastResult = runLiveDay({
            commission: dollars(0),
            plan: buildApexLivePlan(),
            positionSizing: null,
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
    it('sizes the first trade at exactly 5% of the full $3,000 cushion: $150 risk', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
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

    it('never busts from a pure losing streak alone: risk shrinks with the cushion faster than the cushion can reach zero', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        const result = runDays(state, 5, alwaysLoses, 0);

        expect(result.busted).toBe(false);
        expect(state.balance).toBeCloseTo(-678.6571875, 8);
        expect(state.balance - state.threshold).toBeCloseTo(
            3000 * Math.pow(0.95, 5),
            8,
        );
    });

    it('locks the threshold at exactly startingBalance + $100 on the day cumulative profit first reaches $3,100, overriding whatever the EOD ratchet had already trailed it to', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        const result = runDays(state, 21, alwaysWins, 1, 1);

        expect(result.busted).toBe(false);
        expect(state.balance).toBeCloseTo(3150, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });

    it('applies the 10% post-lock rate -- double the 5% pre-lock rate -- to the cushion once locked', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        runDays(state, 21, alwaysWins, 1, 1);
        expect(state.thresholdLocked).toBe(true);
        const cushionAtLock = state.balance - state.threshold;

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
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
    it('a full ("withdraw everything") payout only ever drains the account down to the $3,100 payoutFloor safety net, not the $100 drawdown-lock threshold, so the account never busts from an ordinary full withdrawal: $690.50 on day 23, nothing on day 24 ($300 is under the $500 minimum), $630 on day 25', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * (690.5 + 630), 8);
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
            positionSizing: null,
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

    it('a request size that outpaces post-lock growth still never busts the account, because withdrawals are capped at the $3,100 payoutFloor, well above the real $100 bust threshold', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: 1000,
            plan,
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * (690.5 + 630), 8);
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('never busts over a long horizon of pure losses, because percent-of-cushion sizing with a sub-100% rate cannot drive the cushion to zero on its own', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
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
    it('keeps the 3-mini tier after a losing day: +$1,500 on day 1, -$575 on day 2 to a $925 close, then a 1pt NQ loss on day 3 is capped at 3 minis ($60), not 1 ($20)', () => {
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
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 3,
            winrate: fraction(1),
        });
        expect(state.balance).toBe(1500);
        expect(state.peakDayCloseProfit).toBe(1500);

        runLiveDay({
            ...dayOptions,
            positionSizing: null,
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
    it('waits past the $50 day-21 and $355 day-22 excess over the $3,100 safety net and first withdraws $690.50 on day 23', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 23,
            payoutRequestSize: undefined,
            plan: buildApexLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(3000),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(23);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 690.5, 8);
    });

    it('rejects a request size below the minimum at the runLiveHorizon boundary instead of silently paying $0', () => {
        expect(() =>
            runLiveHorizon({
                commission: dollars(0),
                horizonDays: 60,
                payoutRequestSize: 400,
                plan: buildApexLivePlan(),
                positionSizing: null,
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
    it('keeps one full $2,000 drawdown of cushion: no pre-lock withdrawal, day 21 excess of $200 is under the $250 live minimum, so it withdraws $420 every second day from day 22, 0.9 x 10 x 420 = $3,780 over 40 days with no bust', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 40,
            payoutRequestSize: undefined,
            plan: buildMffuRapidLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(2000),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
        expect(result.daysToFirstWithdrawal).toBe(22);
        expect(result.totalWithdrawn).toBeCloseTo(3780, 6);
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
                positionSizing: null,
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
                positionSizing: null,
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
            positionSizing: null,
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
    it('makes its first withdrawal on day 2, long before live profit reaches the $2,000 starting drawdown, because Lucid locks the Max Loss Limit at $100 the moment a payout is requested and the withdrawable cushion is measured against that $100 lock target instead of the -$1,800 trailing floor', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 10,
            payoutRequestSize: 50,
            plan: buildLucidLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(2);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 105.49, 6);
    });

    it('day 1 produces nothing withdrawable at all: $100 of profit sits exactly at the $100 lock target the request would move the floor to, so the trader cannot pull a cent before day 2', () => {
        const plan = buildLucidLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
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
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('still withdraws on day 2 rather than after $2,000 of profit when the trader withdraws everything, taking $99.99 so the balance stays one cent above the freshly locked $100 floor, and does not bust on day 3', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildLucidLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(2);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 99.99, 6);
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
                positionSizing: null,
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
    it('Tradeify locks at $100 on day 21 and withdraws $1,999.99, leaving one cent above the Max Loss Limit, so day 22 still trades instead of busting on a zero cushion', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: undefined,
            plan: buildTradeifyLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(21);
        expect(result.totalWithdrawn).toBeCloseTo(0.8 * 1999.99, 6);
    });

    it('FundedNext locks $1,000 below its $2,000 start on day 20 and withdraws $2,999.99, leaving one cent above the Max Loss Limit, with no bust on day 21', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 22,
            payoutRequestSize: undefined,
            plan: buildFundedNextLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(20);
        expect(result.totalWithdrawn).toBeCloseTo(2999.99, 6);
    });

    it('Lucid withdraws $99.99 on day 2 and survives the rest of a 20-day horizon on the one-cent cushion', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 20,
            payoutRequestSize: undefined,
            plan: buildLucidLivePlan(),
            positionSizing: null,
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
            positionSizing: null,
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
                positionSizing: null,
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
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(13_500, 6);
    });

    it("layers day 2's ordinary $99.99 full withdrawal on top of the seeded credit as a $89.991 increment rather than re-paying the transition amount, and does not bust on day 3, exactly as the same plan without a credit", () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildLucidDailyLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(13_500 + 0.9 * 99.99, 6);
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
            positionSizing: null,
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
            positionSizing: null,
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
            positionSizing: null,
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

    it('waits for 5 winning days of $150+ before the first LFA payout, then drains 50% of the $12,486.53 balance, seed included, $6,243.26 paying $5,618.934 (N-44)', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(5);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 6243.26, 8);
    });

    it('keeps the seed at the default one-drawdown cushion: day 5 withdraws only the $2,486.53 of profit, paying $2,237.877', () => {
        const plan = buildTopStepLivePlan();
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(5);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 2486.53, 8);
    });

    it('adds a released $10,000 Reserve increment to the balance but keeps it out of both payouts and position size: over 20 winning days the day-10 review releases $10,000 on day 12, the day-15 and day-20 reviews see only $2,486.5 of profit each, and the default cushion pays $8,951.526 of profit', () => {
        const plan = buildTopStepLivePlan();
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 20,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.totalWithdrawn).toBeCloseTo(8951.526, 6);
    });

    it('never pays the released Reserve out as recurring income: over 60 winning days all four $10,000 increments release, yet the default withdraws only the $28,419.21 of trading profit, paying $25,577.289, and the 60-day annual rate carries none of the $40,000 Reserve', () => {
        const horizonDays = 60;
        const plan = buildTopStepLivePlan();
        const retainedCushion = plan.resolveRetainedCushion(undefined);
        const state = plan.initialState();
        let tradingProfit = 0;
        let debitedTotal = 0;
        for (let day = 0; day < horizonDays; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: null,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
            tradingProfit += state.todayPnL;
            const debited = plan.payoutRequestAmount(
                state,
                retainedCushion,
                undefined,
            );
            if (debited <= 0) continue;
            plan.withdraw(state, debited);
            debitedTotal += debited;
        }
        const out = simulateLiveAccount({
            horizonDays,
            plan: buildTopStepLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(state.startingBalance).toBe(50_000);
        expect(debitedTotal).toBeCloseTo(28_419.21, 6);
        expect(debitedTotal).toBeLessThanOrEqual(tradingProfit);
        expect(out.cumulativeWithdrawalsAtHorizon[0]).toBeCloseTo(
            25_577.289,
            6,
        );
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            ((0.9 * debitedTotal) / horizonDays) * TRADING_DAYS_PER_YEAR,
            6,
        );
        expect(out.expectedAnnualWithdrawalRate).toBeLessThanOrEqual(
            ((0.9 * tradingProfit) / horizonDays) * TRADING_DAYS_PER_YEAR,
        );
    });

    it('pays the same over 60 winning days whether the assumed transferred XFA balance leaves a $40,000 Reserve or none, so the unconfirmed $50,000 default does not drive the result', () => {
        const runWith = (plan: ReturnType<typeof buildTopStepLivePlan>) =>
            runLiveHorizon({
                commission: dollars(0),
                horizonDays: 60,
                payoutRequestSize: undefined,
                plan,
                positionSizing: null,
                retainedCushion: plan.resolveRetainedCushion(undefined),
                rng: alwaysWins,
                rrRatio: 1,
                tradesPerDay: 1,
                winrate: fraction(1),
            }).totalWithdrawn;

        const withoutReserve = buildTopStepLivePlan(
            undefined,
            dollars(10_000),
        );

        expect(withoutReserve.seedReserve.amount).toBe(0);
        expect(runWith(buildTopStepLivePlan())).toBeCloseTo(25_577.289, 6);
        expect(runWith(withoutReserve)).toBeCloseTo(25_577.289, 6);
    });

    it('never lets one losing trade at the default 5% sizing exceed the $2,000 base Daily Loss Limit after all four Reserve releases: the $40,000 released Reserve does not feed the position size', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (const pnl of [
            3000, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 3000, 0, 0,
            0, 0, 0, 0,
        ]) {
            state.todayPnL = pnl;
            state.balance += pnl;
            plan.recordDayClose(state, pnl !== 0);
        }
        state.todayPnL = 0;

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.startingBalance).toBe(50_000);
        expect(state.todayPnL).toBeCloseTo(-1050, 9);
        expect(state.todayPnL).toBeGreaterThan(-2000);
    });

    it('closes the account at the $1,000 auto-liquidation floor: a $10 commission on every losing trade busts it on day 75', () => {
        const result = runLiveHorizon({
            commission: dollars(10),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(75);
        expect(result.totalWithdrawn).toBe(0);
    });

    it('restarts the winning-day count after each LFA payout: over 10 winning days it withdraws only on days 5 and 10', () => {
        const withdrawalDays: number[] = [];
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (let day = 1; day <= 10; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: null,
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

    it('does not count a winning day under $150 toward the LFA payout gate: a 1% cushion earns $100 a day and never unlocks a payout', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 20,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan({
                postLock: fraction(0.01),
                preLock: fraction(0.01),
            }),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBeNull();
        expect(result.totalWithdrawn).toBe(0);
    });

    it('never reaches the $1,000 floor on a commission-free loss streak, since each loss is 5% of the shrinking distance to it', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('locks the trading day out for the rest of the day once losses reach the current Daily Loss Limit tier', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        const result = runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 100,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(state.todayPnL).toBeLessThanOrEqual(-2000);
        expect(state.todayPnL).toBeGreaterThan(-2500);
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

    it('withdraws only positive profit from day 1 under drain-to-floor and never busts, instead of paying out the drawdown allowance on day 1 and busting on day 2', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildTptLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(1);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * (100 + 95 + 95), 6);
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
                positionSizing: null,
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

    it("closes for inactivity once 7 consecutive idle days accrue, matching the same maxConsecutiveIdleDays: 7 rule as PRO's own funded-phase weekly-trading requirement", () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        let result = {
            busted: false,
            closedForInactivity: false,
            traded: false,
        };
        for (let day = 0; day < 7; day++) {
            result = runLiveDay({
                commission: dollars(0),
                idleDayProbability: 1,
                plan,
                positionSizing: null,
                rng: alwaysIdle,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.consecutiveIdleDays).toBe(7);
        expect(result.busted).toBe(true);
        expect(result.closedForInactivity).toBe(true);
    });

    it('resets the idle-day counter to 0 on any traded day, so an interrupted idle streak never accumulates toward closure', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 6; day++) {
            runLiveDay({
                commission: dollars(0),
                idleDayProbability: 1,
                plan,
                positionSizing: null,
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
            positionSizing: null,
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
        plan: buildApexLivePlan(),
        rrRatio: 2,
        seed: 42,
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

    it('hand-verifies the full aggregation pipeline end-to-end against the same worked Apex numbers as runLiveHorizon (trials: 1, winrate 1 makes the seed irrelevant since rng() < 1 is always true)', () => {
        const out = simulateLiveAccount({
            horizonDays: 23,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        const expectedWithdrawn = 0.9 * 690.5;
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

    it('hand-verifies a zero-commission 25-day Apex run under the $500 minimum request: $150/day pre-lock locks on day 21 at $3,150, $3,455 on day 22, $3,790.50 on day 23 (withdraws $690.50), $3,400 on day 24 (under the minimum), $3,730 on day 25 (withdraws $630), paying 0.9 x $1,320.50 = $1,188.45', () => {
        const out = simulateLiveAccount({
            commissionPerRoundTrip: 0,
            horizonDays: 25,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(1188.45, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(23);
        expect(out.liveBustProbability).toBe(0);
    });

    it('hand-verifies a $10 round-trip commission on the same run: $140/day pre-lock locks on day 23 at $3,220 ($120 is under the $500 minimum), $3,522 on day 24 ($422, still under), $3,854.20 on day 25 (withdraws $754.20), paying $678.78', () => {
        const out = simulateLiveAccount({
            commissionPerRoundTrip: 10,
            horizonDays: 25,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(678.78, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(25);
        expect(out.liveBustProbability).toBe(0);
    });

    it('defaults MFFU Rapid Live to one full drawdown of retained cushion: no bust and $3,780 over 40 days, first withdrawal on day 22 under the $250 live minimum', () => {
        const out = simulateLiveAccount({
            horizonDays: 40,
            plan: buildMffuRapidLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.liveBustProbability).toBe(0);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(3780, 6);
        expect(out.medianDaysToFirstWithdrawal).toBe(22);
    });

    it('drains MFFU Rapid Live to its $0 floor with an explicit retainedCushion of 0: the $100 and $200 of days 1 and 2 are under the $250 live minimum, so the first withdrawal is $300 on day 3, $3,163.995 over 40 days, no bust', () => {
        const out = simulateLiveAccount({
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
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(3163.995, 6);
        expect(out.medianDaysToFirstWithdrawal).toBe(3);
    });

    it('annualizes over the whole horizon, counting the days after a bust as $0 (N-24): $1,989.99 withdrawn on day 1 then a bust on day 2 of a 10-day horizon is 1,989.99 / 10 x 252 = $50,147.748, not 1,989.99 / 2 x 252', () => {
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
            commissionPerRoundTrip: 10,
            horizonDays: 10,
            plan,
            retainedCushion: 0,
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.liveBustProbability).toBe(1);
        expect(out.medianDaysToBust).toBe(2);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(1989.99, 8);
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            (1989.99 / 10) * TRADING_DAYS_PER_MONTH * 12,
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
