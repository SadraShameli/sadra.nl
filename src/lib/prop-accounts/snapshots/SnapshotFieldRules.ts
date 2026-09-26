import { AccountStage } from '~/lib/prop-accounts/core';
import { DrawdownKind, type Plan, TradingPhase } from '~/lib/prop-calculator';

export enum SnapshotField {
    AsOf = 'asOf',
    Balance = 'balanceCents',
    BalanceAtLastPayout = 'balanceAtLastPayoutCents',
    CumulativePayout = 'cumulativePayoutCents',
    CycleBestDayProfit = 'cycleBestDayProfitCents',
    DashboardFloor = 'dashboardFloorCents',
    EvalBestDayProfit = 'evalBestDayProfitCents',
    FloorAtLastPayout = 'floorAtLastPayoutCents',
    HighestEodBalance = 'highestEodBalanceCents',
    HighestIntradayBalance = 'highestIntradayBalanceCents',
    LastPayoutOn = 'lastPayoutOn',
    LastTradedOn = 'lastTradedOn',
    PayoutsTaken = 'payoutsTaken',
    QualifyingDaysSinceLastPayout = 'qualifyingDaysSinceLastPayout',
    TradingDays = 'tradingDays',
}

export enum SnapshotFieldRequirement {
    Hidden = 'hidden',
    OneOf = 'one-of',
    Optional = 'optional',
    Required = 'required',
}

export enum SnapshotInputKind {
    Count = 'count',
    Date = 'date',
    Money = 'money',
}

export interface MissingSnapshotField {
    readonly alternative: null | SnapshotFieldLabel;
    readonly field: SnapshotField;
    readonly label: string;
}

export interface SnapshotFieldLabel {
    readonly field: SnapshotField;
    readonly label: string;
}

export interface SnapshotFieldRule {
    readonly alternative: null | SnapshotField;
    readonly field: SnapshotField;
    readonly hint: null | string;
    readonly input: SnapshotInputKind;
    readonly label: string;
    readonly requirement: SnapshotFieldRequirement;
}

interface FieldText {
    readonly hint: null | string;
    readonly input: SnapshotInputKind;
    readonly label: string;
}

interface PeakRequirements {
    readonly [SnapshotField.DashboardFloor]: Requirement;
    readonly [SnapshotField.HighestEodBalance]: Requirement;
    readonly [SnapshotField.HighestIntradayBalance]: Requirement;
}

interface Requirement {
    readonly alternative: null | SnapshotField;
    readonly requirement: SnapshotFieldRequirement;
}

const FIELD_TEXT: Readonly<Record<SnapshotField, FieldText>> = {
    [SnapshotField.AsOf]: {
        hint: null,
        input: SnapshotInputKind.Date,
        label: 'Snapshot date',
    },
    [SnapshotField.Balance]: {
        hint: 'As the firm dashboard shows it, in this account’s dashboard convention.',
        input: SnapshotInputKind.Money,
        label: 'Balance',
    },
    [SnapshotField.BalanceAtLastPayout]: {
        hint: null,
        input: SnapshotInputKind.Money,
        label: 'Balance at the last payout',
    },
    [SnapshotField.CumulativePayout]: {
        hint: 'What you were paid, after the profit split, not the gross amount debited.',
        input: SnapshotInputKind.Money,
        label: 'Cumulative payouts received after split',
    },
    [SnapshotField.CycleBestDayProfit]: {
        hint: 'For consistency rules in the current payout cycle.',
        input: SnapshotInputKind.Money,
        label: 'Best day profit this payout cycle',
    },
    [SnapshotField.DashboardFloor]: {
        hint: 'The max loss level the firm dashboard shows. When you enter it, it decides the floor instead of the peak.',
        input: SnapshotInputKind.Money,
        label: 'Drawdown floor on the dashboard',
    },
    [SnapshotField.EvalBestDayProfit]: {
        hint: 'For evaluation consistency rules.',
        input: SnapshotInputKind.Money,
        label: 'Best day profit in the evaluation',
    },
    [SnapshotField.FloorAtLastPayout]: {
        hint: 'Settles where the floor locked if the plan locks it on a payout.',
        input: SnapshotInputKind.Money,
        label: 'Floor at the last payout',
    },
    [SnapshotField.HighestEodBalance]: {
        hint: 'The highest end-of-day balance so far.',
        input: SnapshotInputKind.Money,
        label: 'Highest end-of-day balance',
    },
    [SnapshotField.HighestIntradayBalance]: {
        hint: 'The highest balance reached during any session, including open profit.',
        input: SnapshotInputKind.Money,
        label: 'Highest intraday balance',
    },
    [SnapshotField.LastPayoutOn]: {
        hint: null,
        input: SnapshotInputKind.Date,
        label: 'Last payout date',
    },
    [SnapshotField.LastTradedOn]: {
        hint: null,
        input: SnapshotInputKind.Date,
        label: 'Last traded date',
    },
    [SnapshotField.PayoutsTaken]: {
        hint: null,
        input: SnapshotInputKind.Count,
        label: 'Payouts taken',
    },
    [SnapshotField.QualifyingDaysSinceLastPayout]: {
        hint: null,
        input: SnapshotInputKind.Count,
        label: 'Qualifying days since the last payout',
    },
    [SnapshotField.TradingDays]: {
        hint: null,
        input: SnapshotInputKind.Count,
        label: 'Trading days',
    },
};

