import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        monthlySubscription: 170,
        profitTarget: dollars(3000),
    },
] as const;

type TptSize = (typeof SIZES)[number];

export class TakeProfitTrader extends TradingFirm {
    readonly displayName = 'Take Profit Trader';
    readonly id = FirmId.Tpt;
    readonly notes = [
        'No minimum payout request size exists. Any withdrawal amount is allowed; requests of $250 or less carry a flat $50 fee, waived above $250 (help center: "Withdrawal Fees").',
        'A one-time buffer-zone gate applies before the first payout only: balance must reach starting balance + max drawdown (e.g. $52,000 for a $50K account) before any withdrawal is possible (help center: "PRO Account Profit Split & Withdrawal Rules"). This is minPayoutProfit in this codebase, not a recurring per-request minimum.',
        'No recurring per-cycle profit requirement exists beyond that one-time buffer-zone gate: takeprofittrader.com confirms PRO payouts have no minimum-profitable-days requirement for withdrawals after the first, so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0.',
        "PRO (funded) accounts require at least one traded day per calendar week (Sunday-Friday), per a scripted propfirmmatch.com panel extraction (2026-09-14) cross-checked against takeprofittrader.com's own Overview tab Firm Rules. Previously unmodeled (maxConsecutiveIdleDays was unset); set to 7, matching the mechanism used elsewhere in this codebase.",
        "Contract limit (6 minis / 60 micros, flat across eval and funded) was previously unmodeled entirely, confirmed by the same 2026-09-14 extraction and independently by takeprofittrader.com's own per-size leverage table.",
        "BIGGEST UNMODELED GAP, flagged rather than approximated: the real payout split is NOT the flat 80% modeled here. takeprofittrader.com's own Payout Policy describes a 'Buffer Zone Profit Share' schedule -- 50% for the first 60 calendar days since the PRO account was opened, rising to 80% only after day 60 (PRO+/live is a separate, unmodeled 90%). This engine's payoutTiers mechanism keys profit share off cumulative dollar profit, not elapsed calendar days since funding began -- a genuinely different axis a fast trader (reaching the same profit in 10 days) and a slow one (90 days) would resolve completely differently, so there is no safe way to approximate one as the other without a new, purpose-built mechanism (the same 'no simplification, build the real feature' judgement call already made for E8 Futures' payout-count-tiered cap). Not built without being asked; every simulated TPT payout in this codebase currently overstates the trader's take during a funded account's first 60 days.",
        "The reset fee modeled here ($99) is TPT's own confirmed EVALUATION-phase reset price, matching exactly what this engine's reset mechanic represents (retrying a busted eval). A separate, much higher $649 FUNDED/PRO account reset option also exists (buy back into the same funded account after a funded-phase bust, up to 3 times, per the Overview tab's 'Pro Account Reset Option') -- not modeled, since this engine's replacement model for a busted funded account is already a fresh eval cycle, not a same-account funded reset; the $649 option is a genuinely different real-world choice this simulator does not currently represent as an alternative.",
        "This firm's own site shows two different minimum-trading-day figures for the same Test-phase requirement: the plan-card detail panel says 3 days (matching minTradingDays here), the Overview tab's own Consistency Rules section separately states 5 days. Quoted as an unreconciled site-internal conflict rather than silently picked; kept at 3 since that is this file's pre-existing, already-tested value and no clearer signal points either way.",
    ];
    readonly plans = SIZES.map((s) => this.buildPlan(buildPlan(s)));
    readonly website = 'https://takeprofittrader.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildPlan(size: TptSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: {
            evalMicros: contracts(60),
            evalMinis: contracts(6),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(60),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(6),
            },
        },
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(130),
            monthlySubscription: dollars(size.monthlySubscription),
            oneTimeEval: dollars(0),
            reset: dollars(99),
        },
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        id: { accountSize: 50_000, firm: FirmId.Tpt },
        label: planLabel(size.accountSize, 'Test → PRO'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: size.maxDrawdown,
        minPayoutRequest: dollars(0.01),
        minTradingDays: 3,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}
