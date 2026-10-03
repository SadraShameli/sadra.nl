import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DpValidatedPlansModule from '~/lib/prop-calculator/advisor/dp/DpValidatedPlans';
import type * as AverageRewardSolverModule from '~/lib/prop-calculator/core/AverageRewardSolver';

import advise from '~/cli/commands/prop/advise/command';
import { todayIsoDate } from '~/lib/prop-accounts/core';
import {
    findFirm,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    DpNotValidatedCause,
    fundedRetainedCushionResolution,
} from '~/lib/prop-calculator/advisor';
import { DpGateFailure } from '~/lib/prop-calculator/advisor/dp';
import { dpValidationFor } from '~/lib/prop-calculator/advisor/dp/DpValidatedPlans';
import {
    DP_ADVICE_SOLVER_VERSION,
    DpAdviceGap,
    DpGateFailureCode,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import { PayoutRequestPolicy } from '~/lib/prop-calculator/core';
import {
    type AverageRewardConfig,
    type AverageRewardSolution,
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';

import {
    assertInsertedForUser,
    assertUserScopedWhere,
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../../server/fakeDatabase';
import {
    accountRow,
    IDS,
    insertsInto,
    INSTANT_ENTRY,
    planKeyFields,
    type RegistryEntry,
    snapshotRow,
    tableResponder,
    TABLES,
    USER_ID,
} from '../../server/propAccounts/propRouterHarness';

const holder = vi.hoisted(() => ({ database: {} }));

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const { user } = await import('~/server/db/schemas/auth');
    return {
        db: new Proxy(
            {},
            {
                get: (_target, property): unknown =>
                    Reflect.get(holder.database, property),
            },
        ),
        endDb: vi.fn(),
        user,
    };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ fanOutEvent: vi.fn() }));
vi.mock('~/lib/observability/rate-limit', () => ({
    isWithinRateLimit: vi.fn(() => Promise.resolve(true)),
}));
vi.mock(
    '~/lib/prop-calculator/advisor/dp/DpValidatedPlans',
    async (importOriginal) => {
        const actual = await importOriginal<typeof DpValidatedPlansModule>();
        return { ...actual, dpValidationFor: vi.fn(actual.dpValidationFor) };
    },
);
vi.mock(
    '~/lib/prop-calculator/core/AverageRewardSolver',
    async (importOriginal) => ({
        ...(await importOriginal<typeof AverageRewardSolverModule>()),
        solveAverageRewardPolicy: vi.fn(),
    }),
);

const USER_TABLE = 'sadranl_user';
const EMAIL = 'Owner@Example.com';
const OTHER_ACCOUNT_ID = IDS.otherAccount;
const OTHER_SNAPSHOT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TODAY = todayIsoDate(new Date());

interface CapturedRun {
    readonly exitCode: number | string | undefined;
    readonly stderr: string;
    readonly stdout: string;
}

interface StubOptions {
    readonly status?: RateSearchStatus;
    readonly unconvergedLevelCount?: number;
}

const FRESH_EVAL_MFF_RAPID_EOD = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--stage',
    'eval',
    '--balance',
    '50000',
    '--highest-eod',
    '50000',
    '--trading-days',
    '0',
    '--trials',
    '10',
];

const FUNDED_MFF_RAPID_EOD = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--stage',
    'funded',
    '--balance',
    '52000',
    '--highest-eod',
    '52000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--trials',
    '10',
];

function allArguments(extra: string[] = []): string[] {
    return [
        '--dp',
        '--store',
        '--all',
        '--user-email',
        EMAIL,
        '--eval-days',
        '2',
        ...extra,
    ];
}

function dbResponder(
    overrides: Readonly<Record<string, FakeRow[]>> = {},
): (query: IssuedQuery) => FakeRow[] {
    return tableResponder({
        [TABLES.account]: [fundedAccountRow()],
        [TABLES.dpAdvice]: [],
        [TABLES.event]: [],
        [TABLES.payout]: [],
        [TABLES.snapshot]: [fundedSnapshotRow()],
        [USER_TABLE]: [{ id: USER_ID }],
        ...overrides,
    });
}

