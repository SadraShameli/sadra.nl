import {
    type AccountStateEntry,
    AccountStateKind,
    type AccountStateResult,
    type AccountStateUnavailableReason,
    type ReconstructedSnapshotState,
} from '~/lib/prop-accounts/metrics';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    type LiveAccountState,
    type LivePlan,
    MffuVariant,
    type Plan,
    type PlanId,
    restoreFundedCycleTracker,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type Assumption,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import { buildTopStepLivePlan } from '~/lib/prop-calculator/firms/topstep/TopStepLive';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const MFF_BUILDER_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Builder,
};

export interface EvalFixtureOptions {
    readonly assumptions?: readonly Assumption[];
    readonly balance?: number;
    readonly bestDayProfit?: number;
    readonly dashboardFloorMismatch?: null | {
        readonly engineFloor: number;
        readonly enteredFloor: number;
    };
    readonly personalMaxRiskPerTrade?: null | number;
    readonly tradingDays?: number;
}

export interface FundedFixtureOptions {
    readonly assumptions?: readonly Assumption[];
    readonly balance?: number;
    readonly cumulativePayout?: number;
    readonly cycleBestDayProfit?: number;
    readonly dashboardFloorMismatch?: null | {
        readonly engineFloor: number;
        readonly enteredFloor: number;
    };
    readonly lastPayoutBalance?: number;
    readonly otherAccountsPendingPayoutCount?: number;
    readonly payoutsIssued?: number;
    readonly pendingPayoutCount?: number;
    readonly pendingPayouts?: number;
    readonly personalMaxRiskPerTrade?: null | number;
}

export interface LiveFixtureOptions {
    readonly assumptions?: readonly Assumption[];
    readonly balance?: number;
    readonly dashboardFloorMismatch?: null | {
        readonly engineFloor: number;
        readonly enteredFloor: number;
    };
    readonly livePlan?: LivePlan;
    readonly personalMaxRiskPerTrade?: null | number;
}

export function evalReconstructed(
    plan: Plan,
    options: EvalFixtureOptions = {},
): ReconstructedFundedOrEvalAccount {
    const state: AccountState = plan.initialState();
    state.balance = dollars(options.balance ?? plan.accountSize);
    state.bestDayProfit = options.bestDayProfit ?? 0;
    state.tradingDays = options.tradingDays ?? 0;
    state.elapsedDays = state.tradingDays;
    return {
        assumptions: options.assumptions ?? [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        dashboardFloorMismatch: options.dashboardFloorMismatch ?? null,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        personalMaxRiskPerTrade: options.personalMaxRiskPerTrade ?? null,
        plan,
        resolvedDailyLossLimit: plan.resolvedDailyLossLimit(
            state,
            TradingPhase.Eval,
        ),
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

export function fundedReconstructed(
    plan: Plan,
    options: FundedFixtureOptions = {},
): ReconstructedFundedOrEvalAccount {
    const state: AccountState = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = dollars(options.balance ?? plan.accountSize);
    const payoutsIssued = options.payoutsIssued ?? 0;
    const lastPayoutBalance = dollars(
        options.lastPayoutBalance ??
            (payoutsIssued > 0 ? state.balance : plan.accountSize),
    );
    const tracker = restoreFundedCycleTracker(state, {
        calendarDayGateProgress: 0,
        cumulativePayout: options.cumulativePayout ?? 0,
        cycleBestDayProfit:
            options.cycleBestDayProfit ??
            Math.max(0, state.balance - lastPayoutBalance),
        fundedResetsUsed: 0,
        lastPayoutBalance,
        payoutsIssued,
        qualifyingDaysAtLastPayout: 0,
    });
    return {
        assumptions: options.assumptions ?? [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        dashboardFloorMismatch: options.dashboardFloorMismatch ?? null,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
        otherAccountsPendingPayoutCount:
            options.otherAccountsPendingPayoutCount ?? 0,
        pendingPayoutCount:
            options.pendingPayoutCount ??
            ((options.pendingPayouts ?? 0) > 0 ? 1 : 0),
        pendingPayouts: options.pendingPayouts ?? 0,
        personalMaxRiskPerTrade: options.personalMaxRiskPerTrade ?? null,
        plan,
        resolvedDailyLossLimit: plan.resolvedDailyLossLimit(
            state,
            TradingPhase.Funded,
        ),
        state,
    };
}

export function liveReconstructed(
    plan: Plan,
    options: LiveFixtureOptions = {},
): ReconstructedLiveAccount {
    const livePlan = options.livePlan ?? buildTopStepLivePlan();
    const state: LiveAccountState = livePlan.initialState();
    state.balance = dollars(options.balance ?? state.startingBalance);
    return {
        assumptions: options.assumptions ?? [],
        cushion: state.balance - state.threshold,
        dashboardFloorMismatch: options.dashboardFloorMismatch ?? null,
        kind: ReconstructedLiveKind.Live,
        livePlan,
        personalMaxRiskPerTrade: options.personalMaxRiskPerTrade ?? null,
        plan,
        state,
    };
}

export function mffBuilderPlan(): Plan {
    return planFor(MFF_BUILDER_ID);
}

export function mffProPlan(): Plan {
    return planFor(MFF_PRO_ID);
}

export function notReconstructed(
    reason: AccountStateUnavailableReason,
): AccountStateResult {
    return { kind: AccountStateKind.Unavailable, reason };
}

export function reconstructedEntry(
    accountId: string,
    plan: Plan,
    latest: ReconstructedFundedOrEvalAccount | ReconstructedLiveAccount,
    options: {
        readonly asOf?: string;
        readonly previous?:
            null | ReconstructedFundedOrEvalAccount | ReconstructedLiveAccount;
        readonly previousAsOf?: string;
    } = {},
): AccountStateEntry {
    const asOf = options.asOf ?? '2026-09-23';
    const previous: null | ReconstructedSnapshotState =
        options.previous === undefined || options.previous === null
            ? null
            : {
                  asOf: options.previousAsOf ?? '2026-09-01',
                  reconstructed: options.previous,
              };
    return {
        accountId,
        state: {
            kind: AccountStateKind.Reconstructed,
            latest: { asOf, reconstructed: latest },
            plan,
            previous,
        },
    };
}

export function unavailableEntry(
    accountId: string,
    reason: AccountStateUnavailableReason,
): AccountStateEntry {
    return { accountId, state: notReconstructed(reason) };
}

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error('fixture plan missing from the registry');
    return plan;
}
