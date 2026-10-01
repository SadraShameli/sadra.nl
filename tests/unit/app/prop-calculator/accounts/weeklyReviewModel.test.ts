import { describe, expect, it } from 'vitest';

import {
    buildWeeklyReview,
    DecisionAdherenceKind,
    reviewSubmitPayload,
    type WeeklyReviewAccountInput,
    type WeeklyReviewDecisionRow,
    type WeeklyReviewDraft,
    WeeklyReviewSizingKind,
    type WeeklyReviewSnapshotRow,
    type WeeklyReviewViolationRow,
} from '~/app/(app)/prop-calculator/accounts/review/weeklyReviewModel';
import {
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    RuleViolationKind,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const ACCOUNT_SIZE = 50_000;
const MONDAY = '2026-09-21';
const LATE_SAME_WEEK = '2026-09-24';

function accountFor(
    plan: Plan,
    overrides: Partial<WeeklyReviewAccountInput> = {},
): WeeklyReviewAccountInput {
    const firm = ALL_FIRMS.find((candidate) =>
        candidate.plans.includes(plan),
    );
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
    const firm = ALL_FIRMS.find((candidate) =>
        candidate.plans.some(isMatch),
    );
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
        drafts: EMPTY_MAP,
        latestDecisions: options.latestDecisions ?? EMPTY_MAP,
        latestSnapshots: EMPTY_MAP,
        rulebook: DEFAULT_RULEBOOK,
        today: options.today ?? MONDAY,
        violations: options.violations ?? [],
    });
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
        const result = buildWeeklyReview({
            accounts: [
                active,
                suspended,
                busted,
                concluded,
                closed,
                ledgerOnly,
            ],
            drafts: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: EMPTY_MAP,
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, snapshot]]),
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map([[account.id, { balanceCents: 5_040_000 }]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            today: MONDAY,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.isBlocked).toBe(true);
        expect(row?.missingFieldLabels.length).toBeGreaterThan(0);
        expect(row?.sizing).toEqual({ kind: WeeklyReviewSizingKind.NotModeled });
    });

    it('blocks a nominal 2,400 entry on a 50K account with the convention message', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const result = buildWeeklyReview({
            accounts: [account],
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
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map([[account.id, draft]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
        expect(row.sizing.rungsCents.every((cents) => cents > 0)).toBe(
            true,
        );
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
            drafts: new Map([[account.id, draft]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map([[account.id, draft]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
            today: LATE_SAME_WEEK,
            violations: [],
        });
        const row = result.rows[0];
        expect(row?.sizing).toEqual({ kind: WeeklyReviewSizingKind.Stale });
        const payload = reviewSubmitPayload(
            result,
            new Set([account.id]),
        );
        expect(payload.decisions).toEqual([]);
    });

    it('diffs the new headline against the last accepted decision when one exists', () => {
        const plan = evalEodTrailingPlan();
        const account = accountFor(plan);
        const draft = plausibleSnapshotRow(MONDAY);
        const result = buildWeeklyReview({
            accounts: [account],
            drafts: new Map([[account.id, draft]]),
            latestDecisions: new Map([
                [account.id, decisionRow({ acceptedRiskCents: 1 })],
            ]),
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map([[account.id, draft]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, previous]]),
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map([[account.id, draft]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: new Map([[account.id, staleForPrevious]]),
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map<string, WeeklyReviewDraft>([
                [blocked.id, { balanceCents: 5_040_000 }],
                [ready.id, plausibleSnapshotRow(MONDAY)],
            ]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            drafts: new Map([[account.id, plausibleSnapshotRow(MONDAY)]]),
            latestDecisions: EMPTY_MAP,
            latestSnapshots: EMPTY_MAP,
            rulebook: DEFAULT_RULEBOOK,
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
            isViolationLogged: false,
        });
    });

    it('treats an actual risk at or below the accepted risk as followed, the way the bust diagnosis does', () => {
        const below = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 1000 })],
            ]),
        });
        expect(below.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.Followed,
        );
    });

    it('says an actual risk even one cent above the accepted risk was not followed', () => {
        const above = reviewWith([account], {
            latestDecisions: new Map([
                [account.id, decisionRow({ actualRiskCents: 40_001 })],
            ]),
        });
        expect(above.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotFollowed,
        );
    });

    it('says a funded decision risked 40 dollars above its accepted risk was not followed', () => {
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
            DecisionAdherenceKind.NotFollowed,
        );
        expect(result.adherence.followed).toBe(0);
    });

    it('says adherence is not recorded when no actual risk was entered, and shows no decision when there is none', () => {
        const unrecorded = reviewWith([account], {
            latestDecisions: new Map([[account.id, decisionRow()]]),
        });
        expect(unrecorded.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotRecorded
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
        expect(result.rows[0]?.logViolation).toEqual({
            costCents: '',
            decisionId: 'decision-1',
            kind: RuleViolationKind.Oversize,
            note: '',
            occurredOn: '2026-09-14',
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
        expect(result.rows[0]?.logViolation?.occurredOn).toBe('2026-08-17');
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
        expect(result.rows[0]?.logViolation).toBeNull();
        expect(result.rows[0]?.lastDecision?.isViolationLogged).toBe(true);
        expect(result.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotFollowed,
        );
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
        expect(result.rows[0]?.logViolation).not.toBeNull();
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
        expect(followed.rows[0]?.logViolation).toBeNull();
        expect(unrecorded.rows[0]?.logViolation).toBeNull();
        expect(none.rows[0]?.logViolation).toBeNull();
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
