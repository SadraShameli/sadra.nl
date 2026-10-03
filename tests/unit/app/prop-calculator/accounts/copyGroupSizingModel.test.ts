import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    CopyGroupWorkerOutcomeKind,
    simulateGroupOutcomeOf,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import {
    overviewPlanOptInsOf,
    overviewRequestsFor,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { accountStateUnavailableText } from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import { type OverviewAccountRow } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { type OverviewSnapshotRow } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    COPY_GROUP_SIMULATION_SEED,
    COPY_GROUP_SIMULATION_TRIALS,
    CopyGroupSimulationPlanKind,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSimulationModel';
import {
    copyGroupRuleTermsOf,
    type CopyGroupSizingSection,
    copyGroupSizingSectionsOf,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    AccountEventKind,
    AccountStage,
    AccountStateUnavailableKind,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    ExposureUnavailableKind,
    type LedgerEventRow,
    usdCents,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
    DayStopRuleKind,
    dollars,
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AssumptionKind,
    assumptionText,
    CopyGroupSizingRejectionKind,
    CopyGroupSizingResultKind,
    DailyProfitCapKind,
    DEFAULT_RULEBOOK,
    type DocumentedSizing,
    SIZING_CONSTRAINT_TEXT,
    SizingAssumption,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

import { soloRungSumOf } from './copyGroupSizedRungs';

const USER_ID = 'user-a';
const TODAY = '2026-09-26';
const GROUP = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
};

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
const TIGHT_RISK_CENTS = Math.round((DOCUMENTED_RISK / 2) * 100);

function accountRow(
    id: string,
    overrides: Record<string, unknown> = {},
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
        personalRules: {},
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
        ...overrides,
    } as unknown as CopyGroupAccount & OverviewAccountRow;
}

function loose() {
    return accountRow('loose');
}

function readyPlanOf(section: CopyGroupSizingSection) {
    if (section.simulation.kind !== CopyGroupSimulationPlanKind.Ready) {
        throw new Error(
            `expected a ready simulation plan, received ${section.simulation.kind}`,
        );
    }
    return section.simulation;
}

function sectionFor(
    accounts: readonly (CopyGroupAccount & OverviewAccountRow)[],
    balances: Readonly<Record<string, number>> = {},
    rulebook = DEFAULT_RULEBOOK,
    events: readonly LedgerEventRow[] = [],
): CopyGroupSizingSection {
    const groups = copyGroupRows([GROUP], accounts).groups;
    const sections = copyGroupSizingSectionsOf(
        rulebook,
        USER_ID,
        TODAY,
        accounts,
        events,
        [],
        accounts.map((account) =>
            snapshotRow(
                account.id,
                balances[account.id] ?? ROOMY_BALANCE_CENTS,
            ),
        ),
        groups,
    );
    const section = sections.get(GROUP.id);
    if (section === undefined) throw new Error('no section for the group');
    return section;
}

