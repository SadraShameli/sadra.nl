import {
    type AccountFromStateFigures,
    type OverviewRequest,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { formatCurrency, NOT_APPLICABLE } from '~/lib/format';
import {
    NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
    NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
    nextPayoutEvidenceText,
    type NextPayoutProjection,
    NextPayoutTimingKind,
    nextPayoutTimingOf,
    type SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    CreditBasis,
    EvalMilestoneGap,
    MilestoneKind,
    valueGap,
} from '~/lib/prop-calculator/advisor/value';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import { EngineSlotKind, engineSlotOf, type SlotEngine } from './engineSlot';
import {
    estimateCurrency,
    estimatePercent,
    formatTrials,
} from './uncertainText';

const CREDIT_BASIS_TEXT =
    'Headline is credit-free (no end-of-horizon credit); the credit-inclusive figure, which books one capped payout request for each surviving account, is shown beside it.';

const EVAL_GATE_TEXT: Readonly<Record<EvalMilestoneGap, string>> = {
    [EvalMilestoneGap.ConsistencyNotMet]:
        'The consistency rule is not met if the whole profit arrives in one closing day, so this milestone can be worth less than reaching the target over several days.',
    [EvalMilestoneGap.MinTradingDaysNotMet]:
        'The minimum trading days are not yet met at this milestone, so the pass still waits on days.',
};

const MILESTONE_LABEL: Readonly<
    Record<MilestoneKind.Eval | MilestoneKind.Funded, string>
> = {
    [MilestoneKind.Eval]:
        'At the evaluation target, modeled as reached in one closing day',
    [MilestoneKind.Funded]:
        'After the next payout request is taken, counting the cash you receive from it',
};

const MILESTONE_UNAVAILABLE_TEXT: Readonly<
    Record<MilestoneKind.Eval | MilestoneKind.Funded, string>
> = {
    [MilestoneKind.Eval]:
        'The account cannot be valued at the evaluation target',
    [MilestoneKind.Funded]:
        'The account cannot be valued after the next payout request',
};

export enum AccountFromStateViewKind {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
    Refused = 'refused',
}

export enum MilestoneValueViewKind {
    Unavailable = 'unavailable',
    Value = 'value',
}

export interface AccountFromStateMilestoneModel {
    readonly debited: null | string;
    readonly gates: readonly string[];
    readonly kind: MilestoneKind.Eval | MilestoneKind.Funded;
    readonly label: string;
    readonly received: null | string;
    readonly value: AccountFromStateMilestoneValueModel;
}

export interface AccountFromStateModel {
    readonly asOf: string;
    readonly creditBasis: string;
    readonly milestone: AccountFromStateMilestoneModel;
    readonly nextPayout: AccountFromStateNextPayoutModel | null;
    readonly stage: SizingStage.Eval | SizingStage.Funded;
    readonly startBasis: string;
    readonly trials: string;
    readonly value: AccountFromStateValueModel;
}

export interface AccountFromStateNextPayoutModel {
    readonly accountLostBeforePayout: string;
    readonly breachAtFirstPayout: string;
    readonly calendarDays: string;
    readonly payingTrials: string;
    readonly resetFee: string;
    readonly sessionDays: string;
}

export interface AccountFromStateValueModel {
    readonly creditFree: string;
    readonly creditInclusive: string;
}

export type AccountFromStateView =
    | {
          readonly kind: AccountFromStateViewKind.Failed;
          readonly reason: string;
      }
    | { readonly kind: AccountFromStateViewKind.Pending }
    | {
          readonly kind: AccountFromStateViewKind.Ready;
          readonly model: AccountFromStateModel;
      }
    | {
          readonly kind: AccountFromStateViewKind.Refused;
          readonly reason: string;
      };

type AccountFromStateMilestoneValueModel =
    | {
          readonly creditFree: string;
          readonly creditInclusive: string;
          readonly gain: string;
          readonly kind: MilestoneValueViewKind.Value;
      }
    | {
          readonly kind: MilestoneValueViewKind.Unavailable;
          readonly text: string;
      };

export function accountFromStateViewOf(
    engine: SlotEngine,
    request: OverviewRequest,
): AccountFromStateView {
    const asOf = request.account?.asOf;
    const slot = engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.AccountFromState
            ? result.figures
            : null,
    );
    switch (slot.kind) {
        case EngineSlotKind.Failed: {
            return {
                kind: AccountFromStateViewKind.Failed,
                reason: slot.reason,
            };
        }
        case EngineSlotKind.Pending: {
            return { kind: AccountFromStateViewKind.Pending };
        }
        case EngineSlotKind.Ready: {
            return asOf === undefined
                ? {
                      kind: AccountFromStateViewKind.Failed,
                      reason: 'An account request has no account state.',
                  }
                : {
                      kind: AccountFromStateViewKind.Ready,
                      model: modelOf(slot.figures, asOf),
                  };
        }
        case EngineSlotKind.Refused: {
            return {
                kind: AccountFromStateViewKind.Refused,
                reason: slot.reason,
            };
        }
    }
}

