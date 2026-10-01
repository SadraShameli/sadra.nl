import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    evalStartStateIssue,
    findFirm,
    FirmId,
    FundedNextVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountReconstructionError,
    type AccountSnapshotInput,
    AssumptionKind,
    DashboardBalanceConvention,
    ReconstructedLiveKind,
    ReconstructionErrorReason,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const MFF_RAPID_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
};

const FUNDEDNEXT_LEGACY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.FundedNext,
    variant: FundedNextVariant.Legacy,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

function baseInput(
    overrides: Partial<AccountSnapshotInput>,
): AccountSnapshotInput {
    return {
        asOf: '2026-01-01',
        balance: dollars(50_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('AccountReconstruction.rebuild: funded phase', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('replays the EOD-trailing threshold from the highest EOD balance with no payout yet', () => {
        const input = baseInput({
            asOf: '2026-01-10',
            balance: dollars(52_400),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(53_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.state.threshold).toBe(51_000);
        expect(account.state.thresholdLocked).toBe(false);
        expect(account.state.balance).toBe(52_400);
        expect(account.cushion).toBe(1400);
        expect(account.fundedTracker).not.toBeNull();
        expect(account.fundedTracker?.payoutsIssued).toBe(0);
        expect(account.fundedTracker?.lastPayoutBalance).toBe(50_000);
        expect(
            account.fundedTracker?.dayGateProgress(plan, account.state),
        ).toBe(7);
        expect(account.assumptions).toEqual([
            {
                bias: 'conservative',
                kind: AssumptionKind.CycleBestDayProfitAssumedWorstCase,
            },
            {
                bias: 'neutral',
                kind: AssumptionKind.ContractCapInstrumentAssumed,
            },
        ]);
    });

    it('carries the personal max risk per trade passed in by the caller, defaulting to null', () => {
        const sharedInput = baseInput({
            highestEodBalance: dollars(51_000),
            payoutsTaken: 0,
        });
        const withoutPersonalCap = AccountReconstruction.rebuild(
            sharedInput,
            plan,
        );
        if (withoutPersonalCap.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(withoutPersonalCap.personalMaxRiskPerTrade).toBeNull();

        const withPersonalCap = AccountReconstruction.rebuild(
            sharedInput,
            plan,
            dollars(250),
        );
        if (withPersonalCap.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(withPersonalCap.personalMaxRiskPerTrade).toBe(250);
    });

    it('resolves the funded micro contract limit as the micro variant of the same tier', () => {
        const input = baseInput({
            highestEodBalance: dollars(51_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.contractLimit).toBe(5);
        expect(account.microContractLimit).toBe(5);
    });

    it('resolves the funded micro contract limit independently of the mini limit on a tiered plan', () => {
        const apexPlan = registryPlan(APEX_EOD_ID);
        const input = baseInput({
            balance: dollars(50_000),
            highestEodBalance: dollars(50_500),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, apexPlan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.contractLimit).not.toBeNull();
        expect(account.microContractLimit).toBe(
            (account.contractLimit ?? 0) * 10,
        );
    });

    it('overrides the ratcheted threshold with the fixed locked floor once a payout moves the floor', () => {
        const input = baseInput({
            asOf: '2026-02-08',
            balance: dollars(52_000),
            balanceAtLastPayout: dollars(50_500),
            cumulativePayout: dollars(400),
            highestEodBalance: dollars(53_500),
            lastPayoutOn: '2026-02-01',
            payoutsTaken: 1,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.state.threshold).toBe(50_100);
        expect(account.state.thresholdLocked).toBe(true);
        expect(account.state.balance).toBe(52_000);
        expect(account.cushion).toBe(1900);
        expect(account.fundedTracker?.payoutsIssued).toBe(1);
        expect(account.fundedTracker?.lastPayoutBalance).toBe(50_500);
        expect(account.fundedTracker?.cumulativePayout).toBe(400);
        expect(
            account.fundedTracker?.dayGateProgress(plan, account.state),
        ).toBe(5);
    });

    it('defaults lastPayoutBalance to the current balance, not the account size, when payouts were taken but balanceAtLastPayout is missing', () => {
        const input = baseInput({
            asOf: '2026-02-08',
            balance: dollars(55_000),
            cumulativePayout: dollars(400),
            highestEodBalance: dollars(56_000),
            lastPayoutOn: '2026-02-01',
            payoutsTaken: 2,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.fundedTracker?.lastPayoutBalance).toBe(55_000);
        expect(account.fundedTracker?.cycleBestDayProfit).toBe(0);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                {
                    bias: 'conservative',
                    kind: AssumptionKind.LastPayoutBalanceAssumedCurrent,
                },
            ]),
        );
    });

    it('gives zero calendar-gate progress plus a CalendarAnchorMissing assumption without an anchor date', () => {
        const input = baseInput({
            balance: dollars(51_000),
            highestEodBalance: dollars(51_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(
            account.fundedTracker?.dayGateProgress(plan, account.state),
        ).toBe(0);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                {
                    bias: 'conservative',
                    kind: AssumptionKind.CalendarAnchorMissing,
                },
            ]),
        );
    });

    it('deducts a pending payout from the reconstructed balance with a disclosed assumption', () => {
        const input = baseInput({
            balance: dollars(52_000),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(52_000),
            payoutsTaken: 0,
            pendingPayouts: dollars(500),
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.state.balance).toBe(51_500);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                {
                    bias: 'conservative',
                    kind: AssumptionKind.PendingPayoutDeducted,
                },
            ]),
        );
    });

    it('throws EodPeakRequired without the highest EOD balance instead of guessing a peak', () => {
        const input = baseInput({
            balance: dollars(51_000),
            firstFundedTradeOn: '2026-01-01',
            payoutsTaken: 0,
        });
        try {
            AccountReconstruction.rebuild(input, plan);
            throw new Error('expected a throw');
        } catch (error) {
            expect(error).toBeInstanceOf(AccountReconstructionError);
            expect((error as AccountReconstructionError).reason).toBe(
                ReconstructionErrorReason.EodPeakRequired,
            );
        }
    });

    it('assumes the worst-case cycle best day profit when it is missing, instead of clearing the consistency gate', () => {
        const input = baseInput({
            asOf: '2026-01-10',
            balance: dollars(52_400),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(53_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.fundedTracker?.cycleBestDayProfit).toBe(2400);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                {
                    bias: 'conservative',
                    kind: AssumptionKind.CycleBestDayProfitAssumedWorstCase,
                },
            ]),
        );
    });

    it('carries both the engine-computed floor and the entered floor on a dashboard floor mismatch', () => {
        const input = baseInput({
            asOf: '2026-01-10',
            balance: dollars(56_000),
            dashboardFloor: dollars(55_000),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(53_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.dashboardFloorMismatch).toEqual({
            engineFloor: 51_000,
            enteredFloor: 55_000,
        });
        expect(account.state.threshold).toBe(55_000);
    });

    it('carries no dashboard floor mismatch when the entered floor does not override the engine floor', () => {
        const input = baseInput({
            asOf: '2026-01-10',
            balance: dollars(52_400),
            dashboardFloor: dollars(50_500),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(53_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.dashboardFloorMismatch).toBeNull();
    });

    it('carries the raw pending payouts, not just the netted balance', () => {
        const input = baseInput({
            balance: dollars(52_000),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(52_000),
            payoutsTaken: 0,
            pendingPayouts: dollars(500),
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.pendingPayouts).toBe(500);
    });

    it('carries zero pending payouts by default', () => {
        const input = baseInput({
            balance: dollars(52_000),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(52_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.pendingPayouts).toBe(0);
    });

    it('discloses no worst-case assumption when cycleBestDayProfit is given', () => {
        const input = baseInput({
            asOf: '2026-01-10',
            balance: dollars(52_400),
            cycleBestDayProfit: dollars(900),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(53_000),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.fundedTracker?.cycleBestDayProfit).toBe(900);
        expect(
            account.assumptions.map((assumption) => assumption.kind),
        ).not.toContain(AssumptionKind.CycleBestDayProfitAssumedWorstCase);
    });
});

describe('AccountReconstruction.rebuild: intraday-trailing funded accounts', () => {
    const plan = registryPlan(MFF_RAPID_ID);

    it('replays the intraday-trailing threshold from the highest intraday balance', () => {
        const input = baseInput({
            balance: dollars(51_500),
            highestIntradayBalance: dollars(52_200),
            payoutsTaken: 0,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(account.state.threshold).toBe(50_100);
        expect(account.state.thresholdLocked).toBe(true);
        expect(account.state.balance).toBe(51_500);
        expect(account.cushion).toBe(1400);
    });

    it('throws IntradayPeakRequired without the highest intraday balance', () => {
        const input = baseInput({ balance: dollars(51_500), payoutsTaken: 0 });
        try {
            AccountReconstruction.rebuild(input, plan);
            throw new Error('expected a throw');
        } catch (error) {
            expect(error).toBeInstanceOf(AccountReconstructionError);
            expect((error as AccountReconstructionError).reason).toBe(
                ReconstructionErrorReason.IntradayPeakRequired,
            );
        }
    });
});

describe('AccountReconstruction.rebuild: eval phase', () => {
    it('replays the eval EOD-trailing lock trigger and sets elapsedDays from tradingDays', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const input = baseInput({
            balance: dollars(51_800),
            highestEodBalance: dollars(52_200),
            stage: SizingStage.Eval,
            tradingDays: 4,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }
        expect(account.state.threshold).toBe(50_100);
        expect(account.state.thresholdLocked).toBe(true);
        expect(account.state.balance).toBe(51_800);
        expect(account.state.tradingDays).toBe(4);
        expect(account.state.elapsedDays).toBe(4);
        expect(account.cushion).toBe(1700);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                {
                    bias: 'optimistic',
                    kind: AssumptionKind.ElapsedDaysApproximatedFromTradingDays,
                },
            ]),
        );
    });

    it('uses elapsedDaysSinceAttemptStart directly when present, for an eval with idle sessions', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const input = baseInput({
            balance: dollars(51_800),
            elapsedDaysSinceAttemptStart: 9,
            highestEodBalance: dollars(52_200),
            stage: SizingStage.Eval,
            tradingDays: 4,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }
        expect(account.state.tradingDays).toBe(4);
        expect(account.state.elapsedDays).toBe(9);
        expect(account.assumptions).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: AssumptionKind.ElapsedDaysApproximatedFromTradingDays,
                }),
            ]),
        );
    });

    it('clamps elapsedDaysSinceAttemptStart up to tradingDays when the input is inconsistent, disclosing the assumption instead of violating the elapsedDays >= tradingDays invariant', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const input = baseInput({
            balance: dollars(51_800),
            elapsedDaysSinceAttemptStart: 1,
            highestEodBalance: dollars(52_200),
            stage: SizingStage.Eval,
            tradingDays: 2,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }
        expect(account.state.tradingDays).toBe(2);
        expect(account.state.elapsedDays).toBe(2);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                {
                    bias: 'optimistic',
                    kind: AssumptionKind.ElapsedDaysApproximatedFromTradingDays,
                },
            ]),
        );
        expect(evalStartStateIssue(plan, account.state, 90)).toBeNull();
    });

    it('resolves the eval micro contract limit independently of the mini limit', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const input = baseInput({
            balance: dollars(51_800),
            highestEodBalance: dollars(52_200),
            stage: SizingStage.Eval,
            tradingDays: 4,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }
        expect(account.contractLimit).toBe(3);
        expect(account.microContractLimit).toBe(30);
    });
});

describe('AccountReconstruction.rebuild: live phase', () => {
    it('gives LiveNotModeled with the cushion from the dashboard floor when the firm has a separate live program', () => {
        const plan = registryPlan(FUNDEDNEXT_LEGACY_ID);
        const input = baseInput({
            balance: dollars(10_000),
            dashboardFloor: dollars(8000),
            liveStartBalance: dollars(10_000),
            stage: SizingStage.Live,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        expect(account.livePlan).toBeNull();
        expect(account.state).toBeNull();
        expect(account.cushion).toBe(2000);
        expect(account.assumptions).toEqual(
            expect.arrayContaining([
                { bias: 'conservative', kind: AssumptionKind.LiveNotModeled },
            ]),
        );
    });

    it('tracks the current balance for the NotModeled cushion, not the historical live-start balance', () => {
        const plan = registryPlan(FUNDEDNEXT_LEGACY_ID);
        const input = baseInput({
            balance: dollars(12_500),
            dashboardFloor: dollars(8000),
            liveStartBalance: dollars(10_000),
            stage: SizingStage.Live,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        expect(account.cushion).toBe(4500);
    });

    it('defaults the TopStep live reserve to the builder own $40,000 default with both TopStep and approximation assumptions', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const input = baseInput({
            balance: dollars(11_000),
            stage: SizingStage.Live,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        expect(account.livePlan).not.toBeNull();
        expect(account.state).not.toBeNull();
        expect(account.livePlan?.seedReserveTerms()?.amount).toBe(40_000);
        expect(
            account.assumptions.map((assumption) => assumption.kind),
        ).toEqual(
            expect.arrayContaining([
                AssumptionKind.TopStepLiveReserveDefaulted,
                AssumptionKind.LiveModelApproximation,
            ]),
        );
    });

    it('builds a verified live plan with no approximation assumption when the builder is not defaulted', () => {
        const plan = registryPlan(APEX_EOD_ID);
        const input = baseInput({
            balance: dollars(2000),
            highestEodBalance: dollars(2000),
            stage: SizingStage.Live,
        });
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        expect(account.livePlan).not.toBeNull();
        expect(account.state).not.toBeNull();
        expect(account.state?.balance).toBe(2000);
        expect(
            account.assumptions.map((assumption) => assumption.kind),
        ).not.toContain(AssumptionKind.LiveModelApproximation);
    });
});