function fundedAccountRow(overrides: FakeRow = {}): FakeRow {
    return accountRow({
        ...planColumns(mffEntry(MffuVariant.RapidEod)),
        first_funded_trade_on: '2026-08-02',
        funded_on: '2026-08-01',
        stage: 'funded',
        ...overrides,
    });
}

function fundedSnapshotRow(overrides: FakeRow = {}): FakeRow {
    return snapshotRow({
        as_of: TODAY,
        balance_cents: 5_200_000,
        highest_eod_balance_cents: 5_200_000,
        payouts_taken: 0,
        trading_days: 5,
        ...overrides,
    });
}

function insertedValue(query: IssuedQuery, column: string): unknown {
    const text = query.text;
    const columns = /^insert into "\w+" \((.*?)\) values/is
        .exec(text)?.[1]
        ?.split(',')
        .map((name) => name.trim().replaceAll('"', ''));
    const index = columns?.indexOf(column) ?? -1;
    if (index === -1) throw new Error(`no column ${column} in ${text}`);
    const tokens = /values \((.*?)\)(?:\son conflict|\sreturning|$)/is
        .exec(text)?.[1]
        ?.split(',')
        .map((token) => token.trim());
    const parameter = /^\$(\d+)$/.exec(tokens?.[index] ?? '');
    return parameter?.[1] ? query.params[Number(parameter[1]) - 1] : undefined;
}

function instantAccountTables(): Readonly<Record<string, FakeRow[]>> {
    const balanceCents = (INSTANT_ENTRY.plan.id.accountSize + 2000) * 100;
    const account = accountRow({
        ...planColumns(INSTANT_ENTRY),
        first_funded_trade_on: '2026-08-02',
        funded_on: '2026-08-01',
        stage: 'funded',
    });
    const snapshot = fundedSnapshotRow({
        balance_cents: balanceCents,
        highest_eod_balance_cents: balanceCents,
    });
    return { [TABLES.account]: [account], [TABLES.snapshot]: [snapshot] };
}

function mffEntry(variant: MffuVariant): RegistryEntry {
    const firm = findFirm(FirmId.Mffu);
    const plan = firm?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (firm === undefined || plan === undefined) {
        throw new Error(`MFF ${variant} 50K plan not found`);
    }
    return { firm, plan };
}

function planColumns(entry: RegistryEntry): FakeRow {
    const key = planKeyFields(entry);
    return {
        account_size: key.accountSize,
        firm_id: key.firmId,
        opt_ins: key.optIns,
        plan_serial: key.planSerial,
    };
}

function proAccountTables(
    overrides: FakeRow = {},
): Readonly<Record<string, FakeRow[]>> {
    const proAccount = fundedAccountRow({
        ...planColumns(mffEntry(MffuVariant.Pro)),
        id: OTHER_ACCOUNT_ID,
        ...overrides,
    });
    const proSnapshot = fundedSnapshotRow({
        account_id: OTHER_ACCOUNT_ID,
        id: OTHER_SNAPSHOT_ID,
    });
    return {
        [TABLES.account]: [fundedAccountRow(), proAccount],
        [TABLES.snapshot]: [fundedSnapshotRow(), proSnapshot],
    };
}

function propSelects(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter((query) =>
        (readTable(query) ?? '').startsWith('sadranl_prop_'),
    );
}

async function runAdvise(
    argv: string[],
    responder: (query: IssuedQuery) => FakeRow[] = tableResponder(),
): Promise<CapturedRun & { readonly queries: readonly IssuedQuery[] }> {
    const { database, queries } = createFakeDatabase(responder);
    holder.database = database;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdout.push(String(chunk));
        return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr.push(String(chunk));
        return true;
    });
    try {
        await runCommand(advise, { rawArgs: argv });
        return {
            exitCode: process.exitCode,
            queries,
            stderr: stderr.join(''),
            stdout: stdout.join(''),
        };
    } finally {
        process.exitCode = previousExitCode;
    }
}

function sameAccountTables(): Readonly<Record<string, FakeRow[]>> {
    const secondAccount = fundedAccountRow({
        id: OTHER_ACCOUNT_ID,
        label: 'Funded two',
    });
    const secondSnapshot = fundedSnapshotRow({
        account_id: OTHER_ACCOUNT_ID,
        id: OTHER_SNAPSHOT_ID,
    });
    return {
        [TABLES.account]: [fundedAccountRow(), secondAccount],
        [TABLES.snapshot]: [fundedSnapshotRow(), secondSnapshot],
    };
}

