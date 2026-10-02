import { afterEach, describe, expect, it } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    type OverviewAccountRow,
    type OverviewPayoutRow,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type CopyGroupSizingSection,
    copyGroupSizingSectionsOf,
    withPositionSizing,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    type LedgerEventRow,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    InstrumentSymbol,
    type LiveTransitionTrigger,
    MffuVariant,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';
import {
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    LiveTriggerCoverage,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const TODAY = '2026-09-26';
const GROUP = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
};

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function mffProPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

const PLAN = mffProPlan();
const DOCUMENTED_RISK = DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;
const PEAK = PLAN.accountSize + 20_000;
const THRESHOLD = PEAK - PLAN.fundedDrawdown.amount;
const ROOMY_BALANCE_CENTS = Math.round((THRESHOLD + DOCUMENTED_RISK * 5) * 100);

const MNQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.MNQ,
    stopPoints: 20,
} as const;

function accountRow(
    id: string,
    personalRules: unknown = {},
): CopyGroupAccount & OverviewAccountRow {
    return {
        accountSize: PLAN.accountSize,
        archivedAt: null,
        copyGroupId: GROUP.id,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: PLAN.id.firm,
        firstFundedTradeOn: '2026-08-01',
        fundedOn: '2026-08-01',
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules,
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-07-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
    } as unknown as CopyGroupAccount & OverviewAccountRow;
}

function movedLiveEvent(accountId: string, on: string): LedgerEventRow {
    return {
        accountId,
        id: `${accountId}-moved-live-${on}`,
        kind: AccountEventKind.MovedLive,
        occurredOn: on,
        userId: USER_ID,
    } as unknown as LedgerEventRow;
}

function paidPayout(
    accountId: string,
    index: number,
    paidOn: string,
): OverviewPayoutRow {
    return {
        accountId,
        approvedOn: paidOn,
        grossCents: usdCents(100_000),
        id: `${accountId}-payout-${String(index)}`,
        netCents: usdCents(90_000),
        paidOn,
        requestedOn: paidOn,
        status: PayoutStatus.Paid,
        userId: USER_ID,
    };
}

function sectionFor(
    ids: readonly string[],
    ledger: {
        readonly events?: readonly LedgerEventRow[];
        readonly payouts?: readonly OverviewPayoutRow[];
        readonly personalRules?: ReadonlyMap<string, unknown>;
    } = {},
): CopyGroupSizingSection {
    const accounts = ids.map((id) =>
        accountRow(id, ledger.personalRules?.get(id) ?? {}),
    );
    const sections = copyGroupSizingSectionsOf(
        DEFAULT_RULEBOOK,
        USER_ID,
        TODAY,
        accounts,
        ledger.events ?? [],
        ledger.payouts ?? [],
        accounts.map((account) => snapshotRow(account.id)),
        copyGroupRows([GROUP], accounts).groups,
    );
    const section = sections.get(GROUP.id);
    if (section === undefined) throw new Error('no section for the group');
    return section;
}

function sizedResultOf(section: CopyGroupSizingSection) {
    if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error('expected the group to be sized');
    }
    return section.result;
}

