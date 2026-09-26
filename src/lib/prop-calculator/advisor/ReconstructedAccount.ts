import {
    type AccountState,
    type FundedCycleTracker,
    type LiveAccountState,
    type LivePlan,
    type Plan,
    type TradingPhase,
} from '../core';
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
    readonly fundedTracker: FundedCycleTracker | null;
    readonly kind: TradingPhase.Eval | TradingPhase.Funded;
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