const HIDDEN: Requirement = {
    alternative: null,
    requirement: SnapshotFieldRequirement.Hidden,
};
const OPTIONAL: Requirement = {
    alternative: null,
    requirement: SnapshotFieldRequirement.Optional,
};
const REQUIRED: Requirement = {
    alternative: null,
    requirement: SnapshotFieldRequirement.Required,
};

export function missingSnapshotFields(
    rules: readonly SnapshotFieldRule[],
    isFilled: (field: SnapshotField) => boolean,
): readonly MissingSnapshotField[] {
    return rules.flatMap((rule) => {
        if (isFilled(rule.field)) return [];
        const missing = missingFieldOf(rule, isFilled);
        return missing === null ? [] : [missing];
    });
}

export function snapshotFieldRules(
    plan: Plan,
    stage: AccountStage,
): readonly SnapshotFieldRule[] {
    const peaks = peakRequirements(stageDrawdownKind(plan, stage));
    return Object.values(SnapshotField).map((field) => ({
        ...FIELD_TEXT[field],
        ...requirementFor(field, stage, peaks),
        field,
    }));
}

function missingFieldOf(
    rule: SnapshotFieldRule,
    isFilled: (field: SnapshotField) => boolean,
): MissingSnapshotField | null {
    switch (rule.requirement) {
        case SnapshotFieldRequirement.Hidden:
        case SnapshotFieldRequirement.Optional: {
            return null;
        }
        case SnapshotFieldRequirement.OneOf: {
            return rule.alternative === null || isFilled(rule.alternative)
                ? null
                : {
                      alternative: {
                          field: rule.alternative,
                          label: FIELD_TEXT[rule.alternative].label,
                      },
                      field: rule.field,
                      label: rule.label,
                  };
        }
        case SnapshotFieldRequirement.Required: {
            return { alternative: null, field: rule.field, label: rule.label };
        }
    }
}

function oneOf(alternative: SnapshotField): Requirement {
    return { alternative, requirement: SnapshotFieldRequirement.OneOf };
}

function peakRequirements(kind: DrawdownKind | null): PeakRequirements {
    if (kind === null) {
        return {
            [SnapshotField.DashboardFloor]: OPTIONAL,
            [SnapshotField.HighestEodBalance]: OPTIONAL,
            [SnapshotField.HighestIntradayBalance]: OPTIONAL,
        };
    }
    switch (kind) {
        case DrawdownKind.EodTrailing:
        case DrawdownKind.Static: {
            return {
                [SnapshotField.DashboardFloor]: OPTIONAL,
                [SnapshotField.HighestEodBalance]: REQUIRED,
                [SnapshotField.HighestIntradayBalance]: HIDDEN,
            };
        }
        case DrawdownKind.IntradayTrailing: {
            return {
                [SnapshotField.DashboardFloor]: oneOf(
                    SnapshotField.HighestIntradayBalance,
                ),
                [SnapshotField.HighestEodBalance]: REQUIRED,
                [SnapshotField.HighestIntradayBalance]: oneOf(
                    SnapshotField.DashboardFloor,
                ),
            };
        }
    }
}

function requirementFor(
    field: SnapshotField,
    stage: AccountStage,
    peaks: PeakRequirements,
): Requirement {
    switch (field) {
        case SnapshotField.AsOf:
        case SnapshotField.Balance:
        case SnapshotField.TradingDays: {
            return REQUIRED;
        }
        case SnapshotField.BalanceAtLastPayout:
        case SnapshotField.CumulativePayout:
        case SnapshotField.CycleBestDayProfit:
        case SnapshotField.FloorAtLastPayout:
        case SnapshotField.LastPayoutOn:
        case SnapshotField.QualifyingDaysSinceLastPayout: {
            return stage === AccountStage.Funded ? OPTIONAL : HIDDEN;
        }
        case SnapshotField.DashboardFloor:
        case SnapshotField.HighestEodBalance:
        case SnapshotField.HighestIntradayBalance: {
            return peaks[field];
        }
        case SnapshotField.EvalBestDayProfit: {
            return stage === AccountStage.Eval ? OPTIONAL : HIDDEN;
        }
        case SnapshotField.LastTradedOn: {
            return OPTIONAL;
        }
        case SnapshotField.PayoutsTaken: {
            return stage === AccountStage.Eval ? HIDDEN : REQUIRED;
        }
    }
}

function stageDrawdownKind(
    plan: Plan,
    stage: AccountStage,
): DrawdownKind | null {
    switch (stage) {
        case AccountStage.Eval: {
            return plan.drawdownFor(TradingPhase.Eval).kind;
        }
        case AccountStage.Funded: {
            return plan.drawdownFor(TradingPhase.Funded).kind;
        }
        case AccountStage.Live: {
            return null;
        }
    }
}
