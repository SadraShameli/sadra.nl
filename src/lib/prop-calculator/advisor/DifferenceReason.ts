import { type ConductPattern, type Dollars } from '../core';

export enum DifferenceReason {
    AggressiveOptimumChurn = 'aggressive-optimum-churn',
    AssumedInputs = 'assumed-inputs',
    CandidatesLeftOut = 'candidates-left-out',
    CeilingCap = 'ceiling-cap',
    ConsistencyCap = 'consistency-cap',
    ConsistencyNotEvaluated = 'consistency-not-evaluated',
    CushionCap = 'cushion-cap',
    DailyLossCap = 'daily-loss-cap',
    DpGridMisaligned = 'dp-grid-misaligned',
    DpGridSaturation = 'dp-grid-saturation',
    DpIneligible = 'dp-ineligible',
    DpModelGap = 'dp-model-gap',
    DpNotValidated = 'dp-not-validated',
    DpObjectiveMismatch = 'dp-objective-mismatch',
    DpPayoutPolicyMismatch = 'dp-payout-policy-mismatch',
    DpStateUnreached = 'dp-state-unreached',
    EngineInputsRefused = 'engine-inputs-refused',
    FirmMinimumAboveRequest = 'firm-minimum-above-request',
    FreshStartApproximation = 'fresh-start-approximation',
    HorizonCreditOneRequest = 'horizon-credit-one-request',
    LiveModelApproximation = 'live-model-approximation',
    LiveNotModeled = 'live-not-modeled',
    LiveTriggersNotChecked = 'live-triggers-not-checked',
    NoCushion = 'no-cushion',
    ObjectiveSpeedVsMonthlyNet = 'objective-speed-vs-monthly-net',
    PayoutPolicyDiffers = 'payout-policy-differs',
    PersonalCap = 'personal-cap',
    PlanRulesChanged = 'plan-rules-changed',
    RemainingTargetCap = 'remaining-target-cap',
    RetainedCushionBasis = 'retained-cushion-basis',
    StaleAdvice = 'stale-advice',
    WholeContractPlacement = 'whole-contract-placement',
    WithinNoise = 'within-noise',
    WouldTriggerLive = 'would-trigger-live',
}

export enum DpNotValidatedCause {
    NoGateRun = 'no-gate-run',
    RetainedCushionMismatch = 'retained-cushion-mismatch',
    SolveCapReached = 'solve-cap-reached',
    StaleTree = 'stale-tree',
}

export type DifferenceReasonDetail =
    | BareDifferenceReasonDetail<DifferenceReason.AssumedInputs>
    | BareDifferenceReasonDetail<DifferenceReason.ConsistencyNotEvaluated>
    | BareDifferenceReasonDetail<DifferenceReason.DpGridSaturation>
    | BareDifferenceReasonDetail<DifferenceReason.DpObjectiveMismatch>
    | BareDifferenceReasonDetail<DifferenceReason.DpPayoutPolicyMismatch>
    | BareDifferenceReasonDetail<DifferenceReason.FreshStartApproximation>
    | BareDifferenceReasonDetail<DifferenceReason.LiveModelApproximation>
    | BareDifferenceReasonDetail<DifferenceReason.LiveNotModeled>
    | BareDifferenceReasonDetail<DifferenceReason.LiveTriggersNotChecked>
    | BareDifferenceReasonDetail<DifferenceReason.NoCushion>
    | BareDifferenceReasonDetail<DifferenceReason.ObjectiveSpeedVsMonthlyNet>
    | BareDifferenceReasonDetail<DifferenceReason.PlanRulesChanged>
    | { readonly cap: Dollars; readonly kind: DifferenceReason.PersonalCap }
    | {
          readonly cause: DpNotValidatedCause;
          readonly kind: DifferenceReason.DpNotValidated;
      }
    | { readonly ceiling: Dollars; readonly kind: DifferenceReason.CeilingCap }
    | {
          readonly contracts: number;
          readonly kind: DifferenceReason.WholeContractPlacement;
      }
    | { readonly cushion: Dollars; readonly kind: DifferenceReason.CushionCap }
    | {
          readonly d4Cushion: Dollars;
          readonly kind: DifferenceReason.RetainedCushionBasis;
          readonly rulebookCushion: Dollars;
      }
    | {
          readonly dailyLossLimit: Dollars;
          readonly kind: DifferenceReason.DailyLossCap;
      }
    | { readonly day: number; readonly kind: DifferenceReason.DpStateUnreached }
    | {
          readonly drawdown: Dollars;
          readonly kind: DifferenceReason.DpGridMisaligned;
          readonly step: Dollars;
      }
    | {
          readonly enginePolicyLabel: string;
          readonly headlinePolicyLabel: string;
          readonly kind: DifferenceReason.PayoutPolicyDiffers;
      }
    | {
          readonly gap: Dollars;
          readonly kind: DifferenceReason.WithinNoise;
          readonly threshold: Dollars;
      }
    | { readonly gap: string; readonly kind: DifferenceReason.DpModelGap }
    | {
          readonly horizonDays: number;
          readonly kind: DifferenceReason.HorizonCreditOneRequest;
      }
    | {
          readonly issue: string;
          readonly kind: DifferenceReason.EngineInputsRefused;
      }
    | {
          readonly kind: DifferenceReason.AggressiveOptimumChurn;
          readonly pattern: ConductPattern;
      }
    | {
          readonly kind: DifferenceReason.CandidatesLeftOut;
          readonly leftOutCount: number;
      }
    | {
          readonly kind: DifferenceReason.ConsistencyCap;
          readonly maxDayProfit: Dollars;
      }
    | { readonly kind: DifferenceReason.DpIneligible; readonly reason: string }
    | {
          readonly kind: DifferenceReason.FirmMinimumAboveRequest;
          readonly minimum: Dollars;
          readonly requested: Dollars;
      }
    | {
          readonly kind: DifferenceReason.RemainingTargetCap;
          readonly remaining: Dollars;
      }
    | { readonly kind: DifferenceReason.StaleAdvice; readonly snapshotDate: string }
    | { readonly kind: DifferenceReason.WouldTriggerLive; readonly trigger: string };

type BareDifferenceReasonDetail<Kind extends DifferenceReason> = {
    readonly kind: Kind;
};
