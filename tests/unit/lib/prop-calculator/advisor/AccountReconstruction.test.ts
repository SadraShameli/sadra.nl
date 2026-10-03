import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    EodTrailingDrawdown,
    evalStartStateIssue,
    findFirm,
    FirmId,
    FundedNextVariant,
    LucidVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradeifyVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountReconstructionError,
    type AccountSnapshotInput,
    AssumptionKind,
    DashboardBalanceConvention,
    NO_PENDING_PAYOUT_COUNTS,
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
                kind: AssumptionKind.QualifyingDaysDefaulted,
            },
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
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (withoutPersonalCap.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(withoutPersonalCap.personalMaxRiskPerTrade).toBeNull();

        const withPersonalCap = AccountReconstruction.rebuild(
            sharedInput,
            plan,
            dollars(250),
            NO_PENDING_PAYOUT_COUNTS,
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            apexPlan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
            AccountReconstruction.rebuild(
                input,
                plan,
                null,
                NO_PENDING_PAYOUT_COUNTS,
            );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
            AccountReconstruction.rebuild(
                input,
                plan,
                null,
                NO_PENDING_PAYOUT_COUNTS,
            );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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

const TRADEIFY_GROWTH_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Tradeify,
    variant: TradeifyVariant.Growth,
};

const TRADEIFY_SELECT_DAILY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Tradeify,
    variant: TradeifyVariant.SelectDaily,
};

const LUCID_FLEX_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Flex,
};

const TPT_ID: PlanId = { accountSize: 50_000, firm: FirmId.Tpt };

function evalOf(input: AccountSnapshotInput, plan: Plan) {
    const account = AccountReconstruction.rebuild(
        input,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== TradingPhase.Eval) {
        throw new Error('expected an eval reconstruction');
    }
    return account;
}

function fundedInputWithEverySeed(): AccountSnapshotInput {
    return baseInput({
        asOf: '2026-02-08',
        balance: dollars(52_000),
        balanceAtLastPayout: dollars(50_500),
        cumulativePayout: dollars(400),
        cycleBestDayProfit: dollars(300),
        firstFundedTradeOn: '2026-01-01',
        fundedResetsUsed: 0,
        highestEodBalance: dollars(53_500),
        lastPayoutOn: '2026-02-01',
        payoutsTaken: 1,
        qualifyingDaysSinceLastPayout: 4,
    });
}

function fundedOf(
    input: AccountSnapshotInput,
    plan: Plan,
    personalMaxRiskPerTrade: null | number = null,
) {
    const account = AccountReconstruction.rebuild(
        input,
        plan,
        personalMaxRiskPerTrade === null
            ? null
            : dollars(personalMaxRiskPerTrade),
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== TradingPhase.Funded) {
        throw new Error('expected a funded reconstruction');
    }
    return account;
}

function inputWithPendingRequest(overrides: Partial<AccountSnapshotInput>) {
    return baseInput({
        asOf: '2026-02-08',
        balance: dollars(52_000),
        balanceAtLastPayout: dollars(50_500),
        cumulativePayout: dollars(400),
        cycleBestDayProfit: dollars(300),
        highestEodBalance: dollars(53_500),
        lastPayoutOn: '2026-02-01',
        payoutsTaken: 1,
        qualifyingDaysSinceLastPayout: 4,
        ...overrides,
    });
}

function kindsOf(account: {
    readonly assumptions: readonly { readonly kind: AssumptionKind }[];
}): readonly AssumptionKind[] {
    return account.assumptions.map((assumption) => assumption.kind);
}

function lateLockPlan(): Plan {
    return registryPlan(TRADEIFY_GROWTH_ID).withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: dollars(5000),
                lockedThreshold: (start) => start + 100,
            },
        }),
    });
}

function liveOf(
    input: AccountSnapshotInput,
    plan: Plan,
    personalMaxRiskPerTrade: null | number = null,
) {
    const account = AccountReconstruction.rebuild(
        { ...input, stage: SizingStage.Live },
        plan,
        personalMaxRiskPerTrade === null
            ? null
            : dollars(personalMaxRiskPerTrade),
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== ReconstructedLiveKind.Live) {
        throw new Error('expected a live reconstruction');
    }
    return account;
}