function solverCalls(): AverageRewardConfig[] {
    return vi
        .mocked(solveAverageRewardPolicy)
        .mock.calls.map(([config]) => config);
}

function storeArguments(extra: string[] = []): string[] {
    return [
        '--dp',
        '--store',
        '--account',
        IDS.account,
        '--user-email',
        EMAIL,
        '--eval-days',
        '2',
        ...extra,
    ];
}

function storedRow(configKey: string): FakeRow {
    return {
        account_id: IDS.account,
        config_key: configKey,
        created_at: new Date('2026-09-01T00:00:00Z'),
        eligible: true,
        gaps: [],
        id: IDS.dpAdvice,
        ineligible_reason: null,
        objective: 'monthly-net',
        plan_rules_fingerprint: null,
        plan_serial: planKeyFields(mffEntry(MffuVariant.RapidEod)).planSerial,
        runtime_ms: 1,
        samples: {
            kind: 'unavailable',
            reason: 'not-eligible',
            stage: 'funded',
        },
        snapshot_id: IDS.snapshot,
        solved_at: new Date('2026-09-01T00:00:00Z'),
        solver_version: DP_ADVICE_SOLVER_VERSION,
        user_id: USER_ID,
        validated: false,
        validation_ref: null,
        value_samples: [],
    };
}

