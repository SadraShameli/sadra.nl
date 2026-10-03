import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    copyGroupSizing,
    type CopyGroupSizingMember,
    CopyGroupSizingRejectionKind,
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    documentedSizingOf,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    SizingAssumption,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const TOPSTEP_STANDARD_CONSISTENCY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardConsistency,
};

function evalAccount(threshold: number): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 50_600,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: apexPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAccount(
    cushion: number,
    plan: Plan = topStepPlan,
): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 50_000 + cushion,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: tracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function member(
    id: string,
    label: string,
    account: ReconstructedAccount,
    personalDll?: number,
): CopyGroupSizingMember {
    const base = {
        account,
        accountPolicy: null,
        id,
        label,
        paidPayoutsSinceLastLiveAccount: null,
        personalRequestOverride: null,
        personalRetainedCushion: null,
    };
    return personalDll === undefined
        ? base
        : { ...base, personalDll: dollars(personalDll) };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function tracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

const apexPlan = registryPlan(APEX_EOD_ID);
const topStepPlan = registryPlan(TOPSTEP_STANDARD_ID);
const topStepConsistencyPlan = registryPlan(TOPSTEP_STANDARD_CONSISTENCY_ID);

describe('copyGroupSizing (PT-26b, F-130)', () => {
    it('rejects a group with no members', () => {
        const result = copyGroupSizing({
            members: [],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.NoMembers,
        );
    });

    it('rejects a group whose members span more than one stage', () => {
        const result = copyGroupSizing({
            members: [
                member('a', 'A', evalAccount(48_000)),
                member('b', 'B', fundedAccount(2000)),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.MixedStage,
        );
        if (result.rejection.kind !== CopyGroupSizingRejectionKind.MixedStage) {
            return;
        }
        expect(result.rejection.stages).toEqual([
            SizingStage.Eval,
            SizingStage.Funded,
        ]);
    });

    it('rejects a live-stage group as not modeled', () => {
        const result = copyGroupSizing({
            members: [
                member('a', 'A', {
                    assumptions: [],
                    cushion: 1000,
                    kind: ReconstructedLiveKind.Live,
                    livePlan: null,
                    plan: topStepPlan,
                    state: null,
                }),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.LiveNotModeled,
        );
    });

    it('sizes a funded group at the minimum flat risk and warns about the diverging member', () => {
        const result = copyGroupSizing({
            members: [
                member('tight', 'Tight', fundedAccount(600)),
                member('roomy', 'Roomy', fundedAccount(5000)),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        expect(result.stage).toBe(SizingStage.Funded);
        expect(result.sizing.rungs.map((rung) => rung.risk)).toEqual([
            250, 250, 100,
        ]);
        expect(result.divergences).toHaveLength(1);
        expect(result.divergences[0]?.memberId).toBe('roomy');
        expect(result.divergences[0]?.ownRisk).toBe(250);
        expect(result.divergences[0]?.groupRisk).toBe(100);
    });

    it('sizes an eval group rung by rung, never collapsing to a single flat size', () => {
        const tightWithSixHundredCushion = evalAccount(50_000);
        const roomyWithFiveThousandCushionSharingThePlanDllRoom =
            evalAccount(45_600);
        const result = copyGroupSizing({
            members: [
                member('tight', 'Tight', tightWithSixHundredCushion),
                member(
                    'roomy',
                    'Roomy',
                    roomyWithFiveThousandCushionSharingThePlanDllRoom,
                ),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        expect(result.stage).toBe(SizingStage.Eval);
        const risks = result.sizing.rungs.map((rung) => rung.risk);
        expect(risks).toEqual([100, 150, 200, 50]);
        expect(new Set(risks).size).toBeGreaterThan(1);
        expect(result.divergences).toHaveLength(2);
        const roomyDivergence = result.divergences.find(
            (divergence) => divergence.memberId === 'roomy',
        );
        expect(roomyDivergence?.rungIndex).toBe(0);
        expect(roomyDivergence?.ownRisk).toBe(200);
        expect(roomyDivergence?.groupRisk).toBe(100);
        const tightDivergence = result.divergences.find(
            (divergence) => divergence.memberId === 'tight',
        );
        expect(tightDivergence?.rungIndex).toBe(3);
        expect(tightDivergence?.ownRisk).toBe(150);
        expect(tightDivergence?.groupRisk).toBe(50);
    });

    it('never sizes a member above what its own RuleContext affords', () => {
        const tight = fundedAccount(600);
        const roomy = fundedAccount(5000);
        const result = copyGroupSizing({
            members: [
                member('tight', 'Tight', tight),
                member('roomy', 'Roomy', roomy),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        for (const account of [tight, roomy]) {
            const own = documentedSizingOf(account, DEFAULT_RULEBOOK);
            for (const [index, groupRung] of result.sizing.rungs.entries()) {
                const ownRung = own.sizing.rungs[index];
                expect(ownRung).toBeDefined();
                if (ownRung === undefined) continue;
                expect(groupRung.risk).toBeLessThanOrEqual(ownRung.risk);
            }
        }
    });

    it("threads a funded member's real payout consistency ceiling instead of always dropping it", () => {
        const soloWithConsistencyCeiling = fundedAccount(
            600,
            topStepConsistencyPlan,
        );
        const result = copyGroupSizing({
            members: [member('solo', 'Solo', soloWithConsistencyCeiling)],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        expect(result.sizing.profitCeiling).not.toBeNull();
        expect(result.sizing.assumptions).not.toContain(
            SizingAssumption.NoProfitCeiling,
        );
    });

    it('lets a caller thread a per-member personal daily-loss-limit override into the ladder', () => {
        const result = copyGroupSizing({
            members: [
                member('tight', 'Tight', fundedAccount(600)),
                member('roomy', 'Roomy', fundedAccount(5000), 50),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        expect(result.sizing.rungs[0]?.risk).toBe(50);
        expect(
            result.divergences.map((divergence) => divergence.memberId),
        ).toContain('tight');
    });

    it('rejects a group where a member has no cushion room left instead of returning a silent empty ladder', () => {
        const result = copyGroupSizing({
            members: [
                member('drained', 'Drained', fundedAccount(0)),
                member('roomy', 'Roomy', fundedAccount(5000)),
            ],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.NoCushionRoom,
        );
        if (
            result.rejection.kind !== CopyGroupSizingRejectionKind.NoCushionRoom
        ) {
            return;
        }
        expect(result.rejection.memberIds).toEqual(['drained']);
    });

    it('reports whole contracts per member and for the group given an instrument and stop', () => {
        const result = copyGroupSizing({
            members: [
                member('tight', 'Tight', fundedAccount(600)),
                member('roomy', 'Roomy', fundedAccount(5000)),
            ],
            positionSizing: {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
            },
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        const placement = result.contractPlacement;
        expect(placement).not.toBeNull();
        expect(placement?.isRefused).toBe(false);
        expect(placement?.contracts).toBeGreaterThan(0);
        const memberPlacements = placement?.members ?? [];
        expect(memberPlacements).toHaveLength(2);
        for (const memberPlacement of memberPlacements) {
            expect(memberPlacement.placed.contracts).toBeGreaterThanOrEqual(
                placement?.contracts ?? 0,
            );
        }
    });

    it('names a below-one-contract group as refused', () => {
        const result = copyGroupSizing({
            members: [
                member('tight', 'Tight', fundedAccount(600)),
                member('roomy', 'Roomy', fundedAccount(5000)),
            ],
            positionSizing: {
                instrument: InstrumentSymbol.ES,
                stopPoints: 1000,
            },
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        expect(result.contractPlacement?.isRefused).toBe(true);
        expect(result.contractPlacement?.contracts).toBe(0);
        expect(result.sizing.rungs[0]?.risk).toBe(250);
    });
});
