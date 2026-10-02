import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    CopyGroupWorkerOutcomeKind,
    simulateGroupOutcomeOf,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
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
    type CopyGroupSizingSection,
    copyGroupSizingSectionsOf,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    AccountStage,
    AccountStateUnavailableKind,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    ExposureUnavailableKind,
    usdCents,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
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
    DEFAULT_RULEBOOK,
    SizingAssumption,
} from '~/lib/prop-calculator/advisor';

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
): CopyGroupSizingSection {
    const groups = copyGroupRows([GROUP], accounts).groups;
    const sections = copyGroupSizingSectionsOf(
        DEFAULT_RULEBOOK,
        USER_ID,
        TODAY,
        accounts,
        [],
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
