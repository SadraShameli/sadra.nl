import type { ArgsDef } from 'citty';

import {
    readFraction,
    readLossThreshold,
    readNonNegativeInteger,
    readPositiveInteger,
    readPositiveNumber,
    type TradingInputs,
} from '~/cli/commands/prop/shared';
import {
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
    type Plan,
} from '~/lib/prop-calculator';
import {
    type BankrollPolicy,
    type BankrollTimelineInputs,
} from '~/lib/prop-calculator/portfolioTimeline';

export interface BankrollBatchArguments {
    attempts: string;
}

export interface BankrollBatchInputs {
    attempts: number;
}

export interface BankrollCompareArguments {
    'horizon-days': string;
    multiples?: string;
    risks?: string;
    start: string;
}

export interface BankrollCompareInputs {
    horizonDays: number;
    multiples: null | { cycleDays: number; multiple: number }[];
    risks: null | number[];
    start: Dollars;
}

export interface BankrollLeversArguments {
    bankroll: string;
    'request-sizes'?: string;
    risks?: string;
    'trades-per-day'?: string;
}

export interface BankrollLeversInputs {
    bankroll: Dollars;
    requestSizes: null | number[];
    risks: null | number[];
    tradesPerDay: null | number[];
}

export interface BankrollProjectArguments {
    capacity?: string;
    'horizon-days': string;
    'monthly-budget'?: string;
    'payout-lag-days': string;
    reinvest: string;
    start: string;
    trials: string;
}

export interface BankrollProjectInputs {
    capacity: null | number;
    horizonDays: number;
    monthlyBudget: Dollars | null;
    payoutLagDays: number;
    reinvest: Fraction0to1;
    start: Dollars;
    trials: number;
}

export interface BankrollRiskArguments {
    budget: string;
    'loss-threshold'?: string;
    'pass-rate'?: string;
    'payout-rate'?: string;
}

export interface BankrollRiskInputs {
    budget: Dollars;
    lossThreshold: Fraction0to1 | null;
    passRateOverride: Fraction0to1 | null;
    payoutRateOverride: Fraction0to1 | null;
}

export const bankrollBatchArguments = {
    attempts: {
        default: '100',
        description: 'Number of paying-eligible attempts in the batch',
        type: 'string',
    },
} satisfies ArgsDef;

export const bankrollCompareArguments = {
    'horizon-days': {
        default: '180',
        description: 'Horizon in trading days',
        type: 'string',
    },
    multiples: {
        description:
            'Closed-form multiple@cycleDays pairs, comma separated (e.g. 5@60,3@30); a deterministic illustration only',
        type: 'string',
    },
    risks: {
        description:
            'Eval risk per trade values to compare, comma separated (e.g. 250,500); each is a what-if, priced on the same seed',
        type: 'string',
    },
    start: {
        default: '5000',
        description: 'Starting bankroll',
        type: 'string',
    },
} satisfies ArgsDef;

export const bankrollLeversArguments = {
    bankroll: {
        default: '2000',
        description: 'Bankroll to price the loss risk at',
        type: 'string',
    },
    'request-sizes': {
        description:
            'Payout-request-size what-ifs, comma separated; the documented request stays the headline (QV-10)',
        type: 'string',
    },
    risks: {
        description: 'Eval risk-per-trade what-ifs, comma separated',
        type: 'string',
    },
    'trades-per-day': {
        description: 'Trades-per-day what-ifs, comma separated',
        type: 'string',
    },
} satisfies ArgsDef;

export const bankrollProjectArguments = {
    capacity: {
        description:
            'Maximum concurrent accounts (also capped at the plan maxFundedAccounts); omit for the plan cap only',
        type: 'string',
    },
    'horizon-days': {
        default: '180',
        description: 'Projection horizon in trading days',
        type: 'string',
    },
    'monthly-budget': {
        description: 'Cap on spend per calendar month; omit for no cap',
        type: 'string',
    },
    'payout-lag-days': {
        default: '0',
        description:
            'Days between a payout request and its cash credit; 0 is optimistic. Prefer your own measured lag',
        type: 'string',
    },
    reinvest: {
        default: '1',
        description: 'Fraction [0,1] of each payout reinvested; the rest is withdrawn',
        type: 'string',
    },
    start: {
        default: '5000',
        description: 'Starting bankroll',
        type: 'string',
    },
    trials: {
        default: '2000',
        description: 'Monte Carlo trials',
        type: 'string',
    },
} satisfies ArgsDef;

export const bankrollRiskArguments = {
    budget: {
        default: '5000',
        description: 'Bankroll budget',
        type: 'string',
    },
    'loss-threshold': {
        description: 'Loss-probability threshold (0, 0.5] for the minimum-budget line',
        type: 'string',
    },
    'pass-rate': {
        description:
            'Override the eval pass-per-attempt rate instead of the modeled one; an input, not derived from your win rate, rr and risk',
        type: 'string',
    },
    'payout-rate': {
        description:
            'Override P(attempt pays) instead of the modeled one; an input, not derived from your win rate, rr and risk',
        type: 'string',
    },
} satisfies ArgsDef;

export function readBankrollBatchInputs(
    arguments_: BankrollBatchArguments,
): BankrollBatchInputs {
    return { attempts: readPositiveInteger(arguments_.attempts, 'attempts') };
}

