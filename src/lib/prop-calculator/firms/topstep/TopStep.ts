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
    PayoutFloorEffect,
    type PlanInit,
    TopStepVariant,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const ACCOUNT_SIZE = 50_000;
const MAX_LOSS_LIMIT = dollars(2000);
const PROFIT_TARGET = dollars(3000);
const MIN_TRADING_DAYS = 2;
const WIRE_PAYOUT_FEE = dollars(30);
const MIN_PAYOUT = dollars(125);
const MIN_PAYOUT_PROFIT_PER_CYCLE = dollars(0.01);
const PAYOUT_BALANCE_SHARE_CAP = fraction(0.5);
const TRADER_SHARE = 0.9;

const COMBINE_CONSISTENCY = fraction(0.55);
const INACTIVITY_CLOSURE_DAYS = 30;

const CONTRACT_LIMITS = {
    evalMicros: contracts(50),
    evalMinis: contracts(5),
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1500) },
            { maxContracts: contracts(50), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1500) },
            { maxContracts: contracts(5), minBalance: dollars(2000) },
        ],
    },
} as const;

const PRICING_PATHS = [
    {
        activation: 149,
        key: 'standard',
        label: 'Standard path',
        monthlySubscription: 49,
        reset: 49,
    },
    {
        activation: 0,
        key: 'no-fee',
        label: 'No-fee path',
        monthlySubscription: 95,
        reset: 95,
    },
] as const;

const PAYOUT_PATHS = [
    {
        fundedConsistency: null,
        key: 'standard',
        label: 'Standard XFA',
        minQualifyingDayProfit: dollars(150),
        payoutRequestCap: dollars(2000),
        winningDays: 5,
    },
    {
        fundedConsistency: 0.4,
        key: 'consistency',
        label: 'Consistency XFA',
        minQualifyingDayProfit: null,
        payoutRequestCap: dollars(3000),
        winningDays: 3,
    },
] as const;

type PayoutPath = (typeof PAYOUT_PATHS)[number];
type PricingPath = (typeof PRICING_PATHS)[number];
type TopStepVariantKey = `${PricingPath['key']}-${PayoutPath['key']}`;

const TOPSTEP_VARIANTS: Record<TopStepVariantKey, TopStepVariant> = {
    'no-fee-consistency': TopStepVariant.NoFeeConsistency,
    'no-fee-standard': TopStepVariant.NoFeeStandard,
    'standard-consistency': TopStepVariant.StandardConsistency,
    'standard-standard': TopStepVariant.StandardStandard,
};

