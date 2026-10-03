import { describe, expect, it } from 'vitest';

import {
    buildWeeklyReview,
    DecisionAdherenceKind,
    reviewSubmitPayload,
    ViolationOfferKind,
    violationsFromOf,
    type WeeklyReviewAccountInput,
    type WeeklyReviewDecisionRow,
    type WeeklyReviewDraft,
    WeeklyReviewEntryKind,
    WeeklyReviewSizingKind,
    type WeeklyReviewSnapshotRow,
    type WeeklyReviewViolationRow,
    weeklyReviewWindowOf,
} from '~/app/(app)/prop-calculator/accounts/review/weeklyReviewModel';
import {
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    compareText,
    DashboardBalanceConvention,
    RuleViolationKind,
    SnapshotField,
    UnresolvedPlanReason,
    usdCents,
} from '~/lib/prop-accounts';
import { isDecisionFollowed } from '~/lib/prop-accounts/metrics';
import {
    ALL_FIRMS,
    DrawdownKind,
    fraction,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { weeklyReviewSnapshotEntrySchema } from '~/lib/schemas/propAccounts';

const ACCOUNT_SIZE = 50_000;
const MONDAY = '2026-09-21';
const LATE_SAME_WEEK = '2026-09-24';

function accountFor(
    plan: Plan,
    overrides: Partial<WeeklyReviewAccountInput> = {},
): WeeklyReviewAccountInput {
    const firm = ALL_FIRMS.find((candidate) => candidate.plans.includes(plan));
    if (firm === undefined) throw new Error('no firm owns this plan');
    return {
        accountSize: plan.accountSize,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firmId: firm.id,
        id: 'account-1',
        label: 'Eval one',
        liveStartBalanceCents: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: null,
        planSerial: serializePlanId(plan.id),
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function evalEodTrailingPlan(): Plan {
    return findPlan(
        (candidate) =>
            candidate.accountSize === ACCOUNT_SIZE &&
            !candidate.isInstantFunded &&
            candidate.drawdownFor(TradingPhase.Eval).kind ===
                DrawdownKind.EodTrailing,
    );
}

function findPlan(isMatch: (plan: Plan) => boolean): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.plans.some(isMatch));
    const plan = firm?.plans.find(isMatch);
    if (firm === undefined || plan === undefined) {
        throw new Error('no plan matches the predicate');
    }
    return plan;
}

function instantFundedPlan(): Plan {
    return findPlan((candidate) => candidate.isInstantFunded);
}

function plausibleSnapshotRow(
    asOf: string,
    overrides: Partial<WeeklyReviewSnapshotRow> = {},
): WeeklyReviewSnapshotRow {
    return {
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents: 5_040_000,
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: 5_060_000,
        highestIntradayBalanceCents: null,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 3,
        ...overrides,
    };
}

const EMPTY_MAP = new Map();
const EMPTY_SET: ReadonlySet<string> = new Set();

function decisionRow(
    overrides: Partial<WeeklyReviewDecisionRow> = {},
): WeeklyReviewDecisionRow {
    return {
        acceptedRiskCents: 40_000,
        actualRiskCents: null,
        decidedOn: '2026-09-14',
        id: 'decision-1',
        ...overrides,
    };
}

function readyHeadlineLabel(rulebook: typeof DEFAULT_RULEBOOK) {
    const account = accountFor(evalEodTrailingPlan());
    const result = buildWeeklyReview({
        accounts: [account],
        confirmedUnchanged: EMPTY_SET,
        drafts: new Map([[account.id, plausibleSnapshotRow(MONDAY)]]),
        invalidEntries: EMPTY_MAP,
        latestDecisions: EMPTY_MAP,
        latestSnapshots: EMPTY_MAP,
        rulebook,
        stagesOnAsOf: stagesOf([account]),
        today: MONDAY,
        violations: [],
    });
    const sizing = result.rows[0]?.sizing;
    if (sizing?.kind !== WeeklyReviewSizingKind.Ready) {
        throw new Error('the row is not ready');
    }
    return sizing.headlineLabel;
}

function reviewWith(
    accounts: readonly WeeklyReviewAccountInput[],
    options: {
        latestDecisions?: ReadonlyMap<string, WeeklyReviewDecisionRow>;
        today?: string;
        violations?: readonly WeeklyReviewViolationRow[];
    },
) {
    return buildWeeklyReview({
        accounts,
        confirmedUnchanged: EMPTY_SET,
        drafts: EMPTY_MAP,
        invalidEntries: EMPTY_MAP,
        latestDecisions: options.latestDecisions ?? EMPTY_MAP,
        latestSnapshots: EMPTY_MAP,
        rulebook: DEFAULT_RULEBOOK,
        stagesOnAsOf: stagesOf(accounts),
        today: options.today ?? MONDAY,
        violations: options.violations ?? [],
    });
}

function stagesOf(
    accounts: readonly WeeklyReviewAccountInput[],
): ReadonlyMap<string, AccountStage> {
    return new Map(accounts.map((account) => [account.id, account.stage]));
}

function violationRow(
    overrides: Partial<WeeklyReviewViolationRow> = {},
): WeeklyReviewViolationRow {
    return {
        accountId: 'account-1',
        costCents: null,
        decisionId: null,
        id: 'violation-1',
        kind: RuleViolationKind.Oversize,
        note: null,
        occurredOn: '2026-09-18',
        ...overrides,
    };
}

describe('buildWeeklyReview', () => {
    it('lists one row per Active, unarchived, modeled account without read issues; excludes other statuses and ledger-only accounts', () => {
        const plan = evalEodTrailingPlan();
        const active = accountFor(plan, { id: 'active' });
        const suspended = accountFor(plan, {
            id: 'suspended',
            status: AccountStatus.Suspended,
        });
        const busted = accountFor(plan, {
            id: 'busted',
            status: AccountStatus.Busted,
        });
        const concluded = accountFor(plan, {
            id: 'concluded',
            status: AccountStatus.Concluded,
        });
        const closed = accountFor(plan, {
            id: 'closed',
            status: AccountStatus.Closed,
        });
        const ledgerOnly = accountFor(plan, {
            id: 'ledger-only',
            tracking: AccountTracking.LedgerOnly,
        });
        const everyAccount = [
            active,
            suspended,
            busted,
            concluded,
            closed,
            ledgerOnly,
        ];
        const result = buildWeeklyReview({
            accounts: everyAccount,
            confirmedUnchanged: EMPTY_SET,
            drafts: EMPTY_MAP,
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf(everyAccount),
            today: MONDAY,
            violations: [],
        });
        expect(result.rows.map((row) => row.accountId)).toEqual(['active']);
        expect(result.corruptRows).toEqual([]);
    });

    it('lists a corrupt row separately, read-only, with the reason, and excludes it from rows', () => {
        const plan = evalEodTrailingPlan();
        const corrupt = accountFor(plan, {
            id: 'corrupt',
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.AccountSizeMismatch,
                },
            ],
        });
        const result = buildWeeklyReview({
            accounts: [corrupt],
            confirmedUnchanged: EMPTY_SET,
            drafts: EMPTY_MAP,
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([corrupt]),
            today: MONDAY,
            violations: [],
        });
        expect(result.rows).toEqual([]);
        expect(result.corruptRows).toHaveLength(1);
        expect(result.corruptRows[0]?.accountId).toBe('corrupt');
        expect(result.corruptRows[0]?.reasons[0]).toBeTruthy();
    });

    it('defaults asOf to the latest review weekday on or before today', () => {
        const plan = evalEodTrailingPlan();
        const result = buildWeeklyReview({
            accounts: [accountFor(plan)],
            confirmedUnchanged: EMPTY_SET,
            drafts: EMPTY_MAP,
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([accountFor(plan)]),
            today: LATE_SAME_WEEK,
            violations: [],
        });
        expect(result.asOf).toBe(MONDAY);
    });

    it('prefills the draft from the latest snapshot when no draft override is given', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const snapshot = plausibleSnapshotRow(MONDAY, { tradingDays: 5 });
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: EMPTY_MAP,
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, snapshot]]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        expect(result.rows[0]?.draft.tradingDays).toBe(5);
        expect(result.rows[0]?.draft.balanceCents).toBe(5_040_000);
    });

    it('blocks a row missing a field its plan requires and lists the missing labels', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, { balanceCents: 5_040_000 }]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(true);
        expect(row?.missingFieldLabels.length).toBeGreaterThan(0);
        expect(row?.sizing).toEqual({
            kind: WeeklyReviewSizingKind.NotModeled,
        });
    });

    it('blocks a nominal 2,400 entry on a 50K account with the convention message', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([
                [
                    account.id,
                    {
                        balanceCents: 240_000,
                        highestEodBalanceCents: 240_000,
                        tradingDays: 3,
                    },
                ],
            ]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(true);
        expect(
            row?.blockedMessages.some((message) => message.includes('$2,400')),
        ).toBe(true);
        expect(
            row?.blockedMessages.some((message) =>
                message.includes('set the dashboard convention to $0-based'),
            ),
        ).toBe(true);
    });

    it('blocks a $0-based 52,400 entry on a 50K account with the convention message', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan, {
            dashboardConvention: DashboardBalanceConvention.ZeroBased,
        });
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([
                [
                    account.id,
                    {
                        balanceCents: 5_240_000,
                        highestEodBalanceCents: 5_240_000,
                        tradingDays: 3,
                    },
                ],
            ]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(true);
        expect(
            row?.blockedMessages.some((message) => message.includes('$52,400')),
        ).toBe(true);
        expect(
            row?.blockedMessages.some((message) =>
                message.includes('set the dashboard convention to nominal'),
            ),
        ).toBe(true);
    });

    it('warns without blocking when the balance is far above the account size ceiling', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const ceiling =
            plan.accountSize +
            plan.profitTarget +
            plan.drawdownFor(TradingPhase.Eval).amount;
        const aboveCeilingCents = Math.round((ceiling + 200) * 100);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([
                [
                    account.id,
                    {
                        balanceCents: aboveCeilingCents,
                        highestEodBalanceCents: aboveCeilingCents,
                        tradingDays: 3,
                    },
                ],
            ]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(false);
        expect(row?.blockedMessages).toEqual([]);
        expect(row?.fieldWarnings.length).toBeGreaterThan(0);
        expect(
            row?.fieldWarnings.some((warning) =>
                warning.message.includes('account size'),
            ),
        ).toBe(true);
    });

    it('gives a plausible row a documented headline size and positive rungs in cents', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const draft = plausibleSnapshotRow(MONDAY);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, draft]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(false);
        expect(row?.sizing.kind).toBe(WeeklyReviewSizingKind.Ready);
        if (row?.sizing.kind !== WeeklyReviewSizingKind.Ready) {
            return;
        }

        expect(row.sizing.headlineRiskCents).toBeGreaterThan(0);
        expect(row.sizing.rungsCents.every((cents) => cents > 0)).toBe(true);
    });

    it('sizes a funded account with its own personal max risk per trade, so it caps the headline and every rung (PT-68c, F-V16)', () => {
        const plan = evalEodTrailingPlan();
        const draft = plausibleSnapshotRow(MONDAY, {
            payoutsTaken: 0,
            tradingDays: 12,
        });
        const sizingOf = (account: WeeklyReviewAccountInput) => {
            const result = buildWeeklyReview({
                accounts: [account],
                confirmedUnchanged: EMPTY_SET,
                drafts: new Map([[account.id, draft]]),
                invalidEntries: EMPTY_MAP,
                latestDecisions: EMPTY_MAP,
                latestSnapshots: EMPTY_MAP,
                rulebook: DEFAULT_RULEBOOK,
                stagesOnAsOf: stagesOf([account]),
                today: MONDAY,
                violations: [],
            });
            const row = result.rows[0];
            if (row?.sizing.kind !== WeeklyReviewSizingKind.Ready) {
                throw new Error(
                    `expected a ready sizing: ${JSON.stringify(row?.blockedMessages)} ${row?.sizing.kind}`,
                );
            }
            return row.sizing;
        };
        const funded = accountFor(plan, { stage: AccountStage.Funded });
        const plain = sizingOf(funded);
        const personalCap = Math.floor(plain.headlineRiskCents / 4);
        expect(personalCap).toBeGreaterThan(0);
        const capped = sizingOf({
            ...funded,
            personalRules: { maxRiskPerTradeCents: usdCents(personalCap) },
        });
        expect(capped.headlineRiskCents).toBeLessThanOrEqual(personalCap);
        expect(capped.rungsCents.every((cents) => cents <= personalCap)).toBe(
            true,
        );
        expect(plain.headlineRiskCents).toBeGreaterThan(personalCap);
    });

    it('sizes an eval account with its own personal max risk per trade, so it caps the headline and every rung', () => {
        const plan = evalEodTrailingPlan();
        const draft = plausibleSnapshotRow(MONDAY);
        const sizingOf = (account: WeeklyReviewAccountInput) => {
            const result = buildWeeklyReview({
                accounts: [account],
                confirmedUnchanged: EMPTY_SET,
                drafts: new Map([[account.id, draft]]),
                invalidEntries: EMPTY_MAP,
                latestDecisions: EMPTY_MAP,
                latestSnapshots: EMPTY_MAP,
                rulebook: DEFAULT_RULEBOOK,
                stagesOnAsOf: stagesOf([account]),
                today: MONDAY,
                violations: [],
            });
            const sizing = result.rows[0]?.sizing;
            if (sizing?.kind !== WeeklyReviewSizingKind.Ready) {
                throw new Error('expected a ready sizing');
            }
            return sizing;
        };
        const evalAccount = accountFor(plan, { stage: AccountStage.Eval });
        const plain = sizingOf(evalAccount);
        const personalCap = Math.floor(plain.headlineRiskCents / 4);
        expect(personalCap).toBeGreaterThan(0);
        const capped = sizingOf({
            ...evalAccount,
            personalRules: { maxRiskPerTradeCents: usdCents(personalCap) },
        });
        expect(capped.headlineRiskCents).toBeLessThanOrEqual(personalCap);
        expect(capped.rungsCents.every((cents) => cents <= personalCap)).toBe(
            true,
        );
        expect(plain.headlineRiskCents).toBeGreaterThan(personalCap);
    });

    it('sizes an account within its personal daily loss limit (PT-68c, F-V16)', () => {
        const plan = evalEodTrailingPlan();
        const draft = plausibleSnapshotRow(MONDAY);
        const sizingOf = (account: WeeklyReviewAccountInput) => {
            const result = buildWeeklyReview({
                accounts: [account],
                confirmedUnchanged: EMPTY_SET,
                drafts: new Map([[account.id, draft]]),
                invalidEntries: EMPTY_MAP,
                latestDecisions: EMPTY_MAP,
                latestSnapshots: EMPTY_MAP,
                rulebook: DEFAULT_RULEBOOK,
                stagesOnAsOf: stagesOf([account]),
                today: MONDAY,
                violations: [],
            });
            const sizing = result.rows[0]?.sizing;
            if (sizing?.kind !== WeeklyReviewSizingKind.Ready) {
                throw new Error('expected a ready sizing');
            }
            return sizing;
        };
        const plain = sizingOf(accountFor(plan));
        const personalLimit = Math.floor(plain.headlineRiskCents / 2);
        const limited = sizingOf(
            accountFor(plan, {
                personalRules: { dailyLossLimitCents: usdCents(personalLimit) },
            }),
        );
        expect(limited.headlineRiskCents).toBeLessThanOrEqual(personalLimit);
    });

    it('gives no eval advice on an instant-funded plan', () => {
        const plan = instantFundedPlan();
        const account = accountFor(plan, { stage: AccountStage.Eval });
        const draft = plausibleSnapshotRow(MONDAY, {
            balanceCents: plan.accountSize * 100,
            highestEodBalanceCents: plan.accountSize * 100,
        });
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, draft]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.sizing).toEqual({
            kind: WeeklyReviewSizingKind.NoEvalAdvice,
        });
    });

    it('gives StaleAdvice with no amounts and no decision for a stale review', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const draft = plausibleSnapshotRow(LATE_SAME_WEEK);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, draft]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: LATE_SAME_WEEK,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.sizing).toEqual({ kind: WeeklyReviewSizingKind.Stale });
        const payload = reviewSubmitPayload(result, new Set([account.id]));
        expect(payload.decisions).toEqual([]);
    });

    it('diffs the new headline against the last accepted decision when one exists', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const draft = plausibleSnapshotRow(MONDAY);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, draft]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: new Map([
                [account.id, decisionRow({ acceptedRiskCents: 1 })],
            ]),
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.previousAcceptedRiskCents).toBe(1);
        expect(row?.diffCents).not.toBeNull();
        if (row?.sizing.kind === WeeklyReviewSizingKind.Ready) {
            expect(row.diffCents).toBe(row.sizing.headlineRiskCents - 1);
        }
    });

    it('falls back to the documented size at the previous snapshot when there is no decision', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const previous = plausibleSnapshotRow(MONDAY);
        const draft = plausibleSnapshotRow(MONDAY, { tradingDays: 4 });
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, draft]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, previous]]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.previousAcceptedRiskCents).not.toBeNull();
        expect(row?.previousAcceptedRiskCents).toBeGreaterThan(0);
    });

    it('gives no previous size when the previous snapshot cannot be sized either', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const staleForPrevious = plausibleSnapshotRow('2026-08-01');
        const draft = plausibleSnapshotRow(MONDAY);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, draft]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, staleForPrevious]]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.previousAcceptedRiskCents).toBeNull();
        expect(row?.diffCents).toBeNull();
    });
});

