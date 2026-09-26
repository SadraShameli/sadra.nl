import { z } from 'zod';

import {
    type ContractLimitConfig,
    ContractLimitKind,
    type LiveContractLimits,
    maxContractsAt,
} from './ContractLimits';
import {
    type DailyLossLimitConfig,
    resolveDailyLossLimit,
} from './DailyLossLimit';
import { DrawdownKind, type DrawdownStrategy } from './DrawdownStrategy';
import { type InstrumentSpec } from './Instruments';
import {
    type ContractCount,
    dollars,
    type Dollars,
    floorToWholeCents,
    type Fraction0to1,
    isAtOrBelowWithinCentTolerance,
    ONE_CENT,
} from './lib/units';
import {
    createInitialLiveAccountState,
    type LiveAccountState,
} from './LiveAccountState';
import {
    isPayoutLockEffect,
    PayoutFloorEffect,
    payoutFloorEffectName,
} from './PayoutFloorEffect';
import { type PayoutTier, walkPayoutTiers } from './PayoutTiers';
import { type UntrackedTierProfitContext } from './TierBasis';

export interface LiveCushionPercent {
    postLock: Fraction0to1;
    preLock: Fraction0to1;
}

export interface LivePlanInit {
    contractLimits?: LiveContractLimits;
    cushionPercent: LiveCushionPercent;
    label: string;
    liveDailyLossLimit: DailyLossLimitConfig | null;
    liveDrawdown: DrawdownStrategy | null;
    maxConsecutiveIdleDays?: number;
    minPayoutRequest?: Dollars;
    payoutFloor?: Dollars;
    payoutFloorEffect?: PayoutFloorEffect;
    payoutTiers: readonly PayoutTier[];
    requiresLockForWithdrawal?: boolean;
    startingBalance?: Dollars;
    transitionPayout?: Dollars;
    winningDayPayoutGate?: LiveWinningDayPayoutGate;
}

export interface LiveReserveProgress {
    incrementsReleased: number;
    pendingDepositSession: null | number;
    profitSinceExpansion: number;
    sessions: number;
}

export interface LiveSeedReserve {
    readonly amount: Dollars;
    readonly depositLagSessions: number;
    readonly increments: number;
    readonly profitTargetPerIncrement: Dollars;
    readonly reviewIntervalSessions: number;
}

export interface LiveWinningDayPayoutGate {
    readonly dailyPayoutsAfterWinningDays: number;
    readonly minWinningDayProfit: Dollars;
    readonly requestBalanceShareCap: Fraction0to1;
    readonly winningDaysPerRequest: number;
}

export interface ReserveLiveAccountState extends LiveAccountState {
    readonly reserve: LiveReserveProgress;
}

export interface ReserveLivePlanInit extends LivePlanInit {
    seedReserve: LiveSeedReserve;
}

export class LivePlan {
    protected readonly contractLimits: LiveContractLimits | null;

    readonly cushionPercent: LiveCushionPercent;

    readonly label: string;

    protected readonly liveDailyLossLimit: DailyLossLimitConfig | null;

    readonly liveDrawdown: DrawdownStrategy | null;

    readonly maxConsecutiveIdleDays: null | number;

    readonly minPayoutRequest: Dollars;

    readonly payoutFloor: Dollars | null;

    readonly payoutFloorEffect: PayoutFloorEffect;

    readonly payoutTiers: readonly PayoutTier[];

    readonly requiresLockForWithdrawal: boolean;

    readonly startingBalance: Dollars;

    readonly transitionPayout: Dollars;

    readonly winningDayPayoutGate: LiveWinningDayPayoutGate | null;

