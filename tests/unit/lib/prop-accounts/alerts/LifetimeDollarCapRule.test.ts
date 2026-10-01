import { describe, expect, it } from 'vitest';

import {
    type AlertAccountRow,
    type AlertContext,
    AlertDisclosure,
    type AlertInputs,
    AlertKind,
    type AlertPayoutRow,
    AlertSeverity,
    type AlertSnapshotRow,
    DEFAULT_ALERT_RULES,
    LifetimeDollarCapRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    PayoutStatus,
    PlanKeyResolutionKind,
    UnresolvedPlanReason,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    dollars,
    effectivePayoutRequest,
    FirmId,
    fraction,
    LifetimeCapScope,
    MffuVariant,
    PayoutGate,
    type Plan,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    accountFor,
    alertsOf,
    contextOf,
    ledgerOnlyAccountFor,
    MONDAY,
    movedLiveEvent,
    paidPayout,
    planWhere,
    snapshotFor,
    TUESDAY,
} from './alertFixtures';

const MFF_PRO = planWhere(
    (plan) =>
        plan.id.firm === FirmId.Mffu && plan.id.variant === MffuVariant.Pro,
);
const MFF_OTHER_PLAN = planWhere(
    (plan) =>
        plan.id.firm === FirmId.Mffu &&
        plan.id.variant !== MffuVariant.Pro &&
        !plan.isInstantFunded,
);
const NO_DOLLAR_CAP = planWhere(
    (plan) => plan.lifetimeConclusion.maxLifetimePayoutDollars === null,
);
const CAP_CENTS = 10_000_000;
const NEXT_NET_CENTS = 80_000;
const OUTCOME =
    "the engine treats the cap as a hard stop, and profit beyond it can be forfeited (check the firm's rules for this plan)";
const POOLED_OUTCOME =
    "profit beyond the cap can be forfeited (check the firm's rules for this plan), and the calculator's projections apply the cap to one account at a time, so they do not stop at this pooled total";
const POOLING =
    'the firm states this cap per user; this alert assumes that means your accounts on this plan only, since the source does not say whether other plans at the firm count, so it pools your funded, moved-live and archived accounts on this plan; other plans and ledger-only accounts are not counted, and an account at a size the calculator does not model can only be tracked as ledger-only';
const PER_USER = `${POOLED_OUTCOME}; ${POOLING}`;
const PER_ACCOUNT =
    'the cap applies to each account on its own, so no other account is counted';
const UNCONFIRMED_SCOPE =
    "the firm's source does not say whether this cap applies per account or per user, so this alert counts this account only, and your other accounts on this plan may count toward the cap too";
const WARNING_ONLY =
    'payouts the alert cannot confirm can raise this warning but never a critical alert';
const MOVED_LIVE =
    'the payouts of 1 account that moved live, which may include live payouts the cap does not count, because the alert does not know when each account moved live';
const UNRESOLVED =
    'the payouts of 1 account on this plan whose stored plan could not be resolved';
const ARCHIVED_AT = new Date('2026-09-01T00:00:00Z');
const rule = new LifetimeDollarCapRule();

function alertsAt(
    received: {
        ledgerCents?: readonly number[];
        snapshotCents?: null | number;
    },
    options: {
        entry?: typeof MFF_PRO;
        grossOnly?: boolean;
        rulebook?: RulebookParameters;
        stage?: AccountStage;
        status?: AccountStatus;
    } = {},
) {
    const account = accountFor(options.entry ?? MFF_PRO, {
        stage: options.stage ?? AccountStage.Funded,
        status: options.status ?? AccountStatus.Active,
    });
    const snapshot: Partial<AlertSnapshotRow> = {
        cumulativePayoutCents:
            received.snapshotCents === undefined ||
            received.snapshotCents === null
                ? null
                : usdCents(received.snapshotCents),
    };
    return alertsOf(rule, {
        accounts: [account],
        payouts: [
            ...(received.ledgerCents ?? []).map((cents) =>
                paidPayout(account, {
                    grossCents: usdCents(cents),
                    netCents:
                        options.grossOnly === true ? null : usdCents(cents),
                }),
            ),
            paidPayout(account, {
                grossCents: usdCents(5_000_000),
                netCents: usdCents(5_000_000),
                status: PayoutStatus.Denied,
            }),
        ],
        rulebook: options.rulebook ?? DEFAULT_RULEBOOK,
        snapshots: [snapshotFor(account, snapshot)],
    });
}

