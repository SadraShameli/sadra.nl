import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    contractLimitAt,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    dollars,
    EodTrailingDrawdown,
    findFirm,
    FirmId,
    flatDayPolicy,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    type LivePlan,
    MffuVariant,
    newFundedCycleTracker,
    PayoutDayGateBasis,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    points,
    PolicySizing,
    recordBestDay,
    resetForNewDay,
    serializePlanId,
    StaticDrawdown,
    TradeifyVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    NO_PENDING_PAYOUT_COUNTS,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    ALL_FIRMS,
    buildApexLivePlan,
    LiveApplicabilityKind,
    livePlanApplicability,
    type LivePlanApplicability,
} from '~/lib/prop-calculator/firms';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    advanceFundedDay,
    DrawdownTracker,
    FundedDayOutcomeKind,
    LossStreak,
    PhaseStats,
    runDay,
    runLiveDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }

        expect(reconstructed.state.threshold).toBe(engineState.threshold);
        expect(reconstructed.state.thresholdLocked).toBe(
            engineState.thresholdLocked,
        );
        expect(reconstructed.state.balance).toBe(engineState.balance);
        expect(
            reconstructed.fundedTracker?.cycleSnapshot(
                plan,
                reconstructed.state,
            ).fundedResetsUsed,
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
        const reconstructed = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
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
                        null,
                        NO_PENDING_PAYOUT_COUNTS,
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

const FIRST_MONDAY = Date.UTC(2026, 0, 5);
const MILLISECONDS_PER_DAY = 86_400_000;
const SESSIONS_PER_WEEK = 5;
const DAYS_PER_WEEK = 7;
const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6];
const PLAN_SEEDS: readonly number[] = [1, 2, 3, 4];
const LIVE_START_DIFFERENT_FROM_BUILDER = 52_000;
const RESET_SHOCK_SESSION = 8;
const GROWTH_RISK = 300;

interface ComparableCycle {
    readonly cumulativePayout: number;
    readonly cycleBestDayProfit: number;
    readonly dayGateProgress: number;
    readonly fundedResetsUsed: number;
    readonly lastPayoutBalance: number;
    readonly payoutsIssued: number;
}

interface EngineCapture {
    readonly asOfSession: number;
    readonly input: AccountSnapshotInput;
    readonly isCalendarAligned: boolean;
    readonly isWeekAligned: boolean;
    readonly session: number;
}

interface EvalCapture extends EngineCapture {
    readonly state: AccountState;
}

interface FundedCapture extends EngineCapture {
    readonly cycle: ComparableCycle;
    readonly qualifyingDaysAtLastPayout: number;
    readonly state: AccountState;
}

interface LiveCapture extends EngineCapture {
    readonly state: LiveAccountState;
}

class PeakTrackingStats extends PhaseStats {
    highestBalance: number;

    constructor(startingBalance: number) {
        const totals = new TradeTotals();
        super(
            totals,
            new LossStreak(totals),
            new DrawdownTracker(startingBalance, totals),
        );
        this.highestBalance = startingBalance;
    }

    override recordTrade(
        isWon: boolean,
        pnl: number,
        balance: number,
        risk: number,
    ): void {
        super.recordTrade(isWon, pnl, balance, risk);
        this.highestBalance = Math.max(this.highestBalance, balance);
    }
}

function comparableAccountState(
    state: AccountState,
    qualifyingDaysAtLastPayout: number,
): AccountState {
    return {
        ...state,
        qualifyingDays: state.qualifyingDays - qualifyingDaysAtLastPayout,
        todayPnL: 0,
    };
}

function comparableEvalState(state: AccountState): AccountState {
    return { ...state, qualifyingDays: 0, todayPnL: 0 };
}

function comparableLiveState(state: LiveAccountState): LiveAccountState {
    return {
        ...state,
        qualifyingDays: state.qualifyingDays - state.qualifyingDaysAtLastPayout,
        qualifyingDaysAtLastPayout: 0,
        todayPnL: 0,
    };
}

function daysForSeed(seed: number): number {
    return 5 + ((seed * 7) % 36);
}