function modelOf(
    figures: AccountFromStateFigures,
    asOf: string,
): AccountFromStateModel {
    const { milestone, valueNow } = figures;
    return {
        asOf,
        creditBasis: CREDIT_BASIS_TEXT,
        milestone: {
            debited:
                milestone.debited === null
                    ? null
                    : formatCurrency(milestone.debited),
            gates: milestone.unmetGates.map((gate) => EVAL_GATE_TEXT[gate]),
            kind: milestone.kind,
            label: MILESTONE_LABEL[milestone.kind],
            received:
                milestone.received === null
                    ? null
                    : formatCurrency(milestone.received),
            value:
                milestone.value.kind === ValueChainStepOutcomeKind.Unavailable
                    ? {
                          kind: MilestoneValueViewKind.Unavailable,
                          text: `${MILESTONE_UNAVAILABLE_TEXT[milestone.kind]}: ${milestone.value.reason}`,
                      }
                    : {
                          creditFree: estimateCurrency(
                              milestone.value.value.creditFree,
                          ),
                          creditInclusive: estimateCurrency(
                              milestone.value.value.creditInclusive,
                          ),
                          gain: signedEstimate(
                              valueGap(
                                  valueNow,
                                  milestone.value.value,
                                  CreditBasis.CreditFree,
                              ),
                          ),
                          kind: MilestoneValueViewKind.Value,
                      },
        },
        nextPayout:
            figures.nextPayout === null
                ? null
                : nextPayoutModelOf(figures.nextPayout),
        stage: figures.stage,
        startBasis: `From the account state as of ${asOf}, not a fresh start`,
        trials: formatTrials(figures.trials),
        value: {
            creditFree: estimateCurrency(valueNow.creditFree),
            creditInclusive: estimateCurrency(valueNow.creditInclusive),
        },
    };
}

function nextPayoutModelOf(
    projection: NextPayoutProjection,
): AccountFromStateNextPayoutModel {
    const timing = nextPayoutTimingOf(projection);
    const timed = (estimate: UncertainValue, unit: string): string => {
        switch (timing.kind) {
            case NextPayoutTimingKind.AlreadyEligible: {
                return NEXT_PAYOUT_ELIGIBLE_NOW_TEXT;
            }
            case NextPayoutTimingKind.InDays: {
                const standardError =
                    estimate.standardError === null
                        ? NOT_APPLICABLE
                        : estimate.standardError.toFixed(1);
                return `${estimate.value.toFixed(1)} ${unit} (SE ${standardError})`;
            }
            case NextPayoutTimingKind.NoTrialPaid: {
                return NEXT_PAYOUT_NO_TRIAL_PAID_TEXT;
            }
        }
    };
    const breach =
        projection.firstPayoutCausedBreachProbability === null
            ? NEXT_PAYOUT_NO_TRIAL_PAID_TEXT
            : estimatePercent({
                  standardError:
                      projection.firstPayoutCausedBreachStandardError,
                  value: projection.firstPayoutCausedBreachProbability,
              });
    const lost =
        projection.accountLostBeforeFirstPayoutProbability === null
            ? NOT_APPLICABLE
            : estimatePercent({
                  standardError:
                      projection.accountLostBeforeFirstPayoutStandardError,
                  value: projection.accountLostBeforeFirstPayoutProbability,
              });
    return {
        accountLostBeforePayout: lost,
        breachAtFirstPayout: breach,
        calendarDays: timed(
            projection.expectedCalendarDaysToFirstPayout,
            'calendar days',
        ),
        payingTrials: nextPayoutEvidenceText(projection),
        resetFee:
            timing.kind === NextPayoutTimingKind.NoTrialPaid
                ? NEXT_PAYOUT_NO_TRIAL_PAID_TEXT
                : estimateCurrency(
                      projection.expectedResetFeeBeforeFirstPayout,
                  ),
        sessionDays: timed(
            projection.expectedSessionDaysToFirstPayout,
            'sessions',
        ),
    };
}

function signedEstimate(estimate: UncertainValue): string {
    const sign = estimate.value >= 0 ? '+' : '';
    return `${sign}${estimateCurrency(estimate)}`;
}