describe('reviewSubmitPayload', () => {
    it('submits every unblocked row as a snapshot and a decision only for the accepted, ready rows', () => {
        const plan = evalEodTrailingPlan();
        const ready = accountFor(plan, { id: 'ready' });
        const blocked = accountFor(plan, { id: 'blocked' });
        const result = buildWeeklyReview({
            accounts: [ready, blocked],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map<string, WeeklyReviewDraft>([
                [blocked.id, { balanceCents: 5_040_000 }],
                [ready.id, plausibleSnapshotRow(MONDAY)],
            ]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([ready, blocked]),
            today: MONDAY,
            violations: [],
        });
        const payload = reviewSubmitPayload(result, new Set([ready.id]));
        expect(payload.asOf).toBe(MONDAY);
        expect(payload.snapshots.map((entry) => entry.accountId)).toEqual([
            'ready',
        ]);
        expect(payload.decisions).toHaveLength(1);
        expect(payload.decisions[0]?.accountId).toBe('ready');
        expect(payload.decisions[0]?.acceptedRungsCents.length).toBeGreaterThan(
            0,
        );
    });

    it('omits the decision for a ready row the reviewer did not accept', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, plausibleSnapshotRow(MONDAY)]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const payload = reviewSubmitPayload(result, new Set());
        expect(payload.snapshots).toHaveLength(1);
        expect(payload.decisions).toEqual([]);
    });
});