function engineLivePlanFor(applicability: LivePlanApplicability): LivePlan {
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            return applicability.reconstructionDefault === null
                ? applicability.builder(applicability.defaultCushionPercent)
                : applicability.builder(
                      applicability.defaultCushionPercent,
                      applicability.reconstructionDefault,
                  );
        }
        case LiveApplicabilityKind.NotModeled: {
            throw new Error('a not-modeled pair has no engine live plan');
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            return applicability.transitionBuilder(
                applicability.defaultCushionPercent,
                dollars(0),
            );
        }
    }
}

function evalCaptures(
    plan: Plan,
    seed: number,
    riskPerTrade: number,
): readonly EvalCapture[] {
    const rng = mulberry32(seed);
    const state = plan.initialState();
    const stats = new PeakTrackingStats(state.balance);
    let highestEod = state.balance;
    const captures: EvalCapture[] = [];
    const dayPolicy = flatDayPolicy(
        riskPerTrade,
        2,
        { kind: DayStopRuleKind.None },
        PolicySizing.ContractCapped,
    );
    const days = daysForSeed(seed);
    for (let session = 1; session <= days; session++) {
        const { busted } = runDay({
            commission: dollars(0),
            dayPolicy,
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng,
            rrRatio: 1.5,
            rungSizing: DEFAULT_RUNG_SIZING,
            state,
            stats,
            winrate: fraction(0.6),
        });
        recordBestDay(state);
        if (busted) break;
        highestEod = Math.max(highestEod, state.balance);
        const engineState = { ...state };
        resetForNewDay(engineState);
        captures.push({
            asOfSession: session,
            input: {
                asOf: sessionDate(session),
                balance: dollars(state.balance),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                elapsedDaysSinceAttemptStart: state.elapsedDays,
                evalBestDayProfit: dollars(state.bestDayProfit),
                highestEodBalance: dollars(highestEod),
                highestIntradayBalance: dollars(stats.highestBalance),
                stage: SizingStage.Eval,
                tradingDays: state.tradingDays,
            },
            isCalendarAligned: true,
            isWeekAligned: session % SESSIONS_PER_WEEK === 0,
            session,
            state: engineState,
        });
        if (plan.isPassed(state)) break;
    }
    return captures;
}

function evalPlans(): readonly Plan[] {
    return fundedPlans().filter((plan) => !plan.isInstantFunded);
}

function expectEvalRoundTrip(
    plan: Plan,
    seed: number,
    capture: EvalCapture,
): void {
    const label = labelOf(plan, seed, capture);
    const hasWeekRule = plan.calendarWeekInactivityFor(TradingPhase.Eval) !== null;
    if (hasWeekRule && !capture.isWeekAligned) return;
    const account = AccountReconstruction.rebuild(
        capture.input,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== TradingPhase.Eval) {
        throw new Error(`${label}: expected an eval reconstruction`);
    }
    expect(comparableEvalState(account.state), `${label} state`).toEqual(
        comparableEvalState(capture.state),
    );
    expect(account.cushion, `${label} cushion`).toBe(
        capture.state.balance - capture.state.threshold,
    );
    expect(account.resolvedDailyLossLimit, `${label} daily loss limit`).toBe(
        plan.resolvedDailyLossLimit(capture.state, TradingPhase.Eval),
    );
    expect(account.contractLimit, `${label} contract limit`).toBe(
        plan.contractLimits === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  TradingPhase.Eval,
                  false,
                  plan.tierProfitContext(capture.state),
              ),
    );
}