function alertsOnPlan(plan: Plan, payoutsTaken: number, snapshotCents: number) {
    const account = fundedPro();
    return alertsWithPlan(plan, {
        accounts: [account],
        snapshots: [
            snapshotFor(account, {
                cumulativePayoutCents: usdCents(snapshotCents),
                payoutsTaken,
            }),
        ],
    });
}

function alertsWithPlan(plan: Plan, inputs: Partial<AlertInputs>) {
    const context = contextOf(inputs);
    const resolved: AlertContext = {
        ...context,
        accounts: context.accounts.map((monitored) => ({
            ...monitored,
            plan: { kind: PlanKeyResolutionKind.Resolved, plan },
        })),
    };
    return rule.evaluate(resolved);
}

function fundedPro(
    overrides: Partial<AlertAccountRow> = {},
    entry: typeof MFF_PRO = MFF_PRO,
): AlertAccountRow {
    return accountFor(entry, { stage: AccountStage.Funded, ...overrides });
}

function received(
    account: AlertAccountRow,
    cents: number,
    overrides: Partial<AlertPayoutRow> = {},
): AlertPayoutRow {
    return paidPayout(account, {
        grossCents: usdCents(cents),
        netCents: usdCents(cents),
        ...overrides,
    });
}

function withRequestCents(requestCents: number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, requestCents },
    };
}