describe('buildWeeklyReview adherence', () => {
    const plan = evalEodTrailingPlan();
    const account = accountFor(plan);

    it('says a last decision with the actual risk equal to the accepted risk was followed', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 40_000 })],
            ]),
        });
        expect(result.rows[0]?.lastDecision).toEqual({
            acceptedRiskCents: 40_000,
            actualRiskCents: 40_000,
            adherence: DecisionAdherenceKind.Followed,
            decidedOn: '2026-09-14',
            id: 'decision-1',
            isAboveAccepted: false,
            isViolationLogged: false,
        });
    });

    it('says an actual risk within one rounding step of the accepted risk was followed, above or below it', () => {
        const step = DEFAULT_RULEBOOK.eval.roundingStepCents;
        for (const actualRiskCents of [
            40_000 - step,
            40_000 - 1,
            40_000 + 1,
            40_000 + step,
        ]) {
            const result = reviewWith([account], {
                latestDecisions: new Map([
                    [account.id, decisionRow({ actualRiskCents })],
                ]),
            });
            expect(
                result.rows[0]?.lastDecision?.adherence,
                String(actualRiskCents),
            ).toBe(DecisionAdherenceKind.Followed);
            expect(result.rows[0]?.violationOffer.kind).toBe(
                ViolationOfferKind.None,
            );
        }
    });

    it('says an actual risk more than one rounding step above the accepted risk was not followed and offers the violation form', () => {
        const step = DEFAULT_RULEBOOK.eval.roundingStepCents;
        const above = reviewWith([account], {
            latestDecisions: new Map([
                [
                    account.id,
                    decisionRow({ actualRiskCents: 40_000 + step + 1 }),
                ],
            ]),
        });
        expect(above.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotFollowed,
        );
        expect(above.rows[0]?.lastDecision?.isAboveAccepted).toBe(true);
        expect(above.rows[0]?.violationOffer.kind).toBe(
            ViolationOfferKind.Available,
        );
    });

    it('says an actual risk more than one rounding step below the accepted risk was not followed, as the overview does, and offers no violation to log for trading smaller', () => {
        const step = DEFAULT_RULEBOOK.eval.roundingStepCents;
        const below = reviewWith([account], {
            latestDecisions: new Map([
                [
                    account.id,
                    decisionRow({ actualRiskCents: 40_000 - step - 1 }),
                ],
            ]),
        });
        expect(below.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotFollowed,
        );
        expect(below.rows[0]?.lastDecision?.isAboveAccepted).toBe(false);
        expect(below.rows[0]?.violationOffer.kind).toBe(
            ViolationOfferKind.None,
        );
    });

    it('gives the overview verdict on every decision, one rule for both screens', () => {
        const step = DEFAULT_RULEBOOK.eval.roundingStepCents;
        for (const actualRiskCents of [
            0, 1000, 34_999, 35_000, 39_999, 40_000, 40_001, 45_000, 45_001,
            90_000,
        ]) {
            const decision = decisionRow({ actualRiskCents });
            const result = reviewWith([account], {
                latestDecisions: new Map([[account.id, decision]]),
            });
            const verdict = isDecisionFollowed(
                {
                    acceptedRiskCents: usdCents(decision.acceptedRiskCents),
                    accountId: account.id,
                    actualRiskCents: usdCents(actualRiskCents),
                    decidedOn: decision.decidedOn,
                },
                step,
            );
            expect(
                result.rows[0]?.lastDecision?.adherence,
                String(actualRiskCents),
            ).toBe(
                verdict
                    ? DecisionAdherenceKind.Followed
                    : DecisionAdherenceKind.NotFollowed,
            );
        }
    });

    it('says a funded decision risked 40 dollars above its accepted risk was followed, inside the 50 dollar rounding step', () => {
        const funded = accountFor(plan, { stage: AccountStage.Funded });
        const result = reviewWith([funded], {
            latestDecisions: new Map([
                [
                    funded.id,
                    decisionRow({
                        acceptedRiskCents: 30_000,
                        actualRiskCents: 34_000,
                    }),
                ],
            ]),
        });
        expect(result.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.Followed,
        );
        expect(result.adherence.followed).toBe(1);
    });

    it('reports the rounding step the rule used', () => {
        const result = reviewWith([account], {});
        expect(result.adherenceStepCents).toBe(
            DEFAULT_RULEBOOK.eval.roundingStepCents,
        );
    });

    it('says adherence is not recorded when no actual risk was entered, and shows no decision when there is none', () => {
        const unrecorded = reviewWith([account], {
            latestDecisions: new Map([[account.id, decisionRow()]]),
        });
        expect(unrecorded.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotRecorded,
        );
        const none = reviewWith([account], {});
        expect(none.rows[0]?.lastDecision).toBeNull();
    });

    it('summarises the adherence rate over the decisions with an actual risk entered, with the counts', () => {
        const followed = accountFor(plan, { id: 'followed' });
        const missed = accountFor(plan, { id: 'missed' });
        const unrecorded = accountFor(plan, { id: 'unrecorded' });
        const noDecision = accountFor(plan, { id: 'no-decision' });
        const result = reviewWith([followed, missed, unrecorded, noDecision], {
            latestDecisions: new Map([
                [followed.id, decisionRow({ actualRiskCents: 40_000 })],
                [missed.id, decisionRow({ actualRiskCents: 90_000 })],
                [unrecorded.id, decisionRow()],
            ]),
        });
        expect(result.adherence).toEqual({
            followed: 1,
            measured: 2,
            notRecorded: 1,
            rate: 0.5,
            total: 3,
        });
    });

    it('has no adherence rate when no decision has an actual risk entered', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([[account.id, decisionRow()]]),
        });
        expect(result.adherence).toEqual({
            followed: 0,
            measured: 0,
            notRecorded: 1,
            rate: null,
            total: 1,
        });
    });

    it('counts only the accounts that appear as rows, not excluded or corrupt ones', () => {
        const busted = accountFor(plan, {
            id: 'busted',
            status: AccountStatus.Busted,
        });
        const result = reviewWith([account, busted], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 40_000 })],
                [busted.id, decisionRow({ actualRiskCents: 90_000 })],
            ]),
        });
        expect(result.adherence.measured).toBe(1);
        expect(result.adherence.rate).toBe(1);
    });
});

