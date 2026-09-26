export { resolveDayPolicy, runDay } from './day';
export {
    assertDeclaredSizingMatchesPhase,
    assertNoFundedDayPolicyConflict,
    type DeclaredSizingInputs,
    type FundedDayPolicyConflictInputs,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputsSizingInputs,
    simInputsSizingIssue,
} from './dayPolicyValidation';
export {
    FUNDED_PAYOUT_COUNT_TAIL_BUCKET,
    simulate,
    simulatePortfolio,
} from './engine';
export { runEvalAttempt, runEvalWithRetries } from './evalPhase';
export {
    FundedStage,
    type PayoutSink,
    PayoutTotals,
    runFundedDays,
    runFundedHorizon,
    stepFundedDay,
} from './fundedPhase';
export {
    oneOffLiveCredit,
    runLiveDay,
    runLiveHorizon,
    simulateLiveAccount,
} from './livePhase';
export {
    DrawdownTracker,
    LossStreak,
    newPhaseStats,
    PhaseStats,
    TradeTotals,
} from './PhaseStats';
export { resolveCopyAccounts, SIM_DEFAULTS } from './SimDefaults';
export { hasPassedEval } from './trial';
export {
    type AttemptOutcome,
    CorrelationMode,
    type CostBreakdown,
    type DayRunOptions,
    type EvalAttemptOptions,
    type EvalAttemptResult,
    type EvalWithRetriesOptions,
    type EvalWithRetriesResult,
    type FundedDayStepOptions,
    type LiveDayRunOptions,
    type LiveOutputs,
    type LiveSimInputs,
    type MultiAccountResult,
    type PortfolioSimInputs,
    type SimEstimates,
    type SimInputs,
    type SimOutputs,
    type TrialOutcome,
} from './types';
export {
    assertNonNegativeSafeInteger,
    assertPositiveSafeInteger,
} from './validation';