function stubSolution(options: StubOptions = {}): AverageRewardSolution {
    const solution = {
        evalResult: {
            dayPolicy: { ladder: [1, 1] },
            riskAtReachedState: () => 500,
        },
        fundedResult: {
            cushionGrid: { lockedTopDollars: 10_000 },
            dayPolicy: { computeRisk: () => 400, ladder: [0, 0, 0, 0] },
            isGridSaturated: () => false,
            unconvergedLevelCount: options.unconvergedLevelCount ?? 0,
        },
        ratePerDay: 1,
        status: options.status ?? RateSearchStatus.Converged,
        trace: [],
    };
    return solution as never;
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(dpValidationFor).mockReset();
    vi.mocked(solveAverageRewardPolicy).mockReset();
    vi.mocked(solveAverageRewardPolicy).mockReturnValue(stubSolution());
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('prop advise --dp from snapshot flags (PT-30c step 14)', () => {
    it('prints the DP rows after the documented headline, labelled not validated with the gate result and the runtime', async () => {
        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            '--eval-days',
            '2',
        ]);

        expect(run.stderr).toBe('');
        expect(run.exitCode).toBeUndefined();
        const headline = run.stdout.indexOf('your documented rule');
        const dp = run.stdout.indexOf('DP advice');
        expect(headline).toBeGreaterThanOrEqual(0);
        expect(dp).toBeGreaterThan(headline);
        expect(run.stdout).toContain('not validated');
        expect(run.stdout).toContain(
            differenceReasonText({
                cause: DpNotValidatedCause.NoGateRun,
                kind: DifferenceReason.DpNotValidated,
            }),
        );
        expect(run.stdout).toMatch(/solved in \d+(\.\d+)?s/);
        expect(run.stdout).toContain('$400');
    });

    it('hands the solver the rulebook retained cushion, the effective request and FullRequestOnly', async () => {
        await runAdvise([...FUNDED_MFF_RAPID_EOD, '--dp', '--eval-days', '2']);

        const [call] = solverCalls();
        expect(solverCalls()).toHaveLength(1);
        expect(call?.fundedGrid?.minRetainedCushion).toBe(
            fundedRetainedCushionResolution(DEFAULT_RULEBOOK, 0).amount,
        );
        expect(call?.fundedGrid?.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(call?.maxSolves).toBe(12);
    });

    it('raises the retained cushion in the solver call when --retain-cushion asks for more', async () => {
        await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            '--eval-days',
            '2',
            '--retain-cushion',
            '3500',
        ]);

        expect(solverCalls()[0]?.fundedGrid?.minRetainedCushion).toBe(3500);
    });

    it('does not run the solver, and says so, when the plan is not DP-eligible', async () => {
        const instant = INSTANT_ENTRY.plan;
        const run = await runAdvise([
            '--firm',
            instant.id.firm,
            '--variant',
            'variant' in instant.id ? instant.id.variant : '',
            '--stage',
            'funded',
            '--balance',
            String(instant.id.accountSize + 2000),
            '--highest-eod',
            String(instant.id.accountSize + 2000),
            '--trading-days',
            '5',
            '--payouts',
            '0',
            '--trials',
            '10',
            '--dp',
        ]);

        expect(solverCalls()).toHaveLength(0);
        expect(run.stdout).toContain('DP advice');
        expect(run.stdout).toContain('not eligible');
    });

    it('solves in continuous dollars and says so without --stop-points', async () => {
        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            '--eval-days',
            '2',
        ]);

        expect(run.stdout).toContain('continuous dollars');
        expect(run.stdout).not.toMatch(/\(placed \$/);
        expect(solverCalls()[0]?.fundedGrid?.positionSizing).toBeNull();
    });

    it('keys the instrument and stop into both grids and prints the whole-contract placed risk with --stop-points', async () => {
        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            '--eval-days',
            '2',
            '--stop-points',
            '20',
        ]);

        const [call] = solverCalls();
        expect(call?.fundedGrid?.positionSizing).not.toBeNull();
        expect(call?.evalGrid?.positionSizing).not.toBeNull();
        expect(run.stdout).not.toContain('continuous dollars');
        expect(run.stdout).toMatch(/\(placed \$/);
    });

    it('does not solve an eval account whose plan has no validating gate run: the eval rows would be suppressed', async () => {
        const run = await runAdvise([
            ...FRESH_EVAL_MFF_RAPID_EOD,
            '--dp',
            '--eval-days',
            '2',
        ]);

        expect(run.exitCode).toBeUndefined();
        expect(solverCalls()).toHaveLength(0);
        expect(run.stdout).toContain(
            'eval DP rows are shown only for a validated plan',
        );
        expect(run.stdout).toContain('no gate run is recorded for this plan');
    });

    it('refuses a solve that did not converge: no samples are shown and the exit code is 1', async () => {
        vi.mocked(solveAverageRewardPolicy).mockReturnValue(
            stubSolution({ status: RateSearchStatus.SolveCapReached }),
        );

        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            '--eval-days',
            '2',
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.stdout).toContain(RateSearchStatus.SolveCapReached);
        expect(run.stdout).not.toContain('$400');
    });

    it.each([
        ['--json', '--json cannot be combined with --dp'],
        ['--funded-reset', '--funded-reset cannot be combined with --dp'],
        [
            '--early-withdrawal',
            '--early-withdrawal cannot be combined with --dp',
        ],
        ['--store', '--store need --account or --all'],
        ['--max-plans', '--max-plans need --account or --all'],
        ['--time-budget-min', '--time-budget-min need --account or --all'],
    ])('refuses %s with --dp on snapshot flags: %s', async (flag, message) => {
        const isValue = flag === '--max-plans' || flag === '--time-budget-min';
        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            flag,
            ...(isValue ? ['1'] : []),
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(message);
        expect(solverCalls()).toHaveLength(0);
    });

    it('refuses --user-email on snapshot flags', async () => {
        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--dp',
            '--user-email',
            EMAIL,
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('--user-email need --account or --all');
        expect(solverCalls()).toHaveLength(0);
    });

    it('refuses the DP-only flags without --dp', async () => {
        const run = await runAdvise([
            ...FUNDED_MFF_RAPID_EOD,
            '--iterations',
            '3',
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('--dp');
    });
});