describe('weeklyReviewWindowOf', () => {
    it('runs from the first day of the week to the latest review weekday on or before today', () => {
        expect(weeklyReviewWindowOf(LATE_SAME_WEEK, DEFAULT_RULEBOOK)).toEqual({
            asOf: MONDAY,
            weekStart: '2026-09-15',
        });
        expect(weeklyReviewWindowOf(MONDAY, DEFAULT_RULEBOOK)).toEqual({
            asOf: MONDAY,
            weekStart: '2026-09-15',
        });
    });

    it('matches the window the built review reports', () => {
        const result = reviewWith([], { today: LATE_SAME_WEEK });
        expect(weeklyReviewWindowOf(LATE_SAME_WEEK, DEFAULT_RULEBOOK)).toEqual({
            asOf: result.asOf,
            weekStart: result.weekStart,
        });
    });
});

function fromOf(
    accounts: readonly WeeklyReviewAccountInput[],
    decisions: readonly (readonly [string, WeeklyReviewDecisionRow])[],
    today = MONDAY,
) {
    return violationsFromOf({
        accounts,
        latestDecisions: new Map(decisions),
        rulebook: DEFAULT_RULEBOOK,
        today,
    });
}

describe('violationsFromOf', () => {
    const plan = evalEodTrailingPlan();
    const account = accountFor(plan);
    const oversized = { actualRiskCents: 90_000, decidedOn: '2026-08-03' };

    it('is the week start when there is no decision', () => {
        expect(fromOf([account], [])).toBe('2026-09-15');
    });

    it('reaches back to the date of a reviewed account decision that was not followed and traded above the accepted risk, so a violation linked to it is still seen as logged', () => {
        expect(fromOf([account], [[account.id, decisionRow(oversized)]])).toBe(
            '2026-08-03',
        );
    });

    it('takes the oldest date among the decisions that can offer a violation', () => {
        const second = accountFor(plan, { id: 'account-2' });
        expect(
            fromOf(
                [account, second],
                [
                    [
                        account.id,
                        decisionRow({ ...oversized, decidedOn: '2026-08-20' }),
                    ],
                    [second.id, decisionRow(oversized)],
                ],
            ),
        ).toBe('2026-08-03');
    });

    it('stays at the week start for a decision that offers no violation: followed, below the accepted risk, no actual risk, or newer than the week start', () => {
        const rows = [
            decisionRow({ ...oversized, actualRiskCents: 40_000 }),
            decisionRow({ ...oversized, actualRiskCents: 1000 }),
            decisionRow({ ...oversized, actualRiskCents: null }),
            decisionRow({ ...oversized, decidedOn: '2026-09-16' }),
        ];
        for (const row of rows) {
            expect(fromOf([account], [[account.id, row]])).toBe('2026-09-15');
        }
    });

    it('is not moved back by an old decision of an account the review never shows', () => {
        const busted = accountFor(plan, {
            id: 'busted',
            status: AccountStatus.Busted,
        });
        const closed = accountFor(plan, {
            id: 'closed',
            status: AccountStatus.Closed,
        });
        const ledgerOnly = accountFor(plan, {
            id: 'ledger-only',
            tracking: AccountTracking.LedgerOnly,
        });
        const corrupt = accountFor(plan, {
            id: 'corrupt',
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.AccountSizeMismatch,
                },
            ],
        });
        const unknown = accountFor(plan, { id: 'unknown-to-the-review' });
        expect(
            fromOf(
                [busted, closed, ledgerOnly, corrupt],
                [busted, closed, ledgerOnly, corrupt, unknown].map(
                    (entry) => [entry.id, decisionRow(oversized)] as const,
                ),
            ),
        ).toBe('2026-09-15');
    });

    it('follows the week start of the day it is given', () => {
        expect(fromOf([account], [], LATE_SAME_WEEK)).toBe('2026-09-15');
        expect(fromOf([account], [], '2026-09-28')).toBe('2026-09-22');
    });
});

