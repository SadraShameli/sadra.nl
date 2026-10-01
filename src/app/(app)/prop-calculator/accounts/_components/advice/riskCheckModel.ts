import { z } from 'zod';

import { formatCurrency } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    floorToWholeCents,
    ONE_CENT,
} from '~/lib/prop-calculator';
import {
    DAY_STOP_REASON_TEXT,
    type DayProgress,
    type DayStopReason,
    type DocumentedRung,
    NextTradeRiskVerdict,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';
import { type NextTradeRiskCheckResult } from '~/lib/prop-calculator/advisor/actions';

export enum RiskCheckInputKind {
    Empty = 'empty',
    Invalid = 'invalid',
    Valid = 'valid',
}

export type ParsedRiskCheckInputs =
    | { readonly kind: RiskCheckInputKind.Empty }
    | { readonly kind: RiskCheckInputKind.Invalid; readonly message: string }
    | {
          readonly kind: RiskCheckInputKind.Valid;
          readonly losses: number;
          readonly risk: Dollars;
          readonly wins: number;
      };

export interface RiskCheckInputs {
    readonly losses: string;
    readonly risk: string;
    readonly wins: string;
}

export interface RiskCheckView {
    readonly excess: number;
    readonly isViolationOffered: boolean;
    readonly payoutEligibleAboveRung: boolean;
    readonly stopText: null | string;
    readonly verdict: NextTradeRiskVerdict;
    readonly verdictText: string;
}

export interface TodaysDecisions<TDecision> {
    readonly latest: null | TDecision;
    readonly recorded: null | TDecision;
}

export const EMPTY_RISK_CHECK_INPUTS: RiskCheckInputs = {
    losses: '',
    risk: '',
    wins: '',
};

const MAX_DAY_TRADE_COUNT = 100;

const MAX_RISK_CHECK_DOLLARS = 1_000_000;

const dayCountSchema = z
    .string()
    .trim()
    .transform((text) => (text === '' ? '0' : text))
    .pipe(z.coerce.number())
    .pipe(z.number().int().nonnegative().max(MAX_DAY_TRADE_COUNT));

const riskCheckRiskSchema = z
    .string()
    .trim()
    .pipe(z.coerce.number())
    .pipe(z.number().positive().max(MAX_RISK_CHECK_DOLLARS));

export function dayProgressOf(
    rungs: readonly DocumentedRung[],
    wins: number,
    losses: number,
): DayProgress {
    const lastIndex = rungs.length - 1;
    const runningLoss =
        losses <= 0 || lastIndex < 0
            ? dollars(0)
            : (rungs[Math.min(losses - 1, lastIndex)]?.runningLossAfter ??
              dollars(0));
    const currentRung =
        lastIndex < 0 ? null : (rungs[Math.min(losses, lastIndex)] ?? null);
    const winProfit = currentRung === null ? 0 : wins * currentRung.takeProfit;
    return {
        dayPnL: dollars(winProfit - runningLoss),
        losses,
        runningLoss,
        wins,
    };
}

export function dayStopReasonOf(
    advisor: SizingAdvisor,
    rungs: readonly DocumentedRung[],
    wins: number,
    losses: number,
): DayStopReason | null {
    const result = advisor.checkNextTradeRisk(
        ONE_CENT,
        dayProgressOf(rungs, wins, losses),
    );
    return result?.stopReason ?? null;
}

export function parseDayCounts(
    inputs: RiskCheckInputs,
): null | { readonly losses: number; readonly wins: number } {
    const wins = dayCountSchema.safeParse(inputs.wins);
    const losses = dayCountSchema.safeParse(inputs.losses);
    return wins.success && losses.success
        ? { losses: losses.data, wins: wins.data }
        : null;
}

export function parseRiskCheckInputs(
    inputs: RiskCheckInputs,
): ParsedRiskCheckInputs {
    if (inputs.risk.trim() === '') return { kind: RiskCheckInputKind.Empty };
    const risk = riskCheckRiskSchema.safeParse(inputs.risk);
    if (!risk.success) {
        return {
            kind: RiskCheckInputKind.Invalid,
            message: `Enter a risk above $0 and up to ${formatCurrency(MAX_RISK_CHECK_DOLLARS)}.`,
        };
    }
    const wins = dayCountSchema.safeParse(inputs.wins);
    const losses = dayCountSchema.safeParse(inputs.losses);
    if (!wins.success || !losses.success) {
        return {
            kind: RiskCheckInputKind.Invalid,
            message: `Enter wins and losses as whole numbers from 0 to ${String(MAX_DAY_TRADE_COUNT)}.`,
        };
    }
    return {
        kind: RiskCheckInputKind.Valid,
        losses: losses.data,
        risk: dollars(floorToWholeCents(risk.data)),
        wins: wins.data,
    };
}

export function riskCheckViewOf(
    result: NextTradeRiskCheckResult,
    losses: number,
): RiskCheckView {
    const excess = result.excessCents / CENTS_PER_DOLLAR;
    const stopText =
        result.stopReason === null
            ? null
            : DAY_STOP_REASON_TEXT[result.stopReason];
    return {
        excess,
        isViolationOffered:
            result.verdict === NextTradeRiskVerdict.AboveDocumented &&
            losses > 0,
        payoutEligibleAboveRung: result.payoutEligibleAboveRung,
        stopText,
        verdict: result.verdict,
        verdictText: verdictTextOf(result, excess, stopText),
    };
}

export function todaysDecisionsOf<
    TDecision extends {
        readonly actualRiskCents: null | number;
        readonly decidedOn: string;
    },
>(decisions: readonly TDecision[], today: string): TodaysDecisions<TDecision> {
    const ofToday = decisions.filter((decision) => decision.decidedOn === today);
    return {
        latest: ofToday[0] ?? null,
        recorded:
            ofToday.find((decision) => decision.actualRiskCents !== null) ??
            null,
    };
}

function verdictTextOf(
    result: NextTradeRiskCheckResult,
    excess: number,
    stopText: null | string,
): string {
    switch (result.verdict) {
        case NextTradeRiskVerdict.AboveDocumented: {
            return result.documentedRung === null
                ? `The documented plan has stopped for today${stopText === null ? '' : ` (${stopText})`}; this risk is above it by ${formatCurrency(excess, 2)}.`
                : `Above the documented rung of ${formatCurrency(result.documentedRung, 2)} by ${formatCurrency(excess, 2)}.`;
        }
        case NextTradeRiskVerdict.AboveDp: {
            return `Within the documented rung, but above the engine's suggested risk by ${formatCurrency(excess, 2)}.`;
        }
        case NextTradeRiskVerdict.WithinPlan: {
            return 'Within your documented plan.';
        }
    }
}