describe('AccountReconstruction.rebuild: the floor at the last payout and the peak order (F-108 (1), (2), (6), (7))', () => {
    const lateLock = lateLockPlan();

    it('uses the entered floor at the last payout on a LockAtPlanFloor plan and names no peak order assumption', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(53_000),
                balanceAtLastPayout: dollars(52_000),
                cumulativePayout: dollars(900),
                floorAtLastPayout: dollars(50_100),
                highestEodBalance: dollars(53_000),
                payoutsTaken: 1,
            }),
            lateLock,
        );
        expect(account.state.threshold).toBe(50_100);
        expect(account.state.thresholdLocked).toBe(true);
        expect(kindsOf(account)).not.toContain(AssumptionKind.PeakOrderAssumed);
    });

    it('takes the higher floor order and discloses it as conservative without the floor at the last payout', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(53_000),
                balanceAtLastPayout: dollars(52_000),
                cumulativePayout: dollars(900),
                highestEodBalance: dollars(53_000),
                payoutsTaken: 1,
            }),
            lateLock,
        );
        expect(account.state.threshold).toBe(51_000);
        expect(account.state.thresholdLocked).toBe(true);
        expect(account.assumptions).toContainEqual({
            bias: 'conservative',
            kind: AssumptionKind.PeakOrderAssumed,
        });
    });

    it('names no peak order assumption when the order cannot change the floor (the lock floor is above the trailing floor)', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(51_200),
                balanceAtLastPayout: dollars(51_000),
                cumulativePayout: dollars(400),
                highestEodBalance: dollars(51_500),
                payoutsTaken: 1,
            }),
            registryPlan(TRADEIFY_GROWTH_ID),
        );
        expect(account.state.threshold).toBe(50_100);
        expect(kindsOf(account)).not.toContain(AssumptionKind.PeakOrderAssumed);
    });

    it('ignores the floor at the last payout when no payout was taken', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(53_000),
                floorAtLastPayout: dollars(50_100),
                highestEodBalance: dollars(53_000),
                payoutsTaken: 0,
            }),
            lateLock,
        );
        expect(account.state.threshold).toBe(51_000);
        expect(account.state.thresholdLocked).toBe(false);
    });

    it('ignores the floor at the last payout on a MoveToLockedFloor plan, whose floor does not depend on the peak order', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(52_000),
                balanceAtLastPayout: dollars(50_500),
                cumulativePayout: dollars(400),
                floorAtLastPayout: dollars(49_000),
                highestEodBalance: dollars(53_500),
                payoutsTaken: 1,
            }),
            registryPlan(MFF_PRO_ID),
        );
        expect(account.state.threshold).toBe(50_100);
        expect(kindsOf(account)).not.toContain(AssumptionKind.PeakOrderAssumed);
    });
});