function expectFundedRoundTrip(
    plan: Plan,
    seed: number,
    capture: FundedCapture,
): void {
    const label = labelOf(plan, seed, capture);
    const hasWeekRule = plan.calendarWeekInactivityFor(TradingPhase.Funded) !== null;
    if (hasWeekRule && !capture.isWeekAligned) return;
    const account = AccountReconstruction.rebuild(
        capture.input,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== TradingPhase.Funded || account.fundedTracker === null) {
        throw new Error(`${label}: expected a funded reconstruction`);
    }
    const qualifyingAtLastPayout =
        account.fundedTracker.qualifyingDaysAtLastPayout;
    expect(
        comparableAccountState(account.state, qualifyingAtLastPayout),
        `${label} state`,
    ).toEqual(
        comparableAccountState(
            capture.state,
            capture.qualifyingDaysAtLastPayout,
        ),
    );
    const cycle = account.fundedTracker.cycleSnapshot(plan, account.state);
    const expectedCycle: Omit<ComparableCycle, 'cumulativePayout'> = {
        cycleBestDayProfit: capture.cycle.cycleBestDayProfit,
        dayGateProgress: capture.cycle.dayGateProgress,
        fundedResetsUsed: capture.cycle.fundedResetsUsed,
        lastPayoutBalance: capture.cycle.lastPayoutBalance,
        payoutsIssued: capture.cycle.payoutsIssued,
    };
    if (
        plan.payoutDayGateBasis ===
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout &&
        !capture.isCalendarAligned
    ) {
        expect(
            { ...cycle, dayGateProgress: 0 },
            `${label} cycle`,
        ).toEqual({ ...expectedCycle, dayGateProgress: 0 });
    } else {
        expect(cycle, `${label} cycle`).toEqual(expectedCycle);
    }
    expect(
        account.fundedTracker.cumulativePayout,
        `${label} cumulative payout`,
    ).toBe(capture.cycle.cumulativePayout);
    expect(account.cushion, `${label} cushion`).toBe(
        capture.state.balance - capture.state.threshold,
    );
    expect(account.resolvedDailyLossLimit, `${label} daily loss limit`).toBe(
        plan.resolvedDailyLossLimit(capture.state, TradingPhase.Funded),
    );
    expect(account.contractLimit, `${label} contract limit`).toBe(
        plan.contractLimits === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  TradingPhase.Funded,
                  false,
                  plan.tierProfitContext(capture.state),
              ),
    );
}

function expectLiveRoundTrip(
    plan: Plan,
    seed: number,
    capture: LiveCapture,
    livePlan: LivePlan,
): void {
    const label = labelOf(plan, seed, capture);
    if (livePlan.calendarWeekInactivity !== null && !capture.isWeekAligned) {
        return;
    }
    const account = AccountReconstruction.rebuild(
        capture.input,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== ReconstructedLiveKind.Live || account.state === null) {
        throw new Error(`${label}: expected a modeled live reconstruction`);
    }
    const rebuiltPlan = account.livePlan;
    if (rebuiltPlan === null) throw new Error(`${label}: no live plan`);
    expect(comparableLiveState(account.state), `${label} state`).toEqual(
        comparableLiveState(capture.state),
    );
    expect(account.cushion, `${label} cushion`).toBe(
        capture.state.balance - capture.state.threshold,
    );
    expect(
        rebuiltPlan.dailyLossLimitFor(account.state),
        `${label} daily loss limit`,
    ).toBe(rebuiltPlan.dailyLossLimitFor(capture.state));
    expect(
        rebuiltPlan.liveContractLimitsFor(account.state),
        `${label} contract limits`,
    ).toEqual(rebuiltPlan.liveContractLimitsFor(capture.state));
}

