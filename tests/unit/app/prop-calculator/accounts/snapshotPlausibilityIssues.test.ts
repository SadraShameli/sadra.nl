import { describe, expect, it } from 'vitest';

import {
    placeSnapshotPlausibilityIssues,
    SNAPSHOT_FORM_FIELDS,
    type SnapshotPlausibilityContext,
    snapshotPlausibilityIssues,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotPlausibilityIssues';
import {
    AccountStage,
    compareText,
    DashboardBalanceConvention,
    type SnapshotEntryValues,
    SnapshotField,
    usdCents,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    SnapshotInputField,
    SnapshotIssueSeverity,
    SnapshotPlausibilityIssueKind,
} from '~/lib/prop-calculator/advisor';

const ACCOUNT_SIZE = 50_000;

const NO_MESSAGES = {
    fieldIssues: [],
    fieldWarnings: [],
    formIssues: [],
    formWarnings: [],
};

const plan = findPlan(
    (candidate) =>
        candidate.accountSize === ACCOUNT_SIZE &&
        !candidate.isInstantFunded &&
        candidate.drawdownFor(TradingPhase.Eval).kind ===
            DrawdownKind.EodTrailing,
);

function contextFor(
    dashboardConvention: DashboardBalanceConvention,
): SnapshotPlausibilityContext {
    return {
        account: {
            accountSize: ACCOUNT_SIZE,
            dashboardConvention,
            liveStartBalanceCents: null,
        },
        plan,
        stage: AccountStage.Eval,
    };
}

function findPlan(isMatch: (plan: Plan) => boolean): Plan {
    const found = ALL_FIRMS.flatMap((firm) => firm.plans).find(isMatch);
    if (found === undefined) throw new Error('no plan matches the predicate');
    return found;
}

function snapshotOf(
    dollarsByField: Partial<Record<keyof SnapshotEntryValues, number>>,
): SnapshotEntryValues {
    const cents = (field: keyof SnapshotEntryValues) => {
        const amount = dollarsByField[field];
        return amount === undefined ? null : usdCents(Math.round(amount * 100));
    };
    return {
        balanceAtLastPayoutCents: cents('balanceAtLastPayoutCents'),
        balanceCents: usdCents(
            Math.round((dollarsByField.balanceCents ?? 0) * 100),
        ),
        cumulativePayoutCents: cents('cumulativePayoutCents'),
        cycleBestDayProfitCents: cents('cycleBestDayProfitCents'),
        dashboardFloorCents: cents('dashboardFloorCents'),
        evalBestDayProfitCents: cents('evalBestDayProfitCents'),
        floorAtLastPayoutCents: cents('floorAtLastPayoutCents'),
        highestEodBalanceCents: cents('highestEodBalanceCents'),
        highestIntradayBalanceCents: cents('highestIntradayBalanceCents'),
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: dollarsByField.payoutsTaken ?? null,
        qualifyingDaysSinceLastPayout:
            dollarsByField.qualifyingDaysSinceLastPayout ?? null,
        tradingDays: dollarsByField.tradingDays ?? null,
    };
}

describe('SNAPSHOT_FORM_FIELDS', () => {
    it('maps every snapshot form field from exactly one advisor input field of the same name', () => {
        const mapped = Object.entries(SNAPSHOT_FORM_FIELDS).flatMap(
            ([input, field]) =>
                field === null ? [] : [[input, field] as const],
        );
        expect(mapped.map(([, field]) => field).toSorted(compareText)).toEqual(
            Object.values(SnapshotField).toSorted(compareText),
        );
        for (const [input, field] of mapped) {
            expect([input, `${input}Cents`]).toContain(field);
        }
    });

    it('leaves the account-level inputs unplaced so they reach the form banner', () => {
        for (const input of [
            SnapshotInputField.DashboardConvention,
            SnapshotInputField.FirstFundedTradeOn,
            SnapshotInputField.FundedOn,
            SnapshotInputField.FundedResetsUsed,
            SnapshotInputField.PendingPayouts,
            SnapshotInputField.PurchasedOn,
            SnapshotInputField.Stage,
        ]) {
            expect(SNAPSHOT_FORM_FIELDS[input]).toBeNull();
        }
    });
});

describe('placeSnapshotPlausibilityIssues', () => {
    it('puts field issues on their form field, joins two on one field and sends account-level issues to the banner', () => {
        expect(
            placeSnapshotPlausibilityIssues([
                {
                    field: SnapshotInputField.DashboardFloor,
                    kind: SnapshotPlausibilityIssueKind.FloorBelowStartingFloor,
                    message: 'Floor below start.',
                    severity: SnapshotIssueSeverity.Impossible,
                },
                {
                    field: SnapshotInputField.DashboardFloor,
                    kind: SnapshotPlausibilityIssueKind.CushionAboveDrawdown,
                    message: 'Cushion too wide.',
                    severity: SnapshotIssueSeverity.Impossible,
                },
                {
                    field: SnapshotInputField.FundedResetsUsed,
                    kind: SnapshotPlausibilityIssueKind.FundedResetsAboveAllowed,
                    message: 'Too many funded resets.',
                    severity: SnapshotIssueSeverity.Impossible,
                },
            ]),
        ).toEqual({
            fieldIssues: [
                {
                    field: SnapshotField.DashboardFloor,
                    message: 'Floor below start. Cushion too wide.',
                },
            ],
            fieldWarnings: [],
            formIssues: ['Too many funded resets.'],
            formWarnings: [],
        });
    });

    it('leaves out a live start issue, because the account form shows it on its live start field', () => {
        expect(
            placeSnapshotPlausibilityIssues([
                {
                    field: SnapshotInputField.LiveStartBalance,
                    kind: SnapshotPlausibilityIssueKind.LiveStartOutsideDocumented,
                    message: 'Live start outside the documented range.',
                    severity: SnapshotIssueSeverity.Impossible,
                },
            ]),
        ).toEqual(NO_MESSAGES);
    });

    it('keeps a balance far above the account size as a warning on its field, not an issue', () => {
        expect(
            placeSnapshotPlausibilityIssues([
                {
                    field: SnapshotInputField.Balance,
                    kind: SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
                    message: 'Far above the account size.',
                    severity: SnapshotIssueSeverity.Unlikely,
                },
                {
                    field: SnapshotInputField.HighestEodBalance,
                    kind: SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                    message: 'Looks $0-based.',
                    severity: SnapshotIssueSeverity.Unlikely,
                },
            ]),
        ).toEqual({
            fieldIssues: [
                {
                    field: SnapshotField.HighestEodBalance,
                    message: 'Looks $0-based.',
                },
            ],
            fieldWarnings: [
                {
                    field: SnapshotField.Balance,
                    message: 'Far above the account size.',
                },
            ],
            formIssues: [],
            formWarnings: [],
        });
    });
});

describe('snapshotPlausibilityIssues', () => {
    it('flags a nominal 2,400 on a 50K account as a likely $0-based entry on the balance field', () => {
        const result = snapshotPlausibilityIssues(
            contextFor(DashboardBalanceConvention.Nominal),
            snapshotOf({
                balanceCents: 2400,
                highestEodBalanceCents: 2400,
                tradingDays: 3,
            }),
        );
        const balance = result.fieldIssues.find(
            (issue) => issue.field === SnapshotField.Balance,
        );
        expect(balance?.message).toContain('$2,400');
        expect(balance?.message).toContain(
            'set the dashboard convention to $0-based',
        );
        expect(result.formIssues).toEqual([]);
    });

    it('flags a $0-based 52,400 on a 50K account as a likely nominal entry on the balance field', () => {
        const result = snapshotPlausibilityIssues(
            contextFor(DashboardBalanceConvention.ZeroBased),
            snapshotOf({
                balanceCents: 52_400,
                highestEodBalanceCents: 52_400,
                tradingDays: 3,
            }),
        );
        const balance = result.fieldIssues.find(
            (issue) => issue.field === SnapshotField.Balance,
        );
        expect(balance?.message).toContain('$52,400');
        expect(balance?.message).toContain(
            'set the dashboard convention to nominal',
        );
    });

    it('flags a highest end-of-day balance below the balance on that field', () => {
        const result = snapshotPlausibilityIssues(
            contextFor(DashboardBalanceConvention.Nominal),
            snapshotOf({
                balanceCents: 50_800,
                highestEodBalanceCents: 50_500,
                tradingDays: 3,
            }),
        );
        expect(result.fieldIssues.map((issue) => issue.field)).toEqual([
            SnapshotField.HighestEodBalance,
        ]);
    });

    it('warns, without an issue, about an evaluation balance above the account size plus target and drawdown', () => {
        const ceiling =
            ACCOUNT_SIZE +
            plan.profitTarget +
            plan.drawdownFor(TradingPhase.Eval).amount;
        const result = snapshotPlausibilityIssues(
            contextFor(DashboardBalanceConvention.Nominal),
            snapshotOf({
                balanceCents: ceiling + 200,
                highestEodBalanceCents: ceiling + 200,
                tradingDays: 3,
            }),
        );
        expect(result.fieldIssues).toEqual([]);
        expect(result.formIssues).toEqual([]);
        expect(result.fieldWarnings.map((warning) => warning.field)).toEqual([
            SnapshotField.Balance,
            SnapshotField.HighestEodBalance,
        ]);
    });

    it('gives no issue for a plausible nominal or $0-based snapshot', () => {
        expect(
            snapshotPlausibilityIssues(
                contextFor(DashboardBalanceConvention.Nominal),
                snapshotOf({
                    balanceCents: 50_400,
                    highestEodBalanceCents: 50_600,
                    tradingDays: 3,
                }),
            ),
        ).toEqual(NO_MESSAGES);
        expect(
            snapshotPlausibilityIssues(
                contextFor(DashboardBalanceConvention.ZeroBased),
                snapshotOf({
                    balanceCents: 400,
                    highestEodBalanceCents: 600,
                    tradingDays: 3,
                }),
            ),
        ).toEqual(NO_MESSAGES);
    });
});