describe('prop advise --dp --store (PT-30c step 14, the DB write path)', () => {
    it('resolves the user by email, loads the account and the latest snapshot scoped by that user, and inserts one row with that user id', async () => {
        const run = await runAdvise(storeArguments(), dbResponder());

        expect(run.stderr).toBe('');
        expect(run.exitCode).toBeUndefined();
        const userLookup = run.queries.find(
            (query) => readTable(query) === USER_TABLE,
        );
        expect(userLookup?.text).toMatch(
            /lower\("sadranl_user"\."email"\) = \$1/,
        );
        expect(userLookup?.params[0]).toBe(EMAIL.toLowerCase());
        const selects = propSelects(run.queries);
        expect(selects.length).toBeGreaterThan(0);
        for (const select of selects) assertUserScopedWhere(select, USER_ID);
        const snapshotChecks = selects.filter(
            (query) =>
                readTable(query) === TABLES.snapshot &&
                query.params.includes(IDS.snapshot),
        );
        expect(snapshotChecks.length).toBeGreaterThan(0);
        const inserts = insertsInto(run.queries, TABLES.dpAdvice);
        expect(inserts).toHaveLength(1);
        const [insert] = inserts;
        if (insert === undefined) throw new Error('no insert');
        assertInsertedForUser(insert, USER_ID);
        expect(insertedValue(insert, 'account_id')).toBe(IDS.account);
        expect(insertedValue(insert, 'snapshot_id')).toBe(IDS.snapshot);
        expect(insertedValue(insert, 'eligible')).toBe(true);
        expect(insertedValue(insert, 'validated')).toBe(false);
        expect(insertedValue(insert, 'validation_ref')).toBeNull();
        expect(insertedValue(insert, 'solver_version')).toBe(
            DP_ADVICE_SOLVER_VERSION,
        );
        expect(String(insertedValue(insert, 'config_key'))).toMatch(
            /^[0-9a-f]{64}$/,
        );
        expect(JSON.stringify(insertedValue(insert, 'gaps'))).toContain(
            DpAdviceGap.DayStopRuleNotModeled,
        );
        expect(insertedValue(insert, 'gate_failure')).toBe(
            DpGateFailureCode.NoGateRun,
        );
        expect(insertedValue(insert, 'gate_result')).toBeNull();
        expect(insertedValue(insert, 'assumed_instrument')).toBeNull();
        expect(insertedValue(insert, 'assumed_stop_points')).toBeNull();
        expect(run.stdout).toMatch(/solved in \d+(\.\d+)?s/);
        expect(run.stdout).toContain('stored');
        expect(run.stdout).not.toContain(USER_ID);
    });

    it.each([
        [
            ['--dp', '--store', '--user-email', EMAIL],
            '--store, --user-email need --account or --all',
        ],
        [
            ['--dp', '--store', '--account', IDS.account],
            '--account and --all need --user-email',
        ],
        [
            ['--dp', '--account', IDS.account],
            '--account and --all need --user-email',
        ],
        [
            [...storeArguments(), '--balance', '1'],
            '--balance cannot be combined with --account or --all',
        ],
        [
            [...storeArguments(), '--firm', 'mffu'],
            '--firm cannot be combined with --account or --all',
        ],
        [
            [...storeArguments(), '--rr', '3'],
            '--rr cannot be combined with --account or --all',
        ],
        [
            [...storeArguments(), '--max-plans', '1'],
            '--max-plans bound --all only',
        ],
        [
            [...storeArguments(), '--all'],
            '--account and --all cannot be combined',
        ],
        [
            ['--dp', '--account', 'not-a-uuid', '--user-email', EMAIL],
            '--account must be an account id',
        ],
        [
            ['--dp', '--account', IDS.account, '--user-email', 'nobody'],
            '--user-email must be an email address',
        ],
    ])('refuses %j: %s', async (argv, message) => {
        const run = await runAdvise(argv, dbResponder());

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(message);
        expect(insertsInto(run.queries, TABLES.dpAdvice)).toHaveLength(0);
        expect(propSelects(run.queries)).toHaveLength(0);
        expect(solverCalls()).toHaveLength(0);
    });

    it('fails on an unknown email without touching any account', async () => {
        const run = await runAdvise(
            storeArguments(),
            dbResponder({ [USER_TABLE]: [] }),
        );

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('No user found');
        expect(
            run.queries.some((query) => readTable(query) === USER_TABLE),
        ).toBe(true);
        expect(propSelects(run.queries)).toHaveLength(0);
        expect(solverCalls()).toHaveLength(0);
    });

    it('fails on an account id the user does not own: no solve, no insert', async () => {
        const run = await runAdvise(
            storeArguments(),
            dbResponder({ [TABLES.account]: [] }),
        );

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('Account not found');
        expect(solverCalls()).toHaveLength(0);
        expect(insertsInto(run.queries, TABLES.dpAdvice)).toHaveLength(0);
        expect(propSelects(run.queries).length).toBeGreaterThan(0);
        for (const select of propSelects(run.queries)) {
            assertUserScopedWhere(select, USER_ID);
        }
    });

    it('stores the instrument and stop the solve assumed when --stop-points places risk in whole contracts', async () => {
        const run = await runAdvise(
            storeArguments(['--instrument', 'MNQ', '--stop-points', '12.5']),
            dbResponder(),
        );

        expect(run.exitCode, run.stderr).toBeUndefined();
        const [insert] = insertsInto(run.queries, TABLES.dpAdvice);
        if (insert === undefined) throw new Error('no insert');
        expect(insertedValue(insert, 'assumed_instrument')).toBe(
            InstrumentSymbol.MNQ,
        );
        expect(insertedValue(insert, 'assumed_stop_points')).toBe(12.5);
    });

    it('stores the gate failure and its result text for a plan whose gate run fell below the best flat policy, and prints them', async () => {
        vi.mocked(dpValidationFor).mockReturnValue({
            citation: {
                date: '2026-10-05',
                file: 'engine-results/dp-gate.md',
                row: 'row-3',
            },
            failure: DpGateFailure.BelowBestFlat,
            result: '0.99x best flat (credit-free)',
            validated: false,
        });

        const run = await runAdvise(storeArguments(), dbResponder());

        expect(run.exitCode, run.stderr).toBeUndefined();
        const [insert] = insertsInto(run.queries, TABLES.dpAdvice);
        if (insert === undefined) throw new Error('no insert');
        expect(insertedValue(insert, 'validated')).toBe(false);
        expect(insertedValue(insert, 'gate_failure')).toBe(
            DpGateFailureCode.BelowBestFlat,
        );
        expect(insertedValue(insert, 'gate_result')).toBe(
            '0.99x best flat (credit-free)',
        );
        expect(run.stdout).toContain(
            'the gate run is below the best flat policy: 0.99x best flat (credit-free)',
        );
    });

    it('stores no gate failure, result, instrument or stop for an ineligible plan', async () => {
        const ineligible = await runAdvise(
            storeArguments(),
            dbResponder(instantAccountTables()),
        );
        const [ineligibleInsert] = insertsInto(
            ineligible.queries,
            TABLES.dpAdvice,
        );
        if (ineligibleInsert === undefined) throw new Error('no insert');
        expect(insertedValue(ineligibleInsert, 'gate_failure')).toBeNull();
        expect(insertedValue(ineligibleInsert, 'gate_result')).toBeNull();
        expect(
            insertedValue(ineligibleInsert, 'assumed_instrument'),
        ).toBeNull();
    });

    it('stores an ineligible plan as an ineligible row with its reason and never solves it', async () => {
        const responder = dbResponder(instantAccountTables());

        const run = await runAdvise(storeArguments(), responder);

        expect(run.exitCode).toBeUndefined();
        expect(solverCalls(), run.stdout).toHaveLength(0);
        const [insert] = insertsInto(run.queries, TABLES.dpAdvice);
        if (insert === undefined) throw new Error('no insert');
        expect(insertedValue(insert, 'eligible')).toBe(false);
        expect(String(insertedValue(insert, 'ineligible_reason'))).toContain(
            'instant-funded',
        );
        expect(insertedValue(insert, 'runtime_ms')).toBe(0);
    });

    it('reports a solver failure by name, stores nothing and exits 1', async () => {
        vi.mocked(solveAverageRewardPolicy).mockImplementation(() => {
            throw new Error('the funded grid is too large');
        });

        const run = await runAdvise(storeArguments(), dbResponder());

        expect(run.exitCode).toBe(1);
        expect(run.stdout).toContain('the funded grid is too large');
        expect(insertsInto(run.queries, TABLES.dpAdvice)).toHaveLength(0);
    });

    it('does not store a solve that did not converge, and exits 1', async () => {
        vi.mocked(solveAverageRewardPolicy).mockReturnValue(
            stubSolution({ unconvergedLevelCount: 2 }),
        );

        const run = await runAdvise(storeArguments(), dbResponder());

        expect(run.exitCode).toBe(1);
        expect(insertsInto(run.queries, TABLES.dpAdvice)).toHaveLength(0);
        expect(run.stdout).toContain('2 unconverged');
    });

    it('skips a row that is already stored for the same snapshot, config key and solver version', async () => {
        const first = await runAdvise(storeArguments(), dbResponder());
        const [firstInsert] = insertsInto(first.queries, TABLES.dpAdvice);
        if (firstInsert === undefined) throw new Error('no first insert');
        const configKey = String(insertedValue(firstInsert, 'config_key'));
        vi.mocked(solveAverageRewardPolicy).mockClear();

        const second = await runAdvise(
            storeArguments(),
            dbResponder({ [TABLES.dpAdvice]: [storedRow(configKey)] }),
        );

        expect(second.exitCode).toBeUndefined();
        expect(solverCalls()).toHaveLength(0);
        expect(insertsInto(second.queries, TABLES.dpAdvice)).toHaveLength(0);
        expect(second.stdout).toContain('already stored');
    });
});