function fundedCaptures(
    plan: Plan,
    seed: number,
    riskPerTrade: number,
    winrate: number,
    shockSession: null | number = null,
): readonly FundedCapture[] {
    const rng = mulberry32(seed);
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    let tracker = newFundedCycleTracker(state);
    let stats = new PeakTrackingStats(state.balance);
    let highestEod = state.balance;
    let floorAtLastPayout: number | undefined;
    let anchorSession = 1;
    let lastPayoutSession = 0;
    let weekStartSession = 0;
    const curve: number[] = [];
    const captures: FundedCapture[] = [];
    const dayPolicy = flatDayPolicy(
        riskPerTrade,
        2,
        { kind: DayStopRuleKind.None },
        PolicySizing.ContractCapped,
    );
    const days = daysForSeed(seed);
    for (let session = 1; session <= days; session++) {
        curve.length = 0;
        if (session === shockSession) state.balance = state.threshold;
        const outcome = advanceFundedDay({
            commission: dollars(0),
            dayPolicy,
            discounts: undefined,
            equityCurve: curve,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            resetsUsed: tracker.fundedResetsUsed,
            rng,
            rrRatio: 1.5,
            rungSizing: DEFAULT_RUNG_SIZING,
            state,
            stats,
            tracker,
            winrate: fraction(winrate),
        });
        if (outcome.kind === FundedDayOutcomeKind.Busted) break;
        if (outcome.kind === FundedDayOutcomeKind.Reset) {
            tracker = outcome.tracker;
            stats = new PeakTrackingStats(state.balance);
            highestEod = state.balance;
            floorAtLastPayout = undefined;
            anchorSession = session + 1;
            lastPayoutSession = 0;
            weekStartSession = session;
        } else {
            highestEod = Math.max(highestEod, curve[0] ?? state.balance);
            if (outcome.payout !== null) {
                floorAtLastPayout = state.threshold;
                lastPayoutSession = session;
            }
        }
        const payoutsTaken = tracker.payoutsIssued;
        const calendarAnchor =
            payoutsTaken === 0 ? anchorSession : lastPayoutSession;
        const engineState = { ...state };
        resetForNewDay(engineState);
        captures.push({
            asOfSession: session,
            cycle: {
                cumulativePayout: tracker.cumulativePayout,
                cycleBestDayProfit: tracker.cycleBestDayProfit,
                dayGateProgress: tracker.dayGateProgress(plan, state),
                fundedResetsUsed: tracker.fundedResetsUsed,
                lastPayoutBalance: tracker.lastPayoutBalance,
                payoutsIssued: tracker.payoutsIssued,
            },
            input: {
                asOf: sessionDate(session),
                balance: dollars(state.balance),
                balanceAtLastPayout:
                    payoutsTaken > 0
                        ? dollars(tracker.lastPayoutBalance)
                        : undefined,
                cumulativePayout: dollars(tracker.cumulativePayout),
                cycleBestDayProfit: dollars(tracker.cycleBestDayProfit),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                firstFundedTradeOn: sessionDate(anchorSession),
                floorAtLastPayout:
                    floorAtLastPayout !== undefined && payoutsTaken > 0
                        ? dollars(floorAtLastPayout)
                        : undefined,
                fundedResetsUsed: tracker.fundedResetsUsed,
                highestEodBalance: dollars(highestEod),
                highestIntradayBalance: dollars(stats.highestBalance),
                lastPayoutOn:
                    payoutsTaken > 0 ? sessionDate(lastPayoutSession) : undefined,
                payoutsTaken,
                qualifyingDaysSinceLastPayout:
                    state.qualifyingDays - tracker.qualifyingDaysAtLastPayout,
                stage: SizingStage.Funded,
            },
            isCalendarAligned:
                (session - calendarAnchor) % SESSIONS_PER_WEEK === 0,
            isWeekAligned: (session - weekStartSession) % SESSIONS_PER_WEEK === 0,
            qualifyingDaysAtLastPayout: tracker.qualifyingDaysAtLastPayout,
            session,
            state: engineState,
        });
        if (outcome.kind === FundedDayOutcomeKind.Concluded) break;
    }
    return captures;
}

function fundedPlans(): readonly Plan[] {
    return ALL_FIRMS.flatMap((firm) => firm.plans);
}

function hasRebuiltFirstFundedPayout(plan: Plan): boolean {
    for (const seed of SEEDS) {
        const withPayout = fundedCaptures(plan, seed, GROWTH_RISK, 0.62).find(
            (capture) => (capture.input.payoutsTaken ?? 0) > 0,
        );
        if (withPayout !== undefined) {
            expectFundedRoundTrip(plan, seed, withPayout);
            return true;
        }
    }
    return false;
}

function hasRebuiltFirstLivePayout(
    plan: Plan,
    applicability: LivePlanApplicability,
): boolean {
    const livePlan = engineLivePlanFor(applicability);
    if (livePlan.payoutFloorEffect !== PayoutFloorEffect.LockAtPlanFloor) {
        return false;
    }
    for (const seed of SEEDS) {
        const withPayout = liveCaptures(livePlan, seed, 0).find(
            (capture) => (capture.input.payoutsTaken ?? 0) > 0,
        );
        if (withPayout !== undefined) {
            expectLiveRoundTrip(
                plan,
                seed,
                withPayout,
                engineLivePlanFor(applicability),
            );
            return true;
        }
    }
    return false;
}

function labelOf(plan: Plan, seed: number, capture: EngineCapture): string {
    return `${serializePlanId(plan.id)} seed ${seed} session ${capture.session}`;
}

function lateLockPlan(): Plan {
    return registryPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Growth,
    }).withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: dollars(5000),
                lockedThreshold: (start) => start + 100,
            },
        }),
    });
}

