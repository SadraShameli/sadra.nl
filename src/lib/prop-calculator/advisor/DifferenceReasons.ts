import { type ConductPattern, PolicyVerification } from '../core';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
    DpNotValidatedCause,
} from './DifferenceReason';
import { DayStopReason, SizingAssumption, SizingConstraint } from './DocumentedSizing';
import { type RulebookParameters } from './Rulebook';
import { documentedRuleLabel, rulebookDeviation } from './RulebookDeviation';

export const SIZING_CONSTRAINT_TEXT: Readonly<Record<SizingConstraint, string>> =
    {
        [SizingConstraint.CeilingCap]:
            "Capped by today's profit ceiling.",
        [SizingConstraint.ConsistencyCap]:
            'Capped by the funded consistency rule.',
        [SizingConstraint.CushionCap]:
            'Capped so the retained cushion stays intact.',
        [SizingConstraint.DailyLossCap]: 'Capped by the daily loss limit.',
        [SizingConstraint.DailyProfitCap]: 'Capped by the daily profit cap.',
        [SizingConstraint.NoCushion]:
            'No retained cushion is configured, so no cushion cap applies.',
        [SizingConstraint.PersonalCap]: 'Capped by a personal risk limit.',
        [SizingConstraint.RemainingTargetCap]:
            'Capped by the profit remaining to the target.',
    };

export const DAY_STOP_REASON_TEXT: Readonly<Record<DayStopReason, string>> = {
    [DayStopReason.CeilingReached]:
        "Stopped: today's profit ceiling was reached.",
    [DayStopReason.LadderExhausted]:
        'Stopped: every rung in the ladder has been used.',
    [DayStopReason.MaxTrades]:
        'Stopped: the maximum trades for today were reached.',
    [DayStopReason.NoLossRoom]: 'Stopped: no loss room remains today.',
    [DayStopReason.StopRule]: "Stopped: today's stop rule fired.",
};

export const SIZING_ASSUMPTION_TEXT: Readonly<Record<SizingAssumption, string>> =
    {
        [SizingAssumption.LiveDayPolicyUndocumented]:
            'The live-stage day policy is not documented by the skill; it is approximated.',
        [SizingAssumption.NoCommission]:
            'Commission is assumed to be zero.',
        [SizingAssumption.NoProfitCeiling]:
            'No profit ceiling applies to this rung.',
        [SizingAssumption.RungsAssumeEarlierLosses]:
            'Later rungs assume every earlier rung lost.',
        [SizingAssumption.WinsAddNoLossRoom]:
            'Wins are assumed to add no further loss room.',
    };

export function differenceReasonHeadline(rulebook: RulebookParameters): string {
    return documentedRuleLabel(rulebookDeviation(rulebook));
}

