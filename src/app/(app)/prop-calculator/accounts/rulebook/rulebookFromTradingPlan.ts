import { formatCurrency } from '~/lib/format';
import {
    formatUsdCents,
    roundCents,
    usdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import {
    rulebookDeviation,
    type RulebookParameters,
    rulebookSchema,
    RuleSource,
} from '~/lib/prop-calculator/advisor';
import {
    type TradingPlanConfig,
    tradingPlanConfigSchema,
} from '~/lib/schemas/trading';

export enum TradingPlanImportField {
    EvalRisk = 'eval-risk',
    FundedRisk = 'funded-risk',
    FundedTakeProfit = 'funded-take-profit',
    MaxTradesPerWindow = 'max-trades-per-window',
}

export enum TradingPlanImportOutcome {
    Applied = 'applied',
    IgnoredZero = 'ignored-zero',
    NotStored = 'not-stored',
    Rejected = 'rejected',
    Scaled = 'scaled',
    Unchanged = 'unchanged',
}

export enum TradingPlanSourceKind {
    Missing = 'missing',
    Ready = 'ready',
    Unreadable = 'unreadable',
}

enum ImportUnit {
    Count = 'count',
    UsdCents = 'usd-cents',
}

export interface StoredTradingPlan {
    readonly config: unknown;
    readonly name: string;
}

export interface TradingPlanImport {
    readonly changes: readonly TradingPlanImportChange[];
    readonly deviation: RulebookDeviationDiff;
    readonly hasChanges: boolean;
    readonly rulebook: RulebookParameters;
}

export type TradingPlanImportChange =
    | ScaledTakeProfitChange
    | (TradingPlanValueChange & {
          readonly importedValue: number;
          readonly outcome: TradingPlanImportOutcome.Applied;
          readonly rulebookValue: number;
      })
    | (TradingPlanValueChange & {
          readonly importedValue: number;
          readonly outcome: TradingPlanImportOutcome.Unchanged;
          readonly rulebookValue: number;
      })
    | (TradingPlanValueChange & {
          readonly outcome: TradingPlanImportOutcome.IgnoredZero;
          readonly rulebookValue: number;
      })
    | (TradingPlanValueChange & {
          readonly outcome: TradingPlanImportOutcome.NotStored;
      })
    | (TradingPlanValueChange & {
          readonly outcome: TradingPlanImportOutcome.Rejected;
          readonly rejection: string;
          readonly rulebookValue: number;
      });

export type TradingPlanRisk = TradingPlanConfig['risk'];

export type TradingPlanSource =
    | { readonly kind: TradingPlanSourceKind.Missing }
    | {
          readonly kind: TradingPlanSourceKind.Ready;
          readonly name: string;
          readonly risk: TradingPlanRisk;
      }
    | {
          readonly kind: TradingPlanSourceKind.Unreadable;
          readonly name: string;
      };

interface LinkedParameter {
    readonly label: string;
    readonly path: readonly string[];
}

interface MappedField {
    readonly apply: (
        rulebook: RulebookParameters,
        value: number,
    ) => RulebookParameters;
    readonly field: TradingPlanImportField;
    readonly linked: readonly LinkedParameter[];
    readonly path: readonly string[];
    readonly planValue: (risk: TradingPlanRisk) => number;
    readonly read: (rulebook: RulebookParameters) => number;
    readonly source: RuleSource;
    readonly toRulebookUnit: (planValue: number) => number;
    readonly unit: ImportUnit;
}

interface RulebookDeviationDiff {
    readonly added: readonly RuleSource[];
    readonly after: readonly RuleSource[];
    readonly before: readonly RuleSource[];
    readonly cleared: readonly RuleSource[];
}

interface ScaledTakeProfitChange {
    readonly field: TradingPlanImportField.FundedTakeProfit;
    readonly importedValue: number;
    readonly outcome: TradingPlanImportOutcome.Scaled;
    readonly rewardMultiple: number;
    readonly rulebookValue: number;
    readonly source: RuleSource;
}

interface TradingPlanValueChange {
    readonly field: TradingPlanImportField;
    readonly planValue: number;
    readonly source: RuleSource;
}

const FIELD_LABEL: Readonly<Record<TradingPlanImportField, string>> = {
    [TradingPlanImportField.EvalRisk]: 'Eval risk per trade',
    [TradingPlanImportField.FundedRisk]: 'Funded risk per trade',
    [TradingPlanImportField.FundedTakeProfit]: 'Funded take profit',
    [TradingPlanImportField.MaxTradesPerWindow]: 'Max trades per window',
};

const REWARD_MULTIPLE_DIGITS = 2;

const MAPPED_FIELDS: readonly MappedField[] = [
    {
        apply: (rulebook, value) => ({
            ...rulebook,
            funded: {
                ...rulebook.funded,
                riskCents: value,
                takeProfitCents: scaledTakeProfitCents(rulebook, value),
            },
        }),
        field: TradingPlanImportField.FundedRisk,
        linked: [
            {
                label: 'the funded take profit scaled to keep the reward multiple',
                path: ['funded', 'takeProfitCents'],
            },
        ],
        path: ['funded', 'riskCents'],
        planValue: (risk) => risk.fundedDollars,
        read: (rulebook) => rulebook.funded.riskCents,
        source: RuleSource.HardRule5,
        toRulebookUnit: wholeCentsFromDollars,
        unit: ImportUnit.UsdCents,
    },
    {
        apply: (rulebook, value) => ({
            ...rulebook,
            execution: { ...rulebook.execution, maxTradesPerWindow: value },
        }),
        field: TradingPlanImportField.MaxTradesPerWindow,
        linked: [],
        path: ['execution', 'maxTradesPerWindow'],
        planValue: (risk) => risk.maxTradesPerWindow,
        read: (rulebook) => rulebook.execution.maxTradesPerWindow,
        source: RuleSource.HardRule6,
        toRulebookUnit: (planValue) => planValue,
        unit: ImportUnit.Count,
    },
];

const UNIT_OF_FIELD: Readonly<Record<TradingPlanImportField, ImportUnit>> = {
    [TradingPlanImportField.EvalRisk]: ImportUnit.UsdCents,
    [TradingPlanImportField.FundedRisk]: ImportUnit.UsdCents,
    [TradingPlanImportField.FundedTakeProfit]: ImportUnit.UsdCents,
    [TradingPlanImportField.MaxTradesPerWindow]: ImportUnit.Count,
};

export function describeTradingPlanImportChange(
    change: TradingPlanImportChange,
): string {
    const label = FIELD_LABEL[change.field];
    const unit = UNIT_OF_FIELD[change.field];
    switch (change.outcome) {
        case TradingPlanImportOutcome.Applied: {
            return `${label}: ${rulebookValueText(change.rulebookValue, unit)} becomes ${rulebookValueText(change.importedValue, unit)} from the trading plan (${change.source})`;
        }
        case TradingPlanImportOutcome.IgnoredZero: {
            return `${label}: ignored, the trading plan leaves it at 0; the rulebook keeps ${rulebookValueText(change.rulebookValue, unit)}`;
        }
        case TradingPlanImportOutcome.NotStored: {
            return `${label} ${planValueText(change.planValue, unit)} ignored: ${change.source} sizes evals to the maximum allowed by the constraints, so the rulebook stores no eval risk`;
        }
        case TradingPlanImportOutcome.Rejected: {
            return `rejected: ${label.toLowerCase()} ${planValueText(change.planValue, unit)} from the trading plan is not a valid rulebook value (${change.rejection}); the rulebook keeps ${rulebookValueText(change.rulebookValue, unit)}`;
        }
        case TradingPlanImportOutcome.Scaled: {
            return `${label}: ${rulebookValueText(change.rulebookValue, unit)} becomes ${rulebookValueText(change.importedValue, unit)}, so the funded reward stays at ${rewardMultipleText(change.rewardMultiple)} (${change.source})`;
        }
        case TradingPlanImportOutcome.Unchanged: {
            return `${label}: ${planValueText(change.planValue, unit)} already matches the rulebook`;
        }
    }
}

export function rulebookFromTradingPlan(
    rulebook: RulebookParameters,
    risk: TradingPlanRisk,
): TradingPlanImport {
    let imported = rulebook;
    const changes: TradingPlanImportChange[] = [];
    for (const mapped of MAPPED_FIELDS) {
        const change = importField(imported, risk, mapped);
        changes.push(change);
        if (change.outcome !== TradingPlanImportOutcome.Applied) continue;
        const previous = imported;
        imported = mapped.apply(imported, change.importedValue);
        changes.push(...takeProfitChanges(previous, imported));
    }
    changes.push({
        field: TradingPlanImportField.EvalRisk,
        outcome: TradingPlanImportOutcome.NotStored,
        planValue: risk.evalDollars,
        source: RuleSource.HardRule3,
    });
    const before = rulebookDeviation(rulebook);
    const after = rulebookDeviation(imported);
    return {
        changes,
        deviation: {
            added: after.filter((source) => !before.includes(source)),
            after,
            before,
            cleared: before.filter((source) => !after.includes(source)),
        },
        hasChanges: changes.some(
            (change) => change.outcome === TradingPlanImportOutcome.Applied,
        ),
        rulebook: imported,
    };
}

export function tradingPlanSourceFrom(
    stored: StoredTradingPlan | undefined,
): TradingPlanSource {
    if (stored === undefined) return { kind: TradingPlanSourceKind.Missing };
    const parsed = tradingPlanConfigSchema.safeParse(stored.config);
    return parsed.success
        ? {
              kind: TradingPlanSourceKind.Ready,
              name: stored.name,
              risk: parsed.data.risk,
          }
        : { kind: TradingPlanSourceKind.Unreadable, name: stored.name };
}

function fractionDigitsOf(value: number): number {
    return String(value).split('.', 2)[1]?.length ?? 0;
}

function importField(
    rulebook: RulebookParameters,
    risk: TradingPlanRisk,
    mapped: MappedField,
): TradingPlanImportChange {
    const planValue = mapped.planValue(risk);
    const rulebookValue = mapped.read(rulebook);
    const base = {
        field: mapped.field,
        planValue,
        rulebookValue,
        source: mapped.source,
    };
    if (planValue === 0) {
        return { ...base, outcome: TradingPlanImportOutcome.IgnoredZero };
    }
    const rejected = (rejection: string): TradingPlanImportChange => ({
        ...base,
        outcome: TradingPlanImportOutcome.Rejected,
        rejection,
    });
    let value: number;
    let candidate: RulebookParameters;
    try {
        value = mapped.toRulebookUnit(planValue);
        candidate = mapped.apply(rulebook, value);
    } catch (error) {
        return rejected(
            error instanceof RangeError ? error.message : String(error),
        );
    }
    const issues = rulebookSchema.safeParse(candidate).error?.issues ?? [];
    const own = issues.find((issue) => isAtPath(issue.path, mapped.path));
    if (own !== undefined) return rejected(own.message);
    for (const linked of mapped.linked) {
        const issue = issues.find((candidateIssue) =>
            isAtPath(candidateIssue.path, linked.path),
        );
        if (issue !== undefined) {
            return rejected(`${linked.label}: ${issue.message}`);
        }
    }
    return {
        ...base,
        importedValue: value,
        outcome:
            value === rulebookValue
                ? TradingPlanImportOutcome.Unchanged
                : TradingPlanImportOutcome.Applied,
    };
}

function isAtPath(
    issuePath: readonly PropertyKey[],
    path: readonly string[],
): boolean {
    return path.every((segment, index) => issuePath[index] === segment);
}

function planValueText(value: number, unit: ImportUnit): string {
    switch (unit) {
        case ImportUnit.Count: {
            return String(value);
        }
        case ImportUnit.UsdCents: {
            return Number.isFinite(value)
                ? formatCurrency(value, fractionDigitsOf(value))
                : String(value);
        }
    }
}

function rewardMultipleText(multiple: number): string {
    return `${String(Number(multiple.toFixed(REWARD_MULTIPLE_DIGITS)))}R`;
}

function rulebookValueText(value: number, unit: ImportUnit): string {
    switch (unit) {
        case ImportUnit.Count: {
            return String(value);
        }
        case ImportUnit.UsdCents: {
            return formatUsdCents(usdCents(value));
        }
    }
}

function scaledTakeProfitCents(
    rulebook: RulebookParameters,
    riskCents: number,
): number {
    const { funded } = rulebook;
    return roundCents((riskCents * funded.takeProfitCents) / funded.riskCents);
}

function takeProfitChanges(
    before: RulebookParameters,
    after: RulebookParameters,
): ScaledTakeProfitChange[] {
    return before.funded.takeProfitCents === after.funded.takeProfitCents
        ? []
        : [
              {
                  field: TradingPlanImportField.FundedTakeProfit,
                  importedValue: after.funded.takeProfitCents,
                  outcome: TradingPlanImportOutcome.Scaled,
                  rewardMultiple:
                      before.funded.takeProfitCents / before.funded.riskCents,
                  rulebookValue: before.funded.takeProfitCents,
                  source: RuleSource.HardRule5,
              },
          ];
}

function wholeCentsFromDollars(dollars: number): number {
    const cents = usdCentsFromDollars(dollars);
    if (usdCentsToDollars(cents) !== dollars) {
        throw new RangeError(
            `${String(dollars)} dollars is not a whole number of cents`,
        );
    }
    return cents;
}