function liveCaptures(
    livePlan: LivePlan,
    seed: number,
    startShift: number,
): readonly LiveCapture[] {
    const rng = mulberry32(seed);
    const state = livePlan.initialState();
    if (startShift !== 0) {
        state.balance += startShift;
        state.startingBalance += startShift;
        if (livePlan.liveDrawdown !== null) state.threshold += startShift;
    }
    let highestEod = state.balance;
    let floorAtLastPayout: number | undefined;
    let payoutsTaken = 0;
    const weekStartSession = 0;
    const captures: LiveCapture[] = [];
    const positionSizing = {
        instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
        stopPoints: points(20),
    };
    const retainedCushion = livePlan.resolveRetainedCushion(dollars(500));
    const days = daysForSeed(seed);
    for (let session = 1; session <= days; session++) {
        const { busted } = runLiveDay({
            commission: dollars(0),
            plan: livePlan,
            positionSizing,
            rng,
            rrRatio: 1.5,
            state,
            tradesPerDay: 2,
            winrate: fraction(0.62),
        });
        if (busted) break;
        highestEod = Math.max(highestEod, state.balance);
        const debited = livePlan.payoutRequestAmount(
            state,
            retainedCushion,
            undefined,
        );
        if (debited > 0) {
            livePlan.withdraw(state, debited);
            payoutsTaken += 1;
            floorAtLastPayout = state.threshold;
        }
        const engineState = { ...state };
        resetForNewDay(engineState);
        captures.push({
            asOfSession: session,
            input: {
                asOf: sessionDate(session),
                balance: dollars(state.balance),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                floorAtLastPayout:
                    floorAtLastPayout !== undefined && payoutsTaken > 0
                        ? dollars(floorAtLastPayout)
                        : undefined,
                highestEodBalance: dollars(highestEod),
                liveStartBalance: dollars(state.startingBalance),
                payoutsTaken,
                qualifyingDaysSinceLastPayout:
                    state.qualifyingDays - state.qualifyingDaysAtLastPayout,
                stage: SizingStage.Live,
            },
            isCalendarAligned: true,
            isWeekAligned: (session - weekStartSession) % SESSIONS_PER_WEEK === 0,
            session,
            state: engineState,
        });
    }
    return captures;
}

function modeledLivePairs(): readonly {
    readonly applicability: LivePlanApplicability;
    readonly plan: Plan;
}[] {
    return fundedPlans()
        .filter((plan) => plan.id.firm !== FirmId.TopStep)
        .map((plan) => ({
            applicability: livePlanApplicability(plan.id),
            plan,
        }))
        .filter(
            ({ applicability }) =>
                applicability.kind !== LiveApplicabilityKind.NotModeled,
        );
}

function plansWithEffect(effect: PayoutFloorEffect): readonly Plan[] {
    return fundedPlans().filter((plan) => plan.payoutFloorEffect === effect);
}

function plansWithFundedReset(): readonly Plan[] {
    return fundedPlans()
        .filter((plan) => plan.fundedReset !== null)
        .map((plan) => plan.withOverrides({ takesFundedReset: true }));
}

function sessionDate(session: number): string {
    const index = session - 1;
    const week = Math.floor(index / SESSIONS_PER_WEEK);
    const day = index % SESSIONS_PER_WEEK;
    return new Date(
        FIRST_MONDAY + (week * DAYS_PER_WEEK + day) * MILLISECONDS_PER_DAY,
    )
        .toISOString()
        .slice(0, 10);
}

describe('ReconstructionRoundTrip: states captured from seeded engine funded runs rebuild to the engine state (F-107 (1), (5), (6), PT-103)', () => {
    for (const plan of fundedPlans()) {
        it(`rebuilds the whole state, cycle, cushion, daily loss limit and contract limit for ${serializePlanId(plan.id)}`, () => {
            let captured = 0;
            for (const seed of PLAN_SEEDS) {
                const captures = fundedCaptures(plan, seed, GROWTH_RISK, 0.62);
                for (const capture of captures) {
                    expectFundedRoundTrip(plan, seed, capture);
                    captured += 1;
                }
            }
            expect(captured).toBeGreaterThan(0);
        });
    }

    it('rebuilds a funded run on a late-lock plan whose payout floor depends on the peak order, from the floor at the last payout', () => {
        const plan = lateLockPlan();
        let withPayout = 0;
        for (const seed of PLAN_SEEDS) {
            for (const capture of fundedCaptures(plan, seed, GROWTH_RISK, 0.62)) {
                expectFundedRoundTrip(plan, seed, capture);
                if ((capture.input.payoutsTaken ?? 0) > 0) withPayout += 1;
            }
        }
        expect(withPayout).toBeGreaterThan(0);
    });

    it('rebuilds a funded run on a static drawdown plan (the registry holds none, a withOverrides plan stands in)', () => {
        const plan = registryPlan(APEX_EOD_ID).withOverrides({
            drawdown: new StaticDrawdown({ amount: dollars(2000) }),
            fundedDrawdown: new StaticDrawdown({ amount: dollars(2000) }),
        });
        let captured = 0;
        for (const seed of PLAN_SEEDS) {
            for (const capture of fundedCaptures(plan, seed, GROWTH_RISK, 0.62)) {
                expectFundedRoundTrip(plan, seed, capture);
                captured += 1;
            }
        }
        expect(captured).toBeGreaterThan(0);
    });
});