describe('AccountReconstruction.rebuild: every defaulted seed names itself (F-108 (8))', () => {
    const plan = registryPlan(MFF_PRO_ID);

    const DEFAULT_KINDS: readonly AssumptionKind[] = [
        AssumptionKind.CumulativePayoutDefaulted,
        AssumptionKind.PayoutsTakenDefaulted,
        AssumptionKind.QualifyingDaysDefaulted,
    ];

    it('names none of the seed defaults when every seed is entered', () => {
        const kinds = kindsOf(fundedOf(fundedInputWithEverySeed(), plan));
        for (const kind of DEFAULT_KINDS) {
            expect(kinds).not.toContain(kind);
        }
    });

    it('names the cumulative payout default, as optimistic, when payouts were taken and the total is omitted', () => {
        const account = fundedOf(
            { ...fundedInputWithEverySeed(), cumulativePayout: undefined },
            plan,
        );
        expect(account.assumptions).toContainEqual({
            bias: 'optimistic',
            kind: AssumptionKind.CumulativePayoutDefaulted,
        });
        expect(account.fundedTracker?.cumulativePayout).toBe(0);
    });

    it('names no cumulative payout default when no payout was taken', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(50_800),
                highestEodBalance: dollars(50_800),
                payoutsTaken: 0,
            }),
            plan,
        );
        expect(kindsOf(account)).not.toContain(
            AssumptionKind.CumulativePayoutDefaulted,
        );
    });

    it('names the qualifying days default, as conservative, on an account that has history and omits them', () => {
        const account = fundedOf(
            {
                ...fundedInputWithEverySeed(),
                qualifyingDaysSinceLastPayout: undefined,
            },
            plan,
        );
        expect(account.assumptions).toContainEqual({
            bias: 'conservative',
            kind: AssumptionKind.QualifyingDaysDefaulted,
        });
    });

    it('names the payouts taken default, as neutral, when it is omitted on an account that has history', () => {
        const account = fundedOf(
            { ...fundedInputWithEverySeed(), payoutsTaken: undefined },
            plan,
        );
        expect(account.assumptions).toContainEqual({
            bias: 'neutral',
            kind: AssumptionKind.PayoutsTakenDefaulted,
        });
    });

    it('names no seed default on an untouched account that omits them all', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(50_000),
                highestEodBalance: dollars(50_000),
            }),
            plan,
        );
        const kinds = kindsOf(account);
        for (const kind of DEFAULT_KINDS) {
            expect(kinds).not.toContain(kind);
        }
    });

    it('names the eval trading days and best day defaults, as conservative and optimistic, on an eval that has history', () => {
        const account = evalOf(
            baseInput({
                balance: dollars(51_000),
                highestEodBalance: dollars(51_000),
                stage: SizingStage.Eval,
            }),
            plan,
        );
        expect(account.assumptions).toContainEqual({
            bias: 'conservative',
            kind: AssumptionKind.TradingDaysDefaulted,
        });
        expect(account.assumptions).toContainEqual({
            bias: 'optimistic',
            kind: AssumptionKind.EvalBestDayProfitDefaulted,
        });
    });

    it('names no eval default when the trading days and best day are entered or the eval is untouched', () => {
        const entered = evalOf(
            baseInput({
                balance: dollars(51_000),
                evalBestDayProfit: dollars(600),
                highestEodBalance: dollars(51_000),
                stage: SizingStage.Eval,
                tradingDays: 3,
            }),
            plan,
        );
        const untouched = evalOf(
            baseInput({
                balance: dollars(50_000),
                highestEodBalance: dollars(50_000),
                stage: SizingStage.Eval,
            }),
            plan,
        );
        for (const account of [entered, untouched]) {
            expect(kindsOf(account)).not.toContain(
                AssumptionKind.TradingDaysDefaulted,
            );
            expect(kindsOf(account)).not.toContain(
                AssumptionKind.EvalBestDayProfitDefaulted,
            );
        }
    });

    it('names the calendar week default, as neutral, on a plan with a calendar week inactivity rule', () => {
        const tpt = registryPlan(TPT_ID);
        const account = fundedOf(
            baseInput({
                balance: dollars(50_500),
                highestIntradayBalance: dollars(50_500),
                payoutsTaken: 0,
            }),
            tpt,
        );
        expect(account.assumptions).toContainEqual({
            bias: 'neutral',
            kind: AssumptionKind.CalendarWeekProgressDefaulted,
        });
        const withoutWeekRule = fundedOf(fundedInputWithEverySeed(), plan);
        expect(kindsOf(withoutWeekRule)).not.toContain(
            AssumptionKind.CalendarWeekProgressDefaulted,
        );
    });

    it('names the peak profit approximation, as conservative, when a tiered plan is missing the intraday peak', () => {
        const growth = registryPlan(TRADEIFY_GROWTH_ID);
        const missingIntraday = fundedOf(
            baseInput({
                balance: dollars(51_000),
                highestEodBalance: dollars(51_500),
                payoutsTaken: 0,
            }),
            growth,
        );
        const entered = fundedOf(
            baseInput({
                balance: dollars(51_000),
                highestEodBalance: dollars(51_500),
                highestIntradayBalance: dollars(51_700),
                payoutsTaken: 0,
            }),
            growth,
        );
        expect(missingIntraday.assumptions).toContainEqual({
            bias: 'conservative',
            kind: AssumptionKind.PeakProfitApproximated,
        });
        expect(kindsOf(entered)).not.toContain(
            AssumptionKind.PeakProfitApproximated,
        );
        const untieredPlan = fundedOf(
            baseInput({
                balance: dollars(51_000),
                highestEodBalance: dollars(51_500),
                payoutsTaken: 0,
            }),
            plan,
        );
        expect(kindsOf(untieredPlan)).not.toContain(
            AssumptionKind.PeakProfitApproximated,
        );
    });

    it('sizes the peak day close and intraday profit from the entered highest balances', () => {
        const growth = registryPlan(TRADEIFY_GROWTH_ID);
        const account = fundedOf(
            baseInput({
                balance: dollars(51_000),
                highestEodBalance: dollars(51_500),
                highestIntradayBalance: dollars(51_700),
                payoutsTaken: 0,
            }),
            growth,
        );
        expect(account.state.peakDayCloseProfit).toBe(1500);
        expect(account.state.peakIntradayProfit).toBe(1700);
        expect(account.state.intradayHighProfit).toBe(1700);
    });
});

