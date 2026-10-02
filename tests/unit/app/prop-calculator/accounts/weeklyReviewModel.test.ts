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
    DashboardBalanceConvention,
    RuleViolationKind,
    UnresolvedPlanReason,
    usdCents,
} from '~/lib/prop-accounts';
import {
    isDecisionFollowed,
} from '~/lib/prop-accounts/metrics';
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
        expect(row?.sizing).toEqual({
            kind: WeeklyReviewSizingKind.NotModeled,
        });
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
                drafts: new Map([[account.id, draft]]),
                latestDecisions: EMPTY_MAP,
                latestSnapshots: EMPTY_MAP,
                rulebook: DEFAULT_RULEBOOK,
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
                drafts: new Map([[account.id, draft]]),
                latestDecisions: EMPTY_MAP,
                latestSnapshots: EMPTY_MAP,
                rulebook: DEFAULT_RULEBOOK,
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
                drafts: new Map([[account.id, draft]]),
                latestDecisions: EMPTY_MAP,
                latestSnapshots: EMPTY_MAP,
                rulebook: DEFAULT_RULEBOOK,
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
        const payload = reviewSubmitPayload(result, new Set([account.id]));
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
                [account.id, decisionRow({ actualRiskCents: 40_000 + step + 1 })],
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
                [account.id, decisionRow({ actualRiskCents: 40_000 - step - 1 })],
            ]),
        });
        expect(below.rows[0]?.lastDecision?.adherence).toBe(
            DecisionAdherenceKind.NotFollowed,
        );
        expect(below.rows[0]?.lastDecision?.isAboveAccepted).toBe(false);
        expect(below.rows[0]?.violationOffer.kind).toBe(ViolationOfferKind.None);
    });

    it('gives the overview verdict on every decision, one rule for both screens', () => {
        const step = DEFAULT_RULEBOOK.eval.roundingStepCents;
        for (const actualRiskCents of [
            0,
            1000,
            34_999,
            35_000,
            39_999,
            40_000,
            40_001,
            45_000,
            45_001,
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
        expect(
            fromOf([account], [[account.id, decisionRow(oversized)]]),
        ).toBe('2026-08-03');
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
