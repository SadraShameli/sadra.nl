import {
    type AccountState,
    createInitialState,
    resetForNewDay,
} from './AccountState';
import {
    ConsistencyBoundary,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
} from './ConsistencyRule';
import {
    ContractLimitKind,
    type ContractLimits,
    contractLimitTierBreakpoints,
} from './ContractLimits';
import {
    DailyLossLimitBreachEffect,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dailyLossLimitTierBreakpoints,
    resolveDailyLossLimit,
    type TrackedDailyLossLimitContext,
} from './DailyLossLimit';
import { type AffordableRoom, resolveAffordableRoom } from './DayPolicy';
import { type DrawdownStrategy } from './DrawdownStrategy';
import {
    type CouponDiscounts,
    type FeeSchedule,
    feesUntilPass,
    retryFee,
    totalFees,
} from './FeeSchedule';
import {
    type OneTimeEarlyWithdrawal,
    PayoutDayGateBasis,
} from './FundedPayoutCycle';
import { type FundedResetPolicy } from './FundedReset';
import {
    assertValidCalendarWeekInactivityRule,
    type CalendarWeekInactivityRule,
} from './InactivityRule';
import {
    type Dollars,
    dollars,
    type Fraction0to1,
    isAtOrBelowWithinCentTolerance,
    percent,
    type ProfitShareMultiplier,
} from './lib/units';
import { type PayoutBuffer } from './PayoutBuffer';
import {
    FlatPayoutCap,
    type PayoutCapRegime,
    type PayoutCapSchedule,
    type PayoutCapStrategy,
    PayoutProfitPool,
} from './PayoutCap';
import {
    isPayoutLockEffect,
    PayoutFloorEffect,
    payoutFloorEffectName,
} from './PayoutFloorEffect';
import {
    type AccountConclusionGate,
    accountConclusionGate,
    type AccountConclusionSource,
} from './PayoutGate';
import {
    type PayoutCountSplitTier,
    PayoutCountTieredPayoutSplit,
    type PayoutLadder,
    type PayoutTier,
    scalePayoutTiers,
    walkPayoutTiers,
} from './PayoutTiers';
import { PeakRatchet } from './PeakRatchet';
import { PlanAvailability } from './PlanAvailability';
import { type PlanId } from './PlanId';
import { fundedContractLimit } from './PositionSizing';
import {
    TierBasis,
    tierBreakpoints,
    type TrackedTierProfitContext,
} from './TierBasis';
import { TradingPhase } from './TradingPhase';

export enum LifetimeCapScope {
    PerAccount = 'per-account',
    PerUserAcrossVariant = 'per-user-across-variant',
    Unconfirmed = 'unconfirmed',
}

export interface BasketDiscount {
    basketSize: number;
    positions: readonly BasketPositionDiscount[];
}

export interface BasketPositionDiscount {
    percent: Fraction0to1;
    position: number;
}

export interface ConsistencyLadder {
    steps: readonly Fraction0to1[];
}

export type ConsistencyOverride =
    { kind: 'inherit' } | { kind: 'set'; rule: ConsistencyRule | null };

export interface PlanInit {
    accountSize: Dollars;
    availability?: PlanAvailability;
    basketDiscount?: BasketDiscount;
    bulkDiscount?: { minAccounts: number; percent: Fraction0to1 };
    calendarWeekInactivity?: CalendarWeekInactivityRule;
    consistency: ConsistencyRule | null;
    contractLimits?: ContractLimits;
    drawdown: DrawdownStrategy;
    evalDailyLossLimit: DailyLossLimitConfig;
    evalDailyLossLimitBreach?: DailyLossLimitBreachEffect;
    evalMaxConsecutiveIdleDays?: null | number;
    fees: FeeSchedule;
    fullWithdrawalHardBreach?: boolean;
    fundedConsistency?: ConsistencyOverride;
    fundedConsistencyLadder?: ConsistencyLadder;
    fundedDailyLossLimit?: DailyLossLimitConfig;
    fundedDailyLossLimitBreach?: DailyLossLimitBreachEffect;
    fundedDrawdown?: DrawdownStrategy;
    fundedReset?: FundedResetPolicy;
    id: PlanId;
    isInstantFunded?: boolean;
    label: string;
    lifetimeDollarCapScope?: LifetimeCapScope;
    maxConsecutiveIdleDays?: number;
    maxEvalTradingDays?: number;
    maxFundedAccounts: number;
    maxLifetimePayoutDollars?: Dollars;
    maxLifetimePayouts?: number;
    minDaysAfterPassForPayout?: number;
    minDaysAfterPassForPayoutPerCycle?: number;
    minPayoutProfit?: Dollars;
    minPayoutProfitPerCycle?: Dollars;
    minPayoutRequest?: Dollars;
    minQualifyingDayProfit?: Dollars | null;
    minRetainedCushionOverride?: Dollars;
    minTradingDays: number;
    oneTimeEarlyWithdrawal?: OneTimeEarlyWithdrawal;
    payoutBalanceShareCap?: Fraction0to1;
    payoutBuffer?: PayoutBuffer;
    payoutCapOverride?: PayoutCapStrategy;
    payoutDayGateBasis?: PayoutDayGateBasis;
    payoutFloorEffect?: PayoutFloorEffect;
    payoutLadder?: null | PayoutLadder;
    payoutMethodFee?: Dollars;
    payoutProfitPool?: PayoutProfitPool;
    payoutProfitShare?: ProfitShareMultiplier;
    payoutRequestCap?: Dollars;
    payoutTiers: readonly PayoutTier[];
    payoutTiersFromPayout?: readonly PayoutCountSplitTier[];
    profitTarget: Dollars;
    takesFundedReset?: boolean;
    takesOneTimeEarlyWithdrawal?: boolean;
}