export function readBankrollCompareInputs(
    arguments_: BankrollCompareArguments,
): BankrollCompareInputs {
    return {
        horizonDays: readPositiveInteger(
            arguments_['horizon-days'],
            'horizon-days',
        ),
        multiples:
            arguments_.multiples === undefined
                ? null
                : arguments_.multiples.split(',').map((pair) => {
                      const [multiplePart, cycleDaysPart] = pair.split('@', 2);
                      const multiple = Number(multiplePart);
                      const cycleDays = Number(cycleDaysPart);
                      if (
                          !Number.isFinite(multiple) ||
                          !Number.isFinite(cycleDays) ||
                          cycleDays <= 0
                      ) {
                          throw new TypeError(
                              `Invalid --multiples entry "${pair}": expected multiple@cycleDays`,
                          );
                      }
                      return { cycleDays, multiple };
                  }),
        risks:
            arguments_.risks === undefined
                ? null
                : parsePositiveNumberList(arguments_.risks, 'risks'),
        start: dollars(readPositiveNumber(arguments_.start, 'start')),
    };
}

export function readBankrollLeversInputs(
    arguments_: BankrollLeversArguments,
): BankrollLeversInputs {
    return {
        bankroll: dollars(readPositiveNumber(arguments_.bankroll, 'bankroll')),
        requestSizes:
            arguments_['request-sizes'] === undefined
                ? null
                : parsePositiveNumberList(
                      arguments_['request-sizes'],
                      'request-sizes',
                  ),
        risks:
            arguments_.risks === undefined
                ? null
                : parsePositiveNumberList(arguments_.risks, 'risks'),
        tradesPerDay:
            arguments_['trades-per-day'] === undefined
                ? null
                : parsePositiveNumberList(
                      arguments_['trades-per-day'],
                      'trades-per-day',
                  ),
    };
}

export function readBankrollProjectInputs(
    arguments_: BankrollProjectArguments,
): BankrollProjectInputs {
    const capacity = arguments_.capacity;
    const monthlyBudget = arguments_['monthly-budget'];
    return {
        capacity:
            capacity === undefined
                ? null
                : readPositiveInteger(capacity, 'capacity'),
        horizonDays: readPositiveInteger(
            arguments_['horizon-days'],
            'horizon-days',
        ),
        monthlyBudget:
            monthlyBudget === undefined
                ? null
                : dollars(readPositiveNumber(monthlyBudget, 'monthly-budget')),
        payoutLagDays: readNonNegativeInteger(
            arguments_['payout-lag-days'],
            'payout-lag-days',
        ),
        reinvest: fraction(readFraction(arguments_.reinvest, 'reinvest')),
        start: dollars(readPositiveNumber(arguments_.start, 'start')),
        trials: readPositiveInteger(arguments_.trials, 'trials'),
    };
}

export function readBankrollRiskInputs(
    arguments_: BankrollRiskArguments,
): BankrollRiskInputs {
    const passRate = arguments_['pass-rate'];
    const payoutRate = arguments_['payout-rate'];
    return {
        budget: dollars(readPositiveNumber(arguments_.budget, 'budget')),
        lossThreshold: readLossThreshold(arguments_['loss-threshold']),
        passRateOverride:
            passRate === undefined
                ? null
                : fraction(readFraction(passRate, 'pass-rate')),
        payoutRateOverride:
            payoutRate === undefined
                ? null
                : fraction(readFraction(payoutRate, 'payout-rate')),
    };
}

export function toBankrollTimelineInputs(
    inputs: TradingInputs,
    plan: Plan,
    bankroll: BankrollPolicy,
    horizonDays: number,
    trials: number,
): BankrollTimelineInputs {
    if (inputs.ladder !== null) {
        throw new Error(
            'prop bankroll does not support --ladder: it prices flat eval risk only. Omit --ladder or price the ladder with prop sim instead.',
        );
    }
    return {
        bankroll,
        commissionPerRoundTrip: inputs.commissionPerRoundTrip,
        dayBudget: horizonDays,
        dayStop: inputs.dayStop,
        discounts: inputs.toCouponDiscounts(),
        fundedRiskPerTrade: inputs.fundedRiskPerTrade,
        fundedRrRatio: inputs.fundedRrRatio,
        fundedTradesPerDay: inputs.fundedTradesPerDay,
        idleDayProbability: inputs.idleDayProbability,
        instrument: inputs.instrument,
        maxEvalDays: inputs.maxEvalDays,
        minRetainedCushion: inputs.minRetainedCushion,
        payoutRequestSize: inputs.payoutRequestSize,
        plan,
        riskPerTrade: inputs.riskPerTrade,
        rrRatio: inputs.rrRatio,
        rungSizing: inputs.rungSizing,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints,
        tradesPerDay: inputs.tradesPerDay,
        trials,
        winrate: inputs.winrate,
    };
}

function parsePositiveNumberList(raw: string, name: string): number[] {
    return raw.split(',').map((part) => {
        const value = Number(part.trim());
        if (!Number.isFinite(value) || value <= 0) {
            throw new TypeError(
                `Invalid --${name} "${raw}": every entry must be a positive number`,
            );
        }
        return value;
    });
}
