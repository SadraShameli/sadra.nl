import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
    serializePlanId,
    StaticDrawdown,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    LiveApplicabilityKind,
    livePlanApplicability,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { ALL_FIRMS, buildApexLivePlan } from '~/lib/prop-calculator/firms';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const APEX_INTRADAY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
};

function baseInput(
    overrides: Partial<AccountSnapshotInput>,
): AccountSnapshotInput {
    return {
        asOf: '2026-01-10',
        balance: dollars(0),
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

function staticDrawdownPlan(base: Plan): Plan {
    return base.withOverrides({
        drawdown: new StaticDrawdown({ amount: dollars(2000) }),
        fundedDrawdown: new StaticDrawdown({ amount: dollars(2000) }),
    });
}

describe('ReconstructionRoundTrip (F-107, PT-12j, PT-12k)', () => {
    it('rebuilds the same threshold, lock and balance as a real EOD-trailing funded run', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const engineState = plan.initialState();
        plan.beginFundedPhase(engineState);
        const drawdown = plan.fundedDrawdown;

        let highestEodBalance = engineState.balance;
        for (const dayEndBalance of [50_800, 52_000, 51_500, 53_000, 52_400]) {
            engineState.balance = dayEndBalance;
            drawdown.onDayClose(engineState);
            highestEodBalance = Math.max(highestEodBalance, dayEndBalance);
        }

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            firstFundedTradeOn: '2026-01-01',
            highestEodBalance: dollars(highestEodBalance),
            payoutsTaken: 0,
            stage: SizingStage.Funded,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
    });

    it('rebuilds the same threshold, lock and balance as a real EOD-trailing eval run', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const engineState = plan.initialState();
        const drawdown = plan.drawdownFor(TradingPhase.Eval);

        let highestEodBalance = engineState.balance;
        const dailyBalances = [50_800, 51_500, 52_200, 51_800];
        for (const dayEndBalance of dailyBalances) {
            engineState.balance = dayEndBalance;
            drawdown.onDayClose(engineState);
            highestEodBalance = Math.max(highestEodBalance, dayEndBalance);
        }
        engineState.tradingDays = dailyBalances.length;

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            highestEodBalance: dollars(highestEodBalance),
            stage: SizingStage.Eval,
            tradingDays: dailyBalances.length,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
        expect(reconstructed.state.tradingDays).toBe(engineState.tradingDays);
    });

    it('rebuilds the same threshold, lock and balance as a real intraday-trailing funded run', () => {
        const plan = registryPlan(APEX_INTRADAY_ID);
        const engineState = plan.initialState();
        plan.beginFundedPhase(engineState);
        const drawdown = plan.fundedDrawdown;

        let highestIntradayBalance = engineState.balance;

        engineState.balance += 500;
        drawdown.onTrade(engineState, 500, 500);
        highestIntradayBalance = Math.max(
            highestIntradayBalance,
            engineState.balance,
        );

        const preTrade2Balance = engineState.balance;
        engineState.balance += 300;
        drawdown.onTrade(engineState, 300, 900);
        highestIntradayBalance = Math.max(
            highestIntradayBalance,
            preTrade2Balance + 900,
        );

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            highestIntradayBalance: dollars(highestIntradayBalance),
            payoutsTaken: 0,
            stage: SizingStage.Funded,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
    });

    it('rebuilds the same threshold, lock and balance as a real intraday-trailing eval run', () => {
        const plan = registryPlan(APEX_INTRADAY_ID);
        const engineState = plan.initialState();
        const drawdown = plan.drawdownFor(TradingPhase.Eval);

        let highestIntradayBalance = engineState.balance;

        engineState.balance += 400;
        drawdown.onTrade(engineState, 400, 400);
        highestIntradayBalance = Math.max(
            highestIntradayBalance,
            engineState.balance,
        );

        const preTrade2Balance = engineState.balance;
        engineState.balance += 200;
        drawdown.onTrade(engineState, 200, 700);
        highestIntradayBalance = Math.max(
            highestIntradayBalance,
            preTrade2Balance + 700,
        );
        engineState.tradingDays = 1;

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            highestIntradayBalance: dollars(highestIntradayBalance),
            stage: SizingStage.Eval,
            tradingDays: 1,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
    });

    it('rebuilds the same threshold and balance as a real static-drawdown funded run (a withOverrides plan)', () => {
        const plan = staticDrawdownPlan(registryPlan(APEX_EOD_ID));
        const engineState = plan.initialState();
        plan.beginFundedPhase(engineState);
        const drawdown = plan.fundedDrawdown;

        for (const dayEndBalance of [50_800, 49_500, 51_200]) {
            engineState.balance = dayEndBalance;
            drawdown.onDayClose(engineState);
        }

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            payoutsTaken: 0,
            stage: SizingStage.Funded,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
    });

    it('rebuilds the same threshold and balance as a real static-drawdown eval run (a withOverrides plan)', () => {
        const plan = staticDrawdownPlan(registryPlan(APEX_EOD_ID));
        const engineState = plan.initialState();
        const drawdown = plan.drawdownFor(TradingPhase.Eval);

        for (const dayEndBalance of [50_400, 49_800, 50_900]) {
            engineState.balance = dayEndBalance;
            drawdown.onDayClose(engineState);
        }
        engineState.tradingDays = 3;

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            stage: SizingStage.Eval,
            tradingDays: 3,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
    });

    it('rebuilds the same threshold, balance and reset count after a funded reset restarts the drawdown', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const engineState = plan.initialState();
        plan.beginFundedPhase(engineState);
        plan.beginFundedPhase(engineState);
        const drawdown = plan.fundedDrawdown;

        let highestEodBalance = engineState.balance;
        for (const dayEndBalance of [50_600, 51_200, 50_900]) {
            engineState.balance = dayEndBalance;
            drawdown.onDayClose(engineState);
            highestEodBalance = Math.max(highestEodBalance, dayEndBalance);
        }

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            firstFundedTradeOn: '2026-01-05',
            fundedResetsUsed: 1,
            highestEodBalance: dollars(highestEodBalance),
            payoutsTaken: 0,
            stage: SizingStage.Funded,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
        expect(
            reconstructed.fundedTracker
                ?.cycleSnapshot(plan, reconstructed.state)
                .fundedResetsUsed,
        ).toBe(1);
    });

    it('rebuilds the same threshold, lock and balance as a real EOD-trailing verified live run', () => {
        const plan = registryPlan(APEX_EOD_ID);
        const livePlan = buildApexLivePlan();
        const engineState = livePlan.initialState();
        const drawdown = livePlan.liveDrawdown;
        if (drawdown === null) throw new Error('expected a live drawdown');

        let highestEodBalance = engineState.balance;
        for (const dayEndBalance of [1200, 1800, 1500, 2000]) {
            engineState.balance = dayEndBalance;
            drawdown.onDayClose(engineState);
            highestEodBalance = Math.max(highestEodBalance, dayEndBalance);
        }

        const snapshot = baseInput({
            balance: dollars(engineState.balance),
            highestEodBalance: dollars(highestEodBalance),
            stage: SizingStage.Live,
        });
        const reconstructed = AccountReconstruction.rebuild(snapshot, plan);
        if (reconstructed.kind !== ReconstructedLiveKind.Live) {
            throw new Error('expected a live reconstruction');
        }
        if (reconstructed.state === null) {
            throw new Error('expected a modeled live state');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
    });

    describe('every (plan, builder) pair LivePlanApplicability marks as modeled, except TopStep (PD-41)', () => {
        for (const firm of ALL_FIRMS) {
            if (firm.id === FirmId.TopStep) continue;
            for (const plan of firm.plans) {
                const applicability = livePlanApplicability(plan.id);
                if (applicability.kind === LiveApplicabilityKind.NotModeled) {
                    continue;
                }

                it(`rebuilds the live threshold and balance for ${serializePlanId(plan.id)}`, () => {
                    const livePlan =
                        applicability.kind === LiveApplicabilityKind.Builder
                            ? applicability.builder(
                                  applicability.defaultCushionPercent,
                              )
                            : applicability.transitionBuilder(
                                  applicability.defaultCushionPercent,
                                  dollars(0),
                              );
                    const engineState = livePlan.initialState();
                    const drawdown = livePlan.liveDrawdown;

                    let highestEodBalance = engineState.balance;
                    if (drawdown === null) {
                        engineState.balance += 800;
                    } else {
                        for (const delta of [800, 500, -200, 900]) {
                            engineState.balance += delta;
                            drawdown.onDayClose(engineState);
                            highestEodBalance = Math.max(
                                highestEodBalance,
                                engineState.balance,
                            );
                        }
                    }

                    const snapshot = baseInput({
                        balance: dollars(engineState.balance),
                        highestEodBalance: dollars(highestEodBalance),
                        stage: SizingStage.Live,
                    });
                    const reconstructed = AccountReconstruction.rebuild(
                        snapshot,
                        plan,
                    );
                    if (reconstructed.kind !== ReconstructedLiveKind.Live) {
                        throw new Error('expected a live reconstruction');
                    }
                    if (reconstructed.state === null) {
                        throw new Error('expected a modeled live state');
                    }

                    expect(reconstructed.state.threshold).toBe(
                        engineState.threshold,
                    );
                    expect(reconstructed.state.thresholdLocked).toBe(
                        engineState.thresholdLocked,
                    );
                    expect(reconstructed.state.balance).toBe(
                        engineState.balance,
                    );
                });
            }
        }
    });
});
