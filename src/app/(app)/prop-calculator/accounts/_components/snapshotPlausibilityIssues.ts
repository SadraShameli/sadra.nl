import {
    type AccountStage,
    type SnapshotEntryAccount,
    snapshotEntryIssues,
    type SnapshotEntryValues,
    SnapshotField,
    splitSnapshotEntryIssues,
} from '~/lib/prop-accounts';
import { type Plan } from '~/lib/prop-calculator';
import {
    SnapshotInputField,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';

import { type SnapshotFieldIssue } from './snapshotFieldRules';

export interface SnapshotPlausibilityContext {
    readonly account: SnapshotEntryAccount;
    readonly plan: Plan;
    readonly stage: AccountStage;
}

export interface SnapshotPlausibilityMessages {
    readonly fieldIssues: readonly SnapshotFieldIssue[];
    readonly fieldWarnings: readonly SnapshotFieldIssue[];
    readonly formIssues: readonly string[];
    readonly formWarnings: readonly string[];
}

interface PlacedMessages {
    readonly fields: readonly SnapshotFieldIssue[];
    readonly form: readonly string[];
}

export const SNAPSHOT_FORM_FIELDS: Readonly<
    Record<SnapshotInputField, null | SnapshotField>
> = {
    [SnapshotInputField.AsOf]: SnapshotField.AsOf,
    [SnapshotInputField.Balance]: SnapshotField.Balance,
    [SnapshotInputField.BalanceAtLastPayout]: SnapshotField.BalanceAtLastPayout,
    [SnapshotInputField.CumulativePayout]: SnapshotField.CumulativePayout,
    [SnapshotInputField.CycleBestDayProfit]: SnapshotField.CycleBestDayProfit,
    [SnapshotInputField.DashboardConvention]: null,
    [SnapshotInputField.DashboardFloor]: SnapshotField.DashboardFloor,
    [SnapshotInputField.EvalBestDayProfit]: SnapshotField.EvalBestDayProfit,
    [SnapshotInputField.FirstFundedTradeOn]: null,
    [SnapshotInputField.FloorAtLastPayout]: SnapshotField.FloorAtLastPayout,
    [SnapshotInputField.FundedOn]: null,
    [SnapshotInputField.FundedResetsUsed]: null,
    [SnapshotInputField.HighestEodBalance]: SnapshotField.HighestEodBalance,
    [SnapshotInputField.HighestIntradayBalance]:
        SnapshotField.HighestIntradayBalance,
    [SnapshotInputField.LastPayoutOn]: SnapshotField.LastPayoutOn,
    [SnapshotInputField.LastTradedOn]: SnapshotField.LastTradedOn,
    [SnapshotInputField.LiveStartBalance]: null,
    [SnapshotInputField.PayoutsTaken]: SnapshotField.PayoutsTaken,
    [SnapshotInputField.PendingPayouts]: null,
    [SnapshotInputField.PurchasedOn]: null,
    [SnapshotInputField.QualifyingDaysSinceLastPayout]:
        SnapshotField.QualifyingDaysSinceLastPayout,
    [SnapshotInputField.Stage]: null,
    [SnapshotInputField.TradingDays]: SnapshotField.TradingDays,
};

const SHOWN_ON_ACCOUNT_FIELDS: ReadonlySet<SnapshotInputField> = new Set([
    SnapshotInputField.LiveStartBalance,
]);

export function placeSnapshotPlausibilityIssues(
    issues: readonly SnapshotPlausibilityIssue[],
): SnapshotPlausibilityMessages {
    const { blocking, warnings } = splitSnapshotEntryIssues(
        issues.filter((issue) => !SHOWN_ON_ACCOUNT_FIELDS.has(issue.field)),
    );
    const placedIssues = placeMessages(blocking);
    const placedWarnings = placeMessages(warnings);
    return {
        fieldIssues: placedIssues.fields,
        fieldWarnings: placedWarnings.fields,
        formIssues: placedIssues.form,
        formWarnings: placedWarnings.form,
    };
}

export function snapshotPlausibilityIssues(
    context: SnapshotPlausibilityContext,
    snapshot: SnapshotEntryValues,
): SnapshotPlausibilityMessages {
    return placeSnapshotPlausibilityIssues(
        snapshotEntryIssues(
            context.plan,
            context.stage,
            context.account,
            snapshot,
        ),
    );
}

function placeMessages(
    issues: readonly SnapshotPlausibilityIssue[],
): PlacedMessages {
    const byField = new Map<SnapshotField, string[]>();
    const form: string[] = [];
    for (const issue of issues) {
        const field = SNAPSHOT_FORM_FIELDS[issue.field];
        if (field === null) {
            form.push(issue.message);
            continue;
        }
        byField.set(field, [...(byField.get(field) ?? []), issue.message]);
    }
    return {
        fields: [...byField].map(([field, messages]) => ({
            field,
            message: messages.join(' '),
        })),
        form,
    };
}