function snapshotRow(
    accountId: string,
    balanceCents: number,
): OverviewSnapshotRow {
    return {
        accountId,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(balanceCents),
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

function tight() {
    return accountRow('tight', {
        personalRules: { maxRiskPerTradeCents: TIGHT_RISK_CENTS },
    });
}

describe('the copy group simulation plan', () => {
    it('says the group simulation prices no live transfer when a member firm has a hazard entered, and nothing when none does', () => {
        const hazardRulebook = {
            ...DEFAULT_RULEBOOK,
            liveTransfer: {
                hazardPerPaidPayoutByFirm: { [FirmId.Mffu]: 0.3 },
            },
        };
        const priced = readyPlanOf(
            sectionFor([loose(), tight()], {}, hazardRulebook),
        );
        const unpriced = readyPlanOf(sectionFor([loose(), tight()]));

        const notPriced = priced.assumptions.filter(
            (assumption) =>
                assumption.kind === AssumptionKind.LiveTransferHazardNotPriced,
        );
        expect(
            notPriced.map((assumption) => assumptionText(assumption)),
        ).toEqual([
            expect.stringContaining('runs as if no account is ever sent live'),
        ]);
        expect(
            unpriced.assumptions.map((assumption) => assumption.kind),
        ).not.toContain(AssumptionKind.LiveTransferHazardNotPriced);
    });

    it('simulates every sized member at the documented group size, through each member own engine policy', () => {
        const section = sectionFor([loose(), tight()]);
        if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
            throw new Error('expected the group to be sized');
        }
        const groupRisk = section.result.sizing.rungs[0]?.risk ?? 0;
        const plan = readyPlanOf(section);

        expect(plan.groupRisk).toBe(groupRisk);
        expect(plan.request.members.map((member) => member.id)).toEqual([
            'loose',
            'tight',
        ]);
        expect(plan.request.seed).toBe(COPY_GROUP_SIMULATION_SEED);
        expect(plan.request.trials).toBe(COPY_GROUP_SIMULATION_TRIALS);
        for (const member of plan.request.members) {
            expect(member.spec.rulebook.funded.riskCents).toBe(
                Math.round(groupRisk * CENTS_PER_DOLLAR),
            );
            expect(member.start.phase).toBe(TradingPhase.Funded);
            expect(member.planSerial).toBe(serializePlanId(PLAN.id));
        }
    });

    it('builds a member documented engine policy the way the overview builds the same plan: one documented-spec builder (PT-42c, F-136)', () => {
        const plan = readyPlanOf(sectionFor([loose(), accountRow('other')]));
        const member = plan.request.members.find(({ id }) => id === 'loose');
        const [overview] = overviewRequestsFor(
            [
                {
                    firmId: PLAN.id.firm,
                    measuredRebuyLag: null,
                    optIns: overviewPlanOptInsOf(PLAN),
                    planSerial: serializePlanId(PLAN.id),
                },
            ],
            DEFAULT_RULEBOOK,
        );
        expect(member?.spec.enginePolicy).toEqual(overview?.spec.enginePolicy);
        expect(member?.spec.enginePolicy.payoutRequestOverride).toBeNull();
    });

    it('keeps the documented reward to risk ratio when the group size replaces the documented risk', () => {
        const plan = readyPlanOf(sectionFor([loose(), tight()]));
        const documentedRatio =
            DEFAULT_RULEBOOK.funded.takeProfitCents /
            DEFAULT_RULEBOOK.funded.riskCents;
        for (const member of plan.request.members) {
            const { funded } = member.spec.rulebook;
            expect(funded.takeProfitCents / funded.riskCents).toBeCloseTo(
                documentedRatio,
                3,
            );
        }
    });

    it("carries each member's own personal retained cushion into its policy and no one else's", () => {
        const cushionCents = 350_000;
        const plan = readyPlanOf(
            sectionFor([
                loose(),
                accountRow('careful', {
                    personalRules: { retainedCushionCents: cushionCents },
                }),
            ]),
        );
        const cushionOf = (id: string) =>
            plan.request.members.find((member) => member.id === id)?.spec
                .enginePolicy.retainedCushionRequest;
        expect(cushionOf('careful')).toBe(cushionCents / CENTS_PER_DOLLAR);
        expect(cushionOf('loose')).toBe(
            DEFAULT_RULEBOOK.payout.retainedCushionCents / CENTS_PER_DOLLAR,
        );
    });

    it("carries each member's own personal caps and daily loss limit into its policy and no one else's (PT-68g, F-V16)", () => {
        const plan = readyPlanOf(
            sectionFor([
                loose(),
                accountRow('careful', {
                    personalRules: {
                        dailyLossLimitCents: 60_000,
                        dailyProfitCapCents: 90_000,
                        maxRiskPerTradeCents: TIGHT_RISK_CENTS,
                        maxTradesPerDay: 2,
                    },
                }),
            ]),
        );
        const policyOf = (id: string) =>
            plan.request.members.find((member) => member.id === id)?.spec
                .enginePolicy;
        expect(policyOf('careful')?.personalCaps).toEqual({
            dailyProfitCap: 900,
            maxRiskPerTrade: TIGHT_RISK_CENTS / CENTS_PER_DOLLAR,
            maxTradesPerDay: 2,
        });
        expect(policyOf('careful')?.personalDll).toBe(600);
        expect(policyOf('loose')).not.toHaveProperty('personalCaps');
        expect(policyOf('loose')).not.toHaveProperty('personalDll');
    });

    it('carries the optimistic and unsized assumptions of the members policies, each stated once', () => {
        const plan = readyPlanOf(sectionFor([loose(), tight()]));
        const kinds = plan.assumptions.map((assumption) => assumption.kind);
        expect(kinds).toContain(AssumptionKind.PositionSizingUnspecified);
        const noCommission = plan.assumptions.filter(
            (assumption) =>
                assumption.kind === AssumptionKind.SizingRule &&
                assumption.sizingAssumption === SizingAssumption.NoCommission,
        );
        expect(noCommission).toHaveLength(1);
        const texts = plan.assumptions.map((assumption) =>
            assumptionText(assumption),
        );
        expect(new Set(texts).size).toBe(texts.length);
    });

    it('builds a request the copy group worker simulates for the whole sized group', () => {
        const plan = readyPlanOf(sectionFor([loose(), tight()]));
        const outcome = simulateGroupOutcomeOf({
            ...plan.request,
            trials: 40,
        });
        expect(outcome.kind).toBe(CopyGroupWorkerOutcomeKind.Simulated);
        if (outcome.kind !== CopyGroupWorkerOutcomeKind.Simulated) return;
        expect(outcome.result.memberIds).toEqual(['loose', 'tight']);
    });

    it('lists the members left out of the simulation by name', () => {
        const section = sectionFor([
            loose(),
            tight(),
            accountRow('unresolvable', { planSerial: 'no-such-plan' }),
        ]);
        const plan = readyPlanOf(section);
        expect(plan.leftOutLabels).toEqual(['unresolvable']);
        expect(plan.members.map((member) => member.id)).toEqual([
            'loose',
            'tight',
        ]);
    });

    it('is unavailable with the sizing reason when a member has no cushion room left', () => {
        const section = sectionFor([accountRow('drained'), tight()], {
            drained: Math.round(THRESHOLD * 100),
        });
        expect(section.result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (section.result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(section.result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.NoCushionRoom,
        );
        expect(section.simulation).toEqual({
            kind: CopyGroupSimulationPlanKind.Unavailable,
            reason: section.result.rejection.message,
        });
    });

    it('is unavailable with the sizing reason when no member can be sized', () => {
        const section = sectionFor([
            accountRow('unresolvable', { planSerial: 'no-such-plan' }),
        ]);
        expect(section.simulation.kind).toBe(
            CopyGroupSimulationPlanKind.Unavailable,
        );
    });
});

function replacementEvents(): {
    readonly accounts: readonly (CopyGroupAccount & OverviewAccountRow)[];
    readonly events: readonly LedgerEventRow[];
} {
    const replaced = accountRow('prior', {
        copyGroupId: null,
        status: AccountStatus.Busted,
    });
    const replacement = accountRow('loose', {
        purchasedOn: '2026-08-14',
        replacesAccountId: 'prior',
    });
    const event = (
        id: string,
        kind: AccountEventKind,
        occurredOn: string,
    ): LedgerEventRow => ({
        accountId: 'prior',
        createdAt: new Date(`${occurredOn}T12:00:00Z`),
        detail: { changes: [], note: null },
        id,
        kind,
        occurredOn,
        userId: USER_ID,
    });
    return {
        accounts: [replacement, replaced],
        events: [
            event('e-purchased', AccountEventKind.Purchased, '2026-08-03'),
            event('e-busted', AccountEventKind.Busted, '2026-08-10'),
        ],
    };
}

describe('the copy group simulation rebuy lag (PT-101, F-76)', () => {
    it("carries the plan's measured rebuy lag into the member's policy", () => {
        const { accounts, events } = replacementEvents();
        const plan = readyPlanOf(
            sectionFor(accounts, {}, DEFAULT_RULEBOOK, events),
        );
        const policy = plan.request.members.find(
            (member) => member.id === 'loose',
        )?.spec.enginePolicy;

        expect(policy?.rebuyLagDays).toBe(3);
    });

    it('assumes no rebuy lag while the ledger holds no replacement on the plan', () => {
        const plan = readyPlanOf(sectionFor([loose(), tight()]));
        for (const member of plan.request.members) {
            expect(member.spec.enginePolicy.rebuyLagDays).toBe(0);
        }
    });
});

function exposureOfGroup(
    accounts: readonly (CopyGroupAccount & OverviewAccountRow)[],
) {
    const { exposure } = sectionFor(accounts);
    if (exposure === null) throw new Error('expected a group exposure');
    return exposure;
}

describe('the copy group exposure applies the members personal limits (PT-101, F-86)', () => {
    const personalDll = 30_000;
    const personalDllDollars = personalDll / CENTS_PER_DOLLAR;

    function cappedMember(id = 'capped') {
        return accountRow(id, {
            personalRules: { dailyLossLimitCents: personalDll },
        });
    }

    it('caps the group maximum daily loss at each member personal daily loss limit, to the dollar', () => {
        const unlimited = exposureOfGroup([loose(), accountRow('other')]);
        const limited = exposureOfGroup([cappedMember(), accountRow('other')]);
        const cappedAlone = exposureOfGroup([cappedMember()]);

        expect(cappedAlone.maxDailyLoss).toBe(personalDllDollars);
        expect(limited.maxDailyLoss).toBe(
            personalDllDollars + unlimited.maxDailyLoss / 2,
        );
        expect(limited.maxDailyLoss).toBeLessThan(unlimited.maxDailyLoss);
    });

    it('equals the sum of the members sized rungs at their own limits, and is above zero', () => {
        const section = sectionFor([
            cappedMember(),
            accountRow('one-trade', { personalRules: { maxTradesPerDay: 1 } }),
        ]);
        const exposure = section.exposure;

        expect(exposure?.maxDailyLoss).toBe(soloRungSumOf(section));
        expect(exposure?.maxDailyLoss).toBe(
            personalDllDollars + DOCUMENTED_RISK,
        );
        expect(exposure?.maxDailyLoss).toBeGreaterThan(0);
    });

    it('keeps the exposure equal to the sum of the members sized rungs for a group with no personal limit', () => {
        const section = sectionFor([loose(), tight()]);

        expect(section.exposure?.maxDailyLoss).toBe(soloRungSumOf(section));
        expect(section.exposure?.maxDailyLoss).toBeGreaterThan(0);
    });

    it('names the group members left out of the exposure', () => {
        const exposure = exposureOfGroup([
            loose(),
            tight(),
            accountRow('unresolvable', { planSerial: 'no-such-plan' }),
        ]);

        expect(exposure.accountIds).toEqual(['loose', 'tight']);
        expect(exposure.leftOutAccountIds).toEqual(['unresolvable']);
    });
});

describe('the copy group sizing is withheld for a stale balance (PT-101)', () => {
    const FRESH_DAY = '2026-09-26';
    const SEVEN_DAYS_OLD = '2026-09-19';
    const EIGHT_DAYS_OLD = '2026-09-18';

    function sectionWithSnapshotDates(
        dates: Readonly<Record<string, string>>,
    ): CopyGroupSizingSection {
        const accounts = [loose(), tight()];
        const groups = copyGroupRows([GROUP], accounts).groups;
        const sections = copyGroupSizingSectionsOf(
            DEFAULT_RULEBOOK,
            USER_ID,
            TODAY,
            accounts,
            [],
            [],
            accounts.map((account) => ({
                ...snapshotRow(account.id, ROOMY_BALANCE_CENTS),
                asOf: dates[account.id] ?? FRESH_DAY,
            })),
            groups,
        );
        const section = sections.get(GROUP.id);
        if (section === undefined) throw new Error('no section for the group');
        return section;
    }

    it('dates the group size by the oldest balance among its sized members', () => {
        const section = sectionWithSnapshotDates({ tight: SEVEN_DAYS_OLD });

        expect(section.asOf).toBe(SEVEN_DAYS_OLD);
        expect(section.staleMembers).toEqual([]);
    });

    it('names a funded member whose balance is older than the rulebook funded stale days', () => {
        const section = sectionWithSnapshotDates({ tight: EIGHT_DAYS_OLD });

        expect(section.asOf).toBe(EIGHT_DAYS_OLD);
        expect(section.staleMembers).toEqual([
            { asOf: EIGHT_DAYS_OLD, label: 'tight', memberId: 'tight' },
        ]);
    });

    it('has no stale member when every balance is from today', () => {
        const section = sectionWithSnapshotDates({});

        expect(section.asOf).toBe(TODAY);
        expect(section.staleMembers).toEqual([]);
    });
});

function evalAccountRow(id: string) {
    return accountRow(id, {
        firstFundedTradeOn: null,
        fundedOn: null,
        stage: AccountStage.Eval,
    });
}

describe('the copy group sizing is withheld for a stale eval balance (PT-101b, F-130)', () => {
    const WEDNESDAY = '2026-09-23';
    const TUESDAY = '2026-09-22';
    const MONDAY = '2026-09-21';
    const EVAL_BALANCE_CENTS = (PLAN.accountSize + 1000) * CENTS_PER_DOLLAR;

    function evalSection(
        dates: Readonly<Record<string, string>>,
    ): CopyGroupSizingSection {
        const accounts = [evalAccountRow('fresh'), evalAccountRow('old')];
        const groups = copyGroupRows([GROUP], accounts).groups;
        const sections = copyGroupSizingSectionsOf(
            DEFAULT_RULEBOOK,
            USER_ID,
            WEDNESDAY,
            accounts,
            [],
            [],
            accounts.map((account) => ({
                ...snapshotRow(account.id, EVAL_BALANCE_CENTS),
                asOf: dates[account.id] ?? WEDNESDAY,
                highestEodBalanceCents: usdCents(EVAL_BALANCE_CENTS),
            })),
            groups,
        );
        const section = sections.get(GROUP.id);
        if (section === undefined) throw new Error('no section for the group');
        return section;
    }

    it('names an eval member whose balance is two weekday sessions old, and not one a session old', () => {
        const stale = evalSection({ old: MONDAY });

        expect(stale.inputs.members.map((member) => member.id)).toEqual([
            'fresh',
            'old',
        ]);
        expect(stale.staleMembers).toEqual([
            { asOf: MONDAY, label: 'old', memberId: 'old' },
        ]);
        expect(stale.asOf).toBe(MONDAY);
        expect(evalSection({ old: TUESDAY }).staleMembers).toEqual([]);
    });

    it('has no stale eval member when every balance is from today', () => {
        const section = evalSection({});

        expect(section.staleMembers).toEqual([]);
        expect(section.asOf).toBe(WEDNESDAY);
    });
});

function sizingOf(): DocumentedSizing {
    const { result } = sectionFor([loose(), tight()]);
    if (result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error('expected the group to be sized');
    }
    return result.sizing;
}

describe('the copy group rule terms (PT-101)', () => {
    it('states a hard daily profit ceiling and a stop trigger with their amounts', () => {
        const base = sizingOf();

        expect(
            copyGroupRuleTermsOf({
                ...base,
                dailyProfitCap: {
                    ceiling: dollars(400),
                    kind: DailyProfitCapKind.HardCeiling,
                },
            }),
        ).toContain('Daily profit ceiling: $400.00.');
        expect(
            copyGroupRuleTermsOf({
                ...base,
                dailyProfitCap: {
                    kind: DailyProfitCapKind.StopTrigger,
                    stopAfter: dollars(500),
                },
            }),
        ).toContain('Daily stop trigger: $500.00.');
    });

    it('omits the daily profit cap line when the group has none', () => {
        const terms = copyGroupRuleTermsOf({
            ...sizingOf(),
            dailyProfitCap: null,
        });

        expect(terms.some((line) => line.startsWith('Daily'))).toBe(false);
    });

    it('states the profit ceiling with the rule that caps it, and nothing when there is none', () => {
        const base = sizingOf();

        expect(
            copyGroupRuleTermsOf({
                ...base,
                profitCeiling: {
                    amount: dollars(200),
                    constraint: SizingConstraint.ConsistencyCap,
                },
            }),
        ).toContain(
            `Profit ceiling today: $200.00. ${SIZING_CONSTRAINT_TEXT[SizingConstraint.ConsistencyCap]}`,
        );
        expect(
            copyGroupRuleTermsOf({ ...base, profitCeiling: null }).some(
                (line) => line.startsWith('Profit ceiling'),
            ),
        ).toBe(false);
    });

    it('states the maximum trades a day in the singular and the plural', () => {
        const base = sizingOf();

        expect(copyGroupRuleTermsOf({ ...base, maxTrades: 1 })).toContain(
            'At most 1 trade a day.',
        );
        expect(copyGroupRuleTermsOf({ ...base, maxTrades: 4 })).toContain(
            'At most 4 trades a day.',
        );
    });

    it.each([
        [
            { dollars: 300, kind: DayStopRuleKind.AfterTarget },
            'Stop rule: stop after $300.00 of profit.',
        ],
        [
            { k: 1, kind: DayStopRuleKind.AfterKLosses },
            'Stop rule: stop after 1 loss.',
        ],
        [
            { k: 2, kind: DayStopRuleKind.AfterKLosses },
            'Stop rule: stop after 2 losses.',
        ],
        [
            { kind: DayStopRuleKind.DayGreen },
            'Stop rule: stop once the day is green.',
        ],
        [
            { kind: DayStopRuleKind.FirstWin },
            'Stop rule: stop after the first win.',
        ],
        [{ kind: DayStopRuleKind.None }, 'Stop rule: none.'],
    ] as const)('states the stop rule %j', (stopRule, text) => {
        expect(copyGroupRuleTermsOf({ ...sizingOf(), stopRule })).toContain(
            text,
        );
    });
});

describe('the shared account-state reason text', () => {
    it('is the only source of the copy group sizing reasons', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'app',
                '(app)',
                'prop-calculator',
                'accounts',
                'copy-groups',
                'copyGroupSizingModel.ts',
            ),
            'utf8',
        );
        expect(source).not.toContain('reconstructionReasonText');
        expect(source).not.toContain('reconstructionErrorText');
        expect(source).not.toContain(
            'sizing is not modeled yet for live accounts',
        );
        expect(source).toContain('exposureUnavailableText');
    });

    it('gives the live and reconstruction exposure reasons from one module', async () => {
        const { exposureUnavailableText } =
            await import('~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText');
        expect(
            exposureUnavailableText(undefined, {
                kind: ExposureUnavailableKind.LiveNotModeled,
            }),
        ).toBe('sizing is not modeled yet for live accounts');
        const reason = {
            kind: AccountStateUnavailableKind.NoSnapshot,
        } as const;
        expect(
            exposureUnavailableText(undefined, {
                kind: ExposureUnavailableKind.Reconstruction,
                reason,
            }),
        ).toBe(accountStateUnavailableText(undefined, reason));
    });
});