describe('buildWeeklyReview violations', () => {
    const plan = evalEodTrailingPlan();
    const account = accountFor(plan);
    const other = accountFor(plan, { id: 'account-2', label: 'Eval two' });

    it('lists the week violations per account, newest first, and only that account violations', () => {
        const older = violationRow({ id: 'older', occurredOn: '2026-09-15' });
        const newer = violationRow({ id: 'newer', occurredOn: '2026-09-19' });
        const foreign = violationRow({
            accountId: other.id,
            id: 'foreign',
        });
        const result = reviewWith([account, other], {
            violations: [older, foreign, newer],
        });
        expect(result.rows[0]?.violations.map((row) => row.id)).toEqual([
            'newer',
            'older',
        ]);
        expect(result.rows[1]?.violations.map((row) => row.id)).toEqual([
            'foreign',
        ]);
    });

    it('keeps the window from the first day of the week to today, both ends exact', () => {
        const result = reviewWith([account], {
            violations: [
                violationRow({ id: 'before', occurredOn: '2026-09-14' }),
                violationRow({ id: 'first-day', occurredOn: '2026-09-15' }),
                violationRow({ id: 'as-of', occurredOn: MONDAY }),
                violationRow({ id: 'after', occurredOn: '2026-09-22' }),
            ],
        });
        expect(result.rows[0]?.violations.map((row) => row.id)).toEqual([
            'as-of',
            'first-day',
        ]);
        expect(result.weekStart).toBe('2026-09-15');
        expect(result.windowEnd).toBe(MONDAY);
    });

    it('shows a violation logged after the review weekday, up to today', () => {
        const result = reviewWith([account], {
            today: '2026-09-24',
            violations: [
                violationRow({ id: 'wednesday', occurredOn: '2026-09-23' }),
                violationRow({ id: 'today', occurredOn: '2026-09-24' }),
                violationRow({ id: 'future', occurredOn: '2026-09-25' }),
            ],
        });
        expect(result.asOf).toBe(MONDAY);
        expect(result.windowEnd).toBe('2026-09-24');
        expect(result.rows[0]?.violations.map((row) => row.id)).toEqual([
            'today',
            'wednesday',
        ]);
    });

    it('has no violations for an account with none', () => {
        const result = reviewWith([account], {});
        expect(result.rows[0]?.violations).toEqual([]);
    });
});