export function differenceReasonText(detail: DifferenceReasonDetail): string {
    switch (detail.kind) {
        case DifferenceReason.AggressiveOptimumChurn: {
            return `A verified conduct pattern flags this as aggressive sizing: "${conductPatternQuote(detail.pattern)}"`;
        }
        case DifferenceReason.AssumedInputs: {
            return 'One or more inputs are defaulted, not measured; see the assumption list.';
        }
        case DifferenceReason.CandidatesLeftOut: {
            return `${detail.leftOutCount} candidate${detail.leftOutCount === 1 ? '' : 's'} left out of the sweep.`;
        }
        case DifferenceReason.CeilingCap: {
            return `Capped at the $${detail.ceiling.toFixed(2)} profit ceiling for today.`;
        }
        case DifferenceReason.ConsistencyCap: {
            return `Capped at $${detail.maxDayProfit.toFixed(2)}, the most today's profit can be before the payout is pushed out.`;
        }
        case DifferenceReason.ConsistencyNotEvaluated: {
            return 'This plan has no consistency rule to evaluate.';
        }
        case DifferenceReason.CushionCap: {
            return `Capped so at least $${detail.cushion.toFixed(2)} of retained cushion remains.`;
        }
        case DifferenceReason.DailyLossCap: {
            return `Capped by the $${detail.dailyLossLimit.toFixed(2)} daily loss limit.`;
        }
        case DifferenceReason.DpGridMisaligned: {
            return `The $${detail.drawdown.toFixed(2)} drawdown is not an even multiple of the $${detail.step.toFixed(2)} cushion step; informational only.`;
        }
        case DifferenceReason.DpGridSaturation: {
            return 'The DP grid is saturated at this state; the solve may be less reliable here.';
        }
        case DifferenceReason.DpIneligible: {
            return `Not DP-eligible: ${detail.reason}`;
        }
        case DifferenceReason.DpModelGap: {
            return `The DP model has a known gap here: ${detail.gap}`;
        }
        case DifferenceReason.DpNotValidated: {
            return `The DP result is not validated (${dpNotValidatedCauseText(detail.cause)}).`;
        }
        case DifferenceReason.DpObjectiveMismatch: {
            return 'This DP row was solved for a different objective than the one shown here.';
        }
        case DifferenceReason.DpPayoutPolicyMismatch: {
            return 'This DP row used a different payout policy than the headline.';
        }
        case DifferenceReason.DpStateUnreached: {
            return `Day ${detail.day} is past this DP solve's horizon; the state was never reached.`;
        }
        case DifferenceReason.EngineInputsRefused: {
            return `The engine refused these inputs: ${detail.issue}`;
        }
        case DifferenceReason.FirmMinimumAboveRequest: {
            return `Requested $${detail.requested.toFixed(2)}, raised to the firm's $${detail.minimum.toFixed(2)} minimum.`;
        }
        case DifferenceReason.FreshStartApproximation: {
            return 'This optimum was computed from a fresh start, not the current account state.';
        }
        case DifferenceReason.HorizonCreditOneRequest: {
            return `Over the ${detail.horizonDays}-day horizon, the credit reflects only one payout request.`;
        }
        case DifferenceReason.LiveModelApproximation: {
            return 'No account-level live model exists for this firm; the firm-level rule is used instead.';
        }
        case DifferenceReason.LiveNotModeled: {
            return 'Live-stage rules are not modeled for this firm.';
        }
        case DifferenceReason.LiveTriggersNotChecked: {
            return 'Live-transition triggers are not verified yet; engine numbers here are optimistic.';
        }
        case DifferenceReason.NoCushion: {
            return 'No retained cushion is configured, so no cushion cap applies.';
        }
        case DifferenceReason.ObjectiveSpeedVsMonthlyNet: {
            return 'This optimum ranks by speed to funded, not by expected monthly net.';
        }
        case DifferenceReason.PayoutPolicyDiffers: {
            return `This number used the "${detail.enginePolicyLabel}" payout policy, not the headline's "${detail.headlinePolicyLabel}".`;
        }
        case DifferenceReason.PersonalCap: {
            return `Capped by your personal $${detail.cap.toFixed(2)} limit.`;
        }
        case DifferenceReason.PlanRulesChanged: {
            return "This plan's rules changed since the advice was computed; refresh it.";
        }
        case DifferenceReason.RemainingTargetCap: {
            return `Capped at the $${detail.remaining.toFixed(2)} remaining to the profit target.`;
        }
        case DifferenceReason.RetainedCushionBasis: {
            return `Retained cushion is the larger of the rulebook's $${detail.rulebookCushion.toFixed(2)} and D4's $${detail.d4Cushion.toFixed(2)}.`;
        }
        case DifferenceReason.StaleAdvice: {
            return `This advice is from the ${detail.snapshotDate} snapshot and is stale; rung amounts are withheld.`;
        }
        case DifferenceReason.WholeContractPlacement: {
            return `Placed as ${detail.contracts} whole contract${detail.contracts === 1 ? '' : 's'}, rounded down from the documented risk.`;
        }
        case DifferenceReason.WithinNoise: {
            return `The $${detail.gap.toFixed(2)} gap is within $${detail.threshold.toFixed(2)} of noise; treat these as the same.`;
        }
        case DifferenceReason.WouldTriggerLive: {
            return `This would trigger a live-account transition: ${detail.trigger}`;
        }
    }
}

function conductPatternQuote(pattern: ConductPattern): string {
    const { source } = pattern;
    switch (source.verification) {
        case PolicyVerification.Confirmed:
        case PolicyVerification.Conflict: {
            return source.quote;
        }
        case PolicyVerification.NeedsPaste:
        case PolicyVerification.NotFound: {
            return pattern.consequence;
        }
    }
}

function dpNotValidatedCauseText(cause: DpNotValidatedCause): string {
    switch (cause) {
        case DpNotValidatedCause.NoGateRun: {
            return 'no gate run has been recorded';
        }
        case DpNotValidatedCause.RetainedCushionMismatch: {
            return 'the retained cushion did not match the flat baseline';
        }
        case DpNotValidatedCause.SolveCapReached: {
            return 'the solver hit its cap before converging';
        }
        case DpNotValidatedCause.StaleTree: {
            return 'the gate ran on a stale tree';
        }
    }
}
