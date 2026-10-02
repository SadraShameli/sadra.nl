import {
    type LiveTransitionTrigger,
    PolicyVerification,
} from '~/lib/prop-calculator/core';

export function isConfirmedTrigger(trigger: LiveTransitionTrigger): boolean {
    return trigger.source?.verification === PolicyVerification.Confirmed;
}