describe('buildWeeklyReview log violation prefill', () => {
    const plan = evalEodTrailingPlan();
    const account = accountFor(plan);

    it('offers a violation form prefilled with the decision when the last decision was risked above its accepted size', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 90_000 })],
            ]),
        });
        expect(result.rows[0]?.violationOffer).toEqual({
            decision: { decidedOn: '2026-09-14', id: 'decision-1' },
            initial: {
                costCents: '',
                decisionId: 'decision-1',
                kind: RuleViolationKind.Oversize,
                note: '',
                occurredOn: '2026-09-14',
            },
            kind: ViolationOfferKind.Available,
        });
    });

    it('dates the prefilled violation on the day of the decision, however old', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([
                [
                    account.id,
                    decisionRow({
                        actualRiskCents: 90_000,
                        decidedOn: '2026-08-17',
                    }),
                ],
            ]),
        });
        const offer = result.rows[0]?.violationOffer;
        expect(
            offer?.kind === ViolationOfferKind.Available
                ? offer.initial.occurredOn
                : null,
        ).toBe('2026-08-17');
    });

    it('offers nothing and says it is logged once a violation is linked to the last decision, whatever its date', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 90_000 })],
            ]),
            violations: [
                violationRow({
                    decisionId: 'decision-1',
                    id: 'linked',
                    occurredOn: '2026-07-01',
                }),
            ],
        });
        expect(result.rows[0]?.violationOffer).toEqual({
            kind: ViolationOfferKind.AlreadyLogged,
        });
        expect(result.rows[0]?.lastDecision?.isViolationLogged).toBe(true);
        expect(result.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotFollowed,
        );
    });

    it('offers nothing and does not say it is logged for a followed decision that has a linked violation', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 40_000 })],
            ]),
            violations: [
                violationRow({ decisionId: 'decision-1', id: 'linked' }),
            ],
        });
        expect(result.rows[0]?.violationOffer).toEqual({
            kind: ViolationOfferKind.None,
        });
    });

    it('still offers it when the only linked violation belongs to another decision', () => {
        const result = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 90_000 })],
            ]),
            violations: [
                violationRow({ decisionId: 'decision-0', id: 'older' }),
            ],
        });
        expect(result.rows[0]?.violationOffer.kind).toBe(
            ViolationOfferKind.Available,
        );
        expect(result.rows[0]?.lastDecision?.isViolationLogged).toBe(false);
    });

    it('offers nothing when the decision was followed, has no actual risk, or does not exist', () => {
        const followed = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 40_000 })],
            ]),
        });
        const unrecorded = reviewWith([account], {
            latestDecisions: new Map([[account.id, decisionRow()]]),
        });
        const none = reviewWith([account], {});
        for (const result of [followed, unrecorded, none]) {
            expect(result.rows[0]?.violationOffer).toEqual({
                kind: ViolationOfferKind.None,
            });
        }
    });
});

describe('buildWeeklyReview ledger-only accounts', () => {
    it('counts the active ledger-only accounts left out of the review, and not other excluded accounts', () => {
        const plan = evalEodTrailingPlan();
        const modeled = accountFor(plan, { id: 'modeled' });
        const ledgerOnly = accountFor(plan, {
            id: 'ledger-only',
            tracking: AccountTracking.LedgerOnly,
        });
        const closedLedgerOnly = accountFor(plan, {
            id: 'closed-ledger-only',
            status: AccountStatus.Closed,
            tracking: AccountTracking.LedgerOnly,
        });
        const busted = accountFor(plan, {
            id: 'busted',
            status: AccountStatus.Busted,
        });
        const result = reviewWith(
            [modeled, ledgerOnly, closedLedgerOnly, busted],
            {},
        );
        expect(result.ledgerOnlyExcludedCount).toBe(1);
        expect(result.rows.map((row) => row.accountId)).toEqual(['modeled']);
    });
});

