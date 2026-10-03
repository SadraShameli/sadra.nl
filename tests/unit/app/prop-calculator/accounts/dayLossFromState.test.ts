import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    type AccountFromStateFigures,
    overviewAccountRequestsFor,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
    withPreviousAccount,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    evalValueLossDollarsOf,
    previousAccountOf,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import { type SlotEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import {
    type FirmPayoutCount,
    FirmPayoutCountResultKind,
    firmPayoutCountResultOf,
    snapshotInputFrom,
} from '~/lib/prop-accounts/advice';
import {
    type AlertAccountRow,
    createAlertContext,
    dayLossShareOfContext,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    isModeledAccount,
    type ModeledAccountRow,
    trackedAccountOf,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    type AccountStateAccountRow,
    type AccountStateEntry,
    AccountStateKind,
    type AccountStateSnapshotRow,
    accountStatesOf,
    DayLossBasis,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmId,
    MffuVariant,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    DEFAULT_RULEBOOK,
    type NO_PENDING_PAYOUT_COUNTS,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import {
    requireValue,
    valueAtState,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000010';
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';
const WEDNESDAY = '2026-09-23';
const TINY_RUN = { maxEvalDays: 150, seed: 7, trials: 30 } as const;

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

function requirePlan(): Plan {
    const plan = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

const PLAN = requirePlan();

interface Scenario {
    readonly row: AccountStateAccountRow;
    readonly snapshots: readonly AccountStateSnapshotRow[];
    readonly state: AccountStateEntry;
}

function accountRow(
    overrides: Partial<AccountStateAccountRow> = {},
): AccountStateAccountRow {
    return {
        accountSize: 50_000,
        archivedAt: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: ACCOUNT_ID,
        liveStartBalanceCents: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(MFF_PRO_ID),
        purchasedOn: '2026-08-01',
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    };
}

function firmCountAt(
    row: AccountStateAccountRow,
): (asOf: string) => FirmPayoutCount | null {
    return (asOf) => {
        const result = firmPayoutCountResultOf(
            FirmId.Mffu,
            [{ account: row, events: [], payouts: [] }],
            asOf,
        );
        return result.kind === FirmPayoutCountResultKind.Known
            ? result.count
            : null;
    };
}

function modeledRowOf(
    row: AccountStateAccountRow,
): ModeledAccountRow<AccountStateAccountRow> {
    const tracked = trackedAccountOf(row);
    if (!isModeledAccount(tracked)) throw new Error('expected a modeled row');
    return tracked;
}

function previousOf(
    scenario: Scenario,
    count: (asOf: string) => FirmPayoutCount | null = firmCountAt(scenario.row),
) {
    const { plan } =
        scenario.state.state.kind === AccountStateKind.Reconstructed
            ? scenario.state.state
            : { plan: PLAN };
    return previousAccountOf({
        accountId: ACCOUNT_ID,
        events: [],
        firmCountAt: count,
        payouts: [],
        plan,
        rulebook: DEFAULT_RULEBOOK,
        snapshots: scenario.snapshots,
        state: scenario.state.state,
        tracked: modeledRowOf(scenario.row),
    });
}

function scenarioOf(
    snapshots: readonly AccountStateSnapshotRow[],
    overrides: Partial<AccountStateAccountRow> = {},
): Scenario {
    const row = accountRow(overrides);
    const [state] = accountStatesOf(USER_ID, WEDNESDAY, {
        accounts: [row],
        events: [],
        payouts: [],
        snapshots,
    });
    if (state === undefined) throw new Error('expected one account state');
    return { row, snapshots, state };
}

function snapshotRow(
    asOf: string,
    balance: number,
    overrides: Partial<AccountStateSnapshotRow> = {},
): AccountStateSnapshotRow {
    return {
        accountId: ACCOUNT_ID,
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCentsFromDollars(balance),
        createdAt: new Date(`${asOf}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCentsFromDollars(51_300),
        highestIntradayBalanceCents: null,
        id: `10000000-0000-4000-8000-${asOf.replaceAll('-', '').padStart(12, '0')}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: 0,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 4,
        userId: USER_ID,
        ...overrides,
    };
}

const ONE_DAY_LOSS = scenarioOf([
    snapshotRow(TUESDAY, 51_300),
    snapshotRow(WEDNESDAY, 50_300),
]);

describe('which eval accounts get a previous snapshot sent to the worker (PT-90, F-V29)', () => {
    it('sends the previous snapshot for an eval account that lost money since the previous trading day', () => {
        const previous = previousOf(ONE_DAY_LOSS);
        expect(previous).not.toBeNull();
        expect(previous?.account.asOf).toBe(TUESDAY);
        expect(previous?.account.balance).toBe(51_300);
        expect(previous?.pendingPayoutCounts).toBeDefined();
    });

    it('builds the previous snapshot input the way the account state did, with the firm count at the previous date', () => {
        const row = ONE_DAY_LOSS.row;
        const snapshot = ONE_DAY_LOSS.snapshots[0];
        if (snapshot === undefined) throw new Error('expected a snapshot');
        const count = firmCountAt(row)(TUESDAY);
        if (count === null) throw new Error('expected a firm count');
        const direct = snapshotInputFrom(
            PLAN,
            modeledRowOf(row),
            snapshot,
            [],
            [],
            TUESDAY,
            count,
        );
        expect(previousOf(ONE_DAY_LOSS)).toEqual({
            account: direct.input,
            pendingPayoutCounts: direct.pendingPayoutCounts,
        });
    });

    it('sends nothing for an eval account that gained money', () => {
        const gain = scenarioOf([
            snapshotRow(TUESDAY, 50_300),
            snapshotRow(WEDNESDAY, 51_300),
        ]);
        expect(previousOf(gain)).toBeNull();
    });

    it('sends nothing when the two snapshots are more than one trading day apart', () => {
        const apart = scenarioOf([
            snapshotRow(MONDAY, 51_300),
            snapshotRow(WEDNESDAY, 50_300),
        ]);
        expect(previousOf(apart)).toBeNull();
    });

    it('sends nothing when there is only one snapshot', () => {
        const single = scenarioOf([snapshotRow(WEDNESDAY, 50_300)]);
        expect(previousOf(single)).toBeNull();
    });

    it('sends nothing for a funded account, whose loss is the withdrawable', () => {
        const funded = scenarioOf(
            [snapshotRow(TUESDAY, 51_300), snapshotRow(WEDNESDAY, 50_300)],
            { stage: AccountStage.Funded },
        );
        expect(funded.state.state.kind).toBe(AccountStateKind.Reconstructed);
        expect(previousOf(funded)).toBeNull();
    });

    it('sends nothing when the firm payout count at the previous date is unknown', () => {
        expect(previousOf(ONE_DAY_LOSS, () => null)).toBeNull();
    });

    it('sends nothing when the account state is unavailable', () => {
        const none = scenarioOf([]);
        expect(none.state.state.kind).toBe(AccountStateKind.Unavailable);
        expect(previousOf(none)).toBeNull();
    });
});

interface WorkerRun {
    readonly engine: SlotEngine;
    readonly figures: AccountFromStateFigures;
    readonly request: OverviewRequest;
    readonly valueLossDollars: number;
}

function engineWithFigures(
    run: WorkerRun,
    figures: AccountFromStateFigures,
): SlotEngine {
    const key = overviewRequestKey(run.request);
    return {
        failure: null,
        outcomes: new Map([
            [
                key,
                {
                    key,
                    kind: OverviewOutcomeKind.Succeeded,
                    result: {
                        figures,
                        kind: OverviewRequestKind.AccountFromState,
                    },
                },
            ],
        ]),
    };
}

function runOf(): WorkerRun {
    const previous = previousOf(ONE_DAY_LOSS);
    if (previous === null) throw new Error('expected a previous snapshot');
    const snapshot = ONE_DAY_LOSS.snapshots[1];
    if (snapshot === undefined) throw new Error('expected a snapshot');
    const count = firmCountAt(ONE_DAY_LOSS.row)(WEDNESDAY);
    if (count === null) throw new Error('expected a firm count');
    const latest = snapshotInputFrom(
        PLAN,
        modeledRowOf(ONE_DAY_LOSS.row),
        snapshot,
        [],
        [],
        WEDNESDAY,
        count,
    );
    const [first] = overviewAccountRequestsFor(
        [
            {
                account: latest.input,
                firmId: PLAN.id.firm,
                measuredRebuyLag: null,
                optIns: NO_PLAN_OPT_INS,
                pendingPayoutCounts: latest.pendingPayoutCounts,
                planSerial: serializePlanId(PLAN.id),
            },
        ],
        DEFAULT_RULEBOOK,
    );
    if (first === undefined) throw new Error('expected a request');
    const request = withPreviousAccount(
        { ...first, spec: { ...first.spec, run: TINY_RUN } },
        previous,
    );
    if (request === undefined) throw new Error('expected a request');
    const outcome = overviewOutcomeOf(request);
    if (
        outcome.kind !== OverviewOutcomeKind.Succeeded ||
        outcome.result.kind !== OverviewRequestKind.AccountFromState
    ) {
        throw new Error('expected an account-from-state result');
    }
    const { figures } = outcome.result;
    const direct = (
        input: typeof latest.input,
        counts: typeof NO_PENDING_PAYOUT_COUNTS,
    ) => {
        const account = AccountReconstruction.rebuild(
            input,
            PLAN,
            null,
            counts,
        );
        if (account.kind === ReconstructedLiveKind.Live) {
            throw new Error('expected an eval account');
        }
        return requireValue(valueAtState(account, request.spec));
    };
    return {
        engine: {
            failure: null,
            outcomes: new Map([[outcome.key, outcome]]),
        },
        figures,
        request,
        valueLossDollars:
            direct(previous.account, previous.pendingPayoutCounts).creditFree
                .value -
            direct(latest.input, latest.pendingPayoutCounts).creditFree.value,
    };
}

describe('the eval day loss is the change in the from-state value (PT-90, F-V29)', () => {
    let run: WorkerRun;

    beforeAll(() => {
        run = runOf();
    });

    it('has both values ready from the worker, the previous one worth more', () => {
        expect(run.figures.valueNow.kind).toBe(ValueResultKind.Value);
        expect(run.figures.valueAtPrevious?.kind).toBe(
            ValueChainStepOutcomeKind.Value,
        );
        expect(run.valueLossDollars).toBeGreaterThan(0);
    });

    it('maps each account with both values ready to the previous value minus the latest value', () => {
        const losses = evalValueLossDollarsOf(
            [{ accountId: ACCOUNT_ID, request: run.request }],
            run.engine,
        );
        expect(losses.keys().toArray()).toEqual([ACCOUNT_ID]);
        expect(losses.get(ACCOUNT_ID)).toBeCloseTo(run.valueLossDollars, 6);
    });

    it('leaves out an account whose previous value failed, so its loss stays the heuristic', () => {
        const losses = evalValueLossDollarsOf(
            [{ accountId: ACCOUNT_ID, request: run.request }],
            engineWithFigures(run, {
                ...run.figures,
                valueAtPrevious: {
                    kind: ValueChainStepOutcomeKind.Unavailable,
                    reason: 'the previous snapshot could not be rebuilt',
                },
            }),
        );
        expect(losses.size).toBe(0);
    });

    it('leaves out an account whose worker result is still pending, refused or failed', () => {
        const entries = [{ accountId: ACCOUNT_ID, request: run.request }];
        const pending: SlotEngine = { failure: null, outcomes: new Map() };
        const failed: SlotEngine = {
            failure: 'worker crashed',
            outcomes: new Map(),
        };
        const refused: SlotEngine = {
            failure: null,
            outcomes: new Map([
                [
                    overviewRequestKey(run.request),
                    {
                        key: overviewRequestKey(run.request),
                        kind: OverviewOutcomeKind.Failed,
                        reason: 'sizing refused',
                    },
                ],
            ]),
        };
        for (const engine of [pending, failed, refused]) {
            expect(evalValueLossDollarsOf(entries, engine).size).toBe(0);
        }
    });

    it('leaves out an account whose request carried no previous snapshot', () => {
        const { previous: ignored, ...plain } = run.request;
        expect(ignored).toBeDefined();
        const request: OverviewRequest = plain;
        const { valueAtPrevious: unused, ...withoutPrevious } = run.figures;
        expect(unused).toBeDefined();
        const losses = evalValueLossDollarsOf(
            [{ accountId: ACCOUNT_ID, request }],
            engineWithFigures({ ...run, request }, withoutPrevious),
        );
        expect(losses.size).toBe(0);
    });

    it('prices the alert day loss as EvalFromStateValue with that loss when both values are ready', () => {
        const losses = evalValueLossDollarsOf(
            [{ accountId: ACCOUNT_ID, request: run.request }],
            run.engine,
        );
        const [day] = dayLossShareOfContext(contextWith(losses)).days;
        expect(day?.entries).toEqual([
            {
                accountId: ACCOUNT_ID,
                basis: DayLossBasis.EvalFromStateValue,
                lossCents: usdCentsFromDollars(run.valueLossDollars),
            },
        ]);
    });

    it('falls back to the retry-fee heuristic when no value was mapped', () => {
        const [day] = dayLossShareOfContext(contextWith(new Map())).days;
        expect(day?.entries.map((entry) => entry.basis)).toEqual([
            DayLossBasis.EvalFeeHeuristic,
        ]);
    });
});

function alertRowOf(row: AccountStateAccountRow): AlertAccountRow {
    return {
        accountSize: row.accountSize,
        archivedAt: row.archivedAt,
        copyGroupId: null,
        externalFirmId: row.externalFirmId,
        firmId: row.firmId,
        id: row.id,
        label: 'Eval 1',
        optIns: row.optIns,
        planLabel: row.planLabel,
        planSerial: row.planSerial,
        purchasedOn: row.purchasedOn,
        readIssues: row.readIssues,
        stage: row.stage,
        status: row.status,
        tracking: row.tracking,
    };
}

function contextWith(losses: ReadonlyMap<string, number>) {
    return createAlertContext({
        accounts: [alertRowOf(ONE_DAY_LOSS.row)],
        accountStates: [ONE_DAY_LOSS.state],
        availableBankrollCents: usdCents(1_000_000),
        copyGroups: [],
        evalValueLossDollars: losses,
        payouts: [],
        rulebook: DEFAULT_RULEBOOK,
        snapshots: [],
        today: WEDNESDAY,
    });
}

describe('the accounts pages send the previous snapshot through the one shared builder (PT-90, F-V29)', () => {
    const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
    const SOURCE = readFileSync(
        path.join(
            REPO_ROOT,
            'src/app/(app)/prop-calculator/accounts/_components/useAccountValues.ts',
        ),
        'utf8',
    );

    it('keeps no second day-loss gate of its own', () => {
        expect(SOURCE).not.toMatch(
            /performanceSinceSnapshot|profitSinceSnapshot/,
        );
        expect(SOURCE).not.toMatch(
            /weekdaysInRange|DAY_LOSS_MAX_WEEKDAYS_APART/,
        );
    });
});
