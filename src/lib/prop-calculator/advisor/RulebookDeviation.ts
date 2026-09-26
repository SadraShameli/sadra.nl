import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    isRecord,
    LadderFractionSource,
    type RulebookParameters,
} from './Rulebook';
import { RuleSource } from './RuleSource';

interface ParameterCheck {
    readonly isActive: (rulebook: RulebookParameters) => boolean;
    readonly read: (rulebook: RulebookParameters) => unknown;
}

function always(read: ParameterCheck['read']): ParameterCheck {
    return { isActive: () => true, read };
}

function isGeneralDerivationLadder(rulebook: RulebookParameters): boolean {
    return (
        rulebook.eval.mode === EvalSizingMode.Ladder &&
        rulebook.eval.ladderFractionSource ===
            LadderFractionSource.GeneralDerivation
    );
}

function isMaxRisk(rulebook: RulebookParameters): boolean {
    return rulebook.eval.mode === EvalSizingMode.MaxRisk;
}

function isMffSearchLadder(rulebook: RulebookParameters): boolean {
    return (
        rulebook.eval.mode === EvalSizingMode.Ladder &&
        rulebook.eval.ladderFractionSource ===
            LadderFractionSource.MffRapidEodSearch
    );
}

const CHECKS_BY_SOURCE: Readonly<
    Record<RuleSource, readonly ParameterCheck[]>
> = {
    [RuleSource.EvalLadder]: [
        {
            isActive: isMffSearchLadder,
            read: (r) => r.eval.mffSearchFractions,
        },
    ],
    [RuleSource.GeneralDerivation]: [
        always((r) => r.eval.mode),
        always((r) => r.eval.ladderFractionSource),
        {
            isActive: isGeneralDerivationLadder,
            read: (r) => r.eval.generalDerivation,
        },
        always((r) => r.eval.roundingStepCents),
    ],
    [RuleSource.HardRule1]: [],
    [RuleSource.HardRule2]: [always((r) => r.payout.retainedCushionCents)],
    [RuleSource.HardRule3]: [],
    [RuleSource.HardRule4]: [
        {
            isActive: isMaxRisk,
            read: (r) => r.eval.maxRiskDailyCapMultiple,
        },
    ],
    [RuleSource.HardRule5]: [
        always((r) => r.funded.riskCents),
        always((r) => r.funded.takeProfitCents),
    ],
    [RuleSource.HardRule6]: [always((r) => r.execution.maxTradesPerWindow)],
    [RuleSource.HardRule7]: [],
    [RuleSource.HardRule8]: [],
    [RuleSource.HisNumbers]: [
        always((r) => r.strategy),
        always((r) => r.funded.tradesPerDayMax),
        always((r) => r.funded.stopRule),
    ],
    [RuleSource.LiveSizing]: [always((r) => r.live.cushionPercent)],
    [RuleSource.PayoutSize]: [always((r) => r.payout.requestCents)],
    [RuleSource.ReassessmentCadence]: [
        always((r) => r.review.weekday),
        always((r) => r.review.fundedStaleDays),
    ],
};

export function documentedRuleLabel(deviation: readonly RuleSource[]): string {
    return deviation.length === 0
        ? 'your documented rule'
        : `your custom rule (differs from ${deviation.join(', ')})`;
}

export function rulebookDeviation(
    rulebook: RulebookParameters,
): readonly RuleSource[] {
    return Object.values(RuleSource).filter((source) =>
        CHECKS_BY_SOURCE[source].some(
            (check) =>
                check.isActive(rulebook) &&
                !isDeepEqual(
                    check.read(rulebook),
                    check.read(DEFAULT_RULEBOOK),
                ),
        ),
    );
}

function isDeepEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((item, index) => isDeepEqual(item, b[index]))
        );
    }
    if (!isRecord(a) || !isRecord(b)) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => isDeepEqual(a[key], b[key]));
}