describe('buildWeeklyReview invalid entries (F-63)', () => {
    const PREVIOUS_ON = '2026-09-14';
    const BALANCE_ISSUE = {
        field: SnapshotField.Balance,
        message: 'Enter the balance as a dollar amount',
    };

    function reviewWithInvalid(
        issues: readonly { field: SnapshotField; message: string }[],
    ) {
        const account = accountFor(evalEodTrailingPlan());
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: new Set([account.id]),
            drafts: EMPTY_MAP,
            invalidEntries: new Map([[account.id, issues]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([
                [account.id, plausibleSnapshotRow(PREVIOUS_ON)],
            ]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        return { account, result };
    }

    it('blocks a row whose balance was typed as text, with the parse issues, and never sizes it from last week', () => {
        const { result } = reviewWithInvalid([BALANCE_ISSUE]);
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(true);
        expect(row?.entryKind).toBe(WeeklyReviewEntryKind.Edited);
        expect(row?.parseIssues).toEqual([BALANCE_ISSUE]);
        expect(row?.sizing).toEqual({
            kind: WeeklyReviewSizingKind.NotModeled,
        });
        expect(row?.isRecorded).toBe(false);
    });

    it('blocks a row whose required field was emptied and does not list every field as missing besides the issue', () => {
        const emptied = {
            field: SnapshotField.HighestEodBalance,
            message: 'Highest end-of-day balance is required',
        };
        const { result } = reviewWithInvalid([emptied]);
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(true);
        expect(row?.parseIssues).toEqual([emptied]);
        expect(row?.missingFieldLabels).toEqual([]);
        expect(row?.diffCents).toBeNull();
    });

    it('leaves an invalid row out of the payload, with no snapshot and no decision, even when accepted and ticked as unchanged', () => {
        const { account, result } = reviewWithInvalid([BALANCE_ISSUE]);
        const payload = reviewSubmitPayload(result, new Set([account.id]));
        expect(payload.snapshots).toEqual([]);
        expect(payload.decisions).toEqual([]);
    });

    it('does not carry last week values into the draft of an invalid row', () => {
        const { result } = reviewWithInvalid([BALANCE_ISSUE]);
        expect(result.rows[0]?.draft.balanceCents).toBeNull();
        expect(result.rows[0]?.draft.highestEodBalanceCents).toBeNull();
    });
});

describe('buildWeeklyReview untouched rows (F-63, QF-5)', () => {
    const PREVIOUS_ON = '2026-09-14';
    const FRESH_PREVIOUS_ON = '2026-09-19';

    function untouchedReview(
        options: { confirmed?: boolean; previousOn?: string } = {},
    ) {
        const account = accountFor(evalEodTrailingPlan());
        const previous = {
            ...plausibleSnapshotRow(options.previousOn ?? PREVIOUS_ON),
            id: 'stored-snapshot',
            source: 'manual',
            userId: 'user-a',
        };
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: new Set(
                options.confirmed === true ? [account.id] : [],
            ),
            drafts: EMPTY_MAP,
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, previous]]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        return { account, result };
    }

    it('marks a row nobody edited as unchanged since the previous snapshot date and counts it as not updated', () => {
        const { result } = untouchedReview();
        const row = result.rows[0];
        expect(row?.entryKind).toBe(WeeklyReviewEntryKind.Unchanged);
        expect(row?.unchangedSince).toBe(PREVIOUS_ON);
        expect(row?.isRecorded).toBe(false);
        expect(result.notUpdatedCount).toBe(1);
    });

    it('leaves an untouched row out of the snapshots and the decisions even when its size is accepted', () => {
        const { account, result } = untouchedReview();
        const payload = reviewSubmitPayload(result, new Set([account.id]));
        expect(payload.snapshots).toEqual([]);
        expect(payload.decisions).toEqual([]);
    });

    it('posts the previous values dated at the review date once the row is ticked as unchanged, and no longer counts it as not updated', () => {
        const { account, result } = untouchedReview({ confirmed: true });
        const row = result.rows[0];
        expect(row?.entryKind).toBe(WeeklyReviewEntryKind.Unchanged);
        expect(row?.isRecorded).toBe(true);
        expect(result.notUpdatedCount).toBe(0);
        const payload = reviewSubmitPayload(result, new Set());
        expect(payload.asOf).toBe(MONDAY);
        expect(payload.snapshots).toHaveLength(1);
        expect(payload.snapshots[0]).toMatchObject({
            accountId: account.id,
            balanceCents: 5_040_000,
            highestEodBalanceCents: 5_060_000,
            tradingDays: 3,
        });
    });

    it('sizes an untouched row from the date of its snapshot, so an old eval snapshot is stale and offers no size to accept even once ticked', () => {
        const { account, result } = untouchedReview({ confirmed: true });
        expect(result.rows[0]?.sizing).toEqual({
            kind: WeeklyReviewSizingKind.Stale,
        });
        const payload = reviewSubmitPayload(result, new Set([account.id]));
        expect(payload.snapshots).toHaveLength(1);
        expect(payload.decisions).toEqual([]);
    });

    it('offers a size to accept on a ticked untouched row whose snapshot is still fresh', () => {
        const { account, result } = untouchedReview({
            confirmed: true,
            previousOn: FRESH_PREVIOUS_ON,
        });
        expect(result.rows[0]?.sizing.kind).toBe(WeeklyReviewSizingKind.Ready);
        const payload = reviewSubmitPayload(result, new Set([account.id]));
        expect(payload.decisions).toHaveLength(1);
    });

    it('posts only the snapshot fields of the weekly review schema, not the stored row id, user or source', () => {
        const { account, result } = untouchedReview({ confirmed: true });
        const payload = reviewSubmitPayload(result, new Set());
        expect(
            Object.keys(payload.snapshots[0] ?? {}).toSorted(compareText),
        ).toEqual(
            Object.keys(weeklyReviewSnapshotEntrySchema.shape).toSorted(
                compareText,
            ),
        );
        expect(payload.snapshots[0]?.accountId).toBe(account.id);
        expect(result.rows[0]?.draft).not.toHaveProperty('asOf');
    });

    it('fails loudly when a recorded row has no balance instead of dropping it from the payload', () => {
        const { result } = untouchedReview({ confirmed: true });
        const [row] = result.rows;
        if (row === undefined) throw new Error('no row');
        const broken = {
            ...result,
            rows: [{ ...row, draft: { ...row.draft, balanceCents: null } }],
        };
        expect(() => reviewSubmitPayload(broken, new Set())).toThrow(
            /no balance/,
        );
    });

    it('records an edited row without any tick', () => {
        const account = accountFor(evalEodTrailingPlan());
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, plausibleSnapshotRow(MONDAY)]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([
                [account.id, plausibleSnapshotRow(PREVIOUS_ON)],
            ]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        expect(result.rows[0]?.entryKind).toBe(WeeklyReviewEntryKind.Edited);
        expect(result.rows[0]?.isRecorded).toBe(true);
        expect(result.notUpdatedCount).toBe(0);
        expect(
            reviewSubmitPayload(result, EMPTY_SET).snapshots.map(
                (entry) => entry.accountId,
            ),
        ).toEqual([account.id]);
    });

    it('says an account with no previous snapshot and no entry has nothing to record, and counts it as not updated', () => {
        const account = accountFor(evalEodTrailingPlan());
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: new Set([account.id]),
            drafts: EMPTY_MAP,
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.entryKind).toBe(WeeklyReviewEntryKind.NoPrevious);
        expect(row?.unchangedSince).toBeNull();
        expect(row?.isBlocked).toBe(true);
        expect(row?.isRecorded).toBe(false);
        expect(result.notUpdatedCount).toBe(1);
        expect(reviewSubmitPayload(result, EMPTY_SET).snapshots).toEqual([]);
    });

    it.each([MONDAY, '2026-09-23'])(
        'treats a row whose latest snapshot is dated %s, on or after the review date, as already recorded: not counted as not updated, never posted again, even when ticked',
        (previousOn) => {
            const { account, result } = untouchedReview({
                confirmed: true,
                previousOn,
            });
            const row = result.rows[0];
            expect(row?.entryKind).toBe(WeeklyReviewEntryKind.AlreadyRecorded);
            expect(row?.unchangedSince).toBeNull();
            expect(row?.isRecorded).toBe(false);
            expect(result.notUpdatedCount).toBe(0);
            const payload = reviewSubmitPayload(result, new Set([account.id]));
            expect(payload.snapshots).toEqual([]);
            expect(payload.decisions).toEqual([]);
        },
    );

    it('still records an edit on a row that is already recorded for the review date, leaving the server to reject the duplicate loudly', () => {
        const account = accountFor(evalEodTrailingPlan());
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, plausibleSnapshotRow(MONDAY)]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([
                [account.id, plausibleSnapshotRow(MONDAY)],
            ]),
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf: stagesOf([account]),
            today: MONDAY,
            violations: [],
        });
        expect(result.rows[0]?.entryKind).toBe(WeeklyReviewEntryKind.Edited);
        expect(result.rows[0]?.isRecorded).toBe(true);
    });
});