describe('LifetimeDollarCapRule', () => {
    it('reads the $100,000 MFF Pro cap and a $1,000 minimum request paid at 80% from the plan', () => {
        const plan = MFF_PRO.plan;
        expect(plan.lifetimeConclusion.maxLifetimePayoutDollars).toBe(
            dollars(100_000),
        );
        const request = effectivePayoutRequest(
            plan,
            DEFAULT_RULEBOOK.payout.requestCents / 100,
        );
        expect(request).toBe(1000);
        expect(plan.payoutFromProfit(request, 0)).toBe(NEXT_NET_CENTS / 100);
    });

    it('is silent while the next payout at the rulebook request stays below the cap', () => {
        expect(
            alertsAt({ snapshotCents: CAP_CENTS - NEXT_NET_CENTS - 1 }),
        ).toEqual([]);
        expect(alertsAt({})).toEqual([]);
    });

    it('warns once the next payout at the rulebook request would reach the cap, naming the request, the plan minimum and the default threshold', () => {
        const alerts = alertsAt({
            snapshotCents: CAP_CENTS - NEXT_NET_CENTS,
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.LifetimeDollarCapNear);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$99,200 of the plan's $100,000 lifetime payout cap received on this account, $800 left; the next payout would reach the cap: your rulebook request of $500, raised to the plan's $1,000 minimum, pays $800 after the split (the default threshold is one next payout); ${PER_USER}`,
        );
        expect(alerts[0]?.disclosures).toEqual([]);
    });

    it('reads the next payout from the rulebook request when it is above the plan minimum', () => {
        const rulebook = withRequestCents(500_000);
        expect(alertsAt({ snapshotCents: 9_599_999 }, { rulebook })).toEqual(
            [],
        );
        const alerts = alertsAt({ snapshotCents: 9_600_000 }, { rulebook });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$96,000 of the plan's $100,000 lifetime payout cap received on this account, $4,000 left; the next payout would reach the cap: your rulebook request of $5,000 pays $4,000 after the split (the default threshold is one next payout); ${PER_USER}`,
        );
    });

    it('splits the next payout at its own payout index', () => {
        const plan = MFF_PRO.plan.withOverrides({
            payoutTiersFromPayout: [
                {
                    fromPayoutIndex: 3,
                    tiers: [
                        {
                            thresholdProfit: dollars(0),
                            traderShare: fraction(0.9),
                        },
                    ],
                },
            ],
        });
        expect(plan.payoutFromProfit(1000, 2)).toBe(800);
        expect(plan.payoutFromProfit(1000, 3)).toBe(900);
        expect(alertsOnPlan(plan, 3, CAP_CENTS - 90_001)).toEqual([]);
        const alerts = alertsOnPlan(plan, 3, CAP_CENTS - 90_000);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('pays $900 after the split');
        expect(alertsOnPlan(plan, 2, CAP_CENTS - 90_000)).toEqual([]);
    });

    it('is critical once the paid payouts reach the cap, exactly when Plan.conclusionGate names the dollar cap', () => {
        const plan = MFF_PRO.plan;
        expect(plan.conclusionGate(0, (CAP_CENTS - 1) / 100)).toBeNull();
        expect(plan.conclusionGate(0, CAP_CENTS / 100)).toBe(
            PayoutGate.LifetimeDollarCapReached,
        );
        expect(alertsAt({ snapshotCents: CAP_CENTS - 1 })[0]?.severity).toBe(
            AlertSeverity.Warning,
        );
        const critical = alertsAt({ snapshotCents: CAP_CENTS });
        expect(critical).toHaveLength(1);
        expect(critical[0]?.severity).toBe(AlertSeverity.Critical);
        expect(critical[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received on this account; no further payout fits under the cap; ${PER_USER}`,
        );
        expect(
            alertsAt({ snapshotCents: CAP_CENTS + 123_456 })[0]?.severity,
        ).toBe(AlertSeverity.Critical);
    });

    it('sums the paid ledger in cents and ignores denied payouts', () => {
        const alerts = alertsAt({
            ledgerCents: [5_000_000, 4_920_000],
        });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('$99,200 of');
        expect(alertsAt({ ledgerCents: [5_000_000, 4_919_999] })).toEqual([]);
    });

    it('takes the larger of the snapshot and the paid ledger', () => {
        expect(
            alertsAt({
                ledgerCents: [CAP_CENTS],
                snapshotCents: 1_000_000,
            })[0]?.severity,
        ).toBe(AlertSeverity.Critical);
        expect(
            alertsAt({
                ledgerCents: [1_000_000],
                snapshotCents: CAP_CENTS,
            })[0]?.severity,
        ).toBe(AlertSeverity.Critical);
    });

    it('adds payouts paid after the snapshot date to the snapshot figure', () => {
        const account = fundedPro();
        const alerts = alertsOf(rule, {
            accounts: [account],
            payouts: [
                received(account, 200_000, { paidOn: TUESDAY }),
                received(account, 300_000, { paidOn: MONDAY }),
            ],
            snapshots: [
                snapshotFor(account, {
                    asOf: MONDAY,
                    cumulativePayoutCents: usdCents(CAP_CENTS - 200_000),
                }),
            ],
        });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toContain('$100,000 of');
    });

    it('never raises a gross-only ledger total to critical over a lower net snapshot', () => {
        const alerts = alertsAt(
            { ledgerCents: [CAP_CENTS], snapshotCents: 8_000_000 },
            { grossOnly: true },
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received on this account, counting 1 paid payout at gross because no net amount is recorded, so the cap may already be reached; ${WARNING_ONLY}; ${PER_USER}`,
        );
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.GrossUsedForMissingNet,
        ]);
        expect(
            alertsAt({ ledgerCents: [CAP_CENTS] }, { grossOnly: true })[0]
                ?.severity,
        ).toBe(AlertSeverity.Warning);
        expect(
            alertsAt(
                { ledgerCents: [1_000_000], snapshotCents: CAP_CENTS },
                { grossOnly: true },
            )[0],
        ).toMatchObject({ disclosures: [], severity: AlertSeverity.Critical });
    });

    it('counts requested payouts that are not yet paid as committed for the warning only', () => {
        const account = fundedPro();
        const snapshots = [
            snapshotFor(account, {
                cumulativePayoutCents: usdCents(9_560_000),
            }),
        ];
        const pending = paidPayout(account, {
            grossCents: usdCents(450_000),
            netCents: usdCents(360_000),
            paidOn: null,
            status: PayoutStatus.Requested,
        });
        expect(alertsOf(rule, { accounts: [account], snapshots })).toEqual([]);
        const alerts = alertsOf(rule, {
            accounts: [account],
            payouts: [pending],
            snapshots,
        });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$95,600 of the plan's $100,000 lifetime payout cap received on this account, plus $3,600 requested and not yet paid, $800 left; the next payout would reach the cap: your rulebook request of $500, raised to the plan's $1,000 minimum, pays $800 after the split (the default threshold is one next payout); ${PER_USER}`,
        );
        const overCap = alertsOf(rule, {
            accounts: [account],
            payouts: [
                paidPayout(account, {
                    grossCents: usdCents(700_000),
                    netCents: usdCents(600_000),
                    paidOn: null,
                    status: PayoutStatus.Requested,
                }),
            ],
            snapshots,
        });
        expect(overCap[0]?.severity).toBe(AlertSeverity.Warning);
        expect(overCap[0]?.disclosures).toEqual([]);
        const grossRequest = alertsOf(rule, {
            accounts: [account],
            payouts: [
                paidPayout(account, {
                    grossCents: usdCents(450_000),
                    netCents: null,
                    paidOn: null,
                    status: PayoutStatus.Requested,
                }),
            ],
            snapshots,
        });
        expect(grossRequest[0]?.message).toContain(
            'plus $4,500 requested and not yet paid',
        );
        expect(grossRequest[0]?.disclosures).toEqual([
            AlertDisclosure.GrossUsedForMissingNet,
        ]);
        expect(overCap[0]?.message).toContain(
            'plus $6,000 requested and not yet paid, $0 left; the requested payouts reach the cap; profit beyond the cap',
        );
    });

    it('pools the paid payouts of every funded account on a per-user capped plan, whatever their status', () => {
        const first = fundedPro();
        const second = fundedPro();
        const busted = fundedPro({ status: AccountStatus.Busted });
        const alerts = alertsOf(rule, {
            accounts: [first, second, busted],
            payouts: [
                received(first, 5_500_000),
                received(second, 3_500_000),
                received(busted, 2_000_000),
            ],
        });
        expect(alerts.map((alert) => alert.severity)).toEqual([
            AlertSeverity.Critical,
            AlertSeverity.Critical,
        ]);
        expect(alerts[0]?.message).toBe(
            `$110,000 of the plan's $100,000 lifetime payout cap received across your 3 accounts on this plan; no further payout fits under the cap; ${PER_USER}`,
        );
    });

    it('pools the paid payouts of archived accounts on a per-user capped plan, alerting only the active funded account', () => {
        const active = fundedPro();
        const archived = fundedPro({
            archivedAt: ARCHIVED_AT,
            status: AccountStatus.Closed,
        });
        const archivedEval = accountFor(MFF_PRO, {
            archivedAt: ARCHIVED_AT,
            stage: AccountStage.Eval,
        });
        const alerts = alertsOf(rule, {
            accounts: [active, archived, archivedEval],
            payouts: [
                received(active, 5_500_000),
                received(archived, 4_500_000),
                received(archivedEval, 5_000_000),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.subject).toMatchObject({ accountId: active.id });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan; no further payout fits under the cap; ${PER_USER}`,
        );
    });

    it('pools the payouts of accounts that moved live, but never lets them alone make the alert critical', () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const archivedLive = accountFor(MFF_PRO, {
            archivedAt: ARCHIVED_AT,
            stage: AccountStage.Live,
            status: AccountStatus.Closed,
        });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive, archivedLive],
            payouts: [
                received(active, 8_000_000),
                received(movedLive, 1_500_000),
                received(archivedLive, 500_000),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.subject).toMatchObject({ accountId: active.id });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 3 accounts on this plan, counting the payouts of 2 accounts that moved live, which may include live payouts the cap does not count, because the alert does not know when each account moved live, so the cap may already be reached; ${WARNING_ONLY}; ${PER_USER}`,
        );
        expect(alerts[0]?.disclosures).toEqual([]);
        const certain = alertsOf(rule, {
            accounts: [active, movedLive],
            payouts: [
                received(active, CAP_CENTS),
                received(movedLive, 1_500_000),
            ],
        });
        expect(certain[0]?.severity).toBe(AlertSeverity.Critical);
        expect(certain[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, not counting the payouts of 1 account that moved live; no further payout fits under the cap; ${PER_USER}`,
        );
    });

    it('names the moved-live payouts when they bring the pool within one payout of the cap', () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            payouts: [
                received(active, 8_000_000),
                received(movedLive, CAP_CENTS - NEXT_NET_CENTS - 8_000_000),
            ],
        });
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$99,200 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, counting ${MOVED_LIVE}, $800 left; the next payout would reach the cap: your rulebook request of $500, raised to the plan's $1,000 minimum, pays $800 after the split (the default threshold is one next payout); ${PER_USER}`,
        );
        const requestedOnly = alertsOf(rule, {
            accounts: [active, movedLive],
            payouts: [
                received(active, 9_560_000),
                paidPayout(movedLive, {
                    grossCents: usdCents(450_000),
                    netCents: usdCents(360_000),
                    paidOn: null,
                    status: PayoutStatus.Requested,
                }),
            ],
        });
        expect(requestedOnly[0]?.message).toContain(
            `plus $3,600 requested and not yet paid, counting ${MOVED_LIVE}, $800 left`,
        );
    });

    it('keeps $100,000 of payouts on moved-live accounts at warning and says why it cannot turn critical', () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            payouts: [received(movedLive, CAP_CENTS)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, counting ${MOVED_LIVE}, so the cap may already be reached; ${WARNING_ONLY}; ${PER_USER}`,
        );
    });

    it("counts a moved-live account's payouts before its recorded move-live date as certain, and leaves its later payouts out", () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            events: [movedLiveEvent(movedLive, '2026-09-15')],
            payouts: [
                received(active, 4_000_000),
                received(movedLive, 6_000_000, { paidOn: '2026-09-10' }),
                received(movedLive, 3_000_000, { paidOn: '2026-09-20' }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan; no further payout fits under the cap; ${PER_USER}; not counting $30,000 paid on 1 account after moving live, since the cap only counts sim-funded payouts`,
        );
    });

    it("reconciles a moved-live account's pre-cutoff certain figure against its snapshot instead of trusting an incomplete dated ledger", () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            events: [movedLiveEvent(movedLive, '2026-09-15')],
            payouts: [
                received(active, 4_000_000),
                received(movedLive, 1_000_000, { paidOn: '2026-09-10' }),
                received(movedLive, 3_000_000, { paidOn: '2026-09-20' }),
            ],
            snapshots: [
                snapshotFor(movedLive, {
                    asOf: '2026-09-12',
                    cumulativePayoutCents: usdCents(6_000_000),
                }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan; no further payout fits under the cap; ${PER_USER}; not counting $30,000 paid on 1 account after moving live, since the cap only counts sim-funded payouts`,
        );
    });

    it('never lets a snapshot dated on or after the move-live date inflate the certain figure with live payouts, and keeps the disclosure consistent with it', () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            events: [movedLiveEvent(movedLive, '2026-09-15')],
            payouts: [
                received(active, 4_000_000),
                received(movedLive, 6_000_000, { paidOn: '2026-09-10' }),
                received(movedLive, 3_000_000, { paidOn: '2026-09-20' }),
            ],
            snapshots: [
                snapshotFor(movedLive, {
                    asOf: '2026-09-25',
                    cumulativePayoutCents: usdCents(9_000_000),
                }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan; no further payout fits under the cap; ${PER_USER}; not counting $30,000 paid on 1 account after moving live, since the cap only counts sim-funded payouts`,
        );
    });

    it('reconstructs an incomplete pre-cutoff ledger from a snapshot dated on or after the move-live date, instead of undercounting the certain figure', () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            events: [movedLiveEvent(movedLive, '2026-09-15')],
            payouts: [
                received(active, 4_000_000),
                received(movedLive, 1_000_000, { paidOn: '2026-09-10' }),
                received(movedLive, 3_000_000, { paidOn: '2026-09-20' }),
            ],
            snapshots: [
                snapshotFor(movedLive, {
                    asOf: '2026-09-25',
                    cumulativePayoutCents: usdCents(9_000_000),
                }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan; no further payout fits under the cap; ${PER_USER}; not counting $30,000 paid on 1 account after moving live, since the cap only counts sim-funded payouts`,
        );
    });

    it('never applies the move-live cutoff to an account whose stored plan could not be resolved, even with a recorded move-live date', () => {
        const active = fundedPro();
        const flagged = fundedPro({
            archivedAt: ARCHIVED_AT,
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.CorruptOptIns,
                },
            ],
        });
        const alerts = alertsOf(rule, {
            accounts: [active, flagged],
            events: [movedLiveEvent(flagged, '2026-09-15')],
            payouts: [
                received(active, 4_500_000),
                received(flagged, 3_000_000, { paidOn: '2026-09-10' }),
                received(flagged, 3_000_000, { paidOn: '2026-09-20' }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$105,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, counting ${UNRESOLVED}, so the cap may already be reached; ${WARNING_ONLY}; ${PER_USER}`,
        );
    });

    it("keeps a moved-live account's payouts unconfirmed when no move-live date is recorded, even with the same totals", () => {
        const active = fundedPro();
        const movedLive = accountFor(MFF_PRO, { stage: AccountStage.Live });
        const alerts = alertsOf(rule, {
            accounts: [active, movedLive],
            payouts: [
                received(active, 4_000_000),
                received(movedLive, 6_000_000, { paidOn: '2026-09-10' }),
                received(movedLive, 3_000_000, { paidOn: '2026-09-20' }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            'so the cap may already be reached',
        );
        expect(alerts[0]?.message).not.toContain(
            'no further payout fits under the cap',
        );
    });

    it("gives an archived account's stale requested payout a ledger notice even when the pool is nowhere near the cap", () => {
        const active = fundedPro();
        const archived = fundedPro({ archivedAt: ARCHIVED_AT });
        const staleRequest = paidPayout(archived, {
            grossCents: usdCents(450_000),
            netCents: usdCents(360_000),
            paidOn: null,
            status: PayoutStatus.Requested,
        });
        const alerts = alertsOf(rule, {
            accounts: [active, archived],
            payouts: [received(active, 1_000_000), staleRequest],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$3,600 requested on 1 archived account on this plan was never marked paid or denied; mark it paid or denied to keep the lifetime cap total accurate; ${PER_USER}`,
        );
    });

    it('counts an archived account on this plan whose stored plan does not resolve as unconfirmed: it can warn but never make the alert critical', () => {
        const active = fundedPro();
        const sizeMismatch = fundedPro({
            accountSize: 150_000,
            archivedAt: ARCHIVED_AT,
            status: AccountStatus.Closed,
        });
        const flagged = fundedPro({
            archivedAt: ARCHIVED_AT,
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.CorruptOptIns,
                },
            ],
        });
        for (const unresolved of [sizeMismatch, flagged]) {
            const alerts = alertsOf(rule, {
                accounts: [active, unresolved],
                payouts: [
                    received(active, 4_500_000),
                    received(unresolved, 6_000_000),
                ],
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.subject).toMatchObject({ accountId: active.id });
            expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
            expect(alerts[0]?.message).toBe(
                `$105,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, counting ${UNRESOLVED}, so the cap may already be reached; ${WARNING_ONLY}; ${PER_USER}`,
            );
        }
        const certain = alertsOf(rule, {
            accounts: [active, sizeMismatch],
            payouts: [
                received(active, CAP_CENTS),
                received(sizeMismatch, 6_000_000),
            ],
        });
        expect(certain[0]?.severity).toBe(AlertSeverity.Critical);
        expect(certain[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, not counting ${UNRESOLVED}; no further payout fits under the cap; ${PER_USER}`,
        );
    });

    it('counts the paid payouts with an invalid stored date on another account on this plan as unconfirmed', () => {
        const active = fundedPro();
        const archived = fundedPro({ archivedAt: ARCHIVED_AT });
        const alerts = alertsOf(rule, {
            accounts: [active, archived],
            payouts: [
                received(active, 4_500_000),
                received(archived, 6_000_000, { paidOn: '2026-13-45' }),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toBe(
            `$105,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan, counting 1 paid payout with an invalid stored date, so the cap may already be reached; ${WARNING_ONLY}; ${PER_USER}`,
        );
    });

    it('names the accounts at this firm it cannot place on this plan: unknown plan serials, unreadable archived rows and ledger-only accounts', () => {
        const active = fundedPro();
        const unknownSerial = fundedPro({
            archivedAt: ARCHIVED_AT,
            planSerial: 'mffu-no-such-plan',
        });
        const unreadable = fundedPro({
            archivedAt: ARCHIVED_AT,
            planSerial: null,
        });
        const ledgerOnly = ledgerOnlyAccountFor(MFF_PRO, {
            stage: AccountStage.Funded,
        });
        const otherFirmLedgerOnly = ledgerOnlyAccountFor(NO_DOLLAR_CAP, {
            stage: AccountStage.Funded,
        });
        const alerts = alertsOf(rule, {
            accounts: [
                active,
                unknownSerial,
                unreadable,
                ledgerOnly,
                otherFirmLedgerOnly,
            ],
            payouts: [
                received(active, CAP_CENTS),
                received(unknownSerial, 1_000_000),
                received(ledgerOnly, 3_000_000),
                received(otherFirmLedgerOnly, 3_000_000),
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received on this account; no further payout fits under the cap; ${PER_USER}; not counting 1 account at this firm whose plan could not be identified; not counting 1 archived account whose stored data could not be read; not counting $30,000 paid on 1 ledger-only account at this firm that may belong to this plan`,
        );
    });

    it('leaves the requested payouts of archived accounts out of the committed total and names them apart', () => {
        const active = fundedPro();
        const archived = fundedPro({ archivedAt: ARCHIVED_AT });
        const staleRequest = paidPayout(archived, {
            grossCents: usdCents(450_000),
            netCents: usdCents(360_000),
            paidOn: null,
            status: PayoutStatus.Requested,
        });
        const belowCap = alertsOf(rule, {
            accounts: [active, archived],
            payouts: [received(active, 9_560_000), staleRequest],
        });
        expect(belowCap).toHaveLength(1);
        expect(belowCap[0]?.severity).toBe(AlertSeverity.Warning);
        expect(belowCap[0]?.message).toBe(
            `$3,600 requested on 1 archived account on this plan was never marked paid or denied; mark it paid or denied to keep the lifetime cap total accurate; ${PER_USER}`,
        );
        const atCap = alertsOf(rule, {
            accounts: [active, archived],
            payouts: [received(active, CAP_CENTS), staleRequest],
        });
        expect(atCap[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received across your 2 accounts on this plan; no further payout fits under the cap; ${PER_USER}; not counting $3,600 requested on 1 archived account and never marked paid or denied`,
        );
    });

    it('says the scope is unconfirmed and counts this account only when a capped plan states no scope', () => {
        const unconfirmed = MFF_PRO.plan.withOverrides({
            lifetimeDollarCapScope: undefined,
        });
        expect(unconfirmed.lifetimeConclusion.dollarCapScope).toBe(
            LifetimeCapScope.Unconfirmed,
        );
        const first = fundedPro();
        const second = fundedPro();
        expect(
            alertsWithPlan(unconfirmed, {
                accounts: [first, second],
                payouts: [
                    received(first, 6_000_000),
                    received(second, 6_000_000),
                ],
            }),
        ).toEqual([]);
        const atCap = alertsWithPlan(unconfirmed, {
            accounts: [first],
            payouts: [received(first, CAP_CENTS)],
        });
        expect(atCap[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received on this account; no further payout fits under the cap; ${OUTCOME}; ${UNCONFIRMED_SCOPE}`,
        );
    });

    it('reads the cap scope from the plan: MFF Pro is per user, and a per-account cap alerts each account on its own', () => {
        expect(MFF_PRO.plan.lifetimeConclusion.dollarCapScope).toBe(
            LifetimeCapScope.PerUserAcrossVariant,
        );
        const perAccount = MFF_PRO.plan.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        expect(perAccount.lifetimeConclusion.dollarCapScope).toBe(
            LifetimeCapScope.PerAccount,
        );
        const first = fundedPro();
        const second = fundedPro();
        const archived = fundedPro({ archivedAt: ARCHIVED_AT });
        const belowEach = {
            accounts: [first, second, archived],
            payouts: [
                received(first, 6_000_000),
                received(second, 6_000_000),
                received(archived, 6_000_000),
            ],
        };
        expect(alertsWithPlan(perAccount, belowEach)).toEqual([]);
        expect(
            alertsWithPlan(MFF_PRO.plan, belowEach).map(
                (alert) => alert.severity,
            ),
        ).toEqual([AlertSeverity.Critical, AlertSeverity.Critical]);
        const atCap = alertsWithPlan(perAccount, {
            accounts: [first, second],
            payouts: [received(first, CAP_CENTS), received(second, 6_000_000)],
        });
        expect(atCap).toHaveLength(1);
        expect(atCap[0]?.subject).toMatchObject({ accountId: first.id });
        expect(atCap[0]?.message).toBe(
            `$100,000 of the plan's $100,000 lifetime payout cap received on this account; no further payout fits under the cap; ${OUTCOME}; ${PER_ACCOUNT}`,
        );
    });

    it('does not pool eval, ledger-only or other-plan accounts', () => {
        const pro = fundedPro();
        const otherPlan = fundedPro({}, MFF_OTHER_PLAN);
        const evalPro = accountFor(MFF_PRO, { stage: AccountStage.Eval });
        const ledgerOnly = ledgerOnlyAccountFor(MFF_PRO, {
            stage: AccountStage.Funded,
        });
        const alerts = alertsOf(rule, {
            accounts: [pro, otherPlan, evalPro, ledgerOnly],
            payouts: [
                received(pro, 5_000_000),
                received(otherPlan, 5_000_000),
                received(evalPro, 5_000_000),
                received(ledgerOnly, 5_000_000),
            ],
        });
        expect(alerts).toEqual([]);
    });

    it('applies only to active funded accounts on plans with a lifetime dollar cap', () => {
        expect(
            alertsAt(
                { snapshotCents: CAP_CENTS },
                { stage: AccountStage.Eval },
            ),
        ).toEqual([]);
        expect(
            alertsAt(
                { snapshotCents: CAP_CENTS },
                { status: AccountStatus.Busted },
            ),
        ).toEqual([]);
        expect(
            alertsAt(
                { snapshotCents: 1_000_000_000 },
                { entry: NO_DOLLAR_CAP },
            ),
        ).toEqual([]);
    });

    it('skips a ledger-only funded account, which has no plan cap', () => {
        const account = ledgerOnlyAccountFor(MFF_PRO, {
            stage: AccountStage.Funded,
        });
        const snapshot = snapshotFor(account, {
            cumulativePayoutCents: usdCents(CAP_CENTS),
        });
        expect(
            alertsOf(rule, { accounts: [account], snapshots: [snapshot] }),
        ).toEqual([]);
    });

    it('is registered with the default alert rules', () => {
        expect(
            DEFAULT_ALERT_RULES.some(
                (candidate) => candidate instanceof LifetimeDollarCapRule,
            ),
        ).toBe(true);
    });
});
