import {
    type AccountState,
    type FundedCycleTracker,
    type LiveAccountState,
    type LivePlan,
    type Plan,
    type TradingPhase,
} from '~/lib/prop-calculator/core';

import { type Assumption } from './Assumption';

export enum ReconstructedLiveKind {
    Live = 'live',
}

export type ReconstructedAccount =
    ReconstructedFundedOrEvalAccount | ReconstructedLiveAccount;

export interface ReconstructedFundedOrEvalAccount {
    readonly assumptions: readonly Assumption[];
    readonly contractLimit: null | number;
    readonly cushion: number;
    readonly dashboardFloorMismatch?: null | {
        readonly engineFloor: number;
        readonly enteredFloor: number;
    };
    readonly fundedTracker: FundedCycleTracker | null;
    readonly kind: TradingPhase.Eval | TradingPhase.Funded;
    readonly microContractLimit?: null | number;
    readonly pendingPayouts?: number;
    readonly personalMaxRiskPerTrade?: null | number;
    readonly plan: Plan;
    readonly resolvedDailyLossLimit: null | number;
    readonly state: AccountState;
}

export interface ReconstructedLiveAccount {
    readonly assumptions: readonly Assumption[];
    readonly cushion: null | number;
    readonly kind: ReconstructedLiveKind.Live;
    readonly livePlan: LivePlan | null;
    readonly plan: Plan;
    readonly state: LiveAccountState | null;
}
