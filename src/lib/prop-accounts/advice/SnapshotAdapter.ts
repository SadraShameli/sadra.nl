import type {
    PropAccountEventRow,
    PropAccountRow,
    PropAccountSnapshotRow,
    PropPayoutRow,
} from '~/server/db/schemas/prop';

import { type Dollars, isoDaysBetween, type Plan } from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    type Assumption,
    AssumptionBias,
    AssumptionKind,
    inputAssumption,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import {
    AccountEventKind,
    accountStageOn,
    type AccountStageStarts,
    compareText,
    isLedgerOnlyAccount,
    type ModeledAccountRow,
    paidPayoutCash,
    PayoutStatus,
    sumUsdCents,
    type TrackedAccountRow,
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '../core';
import { SnapshotField } from '../snapshots';

export enum AdviceUnavailableReason {
    LedgerOnly = 'ledger-only',
}

export enum SnapshotAdviceInputKind {
    LedgerOnly = 'ledger-only',
    Modeled = 'modeled',
}

export type SnapshotAccountRow = Pick<
    PropAccountRow,
    | 'accountSize'
    | 'dashboardConvention'
    | 'externalFirmId'
    | 'firmId'
    | 'firstFundedTradeOn'
    | 'fundedOn'
    | 'id'
    | 'liveStartBalanceCents'
    | 'planLabel'
    | 'planSerial'
    | 'purchasedOn'
    | 'stage'
    | 'tracking'
>;

export interface SnapshotAdapterResult {
    readonly assumptions: readonly Assumption[];
    readonly input: AccountSnapshotInput;
}

export type SnapshotAdviceInput =
    | {
          readonly kind: SnapshotAdviceInputKind.LedgerOnly;
          readonly reason: AdviceUnavailableReason;
      }
    | {
          readonly kind: SnapshotAdviceInputKind.Modeled;
          readonly result: SnapshotAdapterResult;
          readonly row: ModeledAccountRow<SnapshotAccountRow>;
      };

export type SnapshotEventRow = Pick<PropAccountEventRow, 'kind' | 'occurredOn'>;

export type SnapshotPayoutRow = Pick<
    PropPayoutRow,
    'grossCents' | 'netCents' | 'paidOn' | 'requestedOn' | 'status'
>;

export type SnapshotSnapshotRow = Pick<
    PropAccountSnapshotRow,
    | 'asOf'
    | 'balanceAtLastPayoutCents'
    | 'balanceCents'
    | 'cumulativePayoutCents'
    | 'cycleBestDayProfitCents'
    | 'dashboardFloorCents'
    | 'evalBestDayProfitCents'
    | 'floorAtLastPayoutCents'
    | 'highestEodBalanceCents'
    | 'highestIntradayBalanceCents'
    | 'lastPayoutOn'
    | 'lastTradedOn'
    | 'payoutsTaken'
    | 'qualifyingDaysSinceLastPayout'
    | 'tradingDays'
>;

export const SNAPSHOT_FIELD_TO_INPUT_FIELD: Readonly<
    Record<SnapshotField, keyof AccountSnapshotInput>
> = {
    [SnapshotField.AsOf]: 'asOf',
    [SnapshotField.Balance]: 'balance',
    [SnapshotField.BalanceAtLastPayout]: 'balanceAtLastPayout',
    [SnapshotField.CumulativePayout]: 'cumulativePayout',
    [SnapshotField.CycleBestDayProfit]: 'cycleBestDayProfit',
    [SnapshotField.DashboardFloor]: 'dashboardFloor',
    [SnapshotField.EvalBestDayProfit]: 'evalBestDayProfit',
    [SnapshotField.FloorAtLastPayout]: 'floorAtLastPayout',
    [SnapshotField.HighestEodBalance]: 'highestEodBalance',
    [SnapshotField.HighestIntradayBalance]: 'highestIntradayBalance',
    [SnapshotField.LastPayoutOn]: 'lastPayoutOn',
    [SnapshotField.LastTradedOn]: 'lastTradedOn',
    [SnapshotField.PayoutsTaken]: 'payoutsTaken',
    [SnapshotField.QualifyingDaysSinceLastPayout]:
        'qualifyingDaysSinceLastPayout',
    [SnapshotField.TradingDays]: 'tradingDays',
};

export function snapshotAdviceInputFor(
    plan: null | Pick<Plan, 'isInstantFunded'>,
    row: TrackedAccountRow<SnapshotAccountRow>,
    snapshot: null | SnapshotSnapshotRow,
    events: readonly SnapshotEventRow[],
    payouts: readonly SnapshotPayoutRow[],
    asOf: string,
): SnapshotAdviceInput {
    if (isLedgerOnlyAccount(row)) {
        return {
            kind: SnapshotAdviceInputKind.LedgerOnly,
            reason: AdviceUnavailableReason.LedgerOnly,
        };
    }
    if (plan === null) {
        throw new Error(
            'A modeled account needs its resolved plan to build advice input',
        );
    }
    return {
        kind: SnapshotAdviceInputKind.Modeled,
        result: snapshotInputFrom(plan, row, snapshot, events, payouts, asOf),
        row,
    };
}

export function snapshotInputFrom(
    plan: Pick<Plan, 'isInstantFunded'>,
    account: ModeledAccountRow<SnapshotAccountRow>,
    snapshot: null | SnapshotSnapshotRow,
    events: readonly SnapshotEventRow[],
    payouts: readonly SnapshotPayoutRow[],
    asOf: string,
): SnapshotAdapterResult {
    const assumptions: Assumption[] = [];

    const stageStarts: AccountStageStarts = {
        evalPassedOn: latestOccurredOn(events, AccountEventKind.EvalPassed),
        movedLiveOn: latestOccurredOn(events, AccountEventKind.MovedLive),
    };
    const resolvedAsOf = snapshot?.asOf ?? asOf;
    const stage = accountStageOn(
        {
            fundedOn: account.fundedOn,
            purchasedOn: account.purchasedOn,
            stage: account.stage,
        },
        plan,
        stageStarts,
        resolvedAsOf,
    );

    const fundedResetsUsed = events.filter(
        (event) => event.kind === AccountEventKind.FundedReset,
    ).length;
    if (fundedResetsUsed > 0) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.FundedResetsFromEvents,
                AssumptionBias.Neutral,
            ),
        );
    }

    const paidPayouts = payouts.filter(
        (payout) => payout.status === PayoutStatus.Paid,
    );
    const paidCash = paidPayouts
        .map((payout) => paidPayoutCash(payout))
        .filter((cash) => cash !== null);
    const cumulativePayoutCents =
        snapshot?.cumulativePayoutCents ??
        (paidCash.length > 0
            ? sumUsdCents(paidCash.map((cash) => cash.cents))
            : usdCents(0));
    if (
        snapshot?.cumulativePayoutCents == null &&
        paidCash.some((cash) => cash.grossOnly)
    ) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.GrossOnlyPayouts,
                AssumptionBias.Conservative,
            ),
        );
    }

    const pendingPayoutCents = sumUsdCents(
        payouts
            .filter(
                (payout) =>
                    payout.status === PayoutStatus.Requested &&
                    compareText(payout.requestedOn, resolvedAsOf) > 0,
            )
            .map((payout) => payout.grossCents),
    );

    const balanceCents =
        snapshot?.balanceCents ?? usdCentsFromDollars(account.accountSize);

    const input: AccountSnapshotInput = {
        asOf: resolvedAsOf,
        balance: usdCentsToDollars(balanceCents),
        balanceAtLastPayout: optionalDollars(snapshot?.balanceAtLastPayoutCents),
        cumulativePayout: usdCentsToDollars(cumulativePayoutCents),
        cycleBestDayProfit: optionalDollars(snapshot?.cycleBestDayProfitCents),
        dashboardConvention: account.dashboardConvention,
        dashboardFloor: optionalDollars(snapshot?.dashboardFloorCents),
        elapsedDaysSinceAttemptStart:
            stage === SizingStage.Eval
                ? Math.max(
                      0,
                      isoDaysBetween(account.purchasedOn, resolvedAsOf) + 1,
                  )
                : undefined,
        evalBestDayProfit: optionalDollars(snapshot?.evalBestDayProfitCents),
        firstFundedTradeOn: account.firstFundedTradeOn ?? undefined,
        floorAtLastPayout: optionalDollars(snapshot?.floorAtLastPayoutCents),
        fundedOn: account.fundedOn ?? undefined,
        fundedResetsUsed,
        highestEodBalance: optionalDollars(snapshot?.highestEodBalanceCents),
        highestIntradayBalance: optionalDollars(
            snapshot?.highestIntradayBalanceCents,
        ),
        lastPayoutOn: snapshot?.lastPayoutOn ?? undefined,
        lastTradedOn: snapshot?.lastTradedOn ?? undefined,
        liveStartBalance: optionalDollars(account.liveStartBalanceCents),
        payoutsTaken: snapshot?.payoutsTaken ?? paidPayouts.length,
        pendingPayouts: usdCentsToDollars(pendingPayoutCents),
        purchasedOn: account.purchasedOn,
        qualifyingDaysSinceLastPayout:
            snapshot?.qualifyingDaysSinceLastPayout ?? undefined,
        stage,
        tradingDays: snapshot?.tradingDays ?? undefined,
    };

    return { assumptions, input };
}

function latestOccurredOn(
    events: readonly SnapshotEventRow[],
    kind: AccountEventKind,
): null | string {
    let latest: null | string = null;
    for (const event of events) {
        if (event.kind !== kind) continue;
        if (latest === null || compareText(event.occurredOn, latest) > 0) {
            latest = event.occurredOn;
        }
    }
    return latest;
}

function optionalDollars(
    cents: null | undefined | UsdCents,
): Dollars | undefined {
    return cents === null || cents === undefined
        ? undefined
        : usdCentsToDollars(cents);
}