describe('prop advise --dp --store --all (PT-30c step 14)', () => {
    it('solves once for two accounts with the same config key and inserts a row for each', async () => {
        const run = await runAdvise(
            allArguments(),
            dbResponder(sameAccountTables()),
        );

        expect(run.exitCode).toBeUndefined();
        expect(solverCalls()).toHaveLength(1);
        const inserts = insertsInto(run.queries, TABLES.dpAdvice);
        expect(inserts).toHaveLength(2);
        const accountIds = inserts.map((insert) =>
            String(insertedValue(insert, 'account_id')),
        );
        expect(accountIds.toSorted((a, b) => a.localeCompare(b))).toEqual(
            [IDS.account, OTHER_ACCOUNT_ID].toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
        const keys = new Set(
            inserts.map((insert) => insertedValue(insert, 'config_key')),
        );
        expect(keys.size).toBe(1);
        for (const insert of inserts) assertInsertedForUser(insert, USER_ID);
    });

    it('writes the first row before the second solve starts', async () => {
        const order: string[] = [];
        vi.mocked(solveAverageRewardPolicy).mockImplementation(() => {
            order.push('solve');
            return stubSolution();
        });
        const responder = dbResponder(proAccountTables());
        const wrapped = (query: IssuedQuery): FakeRow[] => {
            if (query.text.startsWith(`insert into "${TABLES.dpAdvice}"`)) {
                order.push('insert');
            }
            return responder(query);
        };

        await runAdvise(allArguments(), wrapped);

        expect(order).toEqual(['solve', 'insert', 'solve', 'insert']);
    });

    it('bounds the plans solved by --max-plans and says which accounts were left out', async () => {
        const responder = dbResponder(
            proAccountTables({ label: 'Funded Pro' }),
        );

        const run = await runAdvise(
            allArguments(['--max-plans', '1']),
            responder,
        );

        expect(solverCalls()).toHaveLength(1);
        expect(insertsInto(run.queries, TABLES.dpAdvice)).toHaveLength(1);
        expect(run.stdout).toContain('Funded Pro');
        expect(run.stdout).toContain('budget');
    });

    it('stops starting solves once --time-budget-min has elapsed', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.mocked(solveAverageRewardPolicy).mockImplementation(() => {
            vi.setSystemTime(Date.now() + 90_000);
            return stubSolution();
        });
        const responder = dbResponder(proAccountTables());

        const run = await runAdvise(
            allArguments(['--time-budget-min', '1']),
            responder,
        );

        expect(solverCalls()).toHaveLength(1);
        expect(insertsInto(run.queries, TABLES.dpAdvice)).toHaveLength(1);
        expect(run.stdout).toContain('budget');
    });

    it('scopes every prop read by the resolved user', async () => {
        const run = await runAdvise(
            allArguments(),
            dbResponder(sameAccountTables()),
        );

        expect(propSelects(run.queries).length).toBeGreaterThan(0);
        for (const select of propSelects(run.queries)) {
            assertUserScopedWhere(select, USER_ID);
        }
    });
});