    constructor(init: LivePlanInit) {
        this.contractLimits = init.contractLimits ?? null;
        if (this.contractLimits !== null) {
            if (hasEmptyTiers(this.contractLimits.minis)) {
                throw new Error(
                    `${init.label}: contractLimits.minis.tiers must not be empty`,
                );
            }
            if (hasEmptyTiers(this.contractLimits.micros)) {
                throw new Error(
                    `${init.label}: contractLimits.micros.tiers must not be empty`,
                );
            }
        }
        this.cushionPercent = init.cushionPercent;
        this.label = init.label;
        this.liveDailyLossLimit = init.liveDailyLossLimit;
        this.liveDrawdown = init.liveDrawdown;
        this.maxConsecutiveIdleDays = init.maxConsecutiveIdleDays ?? null;
        if (
            this.maxConsecutiveIdleDays !== null &&
            (!Number.isSafeInteger(this.maxConsecutiveIdleDays) ||
                this.maxConsecutiveIdleDays <= 0)
        ) {
            throw new Error(
                `${this.label}: maxConsecutiveIdleDays must be a positive integer or omitted, got ${this.maxConsecutiveIdleDays}`,
            );
        }
        this.minPayoutRequest = init.minPayoutRequest ?? dollars(0);
        if (!minPayoutRequestSchema.safeParse(this.minPayoutRequest).success) {
            throw new Error(
                `${this.label}: minPayoutRequest must be a finite number >= 0, got ${this.minPayoutRequest}`,
            );
        }
        this.payoutFloor = init.payoutFloor ?? null;
        this.payoutFloorEffect =
            init.payoutFloorEffect ?? PayoutFloorEffect.None;
        this.requiresLockForWithdrawal = init.requiresLockForWithdrawal ?? true;
        this.startingBalance = init.startingBalance ?? dollars(0);
        this.transitionPayout = init.transitionPayout ?? dollars(0);
        this.winningDayPayoutGate = init.winningDayPayoutGate ?? null;
        if (this.winningDayPayoutGate !== null) {
            const gate = winningDayPayoutGateSchema.safeParse(
                this.winningDayPayoutGate,
            );
            if (!gate.success) {
                throw new Error(
                    `${this.label}: winningDayPayoutGate is invalid (${gate.error.issues.map((issue) => issue.path.join('.')).join(', ')})`,
                );
            }
        }
        if (this.liveDrawdown === null && this.liveDailyLossLimit === null) {
            throw new Error(
                `${this.label}: must set liveDrawdown or liveDailyLossLimit`,
            );
        }
        if (
            isPayoutLockEffect(this.payoutFloorEffect) &&
            this.liveDrawdown?.lock === undefined
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is ${payoutFloorEffectName(this.payoutFloorEffect)} but liveDrawdown has no lock config`,
            );
        }
        if (
            isPayoutLockEffect(this.payoutFloorEffect) &&
            this.requiresLockForWithdrawal
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is ${payoutFloorEffectName(this.payoutFloorEffect)} but requiresLockForWithdrawal gates every withdrawal behind the lock, so the effect could never fire`,
            );
        }
        if (
            this.liveDrawdown?.lock?.atProfit === null &&
            this.payoutFloorEffect !== PayoutFloorEffect.MoveToLockedFloor
        ) {
            throw new Error(
                `${this.label}: liveDrawdown lock has no profit trigger, so only payoutFloorEffect MoveToLockedFloor can ever fire it`,
            );
        }
        if (
            this.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor &&
            this.liveDrawdown === null
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is ReleaseFloor but liveDrawdown is null`,
            );
        }
        if (
            this.payoutFloor !== null &&
            this.payoutFloorEffect !== PayoutFloorEffect.None
        ) {
            throw new Error(
                `${this.label}: payoutFloor and a non-None payoutFloorEffect cannot both be set -- withdraw() would move the threshold to the effect's floor while withdrawableAmount() had already capped the withdrawal at the payoutFloor override, letting balance fall below the effect's floor`,
            );
        }
        this.payoutTiers = init.payoutTiers;
        if (this.payoutTiers.length === 0) {
            throw new Error(`${this.label}: payoutTiers must not be empty`);
        }
    }

    private amountAboveFloor(
        state: LiveAccountState,
        retainedCushion: Dollars,
    ): number {
        if (this.liveDrawdown === null) {
            return wholeCentsOf(
                state.balance - state.startingBalance - retainedCushion,
            );
        }
        if (this.requiresLockForWithdrawal && !state.thresholdLocked) return 0;
        const cushionFloor =
            this.floorAfterWithdrawal(state) +
            Math.max(retainedCushion, ONE_CENT);
        const floor =
            this.payoutFloor === null
                ? cushionFloor
                : Math.max(this.payoutFloor, cushionFloor);
        return wholeCentsOf(state.balance - floor);
    }

    private floorAfterWithdrawal(state: LiveAccountState): number {
        switch (this.payoutFloorEffect) {
            case PayoutFloorEffect.LockAtPlanFloor:
            case PayoutFloorEffect.MoveToLockedFloor: {
                return (
                    this.liveDrawdown?.prospectiveLockThreshold(
                        state,
                        this.payoutFloorEffect,
                    ) ?? state.threshold
                );
            }
            case PayoutFloorEffect.None: {
                return state.threshold;
            }
            case PayoutFloorEffect.ReleaseFloor: {
                return this.startingBalance;
            }
        }
    }

    private restrictedPayoutGate(
        state: LiveAccountState,
    ): LiveWinningDayPayoutGate | null {
        const gate = this.winningDayPayoutGate;
        return gate === null ||
            state.qualifyingDays >= gate.dailyPayoutsAfterWinningDays
            ? null
            : gate;
    }

    cushionPercentFor(state: LiveAccountState): Fraction0to1 {
        return state.thresholdLocked
            ? this.cushionPercent.postLock
            : this.cushionPercent.preLock;
    }

    dailyLossLimitFor(state: LiveAccountState): null | number {
        if (this.liveDailyLossLimit === null) return null;
        return resolveDailyLossLimit(this.liveDailyLossLimit, {
            ...this.tierContextOf(state),
            isThresholdLocked: state.thresholdLocked,
        });
    }

    defaultRetainedCushion(): Dollars {
        if (this.liveDrawdown === null) return dollars(0);
        if (
            this.liveDrawdown.kind !== DrawdownKind.Static &&
            this.liveDrawdown.lock === undefined
        ) {
            throw new Error(
                `${this.label}: the one-drawdown default retained cushion can never be withdrawn from a trailing drawdown with no lock; pass an explicit retainedCushion`,
            );
        }
        return this.liveDrawdown.amount;
    }

    initialState(): LiveAccountState {
        const initialThreshold =
            this.liveDrawdown === null
                ? 0
                : this.liveDrawdown.initialThreshold(this.startingBalance);
        return createInitialLiveAccountState(
            this.startingBalance,
            initialThreshold,
        );
    }

    isBust(state: LiveAccountState): boolean {
        return this.liveDrawdown?.isBreached(state) ?? false;
    }

    isDayLockedOut(state: LiveAccountState): boolean {
        const limit = this.dailyLossLimitFor(state);
        return (
            limit !== null &&
            isAtOrBelowWithinCentTolerance(state.todayPnL, -limit)
        );
    }

    maxContractsFor(
        state: LiveAccountState,
        instrument: InstrumentSpec,
    ): ContractCount | null {
        if (this.contractLimits === null) return null;
        return maxContractsAt(
            instrument.isMicro
                ? this.contractLimits.micros
                : this.contractLimits.minis,
            this.tierContextOf(state),
        );
    }

    payoutFromProfit(liveProfit: number): number {
        return walkPayoutTiers(this.payoutTiers, liveProfit);
    }

    payoutOnLiquidation(_state: LiveAccountState): number {
        return 0;
    }

    payoutRequestAmount(
        state: LiveAccountState,
        retainedCushion: Dollars,
        requestSize: number | undefined,
    ): number {
        const available = this.withdrawableAmount(state, retainedCushion);
        const requested =
            requestSize === undefined
                ? available
                : Math.min(requestSize, available);
        return requested > 0 && requested >= this.minPayoutRequest
            ? requested
            : 0;
    }

    recordDayClose(state: LiveAccountState, isTraded: boolean): void {
        const profit = this.tierProfitOf(state);
        if (profit > state.peakDayCloseProfit) {
            state.peakDayCloseProfit = profit;
        }
        if (
            isTraded &&
            state.todayPnL >=
                (this.winningDayPayoutGate?.minWinningDayProfit ?? -Infinity)
        ) {
            state.qualifyingDays += 1;
        }
    }

    resolvePayoutRequestSize(
        requested: number | undefined,
    ): number | undefined {
        if (requested === undefined) return undefined;
        if (!payoutRequestSizeSchema.safeParse(requested).success) {
            throw new Error(
                `${this.label}: payoutRequestSize must be a finite number > 0 or omitted, got ${requested}`,
            );
        }
        if (requested < this.minPayoutRequest) {
            throw new Error(
                `${this.label}: a payout request of $${requested} is below the $${this.minPayoutRequest} minimum payout request, so it could never be paid`,
            );
        }
        return requested;
    }

    seedReserveTerms(): LiveSeedReserve | null {
        return null;
    }

    resolveRetainedCushion(requested: number | undefined): Dollars {
        const cushion = requested ?? this.defaultRetainedCushion();
        if (!retainedCushionSchema.safeParse(cushion).success) {
            throw new Error(
                `${this.label}: retainedCushion must be a finite number >= 0, got ${cushion}`,
            );
        }
        return dollars(cushion);
    }

    protected tierContextOf(
        state: LiveAccountState,
    ): UntrackedTierProfitContext {
        const profit = this.tierProfitOf(state);
        return {
            peakDayCloseProfit: state.peakDayCloseProfit,
            peakIntradayProfit: null,
            profit,
            sessionOpenProfit: profit - state.todayPnL,
        };
    }

    protected tierProfitOf(state: LiveAccountState): number {
        return state.balance - state.startingBalance;
    }

    withdrawableAmount(
        state: LiveAccountState,
        retainedCushion: Dollars,
    ): number {
        const gate = this.restrictedPayoutGate(state);
        if (
            gate !== null &&
            state.qualifyingDays - state.qualifyingDaysAtLastPayout <
                gate.winningDaysPerRequest
        ) {
            return 0;
        }
        const aboveFloor = this.amountAboveFloor(state, retainedCushion);
        const amount =
            gate === null
                ? aboveFloor
                : Math.min(
                      aboveFloor,
                      wholeCentsOf(gate.requestBalanceShareCap * state.balance),
                  );
        return amount < this.minPayoutRequest ? 0 : amount;
    }

    withdraw(state: LiveAccountState, amount: number): void {
        state.balance -= amount;
        state.qualifyingDaysAtLastPayout = state.qualifyingDays;
        switch (this.payoutFloorEffect) {
            case PayoutFloorEffect.LockAtPlanFloor: {
                this.liveDrawdown?.forceLock(state);
                break;
            }
            case PayoutFloorEffect.MoveToLockedFloor: {
                this.liveDrawdown?.moveToLock(state);
                break;
            }
            case PayoutFloorEffect.None: {
                break;
            }
            case PayoutFloorEffect.ReleaseFloor: {
                this.liveDrawdown?.release(state, this.startingBalance);
                break;
            }
        }
    }
}

export class ReserveLivePlan extends LivePlan {
    readonly seedReserve: LiveSeedReserve;

    constructor(init: ReserveLivePlanInit) {
        super(init);
        const reserve = seedReserveSchema.safeParse(init.seedReserve);
        if (!reserve.success) {
            throw new Error(
                `${this.label}: seedReserve is invalid (${reserve.error.issues.map((issue) => issue.path.join('.')).join(', ')})`,
            );
        }
        this.seedReserve = init.seedReserve;
    }

    private isReviewApproved(progress: LiveReserveProgress): boolean {
        const reserve = this.seedReserve;
        const scheduled =
            progress.incrementsReleased +
            (progress.pendingDepositSession === null ? 0 : 1);
        return (
            progress.sessions % reserve.reviewIntervalSessions === 0 &&
            scheduled < reserve.increments &&
            progress.profitSinceExpansion >= reserve.profitTargetPerIncrement
        );
    }

    private releasedReserveHeldBack(state: LiveAccountState): number {
        const { incrementsReleased } = this.reserveProgressOf(
            state,
            'a payout',
        );
        return incrementsReleased >= this.seedReserve.increments
            ? 0
            : (incrementsReleased * this.seedReserve.amount) /
                  this.seedReserve.increments;
    }

    protected reserveProgressOf(
        state: LiveAccountState,
        reader: string,
    ): LiveReserveProgress {
        if (!isReserveLiveAccountState(state)) {
            throw new Error(
                `${this.label}: ${reader} needs the Reserve progress that initialState() creates`,
            );
        }
        return state.reserve;
    }

    override initialState(): ReserveLiveAccountState {
        return {
            ...super.initialState(),
            reserve: {
                incrementsReleased: 0,
                pendingDepositSession: null,
                profitSinceExpansion: 0,
                sessions: 0,
            },
        };
    }

    override recordDayClose(state: LiveAccountState, isTraded: boolean): void {
        const progress = this.reserveProgressOf(state, 'the session close');
        super.recordDayClose(state, isTraded);
        progress.sessions += 1;
        progress.profitSinceExpansion += state.todayPnL;
        if (progress.pendingDepositSession === progress.sessions) {
            const increment =
                this.seedReserve.amount / this.seedReserve.increments;
            state.balance += increment;
            state.startingBalance += increment;
            progress.incrementsReleased += 1;
            progress.pendingDepositSession = null;
        }
        if (!this.isReviewApproved(progress)) return;
        progress.pendingDepositSession =
            progress.sessions + this.seedReserve.depositLagSessions;
        progress.profitSinceExpansion = 0;
    }

    override seedReserveTerms(): LiveSeedReserve {
        return this.seedReserve;
    }

    override withdrawableAmount(
        state: LiveAccountState,
        retainedCushion: Dollars,
    ): number {
        return super.withdrawableAmount(
            state,
            dollars(retainedCushion + this.releasedReserveHeldBack(state)),
        );
    }
}

const retainedCushionSchema = z.number().nonnegative();
const minPayoutRequestSchema = z.number().nonnegative();
const payoutRequestSizeSchema = z.number().positive();
const seedReserveSchema = z
    .object({
        amount: z.number().nonnegative(),
        depositLagSessions: z.number().int().positive(),
        increments: z.number().int().positive(),
        profitTargetPerIncrement: z.number().positive(),
        reviewIntervalSessions: z.number().int().positive(),
    })
    .refine(
        (reserve) =>
            reserve.depositLagSessions <= reserve.reviewIntervalSessions,
        { path: ['depositLagSessions'] },
    );
const winningDayPayoutGateSchema = z.object({
    dailyPayoutsAfterWinningDays: z.number().int().positive(),
    minWinningDayProfit: z.number().nonnegative(),
    requestBalanceShareCap: z.number().positive().max(1),
    winningDaysPerRequest: z.number().int().positive(),
});

function hasEmptyTiers(config: ContractLimitConfig): boolean {
    return (
        config.kind === ContractLimitKind.Tiered && config.tiers.length === 0
    );
}

function isReserveLiveAccountState(
    state: LiveAccountState,
): state is ReserveLiveAccountState {
    return 'reserve' in state;
}

function wholeCentsOf(amount: number): number {
    return amount <= 0 ? 0 : floorToWholeCents(amount);
}
