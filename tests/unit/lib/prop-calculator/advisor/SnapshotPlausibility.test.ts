import { describe, expect, expectTypeOf, it } from 'vitest';
import { type z } from 'zod';

import { DashboardBalanceConvention as AccountsDashboardBalanceConvention } from '~/lib/prop-accounts';
import {
    AlphaFuturesVariant,
    ApexVariant,
    computeTopStepLiveStartingBalance,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fundedResetsBeforeFirstPayout,
    LucidVariant,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    StaticDrawdown,
    TopStepVariant,
    TradingPhase,
    withFundedResetTaken,
} from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    accountSnapshotInputSchema,
    assertPlausibleSnapshot,
    AssumptionBias,
    AssumptionKind,
    assumptionSchema,
    DashboardBalanceConvention,
    ImplausibleSnapshotError,
    inputAssumption,
    nominalBalanceOf,
    SizingAssumption,
    sizingRuleAssumption,
    SizingStage,
    snapshotDraftIssues,
    SnapshotInputField,
    snapshotInputIssues,
    SnapshotIssueSeverity,
    type SnapshotPlausibilityIssue,
    SnapshotPlausibilityIssueKind,
} from '~/lib/prop-calculator/advisor';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

type InputOverrides = Partial<z.input<typeof accountSnapshotInputSchema>>;

const ACCOUNT_SIZE = 50_000;