describe('AccountReconstruction.rebuild: a live account is rebuilt from its live start balance (F-109 (1), (4), (7), (8), (10))', () => {
    const apex = registryPlan(APEX_EOD_ID);
    const lucid = registryPlan(LUCID_FLEX_ID);

    it('starts an Apex live account at the entered live start, with the true floor, lock and tier profit', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(53_000),
                highestEodBalance: dollars(53_500),
                liveStartBalance: dollars(52_000),
            }),
            apex,
        );
        if (account.state === null || account.livePlan === null) {
            throw new Error('expected a modeled live state');
        }
        expect(account.state.startingBalance).toBe(52_000);
        expect(account.state.threshold).toBe(50_500);
        expect(account.state.thresholdLocked).toBe(false);
        expect(account.cushion).toBe(2500);
        expect(account.livePlan.liveContractLimitsFor(account.state).minis).toBe(
            10,
        );
    });

    it('starts a Lucid live account at the entered live start', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(53_000),
                highestEodBalance: dollars(53_000),
                liveStartBalance: dollars(52_000),
            }),
            lucid,
        );
        if (account.state === null || account.livePlan === null) {
            throw new Error('expected a modeled live state');
        }
        expect(account.state.startingBalance).toBe(52_000);
        expect(account.state.threshold).toBe(51_000);
        expect(account.state.thresholdLocked).toBe(false);
        expect(account.livePlan.liveContractLimitsFor(account.state).minis).toBe(
            2,
        );
    });

    it('names the builder default start, as optimistic, when no live start was entered, and not when one was', () => {
        const without = liveOf(
            baseInput({
                balance: dollars(2000),
                highestEodBalance: dollars(2000),
            }),
            apex,
        );
        const withStart = liveOf(
            baseInput({
                balance: dollars(2000),
                highestEodBalance: dollars(2000),
                liveStartBalance: dollars(0),
            }),
            apex,
        );
        expect(without.assumptions).toContainEqual({
            bias: 'optimistic',
            kind: AssumptionKind.LiveStartBalanceDefaulted,
        });
        expect(kindsOf(withStart)).not.toContain(
            AssumptionKind.LiveStartBalanceDefaulted,
        );
    });

    it('keeps the locked floor of a Lucid live account that took a payout', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(1200),
                highestEodBalance: dollars(1500),
                liveStartBalance: dollars(0),
                payoutsTaken: 1,
            }),
            lucid,
        );
        if (account.state === null) throw new Error('expected a live state');
        expect(account.state.threshold).toBe(100);
        expect(account.state.thresholdLocked).toBe(true);
        expect(account.cushion).toBe(1100);
    });

    it('leaves the trailing floor of a Lucid live account that took no payout', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(1200),
                highestEodBalance: dollars(1500),
                liveStartBalance: dollars(0),
                payoutsTaken: 0,
            }),
            lucid,
        );
        if (account.state === null) throw new Error('expected a live state');
        expect(account.state.threshold).toBe(-500);
        expect(account.state.thresholdLocked).toBe(false);
    });

    it('seeds the live qualifying days and the peak day close profit from the entered values', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(53_000),
                highestEodBalance: dollars(53_500),
                liveStartBalance: dollars(52_000),
                qualifyingDaysSinceLastPayout: 6,
            }),
            apex,
        );
        if (account.state === null) throw new Error('expected a live state');
        expect(account.state.qualifyingDays).toBe(6);
        expect(account.state.peakDayCloseProfit).toBe(1500);
    });
});

