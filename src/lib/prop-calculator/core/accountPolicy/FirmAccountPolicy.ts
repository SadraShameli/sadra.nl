import { lifetimePayoutCountLimit } from '../PayoutGate';
import { type Plan } from '../Plan';
import { type TradingPhase } from '../TradingPhase';
import {
    type AccountCapPolicy,
    PER_PLAN_CAP_POLICY,
} from './AccountCapPolicy';
import { type ConductPattern } from './ConductPattern';
import { PolicyVerification } from './FirmPolicySource';
import {
    type InactivityPolicy,
    unverifiedInactivityPolicyFor,
} from './InactivityPolicy';
import {
    type LiveExclusivityPolicy,
    UNVERIFIED_LIVE_EXCLUSIVITY_POLICY,
} from './LiveExclusivityPolicy';
import {
    type LiveTransitionTrigger,
    LiveTriggerKind,
    NotCheckedLiveTransitionTrigger,
    type PayoutCountPerAccountTrigger,
} from './LiveTransitionTrigger';

export enum LifetimePayoutCapOverrideKind {
    Capped = 'capped',
    NoCountTrigger = 'no-count-trigger',
    NotChecked = 'not-checked',
    PlanAlreadyConcludes = 'plan-already-concludes',
}

export type LifetimePayoutCapOverride =
    | {
          readonly cap: number;
          readonly kind: LifetimePayoutCapOverrideKind.Capped;
      }
    | { readonly kind: LifetimePayoutCapOverrideKind.NoCountTrigger }
    | { readonly kind: LifetimePayoutCapOverrideKind.NotChecked }
    | { readonly kind: LifetimePayoutCapOverrideKind.PlanAlreadyConcludes };

export abstract class FirmAccountPolicy {
    capPolicyFor(_plan: Plan): AccountCapPolicy {
        return PER_PLAN_CAP_POLICY;
    }

    conductPatterns(_plan: Plan): readonly ConductPattern[] {
        return [];
    }

    inactivityFor(plan: Plan, phase: TradingPhase): InactivityPolicy {
        return unverifiedInactivityPolicyFor(plan, phase);
    }

    lifetimePayoutCapOverride(plan: Plan): LifetimePayoutCapOverride {
        return resolveLifetimePayoutCapOverride(
            plan,
            this.liveTriggersFor(plan),
        );
    }

    liveExclusivityFor(_plan: Plan): LiveExclusivityPolicy {
        return UNVERIFIED_LIVE_EXCLUSIVITY_POLICY;
    }

    liveTriggersFor(_plan: Plan): readonly LiveTransitionTrigger[] {
        return [new NotCheckedLiveTransitionTrigger()];
    }
}

export class UnverifiedFirmAccountPolicy extends FirmAccountPolicy {}

export function resolveLifetimePayoutCapOverride(
    plan: Plan,
    triggers: readonly LiveTransitionTrigger[],
): LifetimePayoutCapOverride {
    const perAccountTrigger = triggers.find(
        (trigger): trigger is PayoutCountPerAccountTrigger =>
            trigger.kind === LiveTriggerKind.PayoutCountPerAccount,
    );
    if (perAccountTrigger !== undefined) {
        return resolvePayoutCountPerAccount(plan, perAccountTrigger);
    }
    const hasNotChecked = triggers.some(
        (trigger) => trigger.kind === LiveTriggerKind.NotChecked,
    );
    return ({ kind: hasNotChecked || triggers.length === 0 ? LifetimePayoutCapOverrideKind.NotChecked : LifetimePayoutCapOverrideKind.NoCountTrigger });
}

function payoutCountPerAccountOutcome(
    plan: Plan,
    cap: number,
): LifetimePayoutCapOverride {
    const limit = lifetimePayoutCountLimit(plan);
    return limit === null || cap < limit.count ? { cap, kind: LifetimePayoutCapOverrideKind.Capped } : { kind: LifetimePayoutCapOverrideKind.PlanAlreadyConcludes };
}

function resolveConflictingPayoutCountPerAccount(
    plan: Plan,
    trigger: PayoutCountPerAccountTrigger,
): LifetimePayoutCapOverride {
    if (trigger.conflictingCap === undefined) {
        return { kind: LifetimePayoutCapOverrideKind.NotChecked };
    }
    const primary = payoutCountPerAccountOutcome(plan, trigger.cap);
    const conflicting = payoutCountPerAccountOutcome(
        plan,
        trigger.conflictingCap,
    );
    if (
        primary.kind === LifetimePayoutCapOverrideKind.Capped &&
        conflicting.kind === LifetimePayoutCapOverrideKind.Capped
    ) {
        return primary.cap === conflicting.cap
            ? primary
            : { kind: LifetimePayoutCapOverrideKind.NotChecked };
    }
    return primary.kind === conflicting.kind
        ? primary
        : { kind: LifetimePayoutCapOverrideKind.NotChecked };
}

function resolvePayoutCountPerAccount(
    plan: Plan,
    trigger: PayoutCountPerAccountTrigger,
): LifetimePayoutCapOverride {
    if (trigger.source === undefined) {
        return { kind: LifetimePayoutCapOverrideKind.NotChecked };
    }
    switch (trigger.source.verification) {
        case PolicyVerification.Confirmed: {
            return payoutCountPerAccountOutcome(plan, trigger.cap);
        }
        case PolicyVerification.Conflict: {
            return resolveConflictingPayoutCountPerAccount(plan, trigger);
        }
        case PolicyVerification.NeedsPaste:
        case PolicyVerification.NotFound: {
            return { kind: LifetimePayoutCapOverrideKind.NotChecked };
        }
    }
}