export class TopStep extends TradingFirm {
    readonly displayName = 'TopStep';
    readonly id = FirmId.TopStep;
    readonly notes = [
        "Live-verified against help.topstep.com/en/articles/8284208-consistency-at-topstep (page marked 'Updated this week' as of 2026-09-13): the Trading Combine's eval-phase Consistency Target is 55% of actual realized profit (Best Day Profit / Total Profit, hard line, no rounding), not 50%. The article's own 'What happened to the buffer?' section: 'There is no buffer. 55% is the hard limit. The old buffer was quiet padding on top of a 50% target.' COMBINE_CONSISTENCY was previously fraction(0.5), stricter than the live rule and capable of wrongly failing a simulated eval path whose best-day share falls between 50% and 55%. Corrected to fraction(0.55). Re-ran the pinned 'TopStep Standard XFA' engineCharacterization golden after this fix (bun run test): it passed unchanged. Traced why: at that golden's inputs ($400 risk, 2:1 RR, 2 trades/day), a day's P&L is always a $400 multiple of {1600, 400, -800}, so cumulative eval profit only ever crosses the $3,000 profit target by landing exactly on $3,200 (the $3,000-3,200 band is unreachable) -- and 1600/3200 = 50% already clears both the old and new consistency threshold, so this specific pinned scenario's pass timing happens not to move. The fix is still real and outcome-changing in general -- any risk sizing whose day-close granularity lands cumulative profit inside the old 50-55% gap at the $3,000 mark would flip pass/fail on that trial; it just happens not to for this specific pinned scenario. Verified empirically here rather than assumed inert.",
        "help.topstep.com/en/articles/8284215-express-funded-account-parameters live-confirms a 30-consecutive-day-without-a-trade closure rule for the Express Funded Account (XFA, the funded phase modeled here); previously unmodeled (maxConsecutiveIdleDays was left unset). Set to 30. Unlike E8 Futures/FundedNext, where the same idle-day mechanism was confirmed to apply identically to both the eval and funded phases, TopStep's own Trading Combine Subscriptions FAQ and pricing page both state the Combine itself has no time limit or inactivity closure at all ('no time limit or expiration date -- you pay the monthly subscription while it's active'). This engine's maxConsecutiveIdleDays is a single Plan-wide field with no eval/funded phase split, so setting it also (inaccurately) applies during the simulated eval phase; at the default idleDayProbability of 0 this is inert for eval (consecutiveIdleDays never accrues), so it only matters for a user who explicitly models eval idle days over a long combine run, where it would incorrectly close an eval account TopStep would in reality leave open indefinitely. Flagging this modeling gap rather than adding an eval/funded split to the shared engine, which is out of scope for a firm-config pass.",
        "The tiered funded contract-limit table (2 minis/20 micros below $1,500 profit, 3/30 from $1,500, 5/50 from $2,000) was re-fetched directly from Topstep's own Scaling Plan chart image (downloads.intercomcdn.com, linked from help.topstep.com/en/articles/8284223-what-is-the-scaling-plan) and is unchanged from what is modeled here; the eval-phase flat cap (5 minis / 50 micros) is likewise confirmed unchanged via help.topstep.com/en/articles/8284197-trading-combine-parameters. The same Scaling Plan article confirms the XFA's own internal balance \"starts at a $0 balance\" distinct from the nominal $50K account size, i.e. these thresholds are keyed on funded PROFIT (balance - starting balance), matching resolveContractLimit's use of plan.accountProfit(state) rather than raw state.balance -- re-verified correct, not just assumed carried over.",
        "Drawdown lock mechanics live-confirmed against help.topstep.com/en/articles/8284204-what-is-the-maximum-loss-limit and topstep.com/express-funded-account-rules: the $2,000 trailing MLL locks permanently at breakeven (the XFA's own $0 balance) once profit reaches $2,000, and is independently force-reset to that same $0 level on every payout regardless of whether the natural lock had already fired ('After your first Payout: Your MLL is set to $0 regardless of where it was before'). Both mechanics (the drawdown's own atProfit lock and payoutFloorEffect: ReleaseFloor) are already modeled and match. ReleaseFloor is confirmed non-dead here, not a leftover default: minPayoutProfit is $0 and the qualifying-day payout gates (5 days of $150+, or 3 days under Consistency) can be met well before $2,000 of funded profit accrues, so the natural atProfit lock frequently has not fired yet by first payout.",
        "Pricing verified against topstep.com/no-activation-fee's own data attributes (standard-price/xfa-price/xfa-fee), not just its rendered marketing copy: $50K Standard path is $49/month + $149 one-time XFA activation fee; No Activation Fee path is $95/month + $0 ('Free') activation; resets cost the same as the path's own monthly subscription ($49 / $95 respectively) per the page's own FAQ answer. All match what is modeled. A separate 'Responsible Trading Discount' drops the No Activation Fee path to $85/month (smaller discounts on Standard and on larger sizes) when a Daily Loss Limit is added at purchase -- this is the DLL-linked price variant that is deliberately not modeled as a separate plan, consistent with evalDailyLossLimit being left at DailyLossLimitKind.None.",
        "Payout figures verified against help.topstep.com/en/articles/8284233-topstep-payout-policy's own per-size table: $50K payout request cap is $2,000 (Standard XFA) / $3,000 (Consistency XFA), both capped at 50% of account balance, $125 minimum request, $30 ACH/wire fee -- all matching what's modeled. The flat 90% trader share is correct for a new account: the same article's 100%-of-first-$10,000-lifetime-profits perk is explicitly restricted to traders who joined 'the new Topstep dashboard before January 12, 2026' (today is 2026-09-13), so a new account is on the flat 90/10 split from the first dollar and is correctly left unmodeled as a payout tier.",
        'The $599 (+tax) Back2Funded reactivation fee (topstep.com/express-funded-account-rules) is a distinct pay-to-restart-a-busted-XFA product, not a challenge/reset-fee variant of the modeled Combine-to-XFA path, and is correctly left unmodeled, as is the DLL-linked Responsible Trading Discount noted above.',
    ];
    readonly plans = PRICING_PATHS.flatMap((pricing) =>
        PAYOUT_PATHS.map((payout) =>
            this.buildPlan(buildPlan(pricing, payout)),
        ),
    );
    readonly website = 'https://topstep.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildPlan(pricing: PricingPath, payout: PayoutPath): PlanInit {
    return {
        accountSize: dollars(ACCOUNT_SIZE),
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            COMBINE_CONSISTENCY,
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: MAX_LOSS_LIMIT,
            lock: {
                atProfit: MAX_LOSS_LIMIT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(pricing.monthlySubscription),
            oneTimeEval: dollars(0),
            reset: dollars(pricing.reset),
        },
        fundedConsistency: {
            kind: 'set',
            rule:
                payout.fundedConsistency === null
                    ? null
                    : new ConsistencyRule(
                          ConsistencyScope.Funded,
                          fraction(payout.fundedConsistency),
                      ),
        },
        id: {
            accountSize: ACCOUNT_SIZE,
            firm: FirmId.TopStep,
            variant: TOPSTEP_VARIANTS[`${pricing.key}-${payout.key}`],
        },
        label: planLabel(ACCOUNT_SIZE, `${pricing.label} · ${payout.label}`),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: payout.winningDays,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: MIN_PAYOUT_PROFIT_PER_CYCLE,
        minPayoutRequest: MIN_PAYOUT,
        minQualifyingDayProfit: payout.minQualifyingDayProfit,
        minTradingDays: MIN_TRADING_DAYS,
        payoutBalanceShareCap: PAYOUT_BALANCE_SHARE_CAP,
        payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
        payoutMethodFee: WIRE_PAYOUT_FEE,
        payoutRequestCap: payout.payoutRequestCap,
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: fraction(TRADER_SHARE),
            },
        ],
        profitTarget: PROFIT_TARGET,
    };
}
