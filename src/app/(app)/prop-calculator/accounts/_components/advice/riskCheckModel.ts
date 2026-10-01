import { z } from 'zod';

import { formatCurrency } from '~/lib/format';
import {
    type RuleViolationKind,
    type UsdCents,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    floorToWholeCents,
    ONE_CENT,
} from '~/lib/prop-calculator';
import {
    DAY_STOP_REASON_TEXT,
    type DayStopReason,
    NextTradeRiskVerdict,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';
import {
    dayProgressFromCounts,
    type NextTradeRiskCheckResult,
} from '~/lib/prop-calculator/advisor/actions';

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

export interface RecordedRiskCheck {
    readonly basisText: string;
    readonly decisionId: string;
    readonly risk: number;
    readonly view: RiskCheckView;
}

export interface RiskCheckDecision {
    readonly actualRiskCents: null | UsdCents;
    readonly decidedOn: string;
    readonly id: string;
}

export interface RiskCheckInputs {
    readonly losses: string;
    readonly risk: string;
    readonly wins: string;
}

export interface RiskChecks {
    readonly flagExcess: number;
    readonly parsedRisk: ParsedRiskCheckInputs;
    readonly proposed: null | RiskCheckView;
    readonly recorded: null | RecordedRiskCheck;
    readonly stopReason: DayStopReason | null;
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

const WHOLE_CENTS_PATTERN = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;

const riskCheckRiskSchema = z
    .string()
    .trim()
    .regex(WHOLE_CENTS_PATTERN)
    .pipe(z.coerce.number())
    .pipe(z.number().positive().max(MAX_RISK_CHECK_DOLLARS));

export function dayStopReasonOf(
    advisor: SizingAdvisor,
    wins: number,
    losses: number,
): DayStopReason | null {
    const result = advisor.checkNextTradeRisk(
        ONE_CENT,
        dayProgressFromCounts(advisor, wins, losses),
    );
    return result?.stopReason ?? null;
}

export function hasViolationForDecision(
    violations: readonly {
        readonly decisionId: null | string;
        readonly kind: RuleViolationKind;
    }[],
    decisionId: string,
    kind: RuleViolationKind,
): boolean {
    return violations.some(
        (violation) =>
            violation.decisionId === decisionId && violation.kind === kind,
    );
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
            message: `Enter a risk above $0 and up to ${formatCurrency(MAX_RISK_CHECK_DOLLARS)}, in whole cents.`,
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

export function payoutFlagExcessOf(
    checks: readonly (null | RiskCheckView)[],
): number {
    return Math.max(
        0,
        ...checks.map((check) =>
            check?.payoutEligibleAboveRung === true ? check.excess : 0,
        ),
    );
}

export function riskChecksOf(args: {
    readonly advisor: SizingAdvisor;
    readonly decisions: readonly RiskCheckDecision[];
    readonly inputs: RiskCheckInputs;
    readonly today: string;
}): RiskChecks {
    const { advisor, decisions, inputs, today } = args;
    const dayCounts = parseDayCounts(inputs);
    const parsedRisk = parseRiskCheckInputs(inputs);
    const proposedResult =
        parsedRisk.kind === RiskCheckInputKind.Valid
            ? advisor.checkNextTradeRisk(
                  parsedRisk.risk,
                  dayProgressFromCounts(
                      advisor,
                      parsedRisk.wins,
                      parsedRisk.losses,
                  ),
              )
            : null;
    const proposed =
        proposedResult !== null && parsedRisk.kind === RiskCheckInputKind.Valid
            ? riskCheckViewOf(proposedResult, parsedRisk.losses)
            : null;
    const { recorded: recordedDecision } = todaysDecisionsOf(decisions, today);
    const recorded = recordedRiskCheckOf({
        advisor,
        dayCounts,
        decision: recordedDecision,
    });
    return {
        flagExcess: payoutFlagExcessOf([proposed, recorded?.view ?? null]),
        parsedRisk,
        proposed,
        recorded,
        stopReason:
            dayCounts === null || dayCounts.wins + dayCounts.losses === 0
                ? null
                : dayStopReasonOf(advisor, dayCounts.wins, dayCounts.losses),
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
    const ofToday = decisions.filter(
        (decision) => decision.decidedOn === today,
    );
    return {
        latest: ofToday[0] ?? null,
        recorded:
            ofToday.find((decision) => decision.actualRiskCents !== null) ??
            null,
    };
}

function countText(count: number, singular: string, plural: string): string {
    return `${String(count)} ${count === 1 ? singular : plural}`;
}

function dayBasisTextOf(
    dayCounts: null | { readonly losses: number; readonly wins: number },
): string {
    if (dayCounts === null) {
        return 'Judged as the first trade of the day: the wins and losses entered above are not valid.';
    }
    return dayCounts.wins + dayCounts.losses === 0
        ? 'Judged as the first trade of the day: no wins or losses are entered above.'
        : judgedAgainstText(dayCounts);
}

function judgedAgainstText(dayCounts: {
    readonly losses: number;
    readonly wins: number;
}): string {
    return `Judged against ${countText(dayCounts.wins, 'win', 'wins')} and ${countText(dayCounts.losses, 'loss', 'losses')} entered above.`;
}

function recordedRiskCheckOf(args: {
    readonly advisor: SizingAdvisor;
    readonly dayCounts: null | {
        readonly losses: number;
        readonly wins: number;
    };
    readonly decision: null | {
        readonly actualRiskCents: null | UsdCents;
        readonly id: string;
    };
}): null | RecordedRiskCheck {
    const { advisor, dayCounts, decision } = args;
    if (decision?.actualRiskCents == null) return null;
    const risk = usdCentsToDollars(decision.actualRiskCents);
    const counts = dayCounts ?? { losses: 0, wins: 0 };
    const result = advisor.checkNextTradeRisk(
        risk,
        dayProgressFromCounts(advisor, counts.wins, counts.losses),
    );
    return result === null
        ? null
        : {
              basisText: dayBasisTextOf(dayCounts),
              decisionId: decision.id,
              risk,
              view: riskCheckViewOf(result, counts.losses),
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