const EM_DASH = String.fromCodePoint(0x20_14);

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const apexEod = registryPlan({
    accountSize: ACCOUNT_SIZE,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const apexIntraday = registryPlan({
    accountSize: ACCOUNT_SIZE,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});
const alphaStandard = registryPlan({
    accountSize: ACCOUNT_SIZE,
    firm: FirmId.AlphaFutures,
    variant: AlphaFuturesVariant.Standard,
});
const alphaWithReset = withFundedResetTaken(alphaStandard, true);
const topStepXfa = registryPlan({
    accountSize: ACCOUNT_SIZE,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});
const topStepProAccount = registryPlan({
    accountSize: ACCOUNT_SIZE,
    firm: FirmId.TopStep,
    variant: TopStepVariant.ProAccount,
});
const lucidPro = registryPlan({
    accountSize: ACCOUNT_SIZE,
    firm: FirmId.Lucid,
    variant: LucidVariant.Pro,
});
const tighterFundedDrawdown = apexEod.withOverrides({
    fundedDrawdown: new EodTrailingDrawdown({ amount: dollars(1500) }),
});
const widerFundedDrawdown = apexEod.withOverrides({
    fundedDrawdown: new EodTrailingDrawdown({ amount: dollars(2500) }),
});
const staticFunded = apexEod.withOverrides({
    fundedDrawdown: new StaticDrawdown({ amount: dollars(2000) }),
});
const locksOnPayout = apexEod.withOverrides({
    payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
});

const APEX_FUNDED_DRAWDOWN = apexEod.drawdownFor(TradingPhase.Funded);
const APEX_FUNDED_LOCK_PROFIT = APEX_FUNDED_DRAWDOWN.lock?.atProfit ?? null;
const APEX_EVAL_STARTING_FLOOR = apexEod
    .drawdownFor(TradingPhase.Eval)
    .initialThreshold(apexEod.accountSize);
const TOPSTEP_DOCUMENTED_LIVE_START = computeTopStepLiveStartingBalance(
    dollars(ACCOUNT_SIZE),
    dollars(ACCOUNT_SIZE),
);

const BASE_FUNDED_INPUT = {
    asOf: '2026-09-25',
    balance: 52_400,
    dashboardConvention: DashboardBalanceConvention.Nominal,
    highestEodBalance: 53_000,
    payoutsTaken: 0,
    stage: SizingStage.Funded,
    tradingDays: 12,
};

const PRE_LOCK_WIDE_FLOOR = {
    balance: 51_000,
    dashboardFloor: 48_500,
    highestEodBalance: 51_500,
};

const EVERYTHING_WRONG: InputOverrides = {
    balance: 2400,
    dashboardFloor: -2000,
    fundedResetsUsed: 1,
    highestEodBalance: 2000,
    highestIntradayBalance: 1900,
};

const FULL_INPUT = {
    asOf: '2026-09-25',
    balance: 52_400,
    balanceAtLastPayout: 53_100,
    cumulativePayout: 900,
    cycleBestDayProfit: 400,
    dashboardConvention: DashboardBalanceConvention.Nominal,
    dashboardFloor: 50_100,
    elapsedDaysSinceAttemptStart: 6,
    evalBestDayProfit: 1200,
    firstFundedTradeOn: '2026-08-03',
    floorAtLastPayout: 50_100,
    fundedOn: '2026-08-01',
    fundedResetsUsed: 0,
    highestEodBalance: 53_100,
    highestIntradayBalance: 53_350.5,
    lastPayoutOn: '2026-09-10',
    lastTradedOn: '2026-09-25',
    liveStartBalance: 0,
    payoutsTaken: 1,
    pendingPayouts: 0,
    purchasedOn: '2026-07-01',
    qualifyingDaysSinceLastPayout: 4,
    stage: SizingStage.Funded,
    tradingDays: 18,
};

const EXPECTED_ASSUMPTION_KINDS = [
    'CalendarAnchorMissing',
    'ContractCapInstrumentAssumed',
    'CumulativeQualifyingDaysAssumed',
    'CycleBestDayProfitAssumedWorstCase',
    'DashboardFloorMismatch',
    'ElapsedDaysApproximatedFromTradingDays',
    'FundedResetsFromEvents',
    'GrossOnlyPayouts',
    'LastPayoutBalanceAssumedCurrent',
    'LiveModelApproximation',
    'LiveNotModeled',
    'LiveTriggersNotChecked',
    'NoHolidayCalendar',
    'PeakOrderAssumed',
    'PendingPayoutDeducted',
    'PercentCandidatesLeftOut',
    'PositionSizingUnspecified',
    'RebuyLagAssumed',
    'SizingRule',
    'TopStepLfaProgressDefaulted',
    'TopStepLiveReserveDefaulted',
];

function balanceKindsFor(
    plan: Plan,
    overrides: InputOverrides,
): SnapshotPlausibilityIssueKind[] {
    return issuesFor(plan, overrides)
        .filter((issue) => issue.field === SnapshotInputField.Balance)
        .map((issue) => issue.kind);
}

function evalAt(balance: number): InputOverrides {
    return {
        balance,
        highestEodBalance: 50_000,
        payoutsTaken: undefined,
        stage: SizingStage.Eval,
    };
}

function issuesFor(
    plan: Plan,
    overrides: InputOverrides = {},
): readonly SnapshotPlausibilityIssue[] {
    return snapshotInputIssues(plan, snapshot(overrides));
}

function kindsFor(
    plan: Plan,
    overrides: InputOverrides = {},
): SnapshotPlausibilityIssueKind[] {
    return issuesFor(plan, overrides).map((issue) => issue.kind);
}

function liveOverrides(liveStartBalance: number): InputOverrides {
    return {
        balance: 10_500,
        highestEodBalance: 10_800,
        liveStartBalance,
        stage: SizingStage.Live,
    };
}

function snapshot(overrides: InputOverrides = {}): AccountSnapshotInput {
    return accountSnapshotInputSchema.parse({
        ...BASE_FUNDED_INPUT,
        ...overrides,
    });
}

function sorted(values: readonly string[]): string[] {
    return values.toSorted((left, right) => left.localeCompare(right));
}

function thrownBy(run: () => void): unknown {
    try {
        run();
    } catch (error) {
        return error;
    }
    return null;
}

describe('AccountSnapshotInput (F-106)', () => {
    it('parses a full snapshot whose keys are exactly the SnapshotInputField members', () => {
        const parsed = accountSnapshotInputSchema.parse(FULL_INPUT);

        expect(parsed).toEqual(FULL_INPUT);
        expect(sorted(Object.keys(parsed))).toEqual(
            sorted(Object.values(SnapshotInputField)),
        );
    });

    it('names every input key by a SnapshotInputField member at the type level', () => {
        expectTypeOf<`${SnapshotInputField}`>().toEqualTypeOf<
            keyof AccountSnapshotInput
        >();
    });

    it('is plain data that survives structuredClone, so worker messages can carry it', () => {
        const parsed = accountSnapshotInputSchema.parse(FULL_INPUT);

        expect(structuredClone(parsed)).toEqual(parsed);
    });

    it('requires only the snapshot date, balance, convention and stage; every extra is optional', () => {
        const minimal = {
            asOf: '2026-09-25',
            balance: 2400,
            dashboardConvention: DashboardBalanceConvention.ZeroBased,
            stage: SizingStage.Eval,
        };

        expect(accountSnapshotInputSchema.parse(minimal)).toEqual(minimal);
        for (const key of Object.keys(minimal)) {
            const rest = Object.fromEntries(
                Object.entries(minimal).filter(([name]) => name !== key),
            );
            expect(accountSnapshotInputSchema.safeParse(rest).success).toBe(
                false,
            );
        }
    });

    it.each([
        ['a snapshot date that is not an ISO date', { asOf: '2026-13-01' }],
        ['a fractional trading day count', { tradingDays: 3.5 }],
        ['a negative payout count', { payoutsTaken: -1 }],
        ['a negative funded reset count', { fundedResetsUsed: -1 }],
        ['a negative cumulative payout', { cumulativePayout: -1 }],
        ['a negative pending payout sum', { pendingPayouts: -0.01 }],
        ['a negative live start balance', { liveStartBalance: -100 }],
        ['a non-finite balance', { balance: Infinity }],
        ['an unknown stage', { stage: 'challenge' }],
        ['an unknown key', { balanceCents: 5_240_000 }],
    ])('rejects %s', (_name, overrides) => {
        const result = accountSnapshotInputSchema.safeParse({
            ...FULL_INPUT,
            ...overrides,
        });

        expect(result.success).toBe(false);
    });
});

describe('DashboardBalanceConvention lives in the advisor', () => {
    it('is the same enum object prop-accounts re-exports', () => {
        expect(AccountsDashboardBalanceConvention).toBe(
            DashboardBalanceConvention,
        );
    });

    it.each([
        [DashboardBalanceConvention.Nominal, 52_400, 52_400],
        [DashboardBalanceConvention.ZeroBased, 2400, 52_400],
        [DashboardBalanceConvention.ZeroBased, -1250.5, 48_749.5],
    ])(
        'reads a %s amount of %d as a nominal %d',
        (convention, amount, nominal) => {
            const read = nominalBalanceOf(
                dollars(amount),
                convention,
                dollars(ACCOUNT_SIZE),
            );

            expect(read).toBe(nominal);
        },
    );
});

describe('Assumption model (F-106)', () => {
    it('declares every assumption kind up front (PD-42)', () => {
        expect(sorted(Object.keys(AssumptionKind))).toEqual(
            sorted(EXPECTED_ASSUMPTION_KINDS),
        );
    });

    it('builds an input assumption with its bias', () => {
        expect(
            inputAssumption(
                AssumptionKind.PeakOrderAssumed,
                AssumptionBias.Conservative,
            ),
        ).toEqual({
            bias: AssumptionBias.Conservative,
            kind: AssumptionKind.PeakOrderAssumed,
        });
    });

    it('wraps a documented-rule SizingAssumption in the SizingRule kind', () => {
        expect(
            sizingRuleAssumption(
                SizingAssumption.NoCommission,
                AssumptionBias.Optimistic,
            ),
        ).toEqual({
            bias: AssumptionBias.Optimistic,
            kind: AssumptionKind.SizingRule,
            sizingAssumption: SizingAssumption.NoCommission,
        });
    });

    it('validates assumptions at a boundary and survives structuredClone', () => {
        const assumptions = [
            inputAssumption(
                AssumptionKind.LiveTriggersNotChecked,
                AssumptionBias.Optimistic,
            ),
            sizingRuleAssumption(
                SizingAssumption.WinsAddNoLossRoom,
                AssumptionBias.Conservative,
            ),
        ];

        for (const assumption of assumptions) {
            const cloned: unknown = structuredClone(assumption);
            expect(assumptionSchema.parse(cloned)).toEqual(assumption);
        }
    });

    it.each([
        [
            'a SizingRule assumption without its SizingAssumption',
            { bias: AssumptionBias.Neutral, kind: AssumptionKind.SizingRule },
        ],
        [
            'an input assumption carrying a SizingAssumption',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.GrossOnlyPayouts,
                sizingAssumption: SizingAssumption.NoCommission,
            },
        ],
        [
            'an unknown bias',
            { bias: 'hopeful', kind: AssumptionKind.GrossOnlyPayouts },
        ],
    ])('rejects %s', (_name, candidate) => {
        expect(assumptionSchema.safeParse(candidate).success).toBe(false);
    });

    it('refuses to build an input assumption of the SizingRule kind', () => {
        expect(() =>
            inputAssumption(
                AssumptionKind.SizingRule as never,
                AssumptionBias.Neutral,
            ),
        ).toThrow(/SizingRule/);
    });
});

describe('SnapshotPlausibility: dashboard convention mix-ups (F-140, PD-15)', () => {
    it('flags a nominal 2,400 on a 50K account as a likely $0-based balance, on the balance field', () => {
        const issues = issuesFor(apexEod, {
            balance: 2400,
            highestEodBalance: 3000,
        });

        expect(issues).toEqual([
            {
                field: SnapshotInputField.Balance,
                kind: SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                message: expect.stringContaining('$0-based') as string,
                severity: SnapshotIssueSeverity.Unlikely,
            },
            {
                field: SnapshotInputField.HighestEodBalance,
                kind: SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                message: expect.stringContaining('$3,000') as string,
                severity: SnapshotIssueSeverity.Unlikely,
            },
        ]);
        expect(issues[0]?.message).toContain('$2,400');
        expect(issues[0]?.message).toContain('$48,000');
    });

    it.each([
        [
            'a balance at the last payout typed $0-based',
            { balanceAtLastPayout: 3100, payoutsTaken: 1 },
            DashboardBalanceConvention.Nominal,
            SnapshotInputField.BalanceAtLastPayout,
            SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
        ],
        [
            'a highest intraday balance typed $0-based',
            { highestIntradayBalance: 3350 },
            DashboardBalanceConvention.Nominal,
            SnapshotInputField.HighestIntradayBalance,
            SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
        ],
        [
            'a highest EOD balance typed nominal',
            { balance: 2400, highestEodBalance: 53_000 },
            DashboardBalanceConvention.ZeroBased,
            SnapshotInputField.HighestEodBalance,
            SnapshotPlausibilityIssueKind.BalanceLooksNominal,
        ],
        [
            'a balance at the last payout typed nominal',
            {
                balance: 2400,
                balanceAtLastPayout: 53_100,
                highestEodBalance: 3000,
                payoutsTaken: 1,
            },
            DashboardBalanceConvention.ZeroBased,
            SnapshotInputField.BalanceAtLastPayout,
            SnapshotPlausibilityIssueKind.BalanceLooksNominal,
        ],
    ])(
        'runs the same convention check on %s',
        (_name, overrides: InputOverrides, convention, field, kind) => {
            const issues = issuesFor(apexEod, {
                ...overrides,
                dashboardConvention: convention,
            });

            expect(
                issues
                    .filter(
                        (issue) =>
                            issue.kind ===
                                SnapshotPlausibilityIssueKind.BalanceLooksNominal ||
                            issue.kind ===
                                SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                    )
                    .map((issue) => [issue.field, issue.kind, issue.severity]),
            ).toEqual([[field, kind, SnapshotIssueSeverity.Unlikely]]);
        },
    );

    it('flags a $0-based 52,400 on a 50K account as a likely nominal balance, on the balance field', () => {
        const issues = issuesFor(apexEod, {
            dashboardConvention: DashboardBalanceConvention.ZeroBased,
        });

        expect(issues).toEqual([
            {
                field: SnapshotInputField.Balance,
                kind: SnapshotPlausibilityIssueKind.BalanceLooksNominal,
                message: expect.stringContaining('nominal') as string,
                severity: SnapshotIssueSeverity.Unlikely,
            },
            {
                field: SnapshotInputField.HighestEodBalance,
                kind: SnapshotPlausibilityIssueKind.BalanceLooksNominal,
                message: expect.stringContaining('$103,000') as string,
                severity: SnapshotIssueSeverity.Unlikely,
            },
        ]);
        expect(issues[0]?.message).toContain('$102,400');
    });

    it('uses the stage drawdown for the starting floor: the eval floor on an eval snapshot', () => {
        expect(APEX_EVAL_STARTING_FLOOR).toBe(48_000);
        expect(kindsFor(apexEod, evalAt(APEX_EVAL_STARTING_FLOOR))).toEqual([
            SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
        ]);
        expect(
            issuesFor(apexEod, evalAt(APEX_EVAL_STARTING_FLOOR + 0.02)),
        ).toEqual([]);
    });

    it.each([
        [
            'tighter',
            tighterFundedDrawdown,
            48_200,
            [],
            [SnapshotPlausibilityIssueKind.BalanceLooksZeroBased],
        ],
        [
            'wider',
            widerFundedDrawdown,
            47_800,
            [SnapshotPlausibilityIssueKind.BalanceLooksZeroBased],
            [],
        ],
    ])(
        'reads the starting floor of the snapshot stage when the funded drawdown is %s than the eval one',
        (_name, plan, balance, evalKinds, fundedKinds) => {
            expect(plan.drawdownFor(TradingPhase.Eval).amount).not.toBe(
                plan.drawdownFor(TradingPhase.Funded).amount,
            );
            expect(balanceKindsFor(plan, evalAt(balance))).toEqual(evalKinds);
            expect(
                balanceKindsFor(plan, {
                    balance,
                    highestEodBalance: 50_000,
                    stage: SizingStage.Funded,
                }),
            ).toEqual(fundedKinds);
        },
    );

    it.each([
        ['a nominal funded state', {}],
        [
            'a $0-based funded state after the lock',
            {
                balance: 2400,
                dashboardConvention: DashboardBalanceConvention.ZeroBased,
                dashboardFloor: 100,
                highestEodBalance: 3000,
            },
        ],
        [
            'a $0-based funded state in a drawdown',
            {
                balance: -1500,
                dashboardConvention: DashboardBalanceConvention.ZeroBased,
                highestEodBalance: 0,
            },
        ],
    ])('passes %s', (_name, overrides: InputOverrides) => {
        expect(issuesFor(apexEod, overrides)).toEqual([]);
    });

    it('flags a nominal funded balance more than the account size above it, on every balance field it appears in', () => {
        const issues = issuesFor(apexEod, {
            balance: 102_400,
            highestEodBalance: 102_400,
        });

        expect(
            issues.map((issue) => [issue.field, issue.kind, issue.severity]),
        ).toEqual([
            [
                SnapshotInputField.Balance,
                SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
                SnapshotIssueSeverity.Unlikely,
            ],
            [
                SnapshotInputField.HighestEodBalance,
                SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
                SnapshotIssueSeverity.Unlikely,
            ],
        ]);
        expect(issues[0]?.message).toContain('$102,400');
        expect(issues[0]?.message).toContain('$50,000');
        expect(
            issuesFor(apexEod, {
                balance: 100_000,
                highestEodBalance: 100_000,
            }),
        ).toEqual([]);
    });

    it('caps an eval balance at the profit target plus one drawdown above the account size', () => {
        const ceiling =
            apexEod.accountSize +
            apexEod.profitTarget +
            apexEod.drawdownFor(TradingPhase.Eval).amount;

        expect(ceiling).toBe(55_000);
        expect(
            issuesFor(apexEod, {
                ...evalAt(ceiling),
                highestEodBalance: ceiling,
            }),
        ).toEqual([]);
        expect(
            balanceKindsFor(apexEod, {
                ...evalAt(ceiling + 1),
                highestEodBalance: ceiling + 1,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize]);
    });

    it('applies the same ceiling to a $0-based amount after the convention shift', () => {
        expect(
            balanceKindsFor(apexEod, {
                ...evalAt(10_000),
                dashboardConvention: DashboardBalanceConvention.ZeroBased,
                highestEodBalance: 10_000,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize]);
    });

    it('applies no account-size convention check to a live snapshot', () => {
        expect(
            issuesFor(apexEod, {
                balance: 2400,
                highestEodBalance: 3000,
                stage: SizingStage.Live,
            }),
        ).toEqual([]);
    });
});

describe('SnapshotPlausibility: peaks', () => {
    it('flags a highest EOD balance more than a cent below the balance', () => {
        expect(issuesFor(apexEod, { highestEodBalance: 52_399.98 })).toEqual([
            {
                field: SnapshotInputField.HighestEodBalance,
                kind: SnapshotPlausibilityIssueKind.HighestEodBelowBalance,
                message: expect.stringContaining('$52,399.98') as string,
                severity: SnapshotIssueSeverity.Impossible,
            },
        ]);
    });

    it('treats the snapshot balance as the end-of-day close of the snapshot date and says so', () => {
        const [issue] = issuesFor(apexEod, { highestEodBalance: 51_000 });

        expect(issue?.kind).toBe(
            SnapshotPlausibilityIssueKind.HighestEodBelowBalance,
        );
        expect(issue?.message).toContain(
            'end-of-day close of the snapshot date',
        );
    });

    it('tells the user the balance is a close when an EOD cushion check fails', () => {
        const [issue] = issuesFor(apexEod, PRE_LOCK_WIDE_FLOOR);

        expect(issue?.message).toContain(
            'end-of-day close of the snapshot date',
        );
    });

    it('accepts a highest EOD balance within a cent of the balance', () => {
        expect(issuesFor(apexEod, { highestEodBalance: 52_399.99 })).toEqual(
            [],
        );
    });

    it.each([
        ['the highest EOD balance', { highestIntradayBalance: 52_900 }],
        [
            'the balance',
            {
                highestEodBalance: undefined,
                highestIntradayBalance: 52_300,
            },
        ],
    ])(
        'flags a highest intraday balance below %s',
        (_name, overrides: InputOverrides) => {
            expect(issuesFor(apexIntraday, overrides)).toEqual([
                {
                    field: SnapshotInputField.HighestIntradayBalance,
                    kind: SnapshotPlausibilityIssueKind.HighestIntradayBelowClose,
                    message: expect.any(String) as string,
                    severity: SnapshotIssueSeverity.Impossible,
                },
            ]);
        },
    );

    it('accepts a highest intraday balance at or above every close', () => {
        expect(
            issuesFor(apexIntraday, { highestIntradayBalance: 53_000 }),
        ).toEqual([]);
    });
});

describe('SnapshotPlausibility: pre-lock trailing cushion', () => {
    it('reads the Apex 50K funded drawdown and lock trigger from the plan', () => {
        expect(APEX_FUNDED_DRAWDOWN.amount).toBe(2000);
        expect(APEX_FUNDED_LOCK_PROFIT).toBe(2100);
    });

    it('flags a dashboard floor that leaves a cushion above the drawdown before the lock', () => {
        const issues = issuesFor(apexEod, PRE_LOCK_WIDE_FLOOR);

        expect(issues).toEqual([
            {
                field: SnapshotInputField.DashboardFloor,
                kind: SnapshotPlausibilityIssueKind.CushionAboveDrawdown,
                message: expect.stringContaining('$2,500') as string,
                severity: SnapshotIssueSeverity.Impossible,
            },
        ]);
        expect(issues[0]?.message).toContain('$2,000');
    });

    it('measures the cushion the same way in the $0-based convention', () => {
        expect(
            kindsFor(apexEod, {
                balance: 1000,
                dashboardConvention: DashboardBalanceConvention.ZeroBased,
                dashboardFloor: -1500,
                highestEodBalance: 1500,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.CushionAboveDrawdown]);
    });

    it('accepts a pre-lock cushion at the drawdown within a cent', () => {
        expect(
            issuesFor(apexEod, {
                ...PRE_LOCK_WIDE_FLOOR,
                dashboardFloor: 48_999.99,
            }),
        ).toEqual([]);
    });

    it('accepts a large cushion once the peak reached the lock trigger', () => {
        const highestEod = 52_500;

        expect(highestEod - apexEod.accountSize).toBeGreaterThanOrEqual(
            APEX_FUNDED_LOCK_PROFIT ?? Infinity,
        );
        expect(
            issuesFor(apexEod, {
                dashboardFloor: 50_100,
                highestEodBalance: highestEod,
            }),
        ).toEqual([]);
    });

    it('accepts a large cushion after a payout on a plan whose payout locks the floor', () => {
        const afterPayout = { ...PRE_LOCK_WIDE_FLOOR, payoutsTaken: 1 };

        expect(issuesFor(locksOnPayout, afterPayout)).toEqual([]);
        expect(kindsFor(apexEod, afterPayout)).toEqual([
            SnapshotPlausibilityIssueKind.CushionAboveDrawdown,
        ]);
    });

    it('checks an intraday plan against the highest intraday balance and skips it when that peak is unknown', () => {
        const intraday = {
            balance: 51_000,
            dashboardFloor: 48_500,
            highestEodBalance: 51_000,
        };

        expect(
            kindsFor(apexIntraday, {
                ...intraday,
                highestIntradayBalance: 51_700,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.CushionAboveDrawdown]);
        expect(issuesFor(apexIntraday, intraday)).toEqual([]);
    });

    it('never applies the trailing check to a static drawdown', () => {
        expect(
            issuesFor(staticFunded, {
                ...PRE_LOCK_WIDE_FLOOR,
                dashboardFloor: 48_000,
            }),
        ).toEqual([]);
    });
});

describe('SnapshotPlausibility: floors (F-140)', () => {
    const lockedAfterPayout = {
        balanceAtLastPayout: 53_100,
        payoutsTaken: 1,
    };

    it.each([
        [SnapshotInputField.FloorAtLastPayout, { floorAtLastPayout: 100 }],
        [SnapshotInputField.DashboardFloor, { dashboardFloor: 100 }],
    ])(
        'flags a %s typed zero-based under the nominal convention on a locked account',
        (field, overrides: InputOverrides) => {
            const issues = issuesFor(apexEod, {
                ...lockedAfterPayout,
                ...overrides,
            });

            expect(issues).toEqual([
                {
                    field,
                    kind: SnapshotPlausibilityIssueKind.FloorBelowStartingFloor,
                    message: expect.stringContaining('$48,000') as string,
                    severity: SnapshotIssueSeverity.Impossible,
                },
            ]);
            expect(issues[0]?.message).toContain('$100');
        },
    );

    it('reads the starting floor of the snapshot stage for a floor', () => {
        expect(
            kindsFor(tighterFundedDrawdown, {
                balance: 49_500,
                dashboardFloor: 48_200,
                highestEodBalance: 50_000,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.FloorBelowStartingFloor]);
        expect(
            kindsFor(tighterFundedDrawdown, {
                ...evalAt(49_500),
                dashboardFloor: 48_200,
            }),
        ).toEqual([]);
    });

    it.each([
        [
            'a dashboard floor typed nominal under the $0-based convention',
            {
                balance: 2400,
                dashboardConvention: DashboardBalanceConvention.ZeroBased,
                dashboardFloor: 50_100,
                highestEodBalance: 3000,
            },
            SnapshotInputField.DashboardFloor,
        ],
        [
            'a dashboard floor at the balance',
            { dashboardFloor: 52_400 },
            SnapshotInputField.DashboardFloor,
        ],
        [
            'a floor at the last payout above the balance at the last payout',
            {
                ...lockedAfterPayout,
                floorAtLastPayout: 53_200,
            },
            SnapshotInputField.FloorAtLastPayout,
        ],
    ])(
        'flags %s as a floor at or above its balance',
        (_name, overrides: InputOverrides, field) => {
            expect(
                issuesFor(apexEod, overrides).map((issue) => [
                    issue.field,
                    issue.kind,
                    issue.severity,
                ]),
            ).toEqual([
                [
                    field,
                    SnapshotPlausibilityIssueKind.FloorAtOrAboveBalance,
                    SnapshotIssueSeverity.Impossible,
                ],
            ]);
        },
    );

    it('accepts floors between the starting floor and their balance', () => {
        expect(
            issuesFor(apexEod, {
                ...lockedAfterPayout,
                dashboardFloor: 50_100,
                floorAtLastPayout: 50_100,
            }),
        ).toEqual([]);
        expect(
            issuesFor(apexEod, {
                balance: 50_000,
                dashboardFloor: APEX_FUNDED_DRAWDOWN.initialThreshold(
                    apexEod.accountSize,
                ),
                highestEodBalance: 50_000,
            }),
        ).toEqual([]);
    });

    it('flags a live floor at or above the balance even when the live stage is not modeled', () => {
        expect(
            kindsFor(topStepProAccount, {
                ...liveOverrides(10_000),
                dashboardFloor: 10_600,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.FloorAtOrAboveBalance]);
        expect(
            issuesFor(topStepProAccount, {
                ...liveOverrides(10_000),
                dashboardFloor: 100,
            }),
        ).toEqual([]);
    });
});

describe('SnapshotPlausibility: live trailing cushion', () => {
    const lucidLive = {
        balance: 1500,
        dashboardFloor: -1000,
        highestEodBalance: 1500,
        liveStartBalance: 0,
        stage: SizingStage.Live,
    };

    it('flags a Lucid live floor that leaves more cushion than the live drawdown before the lock', () => {
        expect(issuesFor(lucidPro, lucidLive)).toEqual([
            {
                field: SnapshotInputField.DashboardFloor,
                kind: SnapshotPlausibilityIssueKind.CushionAboveDrawdown,
                message: expect.stringContaining('$2,500') as string,
                severity: SnapshotIssueSeverity.Impossible,
            },
        ]);
    });

    it('accepts a Lucid live cushion at the live drawdown', () => {
        expect(
            issuesFor(lucidPro, { ...lucidLive, dashboardFloor: -500 }),
        ).toEqual([]);
    });

    it.each([
        ['the live start is unknown', { liveStartBalance: undefined }],
        ['the live peak reached the lock', { highestEodBalance: 2000 }],
        ['a live payout may have locked the floor', { payoutsTaken: 1 }],
    ])(
        'skips the Lucid live cushion check when %s',
        (_name, overrides: InputOverrides) => {
            expect(issuesFor(lucidPro, { ...lucidLive, ...overrides })).toEqual(
                [],
            );
        },
    );
});

describe('SnapshotPlausibility: funded resets', () => {
    it('allows up to the resets the plan offers before the first payout', () => {
        const allowed = fundedResetsBeforeFirstPayout(alphaWithReset);

        expect(allowed).toBe(2);
        expect(
            issuesFor(alphaWithReset, { fundedResetsUsed: allowed }),
        ).toEqual([]);
        expect(
            issuesFor(alphaWithReset, { fundedResetsUsed: allowed + 1 }),
        ).toEqual([
            {
                field: SnapshotInputField.FundedResetsUsed,
                kind: SnapshotPlausibilityIssueKind.FundedResetsAboveAllowed,
                message: expect.stringContaining('at most 2') as string,
                severity: SnapshotIssueSeverity.Impossible,
            },
        ]);
    });

    it.each([
        ['the reset option was not taken', alphaStandard],
        ['the plan has no funded reset', apexEod],
    ])('flags any reset when %s', (_name, plan) => {
        expect(kindsFor(plan, { fundedResetsUsed: 1 })).toEqual([
            SnapshotPlausibilityIssueKind.FundedResetsAboveAllowed,
        ]);
        expect(issuesFor(plan, { fundedResetsUsed: 0 })).toEqual([]);
    });

    it('reads the reset preconditions from the plans', () => {
        expect(alphaStandard.takesFundedReset).toBe(false);
        expect(alphaStandard.fundedReset).not.toBeNull();
        expect(apexEod.fundedReset).toBeNull();
    });
});

describe('SnapshotPlausibility: TopStep live start', () => {
    it('accepts the documented LFA start of computeTopStepLiveStartingBalance', () => {
        expect(TOPSTEP_DOCUMENTED_LIVE_START).toBe(10_000);
        expect(
            issuesFor(topStepXfa, liveOverrides(TOPSTEP_DOCUMENTED_LIVE_START)),
        ).toEqual([]);
    });

    it('flags any other TopStep live start on the live start field', () => {
        expect(issuesFor(topStepXfa, liveOverrides(12_000))).toEqual([
            {
                field: SnapshotInputField.LiveStartBalance,
                kind: SnapshotPlausibilityIssueKind.LiveStartOutsideDocumented,
                message: expect.stringContaining('$10,000') as string,
                severity: SnapshotIssueSeverity.Impossible,
            },
        ]);
    });

    it('reads live amounts as the live dashboard shows them, never shifted by the account size', () => {
        const zeroBased = {
            dashboardConvention: DashboardBalanceConvention.ZeroBased,
        };

        expect(
            issuesFor(topStepXfa, {
                ...liveOverrides(TOPSTEP_DOCUMENTED_LIVE_START),
                ...zeroBased,
            }),
        ).toEqual([]);
        expect(
            kindsFor(topStepXfa, {
                ...liveOverrides(TOPSTEP_DOCUMENTED_LIVE_START + ACCOUNT_SIZE),
                ...zeroBased,
            }),
        ).toEqual([SnapshotPlausibilityIssueKind.LiveStartOutsideDocumented]);
    });

    it('does not check a live start on a plan with no modeled live stage or before the live stage', () => {
        expect(issuesFor(topStepProAccount, liveOverrides(12_000))).toEqual([]);
        expect(
            issuesFor(topStepXfa, {
                liveStartBalance: 12_000,
                stage: SizingStage.Funded,
            }),
        ).toEqual([]);
    });
});

describe('SnapshotPlausibility: keys, draft entry and fail-loud entry', () => {
    const everythingWrong = snapshot(EVERYTHING_WRONG);
    const everythingWrongIssues = snapshotInputIssues(apexEod, everythingWrong);

    it('keys every failure by a SnapshotInputField and writes no em dash', () => {
        const fields = new Set<string>(Object.values(SnapshotInputField));

        expect(everythingWrongIssues.length).toBeGreaterThanOrEqual(4);
        for (const issue of everythingWrongIssues) {
            expect(fields.has(issue.field)).toBe(true);
            expect(issue.message).not.toContain(EM_DASH);
            expect(issue.message.length).toBeGreaterThan(0);
        }
    });

    it('runs the same checks for a draft without events or payouts', () => {
        const draft = snapshotDraftIssues(
            apexEod,
            everythingWrong.stage,
            everythingWrong.dashboardConvention,
            apexEod.accountSize,
            everythingWrong,
        );

        expect(draft).toEqual(everythingWrongIssues);
    });

    it.each([
        [ACCOUNT_SIZE, [SnapshotPlausibilityIssueKind.BalanceLooksZeroBased]],
        [2500, []],
    ])(
        'checks a draft against the account size it is given (%d)',
        (accountSize, expected) => {
            const kinds = snapshotDraftIssues(
                apexEod,
                SizingStage.Funded,
                DashboardBalanceConvention.Nominal,
                dollars(accountSize),
                { balance: dollars(2400) },
            ).map((issue) => issue.kind);

            expect(kinds).toEqual(expected);
        },
    );

    it('returns no issue for an empty draft', () => {
        expect(
            snapshotDraftIssues(
                apexEod,
                SizingStage.Funded,
                DashboardBalanceConvention.Nominal,
                apexEod.accountSize,
                {},
            ),
        ).toEqual([]);
    });

    it('throws a typed error carrying every issue for an implausible snapshot', () => {
        const caught = thrownBy(() => {
            assertPlausibleSnapshot(apexEod, everythingWrong);
        });

        expect(caught).toBeInstanceOf(ImplausibleSnapshotError);
        expect((caught as ImplausibleSnapshotError).issues).toEqual(
            everythingWrongIssues,
        );
        expect((caught as ImplausibleSnapshotError).message).toContain(
            SnapshotInputField.Balance,
        );
    });

    describe('acknowledged unlikely issues (Q29 default)', () => {
        const unlikelyOnly = snapshot({
            balance: 2400,
            highestEodBalance: 3000,
        });
        const unlikelyIssues = snapshotInputIssues(apexEod, unlikelyOnly);

        it('has only unlikely issues in the fixture', () => {
            expect(unlikelyIssues.length).toBeGreaterThan(0);
            expect(
                unlikelyIssues.every(
                    (issue) =>
                        issue.severity === SnapshotIssueSeverity.Unlikely,
                ),
            ).toBe(true);
        });

        it('throws for an unlikely issue the user did not acknowledge', () => {
            const caught = thrownBy(() => {
                assertPlausibleSnapshot(apexEod, unlikelyOnly);
            });

            expect(caught).toBeInstanceOf(ImplausibleSnapshotError);
            expect((caught as ImplausibleSnapshotError).issues).toEqual(
                unlikelyIssues,
            );
        });

        it('returns acknowledged unlikely issues as warnings instead of throwing', () => {
            let warnings: readonly SnapshotPlausibilityIssue[] = [];
            const caught = thrownBy(() => {
                warnings = assertPlausibleSnapshot(apexEod, unlikelyOnly, [
                    SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                ]);
            });

            expect(caught).toBe(null);
            expect(warnings).toEqual(unlikelyIssues);
        });

        it('still throws for the unlikely kinds that were not acknowledged', () => {
            const mixed = snapshot({
                balance: 102_400,
                balanceAtLastPayout: 3100,
                highestEodBalance: 102_400,
                payoutsTaken: 1,
            });
            const caught = thrownBy(() => {
                assertPlausibleSnapshot(apexEod, mixed, [
                    SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                ]);
            });

            expect(
                (caught as ImplausibleSnapshotError).issues.map(
                    (issue) => issue.kind,
                ),
            ).toEqual([
                SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
                SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
            ]);
        });

        it('never lets an acknowledgement pass an impossible issue', () => {
            const caught = thrownBy(() => {
                assertPlausibleSnapshot(
                    apexEod,
                    everythingWrong,
                    Object.values(SnapshotPlausibilityIssueKind),
                );
            });

            expect(caught).toBeInstanceOf(ImplausibleSnapshotError);
            expect(
                (caught as ImplausibleSnapshotError).issues.map(
                    (issue) => issue.severity,
                ),
            ).toEqual(
                everythingWrongIssues
                    .filter(
                        (issue) =>
                            issue.severity === SnapshotIssueSeverity.Impossible,
                    )
                    .map((issue) => issue.severity),
            );
        });
    });

    it('does not throw for a plausible snapshot', () => {
        expect(
            thrownBy(() => assertPlausibleSnapshot(apexEod, snapshot())),
        ).toBe(null);
    });
});
