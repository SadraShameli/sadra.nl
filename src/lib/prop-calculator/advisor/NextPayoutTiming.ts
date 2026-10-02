import { formatPercent } from '~/lib/format';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import { type NextPayoutProjection } from './NextPayoutProjection';

export enum NextPayoutTimingKind {
    AlreadyEligible = 'already-eligible',
    InDays = 'in-days',
    NoTrialPaid = 'no-trial-paid',
}

type NextPayoutTiming =
    | {
          readonly calendarDays: UncertainValue;
          readonly kind: NextPayoutTimingKind.InDays;
          readonly sessionDays: UncertainValue;
      }
    | { readonly kind: NextPayoutTimingKind.AlreadyEligible }
    | { readonly kind: NextPayoutTimingKind.NoTrialPaid };

export const NEXT_PAYOUT_ELIGIBLE_NOW_TEXT = 'Eligible now';

export const NEXT_PAYOUT_NO_TRIAL_PAID_TEXT =
    'No simulated trial reached a payout within the horizon';

export const NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT =
    "the firm's live trigger and payout count limits are not applied, see the payout readiness on the advice panel";

export const NEXT_PAYOUT_ELIGIBILITY_CHECK_TEXT = `from the engine's payout eligibility check, no trials were simulated; ${NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT}`;

export const NEXT_PAYOUT_AMONG_PAYING_TEXT = 'among the trials that paid';

export function nextPayoutEvidenceText(
    projection: NextPayoutProjection,
): string {
    return nextPayoutTimingOf(projection).kind ===
        NextPayoutTimingKind.AlreadyEligible
        ? NEXT_PAYOUT_ELIGIBILITY_CHECK_TEXT
        : nextPayoutPayingTrialsText(projection);
}

export function nextPayoutTimingOf(
    projection: NextPayoutProjection,
): NextPayoutTiming {
    if (projection.payingTrials === 0) {
        return { kind: NextPayoutTimingKind.NoTrialPaid };
    }
    if (projection.alreadyEligible) {
        return { kind: NextPayoutTimingKind.AlreadyEligible };
    }
    return {
        calendarDays: projection.expectedCalendarDaysToFirstPayout,
        kind: NextPayoutTimingKind.InDays,
        sessionDays: projection.expectedSessionDaysToFirstPayout,
    };
}

function nextPayoutPayingTrialsText(projection: NextPayoutProjection): string {
    const { payingTrials, trials } = projection;
    return `${payingTrials.toLocaleString('en-US')} of ${trials.toLocaleString('en-US')} trials reached a payout (${formatPercent(payingTrials / trials)})`;
}