describe('buildWeeklyReview stage on the review date', () => {
    const WITHOUT_PEAK: WeeklyReviewDraft = {
        balanceCents: 5_050_000,
        dashboardFloorCents: 4_900_000,
        payoutsTaken: 0,
        tradingDays: 4,
    };

    function reviewAs(stageOnAsOf: AccountStage | null) {
        const account = accountFor(evalEodTrailingPlan(), {
            stage: AccountStage.Live,
        });
        const result = buildWeeklyReview({
            accounts: [account],
            confirmedUnchanged: EMPTY_SET,
            drafts: new Map([[account.id, WITHOUT_PEAK]]),
            invalidEntries: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            stagesOnAsOf:
                stageOnAsOf === null
                    ? EMPTY_MAP
                    : new Map([[account.id, stageOnAsOf]]),
            today: MONDAY,
            violations: [],
        });
        return result;
    }

    it('asks for the fields of the stage the account had on the review date, not the stage it has today', () => {
        const row = reviewAs(AccountStage.Funded).rows[0];
        expect(row?.stage).toBe(AccountStage.Live);
        expect(row?.stageOnAsOf).toBe(AccountStage.Funded);
        expect(row?.isBlocked).toBe(true);
        expect(row?.missingFieldLabels).toContain('Highest end-of-day balance');
    });

    it('accepts the same entry for a live account when it was live on the review date too', () => {
        const row = reviewAs(AccountStage.Live).rows[0];
        expect(row?.stageOnAsOf).toBe(AccountStage.Live);
        expect(row?.missingFieldLabels).toEqual([]);
    });

    it('fails loudly when the stage on the review date was not loaded for a reviewed account', () => {
        expect(() => reviewAs(null)).toThrow(/stage .* on 2026-09-21/);
    });
});

describe('buildWeeklyReview headline label', () => {
    it('calls the headline the documented one while the rulebook is the default', () => {
        expect(readyHeadlineLabel(DEFAULT_RULEBOOK)).toBe(
            'Documented headline',
        );
    });

    it('names the custom rule and the hard rule it differs from once the rulebook deviates', () => {
        const label = readyHeadlineLabel({
            ...DEFAULT_RULEBOOK,
            live: {
                ...DEFAULT_RULEBOOK.live,
                cushionPercent: {
                    ...DEFAULT_RULEBOOK.live.cushionPercent,
                    postLock: fraction(0.2),
                },
            },
        });
        expect(label).toContain('your custom rule (differs from');
        expect(label).not.toBe('Documented headline');
    });
});