function snapshotRow(accountId: string): OverviewSnapshotRow {
    return {
        accountId,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(ROOMY_BALANCE_CENTS),
        createdAt: new Date(`${TODAY}T00:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(Math.round(PEAK * 100)),
        highestIntradayBalanceCents: null,
        id: `${accountId}-snapshot`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 20,
        userId: USER_ID,
    };
}

const mffu = findFirm(FirmId.Mffu) as unknown as {
    accountPolicy: FirmAccountPolicy;
};
const originalPolicy = mffu.accountPolicy;

function withPolicy<T>(
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    mffu.accountPolicy = new StubTriggerPolicy(triggers);
    try {
        return run();
    } finally {
        mffu.accountPolicy = originalPolicy;
    }
}

afterEach(() => {
    mffu.accountPolicy = originalPolicy;
});

describe('the copy-group page prices a verified live trigger (PT-36h, F-145, F-154)', () => {
    const singleDay = new SingleDayProfitTrigger(
        dollars(250),
        true,
        false,
        CONFIRMED_SOURCE,
    );

    it("caps the group rung at the firm's verified single-day ceiling, as it caps a single account", () => {
        const section = withPolicy([singleDay], () => sectionFor(['a', 'b']));
        const [rung] = sizedResultOf(section).sizing.rungs;

        expect(rung?.risk).toBe(100);
        expect(rung?.cappedBy).toContain(SizingConstraint.CeilingCap);
    });

    it('leaves the group rung at the documented size when the firm has no verified trigger', () => {
        const [rung] = sizedResultOf(sectionFor(['a', 'b'])).sizing.rungs;

        expect(rung?.risk).toBe(DOCUMENTED_RISK);
    });

    it('rounds the capped group rung to whole contracts at an entered stop', () => {
        const section = withPolicy([singleDay], () =>
            withPositionSizing(sectionFor(['a', 'b']), MNQ_AT_20_POINTS),
        );
        const result = sizedResultOf(section);

        expect(result.sizing.rungs[0]?.risk).toBe(80);
        expect(result.contractPlacement?.contracts).toBe(2);
        expect(result.contractPlacement?.isRefused).toBe(false);
    });

    it('computes the group without a stop when none is entered', () => {
        const section = sectionFor(['a']);

        expect(sizedResultOf(section).contractPlacement).toBeNull();
        expect(withPositionSizing(section, null).result).toEqual(
            section.result,
        );
    });

    it('hands each member the firm payouts paid since the last live account and enforces a firm-total trigger', () => {
        const total = new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE);
        const section = withPolicy([total], () =>
            sectionFor(['a', 'b'], {
                events: [movedLiveEvent('a', '2026-06-01')],
                payouts: [
                    paidPayout('a', 1, '2026-05-01'),
                    paidPayout('a', 2, '2026-08-05'),
                    paidPayout('b', 1, '2026-08-10'),
                    paidPayout('b', 2, '2026-08-20'),
                ],
            }),
        );

        expect(
            section.inputs.members.map(
                (member) => member.paidPayoutsSinceLastLiveAccount,
            ),
        ).toEqual([3, 3]);
        expect(sizedResultOf(section).liveTriggerCoverage).toBe(
            LiveTriggerCoverage.Enforced,
        );
    });

    it("hands each member its firm's account policy", () => {
        const section = withPolicy([singleDay], () => sectionFor(['a']));

        expect(
            section.inputs.members.map((member) => member.accountPolicy),
        ).toEqual([expect.any(StubTriggerPolicy)]);
    });

    it('says the triggers are not checked for a firm whose triggers no source confirms', () => {
        const unverified = new SingleDayProfitTrigger(
            dollars(250),
            true,
            false,
            {
                verification: PolicyVerification.NeedsPaste,
            },
        );
        const section = withPolicy([unverified], () => sectionFor(['a']));

        expect(sizedResultOf(section).liveTriggerCoverage).toBe(
            LiveTriggerCoverage.NotChecked,
        );
    });

    it("lowers the group rung to a member's personal daily loss limit", () => {
        const section = sectionFor(['a', 'b'], {
            personalRules: new Map([
                ['b', { dailyLossLimitCents: usdCents(5000) }],
            ]),
        });
        const [rung] = sizedResultOf(section).sizing.rungs;

        expect(rung?.risk).toBeLessThanOrEqual(50);
        expect(rung?.cappedBy).toContain(SizingConstraint.PersonalCap);
    });

    it("lowers the group rung to a member's personal max risk per trade", () => {
        const section = sectionFor(['a', 'b'], {
            personalRules: new Map([
                ['a', { maxRiskPerTradeCents: usdCents(6000) }],
            ]),
        });
        const [rung] = sizedResultOf(section).sizing.rungs;

        expect(rung?.risk).toBe(60);
        expect(rung?.cappedBy).toContain(SizingConstraint.PersonalCap);
    });

    it('hands each member its own personal caps and daily loss limit', () => {
        const section = sectionFor(['a', 'b'], {
            personalRules: new Map([
                [
                    'b',
                    {
                        dailyLossLimitCents: usdCents(5000),
                        maxTradesPerDay: 3,
                    },
                ],
            ]),
        });
        const [first, second] = section.inputs.members;

        expect(first?.personalDll).toBeNull();
        expect(first?.personalCaps?.maxTradesPerDay).toBeNull();
        expect(second?.personalDll).toBe(50);
        expect(second?.personalCaps?.maxTradesPerDay).toBe(3);
    });
});
