import {
    type ConfirmedFirmPolicySource,
    type LiveTransitionTrigger,
    PolicyVerification,
} from '~/lib/prop-calculator/core';

export function isConfirmedTrigger(
    trigger: LiveTransitionTrigger,
): trigger is LiveTransitionTrigger & {
    readonly source: ConfirmedFirmPolicySource;
} {
    return trigger.source?.verification === PolicyVerification.Confirmed;
}