export interface PlanLifetimeConclusion extends AccountConclusionSource {
    readonly dollarCapScope: LifetimeCapScope | null;
}

export abstract class Plan {
    private readonly payoutCap: PayoutCapStrategy;

    readonly accountSize: Dollars;

    readonly availability: PlanAvailability;

    readonly basketDiscount: BasketDiscount | null;

    readonly bulkDiscount: null | {
        minAccounts: number;
        percent: Fraction0to1;
    };

    readonly calendarWeekInactivity: CalendarWeekInactivityRule | null;

    readonly consistency: ConsistencyRule | null;

    readonly contractLimits: ContractLimits | null;

    readonly drawdown: DrawdownStrategy;

    readonly evalDailyLossLimit: DailyLossLimitConfig;

    readonly evalDailyLossLimitBreach: DailyLossLimitBreachEffect;

    readonly fees: FeeSchedule;

    readonly fundedDailyLossLimit: DailyLossLimitConfig;

    readonly fundedDailyLossLimitBreach: DailyLossLimitBreachEffect;

    readonly fundedDrawdown: DrawdownStrategy;

    readonly fundedReset: FundedResetPolicy | null;

    readonly fullWithdrawalHardBreach: boolean;

    readonly id: PlanId;

    readonly isInstantFunded: boolean;

    readonly label: string;

    readonly lifetimeConclusion: PlanLifetimeConclusion;

    readonly maxConsecutiveIdleDays: null | number;

    readonly maxFundedAccounts: number;

    readonly maxEvalTradingDays: null | number;

    readonly maxLifetimePayoutDollars: Dollars | null;

    readonly maxLifetimePayouts: null | number;

    readonly minDaysAfterPassForPayout: number;

    readonly minDaysAfterPassForPayoutPerCycle: null | number;

    readonly minPayoutProfit: Dollars;

    readonly minPayoutProfitPerCycle: Dollars | null;

    readonly minPayoutRequest: Dollars;

    readonly minQualifyingDayProfit: Dollars | null;

    readonly minTradingDays: number;

    readonly oneTimeEarlyWithdrawal: null | OneTimeEarlyWithdrawal;

    readonly payoutBalanceShareCap: Fraction0to1 | null;

    readonly payoutBuffer: null | PayoutBuffer;

    readonly payoutCapOverride: null | PayoutCapStrategy;

    readonly payoutDayGateBasis: PayoutDayGateBasis;

    readonly payoutFloorEffect: PayoutFloorEffect;

    readonly payoutLadder: null | PayoutLadder;

    readonly payoutMethodFee: Dollars;

    readonly payoutProfitPool: PayoutProfitPool;

    readonly payoutProfitShare: null | ProfitShareMultiplier;

    readonly payoutRequestCap: Dollars | null;

    readonly payoutSplit: PayoutCountTieredPayoutSplit;

    readonly payoutTiers: readonly PayoutTier[];

    readonly profitTarget: Dollars;

    readonly takesFundedReset: boolean;

    readonly takesOneTimeEarlyWithdrawal: boolean;