describe('AccountReconstruction.rebuild: an entered dashboard floor on a live account (F-109 (3), (9))', () => {
    const apex = registryPlan(APEX_EOD_ID);
    const lucid = registryPlan(LUCID_FLEX_ID);

    it('uses the entered floor instead of throwing when a trailing live account has no peak', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(1500),
                dashboardFloor: dollars(400),
                liveStartBalance: dollars(0),
            }),
            lucid,
        );
        if (account.state === null) throw new Error('expected a live state');
        expect(account.state.threshold).toBe(400);
        expect(account.cushion).toBe(1100);
        expect(account.assumptions).toContainEqual({
            bias: 'conservative',
            kind: AssumptionKind.PeakReplacedByDashboardFloor,
        });
    });

    it('still throws EodPeakRequired for a trailing live account with neither a peak nor a floor', () => {
        expect(() =>
            liveOf(
                baseInput({
                    balance: dollars(1500),
                    liveStartBalance: dollars(0),
                }),
                lucid,
            ),
        ).toThrow(AccountReconstructionError);
    });

    it('raises a dashboard floor mismatch when the entered live floor is above the engine floor', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(53_000),
                dashboardFloor: dollars(51_000),
                highestEodBalance: dollars(53_500),
                liveStartBalance: dollars(52_000),
            }),
            apex,
        );
        if (account.state === null) throw new Error('expected a live state');
        expect(account.dashboardFloorMismatch).toEqual({
            engineFloor: 50_500,
            enteredFloor: 51_000,
        });
        expect(account.state.threshold).toBe(51_000);
        expect(account.cushion).toBe(2000);
        expect(kindsOf(account)).toContain(AssumptionKind.DashboardFloorMismatch);
    });

    it('raises no mismatch when the entered live floor is at or below the engine floor', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(53_000),
                dashboardFloor: dollars(50_000),
                highestEodBalance: dollars(53_500),
                liveStartBalance: dollars(52_000),
            }),
            apex,
        );
        expect(account.dashboardFloorMismatch).toBeNull();
        expect(account.state?.threshold).toBe(50_500);
    });
});

describe('AccountReconstruction.rebuild: the dashboard floor check covers the eval (F-84 (7))', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('raises a dashboard floor mismatch on an eval whose entered floor is above the engine floor', () => {
        const account = evalOf(
            baseInput({
                balance: dollars(51_800),
                dashboardFloor: dollars(50_800),
                evalBestDayProfit: dollars(800),
                highestEodBalance: dollars(52_000),
                stage: SizingStage.Eval,
                tradingDays: 4,
            }),
            plan,
        );
        expect(account.dashboardFloorMismatch).toEqual({
            engineFloor: 50_000,
            enteredFloor: 50_800,
        });
        expect(account.state.threshold).toBe(50_800);
        expect(account.cushion).toBe(1000);
        expect(kindsOf(account)).toContain(AssumptionKind.DashboardFloorMismatch);
    });

    it('raises no mismatch on an eval whose entered floor is at or below the engine floor', () => {
        const account = evalOf(
            baseInput({
                balance: dollars(51_800),
                dashboardFloor: dollars(49_800),
                evalBestDayProfit: dollars(800),
                highestEodBalance: dollars(52_000),
                stage: SizingStage.Eval,
                tradingDays: 4,
            }),
            plan,
        );
        expect(account.dashboardFloorMismatch).toBeNull();
        expect(account.state.threshold).toBe(50_000);
        expect(kindsOf(account)).not.toContain(
            AssumptionKind.DashboardFloorMismatch,
        );
    });

    it('uses the entered floor on an intraday eval with no peak instead of throwing', () => {
        const account = evalOf(
            baseInput({
                balance: dollars(51_500),
                dashboardFloor: dollars(49_700),
                evalBestDayProfit: dollars(800),
                stage: SizingStage.Eval,
                tradingDays: 3,
            }),
            registryPlan({
                accountSize: 50_000,
                firm: FirmId.Apex,
                variant: ApexVariant.Intraday,
            }),
        );
        expect(account.state.threshold).toBe(49_700);
        expect(kindsOf(account)).toContain(
            AssumptionKind.PeakReplacedByDashboardFloor,
        );
    });
});