describe('ReconstructionRoundTrip: the table covers every payout floor effect, the funded reset and both day gate bases (F-107 (2), (3), (4), (7), (8), (9))', () => {
    const EFFECTS: readonly PayoutFloorEffect[] = [
        PayoutFloorEffect.LockAtPlanFloor,
        PayoutFloorEffect.MoveToLockedFloor,
        PayoutFloorEffect.ReleaseFloor,
    ];

    for (const effect of EFFECTS) {
        it(`reaches a captured funded state with a payout taken for a plan with ${effect}, and rebuilds it`, () => {
            const reached = plansWithEffect(effect).filter((plan) =>
                hasRebuiltFirstFundedPayout(plan),
            );
            expect(reached.length).toBeGreaterThan(0);
        });
    }

    it('rebuilds funded runs that reset, on every plan with a funded reset, and reaches a state after a reset', () => {
        let afterReset = 0;
        for (const plan of plansWithFundedReset()) {
            for (const seed of PLAN_SEEDS) {
                for (const capture of fundedCaptures(
                    plan,
                    seed,
                    GROWTH_RISK,
                    0.62,
                    RESET_SHOCK_SESSION,
                )) {
                    expectFundedRoundTrip(plan, seed, capture);
                    if ((capture.input.fundedResetsUsed ?? 0) > 0) {
                        afterReset += 1;
                    }
                }
            }
        }
        expect(afterReset).toBeGreaterThan(0);
    });

    it('holds a plan on each day gate basis', () => {
        const bases = new Set(
            fundedPlans().map((plan) => plan.payoutDayGateBasis),
        );
        expect(bases).toEqual(
            new Set([
                PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
                PayoutDayGateBasis.QualifyingDaysSincePassOrPayout,
            ]),
        );
    });
});

describe('ReconstructionRoundTrip: states captured from seeded engine eval runs rebuild to the engine state (F-107 (1), PT-103)', () => {
    for (const plan of evalPlans()) {
        it(`rebuilds the whole eval state, cushion, daily loss limit and contract limit for ${serializePlanId(plan.id)}`, () => {
            let captured = 0;
            for (const seed of PLAN_SEEDS) {
                for (const capture of evalCaptures(plan, seed, GROWTH_RISK)) {
                    expectEvalRoundTrip(plan, seed, capture);
                    captured += 1;
                }
            }
            expect(captured).toBeGreaterThan(0);
        });
    }
});

describe('ReconstructionRoundTrip: states captured from seeded engine live runs rebuild to the engine state, for every modeled pair except TopStep (F-107 (1), (2), F-109 (1), (4), (7), PT-103)', () => {
    for (const { applicability, plan } of modeledLivePairs()) {
        it(`rebuilds the whole live state with the builder start and with a different live start for ${serializePlanId(plan.id)}`, () => {
            let captured = 0;
            for (const startShift of [0, LIVE_START_DIFFERENT_FROM_BUILDER]) {
                for (const seed of PLAN_SEEDS) {
                    const livePlan = engineLivePlanFor(applicability);
                    for (const capture of liveCaptures(
                        livePlan,
                        seed,
                        startShift,
                    )) {
                        expectLiveRoundTrip(plan, seed, capture, livePlan);
                        captured += 1;
                    }
                }
            }
            expect(captured).toBeGreaterThan(0);
        });
    }

    it('reaches a captured live state with a payout taken on a LockAtPlanFloor live plan, and rebuilds it', () => {
        const reached = modeledLivePairs().filter(({ applicability, plan }) =>
            hasRebuiltFirstLivePayout(plan, applicability),
        );
        expect(reached.length).toBeGreaterThan(0);
    });
});