    constructor(protected readonly init: PlanInit) {
        this.accountSize = init.accountSize;
        this.availability = init.availability ?? PlanAvailability.Purchasable;
        this.basketDiscount = init.basketDiscount ?? null;
        this.bulkDiscount = init.bulkDiscount ?? null;

        if (this.basketDiscount !== null && this.bulkDiscount !== null) {
            throw new Error(
                `${init.label}: bulkDiscount and basketDiscount are two purchase-discount shapes; set only one`,
            );
        }

        if (this.basketDiscount !== null) {
            assertBasketDiscount(this.basketDiscount, init.label);
        }

        for (const [componentKey, priceKey] of [
            ['undiscountableEval', 'oneTimeEval'],
            ['undiscountableReset', 'reset'],
        ] as const) {
            const component = init.fees[componentKey] ?? 0;
            const price = init.fees[priceKey];
            if (!Number.isFinite(component) || price < component) {
                throw new Error(
                    `${init.label}: fees.${componentKey} (${component}) must leave a non-negative discountable part of ${priceKey} (${price})`,
                );
            }
        }
        this.consistency = init.consistency;

        if (
            this.consistency?.violationEffect ===
                ConsistencyViolationEffect.DoubleTarget &&
            this.consistency.boundary !== ConsistencyBoundary.Inclusive
        ) {
            throw new Error(
                `${init.label}: consistency.violationEffect is DoubleTarget, which only compares correctly against Plan.isPassed's strict-greater check when boundary is ConsistencyBoundary.Inclusive; got ${this.consistency.boundary}`,
            );
        }

        this.contractLimits = init.contractLimits ?? null;

        for (const [key, config] of [
            ['fundedMicros', this.contractLimits?.fundedMicros],
            ['fundedMinis', this.contractLimits?.fundedMinis],
        ] as const) {
            if (
                config?.kind === ContractLimitKind.Tiered &&
                config.tiers.length === 0
            ) {
                throw new Error(
                    `${init.label}: contractLimits.${key}.tiers must not be empty`,
                );
            }
        }

        this.drawdown = init.drawdown;
        this.evalDailyLossLimit = init.evalDailyLossLimit;
        this.evalDailyLossLimitBreach =
            init.evalDailyLossLimitBreach ?? DailyLossLimitBreachEffect.Lockout;
        this.fees = init.fees;
        this.fundedDailyLossLimit =
            init.fundedDailyLossLimit ?? init.evalDailyLossLimit;
        this.fundedDailyLossLimitBreach =
            init.fundedDailyLossLimitBreach ?? this.evalDailyLossLimitBreach;

        for (const [phase, config, breach] of [
            [
                TradingPhase.Eval,
                this.evalDailyLossLimit,
                this.evalDailyLossLimitBreach,
            ],
            [
                TradingPhase.Funded,
                this.fundedDailyLossLimit,
                this.fundedDailyLossLimitBreach,
            ],
        ] as const) {
            if (
                config.kind === DailyLossLimitKind.None &&
                breach === DailyLossLimitBreachEffect.Terminate
            ) {
                throw new Error(
                    `${init.label}: ${phase} daily loss limit breach is Terminate but the limit is None, so there is nothing to breach`,
                );
            }
        }

        this.fundedDrawdown = init.fundedDrawdown ?? init.drawdown;
        this.fundedReset = init.fundedReset ?? null;
        this.takesFundedReset = init.takesFundedReset ?? false;

        if (
            this.fundedReset !== null &&
            (!Number.isFinite(this.fundedReset.fee) ||
                this.fundedReset.fee < 0 ||
                !Number.isSafeInteger(this.fundedReset.maxPerAccount) ||
                this.fundedReset.maxPerAccount <= 0 ||
                !Number.isSafeInteger(this.fundedReset.windowCalendarDays) ||
                this.fundedReset.windowCalendarDays <= 0)
        ) {
            throw new Error(
                `${init.label}: fundedReset needs a finite, non-negative fee and a positive whole maxPerAccount and windowCalendarDays, got ${this.fundedReset.fee}, ${this.fundedReset.maxPerAccount} and ${this.fundedReset.windowCalendarDays}`,
            );
        }

        if (this.takesFundedReset && this.fundedReset === null) {
            throw new Error(
                `${init.label}: takesFundedReset is set but the plan offers no fundedReset`,
            );
        }

        this.fullWithdrawalHardBreach = init.fullWithdrawalHardBreach ?? false;
        this.id = init.id;
        this.isInstantFunded = init.isInstantFunded ?? false;
        this.label = init.label;
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

        this.calendarWeekInactivity = init.calendarWeekInactivity ?? null;

        if (this.calendarWeekInactivity !== null) {
            assertValidCalendarWeekInactivityRule(
                this.calendarWeekInactivity,
                this.label,
            );
        }

        if (
            this.calendarWeekInactivity !== null &&
            this.maxConsecutiveIdleDays !== null
        ) {
            throw new Error(
                `${this.label}: calendarWeekInactivity and maxConsecutiveIdleDays both close the funded phase for inactivity; set only one`,
            );
        }

        this.maxFundedAccounts = init.maxFundedAccounts;

        if (
            !Number.isSafeInteger(this.maxFundedAccounts) ||
            this.maxFundedAccounts <= 0
        ) {
            throw new Error(
                `${this.label}: maxFundedAccounts must be a positive integer, got ${this.maxFundedAccounts}`,
            );
        }

        this.maxEvalTradingDays = init.maxEvalTradingDays ?? null;
        this.maxLifetimePayoutDollars = init.maxLifetimePayoutDollars ?? null;
        this.maxLifetimePayouts = init.maxLifetimePayouts ?? null;
        this.minDaysAfterPassForPayout = init.minDaysAfterPassForPayout ?? 0;
        this.minDaysAfterPassForPayoutPerCycle =
            init.minDaysAfterPassForPayoutPerCycle ?? null;
        this.payoutDayGateBasis =
            init.payoutDayGateBasis ??
            PayoutDayGateBasis.QualifyingDaysSincePassOrPayout;

        if (
            this.payoutDayGateBasis ===
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
        ) {
            for (const [key, days] of [
                ['minDaysAfterPassForPayout', this.minDaysAfterPassForPayout],
                [
                    'minDaysAfterPassForPayoutPerCycle',
                    this.minDaysAfterPassForPayoutPerCycle ?? 0,
                ],
            ] as const) {
                if (!Number.isSafeInteger(days) || days < 0) {
                    throw new Error(
                        `${this.label}: ${key} counts calendar days and must be a non-negative integer, got ${days}`,
                    );
                }
            }
        }

        this.minPayoutProfit = init.minPayoutProfit ?? dollars(0);
        this.minPayoutProfitPerCycle = init.minPayoutProfitPerCycle ?? null;
        this.minPayoutRequest = init.minPayoutRequest ?? dollars(0);
        this.minQualifyingDayProfit = init.minQualifyingDayProfit ?? null;
        this.minTradingDays = init.minTradingDays;
        this.oneTimeEarlyWithdrawal = init.oneTimeEarlyWithdrawal ?? null;
        this.takesOneTimeEarlyWithdrawal =
            init.takesOneTimeEarlyWithdrawal ?? false;

        if (
            this.oneTimeEarlyWithdrawal !== null &&
            (!(this.oneTimeEarlyWithdrawal.maxProfitShare > 0) ||
                this.oneTimeEarlyWithdrawal.maxProfitShare > 1 ||
                !Number.isFinite(this.oneTimeEarlyWithdrawal.minRequest) ||
                this.oneTimeEarlyWithdrawal.minRequest < 0)
        ) {
            throw new Error(
                `${this.label}: oneTimeEarlyWithdrawal needs a maxProfitShare in (0, 1] and a finite, non-negative minRequest, got ${this.oneTimeEarlyWithdrawal.maxProfitShare} and ${this.oneTimeEarlyWithdrawal.minRequest}`,
            );
        }

        if (
            this.takesOneTimeEarlyWithdrawal &&
            this.oneTimeEarlyWithdrawal === null
        ) {
            throw new Error(
                `${this.label}: takesOneTimeEarlyWithdrawal is set but the plan offers no oneTimeEarlyWithdrawal`,
            );
        }

        if (
            !Number.isSafeInteger(this.minTradingDays) ||
            this.minTradingDays < 0
        ) {
            throw new Error(
                `${this.label}: minTradingDays must be a non-negative integer, got ${this.minTradingDays}`,
            );
        }

        this.payoutBalanceShareCap = init.payoutBalanceShareCap ?? null;
        this.payoutBuffer = init.payoutBuffer ?? null;
        this.payoutCapOverride = init.payoutCapOverride ?? null;

        if (
            this.payoutCapOverride !== null &&
            (this.payoutBalanceShareCap !== null ||
                init.payoutRequestCap !== undefined)
        ) {
            throw new Error(
                `${this.label}: payoutCapOverride makes payoutBalanceShareCap/payoutRequestCap dead; set only one`,
            );
        }

        if (
            init.fundedConsistencyLadder !== undefined &&
            init.fundedConsistency?.kind === 'set'
        ) {
            throw new Error(
                `${this.label}: fundedConsistencyLadder makes fundedConsistency dead; set only one`,
            );
        }

        if (init.fundedConsistencyLadder?.steps.length === 0) {
            throw new Error(
                `${this.label}: fundedConsistencyLadder.steps must not be empty`,
            );
        }

        this.payoutFloorEffect =
            init.payoutFloorEffect ?? PayoutFloorEffect.None;

        if (
            isPayoutLockEffect(this.payoutFloorEffect) &&
            this.fundedDrawdown.lock === undefined
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is ${payoutFloorEffectName(this.payoutFloorEffect)} but fundedDrawdown has no lock config`,
            );
        }

        if (
            this.fundedDrawdown.lock?.atProfit === null &&
            this.payoutFloorEffect !== PayoutFloorEffect.MoveToLockedFloor
        ) {
            throw new Error(
                `${this.label}: fundedDrawdown lock has no profit trigger, so only payoutFloorEffect MoveToLockedFloor can ever fire it`,
            );
        }

        if (
            this.drawdown !== this.fundedDrawdown &&
            this.drawdown.lock?.atProfit === null
        ) {
            throw new Error(
                `${this.label}: evaluation drawdown lock has no profit trigger and can never fire, since no payout happens in evaluation`,
            );
        }

        this.payoutLadder = init.payoutLadder ?? null;
        if (
            this.payoutLadder !== null &&
            this.payoutLadder.steps.length === 0
        ) {
            throw new Error(
                `${this.label}: payoutLadder.steps must not be empty`,
            );
        }
        if (
            init.lifetimeDollarCapScope !== undefined &&
            this.maxLifetimePayoutDollars === null
        ) {
            throw new Error(
                `${this.label}: lifetimeDollarCapScope ${init.lifetimeDollarCapScope} needs a maxLifetimePayoutDollars cap`,
            );
        }
        this.lifetimeConclusion = lifetimeConclusionOf(
            this.maxLifetimePayoutDollars,
            this.maxLifetimePayouts,
            this.payoutLadder,
            this.maxLifetimePayoutDollars === null
                ? null
                : (init.lifetimeDollarCapScope ?? LifetimeCapScope.Unconfirmed),
        );

        this.payoutMethodFee = init.payoutMethodFee ?? dollars(0);
        this.payoutProfitPool =
            init.payoutProfitPool ?? PayoutProfitPool.CycleProfit;
        this.payoutProfitShare = init.payoutProfitShare ?? null;

        if (
            this.payoutProfitPool === PayoutProfitPool.AccountProfit &&
            this.payoutProfitShare !== null
        ) {
            throw new Error(
                `${this.label}: payoutProfitShare makes payoutProfitPool AccountProfit dead; set only one`,
            );
        }
        this.payoutRequestCap = init.payoutRequestCap ?? null;
        this.payoutCap =
            this.payoutCapOverride ??
            new FlatPayoutCap({
                balanceShareCap: this.payoutBalanceShareCap,
                requestCap: this.payoutRequestCap,
            });

        if (
            this.payoutRequestCap !== null &&
            this.minPayoutRequest > this.payoutRequestCap
        ) {
            throw new Error(
                `${this.label}: minPayoutRequest (${this.minPayoutRequest}) exceeds payoutRequestCap (${this.payoutRequestCap})`,
            );
        }

        this.payoutTiers = init.payoutTiers;
        if (this.payoutTiers.length === 0) {
            throw new Error(`${this.label}: payoutTiers must not be empty`);
        }
        assertDistinctThresholds(
            this.payoutTiers,
            `${this.label}: payoutTiers`,
        );

        if (init.payoutTiersFromPayout?.length === 0) {
            throw new Error(
                `${this.label}: payoutTiersFromPayout must not be empty`,
            );
        }
        const laterSplits = init.payoutTiersFromPayout ?? [];
        for (const entry of laterSplits) {
            if (entry.fromPayoutIndex < 1) {
                throw new Error(
                    `${this.label}: payoutTiersFromPayout entries must start at payout index 1 or later (index 0 is payoutTiers), got ${entry.fromPayoutIndex}`,
                );
            }
            const owner = `${this.label}: payoutTiersFromPayout entry at payout index ${entry.fromPayoutIndex}`;
            if (entry.tiers.length === 0) {
                throw new Error(`${owner} must not be empty`);
            }
            assertDistinctThresholds(entry.tiers, owner);
        }
        this.payoutSplit = new PayoutCountTieredPayoutSplit([
            { fromPayoutIndex: 0, tiers: this.payoutTiers },
            ...laterSplits,
        ]);
        this.profitTarget = init.profitTarget;
    }

    private peakBreakpoints(
        basis: TierBasis,
        phase: TradingPhase,
        contractsAreMicro: boolean | null,
    ): readonly number[] {
        const dailyLossLimitBreakpoints = dailyLossLimitTierBreakpoints(
            this.dailyLossLimitFor(phase),
            basis,
        );
        const contractBreakpoints =
            contractsAreMicro !== null && phase === TradingPhase.Funded
                ? this.fundedContractTierBreakpoints(basis, contractsAreMicro)
                : [];
        return tierBreakpoints([
            ...dailyLossLimitBreakpoints,
            ...contractBreakpoints,
        ]).filter((breakpoint) => breakpoint > 0);
    }

    private purchaseDiscountPercentPoints(accountCount: number): number {
        const bundle = this.bulkDiscount;
        if (bundle !== null) {
            const bundledAccounts =
                bundle.minAccounts *
                Math.floor(accountCount / bundle.minAccounts);
            return bundle.percent * 100 * bundledAccounts;
        }
        const basket = this.basketDiscount;
        if (basket === null) return 0;
        const fullBaskets = Math.floor(accountCount / basket.basketSize);
        const remainder = accountCount % basket.basketSize;
        return basket.positions.reduce(
            (points, { percent: share, position }) =>
                points +
                share * 100 * (fullBaskets + (position <= remainder ? 1 : 0)),
            0,
        );
    }

    get isPurchasable(): boolean {
        return this.availability === PlanAvailability.Purchasable;
    }

    accountProfit(state: AccountState): number {
        return state.balance - state.startingBalance;
    }

    affordableRisk(
        state: AccountState,
        phase: TradingPhase,
        commission: number,
    ): number {
        return this.affordableRoom(state, phase, commission).room;
    }

    affordableRoom(
        state: AccountState,
        phase: TradingPhase,
        commission: number,
    ): AffordableRoom {
        return resolveAffordableRoom(
            state.balance - state.threshold,
            this.resolvedDailyLossLimit(state, phase),
            state.todayPnL,
            commission,
            this.dailyLossLimitBreachFor(phase),
        );
    }

    beginFundedPhase(state: AccountState): void {
        state.balance = this.accountSize;
        state.bestDayProfit = 0;
        state.calendarWeekSessionsElapsed = 0;
        state.calendarWeekSessionsTraded = 0;
        state.consecutiveIdleDays = 0;
        state.intradayHighProfit = 0;
        state.peakDayCloseProfit = 0;
        state.peakIntradayProfit = 0;
        state.qualifyingDays = 0;
        state.threshold = this.fundedDrawdown.initialThreshold(
            this.accountSize,
        );
        state.thresholdLocked = false;
        state.tradingDays = 0;
        resetForNewDay(state);
    }

    dailyLossLimitFor(phase: TradingPhase): DailyLossLimitConfig {
        return phase === TradingPhase.Funded
            ? this.fundedDailyLossLimit
            : this.evalDailyLossLimit;
    }

    dailyLossLimitBreachFor(phase: TradingPhase): DailyLossLimitBreachEffect {
        return phase === TradingPhase.Funded
            ? this.fundedDailyLossLimitBreach
            : this.evalDailyLossLimitBreach;
    }

    isDailyLossLimitTerminating(phase: TradingPhase): boolean {
        return (
            this.dailyLossLimitBreachFor(phase) ===
            DailyLossLimitBreachEffect.Terminate
        );
    }

    drawdownFor(phase: TradingPhase): DrawdownStrategy {
        return phase === TradingPhase.Funded
            ? this.fundedDrawdown
            : this.drawdown;
    }

    profitFor(state: AccountState): number {
        return this.accountProfit(state);
    }

    recordDayClosePeak(state: AccountState): void {
        const profit = this.accountProfit(state);
        if (profit > state.peakDayCloseProfit) {
            state.peakDayCloseProfit = profit;
        }
        state.peakIntradayProfit = Math.max(
            state.peakIntradayProfit,
            state.intradayHighProfit,
            profit,
        );
    }

    recordIntradayHigh(state: AccountState): void {
        state.intradayHighProfit = Math.max(
            state.intradayHighProfit,
            this.accountProfit(state),
        );
    }

    feesUntilPass(daysToPass: number, discounts?: CouponDiscounts): number {
        return feesUntilPass(this.init.fees, daysToPass, discounts);
    }

    purchaseDiscounts(
        discounts: CouponDiscounts | undefined,
        accountCount: number,
    ): CouponDiscounts | undefined {
        const discountedPercentPoints =
            this.purchaseDiscountPercentPoints(accountCount);
        if (discountedPercentPoints === 0) return discounts;
        return {
            activationPercent: discounts?.activationPercent ?? percent(0),
            evalPercent: discounts?.evalPercent ?? percent(0),
            ...discounts,
            bundlePercent: percent(discountedPercentPoints / accountCount),
        };
    }

    retryFee(discounts?: CouponDiscounts): number {
        return retryFee(this.init.fees, discounts);
    }

    initialState(): AccountState {
        return createInitialState(
            this.init.accountSize,
            this.init.drawdown.initialThreshold(this.init.accountSize),
        );
    }

    dailyLossLimitContext(state: AccountState): TrackedDailyLossLimitContext {
        return {
            ...this.tierProfitContext(state),
            isThresholdLocked: state.thresholdLocked,
        };
    }

    resolvedDailyLossLimit(
        state: AccountState,
        phase: TradingPhase,
    ): null | number {
        return resolveDailyLossLimit(
            this.dailyLossLimitFor(phase),
            this.dailyLossLimitContext(state),
        );
    }

    fundedContractTierBreakpoints(
        basis: TierBasis,
        isMicro: boolean,
    ): readonly number[] {
        return contractLimitTierBreakpoints(
            fundedContractLimit(this.contractLimits, isMicro),
            basis,
        );
    }

    fundedDailyLossLimitTierBreakpoints(basis: TierBasis): readonly number[] {
        return dailyLossLimitTierBreakpoints(this.fundedDailyLossLimit, basis);
    }

    peakIntradayBreakpoints(
        phase: TradingPhase,
        contractsAreMicro: boolean | null,
    ): readonly number[] {
        return this.peakBreakpoints(
            TierBasis.PeakIntradayProfit,
            phase,
            contractsAreMicro,
        );
    }

    peakRatchetFor(
        phase: TradingPhase,
        contractsAreMicro: boolean | null,
    ): PeakRatchet {
        const sessionCloseBreakpoints = this.peakSessionCloseBreakpoints(
            phase,
            contractsAreMicro,
        );
        const intradayBreakpoints = this.peakIntradayBreakpoints(
            phase,
            contractsAreMicro,
        );
        if (intradayBreakpoints.length === 0) {
            return new PeakRatchet(sessionCloseBreakpoints);
        }
        if (sessionCloseBreakpoints.length > 0) {
            throw new Error(
                `${this.label}: one peak ratchet cannot track tiers on both the peak session close and the peak intraday profit in the ${phase} phase`,
            );
        }
        return new PeakRatchet(
            intradayBreakpoints,
            TierBasis.PeakIntradayProfit,
        );
    }

    peakSessionCloseBreakpoints(
        phase: TradingPhase,
        contractsAreMicro: boolean | null,
    ): readonly number[] {
        return this.peakBreakpoints(
            TierBasis.PeakSessionCloseProfit,
            phase,
            contractsAreMicro,
        );
    }

    tierProfitContext(state: AccountState): TrackedTierProfitContext {
        const profit = this.profitFor(state);
        return {
            peakDayCloseProfit: state.peakDayCloseProfit,
            peakIntradayProfit: state.peakIntradayProfit,
            profit,
            sessionOpenProfit: profit - state.todayPnL,
        };
    }

    conclusionGate(
        payoutsIssued: number,
        cumulativePayout = 0,
    ): AccountConclusionGate | null {
        return accountConclusionGate(
            this.lifetimeConclusion,
            payoutsIssued,
            cumulativePayout,
        );
    }

    isAccountConcluded(payoutsIssued: number, cumulativePayout = 0): boolean {
        return this.conclusionGate(payoutsIssued, cumulativePayout) !== null;
    }

    isBust(state: AccountState, phase: TradingPhase): boolean {
        return (
            this.drawdownFor(phase).isBreached(state) ||
            (this.isDailyLossLimitTerminating(phase) &&
                this.isDayLockedOut(state, phase))
        );
    }

    isDayLockedOut(state: AccountState, phase: TradingPhase): boolean {
        const limit = this.resolvedDailyLossLimit(state, phase);
        return (
            limit !== null &&
            isAtOrBelowWithinCentTolerance(state.todayPnL, -limit)
        );
    }

    clampedIdleDays(state: AccountState, phase: TradingPhase): number {
        const limit = this.maxConsecutiveIdleDaysFor(phase);
        return limit === null ? 0 : Math.min(state.consecutiveIdleDays, limit);
    }

    maxConsecutiveIdleDaysFor(phase: TradingPhase): null | number {
        if (phase === TradingPhase.Funded) return this.maxConsecutiveIdleDays;
        return this.init.evalMaxConsecutiveIdleDays === undefined
            ? this.maxConsecutiveIdleDays
            : this.init.evalMaxConsecutiveIdleDays;
    }

    calendarWeekInactivityFor(
        phase: TradingPhase,
    ): CalendarWeekInactivityRule | null {
        return phase === TradingPhase.Funded
            ? this.calendarWeekInactivity
            : null;
    }

    clampedTradingDays(state: AccountState): number {
        return Math.min(state.tradingDays, this.minTradingDays);
    }

    evalConsistencyRule(): ConsistencyRule | null {
        const rule = this.init.consistency;
        return rule?.appliesToEval() ? rule : null;
    }

    fundedConsistencyRule(payoutsIssued = 0): ConsistencyRule | null {
        const ladder = this.init.fundedConsistencyLadder;
        if (ladder) {
            const share =
                ladder.steps[Math.min(payoutsIssued, ladder.steps.length - 1)];
            return share === undefined
                ? null
                : new ConsistencyRule(ConsistencyScope.Funded, share);
        }
        const override = this.init.fundedConsistency;
        if (override?.kind === 'set') {
            return override.rule;
        }
        const rule = this.init.consistency;
        return rule?.appliesToFunded() ? rule : null;
    }

    isPassed(state: AccountState): boolean {
        const profit = state.balance - state.startingBalance;
        if (
            profit < this.init.profitTarget ||
            state.tradingDays < this.init.minTradingDays
        )
            return false;
        const consistency = this.evalConsistencyRule();
        return (
            consistency === null ||
            !consistency.isViolated(state.bestDayProfit, profit) ||
            (consistency.violationEffect ===
                ConsistencyViolationEffect.DoubleTarget &&
                profit > 2 * state.bestDayProfit)
        );
    }

    defaultRetainedCushion(): number {
        return (
            this.init.minRetainedCushionOverride ?? this.fundedDrawdown.amount
        );
    }

    resolveRetainedCushion(requested: number | undefined): Dollars {
        const floor = this.defaultRetainedCushion();
        return dollars(Math.max(requested ?? floor, floor));
    }

    canLeaveBalanceAbovePayoutFloor(): boolean {
        return (
            this.payoutLadder !== null ||
            this.payoutRequestCap !== null ||
            this.payoutBalanceShareCap !== null ||
            this.payoutCapOverride !== null ||
            this.payoutProfitShare !== null ||
            (this.takesOneTimeEarlyWithdrawal &&
                this.oneTimeEarlyWithdrawal !== null)
        );
    }

    payoutBalanceFloor(
        state: AccountState,
        minRetainedCushion: number,
    ): number {
        const cushionFloor = state.threshold + Math.max(0, minRetainedCushion);
        return this.payoutBuffer === null
            ? cushionFloor
            : Math.max(
                  cushionFloor,
                  this.payoutBuffer.requiredBalance(
                      this.accountSize,
                      this.fundedDrawdown.amount,
                  ),
              );
    }

    payoutCapSchedule(): PayoutCapSchedule {
        return this.payoutCap.describe();
    }

    payoutFromProfit(fundedProfit: number, payoutIndex: number): number {
        const gross = walkPayoutTiers(
            this.payoutSplit.tiersFor(payoutIndex),
            fundedProfit,
        );
        return Math.max(0, gross - this.payoutMethodFee);
    }

    resolvedPayoutCap(
        state: AccountState,
        payoutsIssued: number,
    ): PayoutCapRegime {
        return this.payoutCap.resolve({
            cumulativeQualifyingDays: state.qualifyingDays,
            payoutsIssued,
        });
    }

    evalDayCap(requestedDays: number): number {
        return this.maxEvalTradingDays === null
            ? requestedDays
            : Math.min(requestedDays, this.maxEvalTradingDays);
    }

    withOverrides(overrides: Partial<PlanInit>): Plan {
        return new VariantPlan({ ...this.init, ...overrides });
    }

    withScaledTraderShare(factor: Fraction0to1): Plan {
        return this.withOverrides({
            payoutTiers: scalePayoutTiers(this.init.payoutTiers, factor),
            payoutTiersFromPayout: this.init.payoutTiersFromPayout?.map(
                (entry) => ({
                    ...entry,
                    tiers: scalePayoutTiers(entry.tiers, factor),
                }),
            ),
        });
    }

    withMaxLifetimePayouts(maxLifetimePayouts: null | number): Plan {
        return this.withOverrides({
            maxLifetimePayouts: maxLifetimePayouts ?? undefined,
            payoutLadder:
                this.payoutLadder === null
                    ? undefined
                    : { ...this.payoutLadder, capsAtLastStep: true },
        });
    }

    totalCostThroughDay(
        totalDays: number,
        discounts?: CouponDiscounts,
    ): number {
        return totalFees(this.init.fees, totalDays, discounts);
    }
}

class VariantPlan extends Plan {}

function assertBasketDiscount(basket: BasketDiscount, label: string): void {
    if (!Number.isSafeInteger(basket.basketSize) || basket.basketSize <= 0) {
        throw new Error(
            `${label}: basketDiscount.basketSize must be a positive integer, got ${basket.basketSize}`,
        );
    }
    const seenPositions = new Set<number>();
    for (const { percent: share, position } of basket.positions) {
        if (
            !Number.isSafeInteger(position) ||
            position < 1 ||
            position > basket.basketSize ||
            seenPositions.has(position)
        ) {
            throw new Error(
                `${label}: basketDiscount position ${position} must be a distinct whole number from 1 to ${basket.basketSize}`,
            );
        }
        if (!(share > 0 && share <= 1)) {
            throw new Error(
                `${label}: basketDiscount percent at position ${position} must be in (0, 1], got ${share}`,
            );
        }
        seenPositions.add(position);
    }
}

function assertDistinctThresholds(
    tiers: readonly PayoutTier[],
    owner: string,
): void {
    const seenThresholds = new Set<number>();
    for (const tier of tiers) {
        if (seenThresholds.has(tier.thresholdProfit)) {
            throw new Error(
                `${owner} has more than one tier at thresholdProfit ${tier.thresholdProfit}`,
            );
        }
        seenThresholds.add(tier.thresholdProfit);
    }
}

function lifetimeConclusionOf(
    maxLifetimePayoutDollars: Dollars | null,
    maxLifetimePayouts: null | number,
    payoutLadder: null | PayoutLadder,
    dollarCapScope: LifetimeCapScope | null,
): PlanLifetimeConclusion {
    return {
        dollarCapScope,
        maxLifetimePayoutDollars,
        maxLifetimePayouts,
        payoutLadder,
    };
}