describe('AccountReconstruction.rebuild: a payout request the balance may not show is disclosed (F-138 (1), (2), (6), Q23)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('names the request assumed to be in the balance, as optimistic, when one is dated on or before the snapshot', () => {
        const account = fundedOf(
            inputWithPendingRequest({ requestedPayoutsAssumedInBalance: 1 }),
            plan,
        );
        expect(account.assumptions).toContainEqual({
            bias: 'optimistic',
            kind: AssumptionKind.PendingPayoutAssumedInBalance,
        });
        expect(kindsOf(account)).not.toContain(
            AssumptionKind.PendingPayoutDeducted,
        );
        expect(account.state.balance).toBe(52_000);
    });

    it('names no such assumption when there is no such request', () => {
        for (const requestedPayoutsAssumedInBalance of [undefined, 0]) {
            const account = fundedOf(
                inputWithPendingRequest({ requestedPayoutsAssumedInBalance }),
                plan,
            );
            expect(kindsOf(account)).not.toContain(
                AssumptionKind.PendingPayoutAssumedInBalance,
            );
        }
    });

    it('names both the deduction and the assumed in balance request when both exist', () => {
        const account = fundedOf(
            inputWithPendingRequest({
                pendingPayouts: dollars(300),
                requestedPayoutsAssumedInBalance: 2,
            }),
            plan,
        );
        expect(kindsOf(account)).toEqual(
            expect.arrayContaining([
                AssumptionKind.PendingPayoutDeducted,
                AssumptionKind.PendingPayoutAssumedInBalance,
            ]),
        );
        expect(account.state.balance).toBe(51_700);
    });
});

describe('AccountReconstruction.rebuild: a live account carries the personal max risk per trade (F-62 (4), QF-2)', () => {
    it('carries the cap on a modeled live account and defaults it to null', () => {
        const apex = registryPlan(APEX_EOD_ID);
        const input = baseInput({
            balance: dollars(2000),
            highestEodBalance: dollars(2000),
            liveStartBalance: dollars(0),
        });
        expect(liveOf(input, apex, 75).personalMaxRiskPerTrade).toBe(75);
        expect(liveOf(input, apex).personalMaxRiskPerTrade).toBeNull();
    });

    it('carries the cap on a live account whose live stage is not modeled', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(10_000),
                dashboardFloor: dollars(8000),
                liveStartBalance: dollars(10_000),
            }),
            registryPlan(FUNDEDNEXT_LEGACY_ID),
            75,
        );
        expect(account.personalMaxRiskPerTrade).toBe(75);
    });
});

describe('AccountReconstruction.rebuild: a dashboard floor stands in for a missing peak on every stage', () => {
    it('uses the entered floor on a funded EOD account with no peak and names the substitution', () => {
        const account = fundedOf(
            baseInput({
                balance: dollars(51_500),
                dashboardFloor: dollars(50_000),
                payoutsTaken: 0,
            }),
            registryPlan(TRADEIFY_SELECT_DAILY_ID),
        );
        expect(account.state.threshold).toBe(50_000);
        expect(account.dashboardFloorMismatch).toBeNull();
        expect(kindsOf(account)).toEqual(
            expect.arrayContaining([
                AssumptionKind.PeakReplacedByDashboardFloor,
                AssumptionKind.PeakProfitApproximated,
            ]),
        );
    });
});

describe('AccountReconstruction.rebuild: the TopStep live start follows the entered live start balance (F-109 (1), PD-41)', () => {
    const plan = registryPlan(TOPSTEP_STANDARD_ID);

    it('builds the LFA from a live start below the documented ceiling, with no reserve to release', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(8500),
                liveStartBalance: dollars(8000),
            }),
            plan,
        );
        if (account.state === null || account.livePlan === null) {
            throw new Error('expected a modeled live state');
        }
        expect(account.state.startingBalance).toBe(8000);
        expect(account.state.threshold).toBe(1000);
        expect(account.livePlan.seedReserveTerms()?.amount).toBe(0);
        expect(kindsOf(account)).not.toContain(
            AssumptionKind.LiveStartBalanceDefaulted,
        );
    });

    it('keeps the builder reserve default at the documented ceiling and names the reserve default', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(11_000),
                liveStartBalance: dollars(10_000),
            }),
            plan,
        );
        if (account.state === null || account.livePlan === null) {
            throw new Error('expected a modeled live state');
        }
        expect(account.state.startingBalance).toBe(10_000);
        expect(account.livePlan.seedReserveTerms()?.amount).toBe(40_000);
        expect(kindsOf(account)).toContain(
            AssumptionKind.TopStepLiveReserveDefaulted,
        );
    });

    it('falls back to the builder start and names it when the entered start is not a possible LFA start', () => {
        const account = liveOf(
            baseInput({
                balance: dollars(11_000),
                liveStartBalance: dollars(500),
            }),
            plan,
        );
        if (account.state === null) throw new Error('expected a live state');
        expect(account.state.startingBalance).toBe(10_000);
        expect(account.assumptions).toContainEqual({
            bias: 'optimistic',
            kind: AssumptionKind.LiveStartBalanceDefaulted,
        });
    });
});
