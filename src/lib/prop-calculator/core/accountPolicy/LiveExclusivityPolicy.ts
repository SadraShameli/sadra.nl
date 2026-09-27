import { type FirmPolicySource } from './FirmPolicySource';

export enum EvalPurchaseEffect {
    ActivationBlocked = 'activation-blocked',
    Allowed = 'allowed',
    Blocked = 'blocked',
    Unknown = 'unknown',
}

export enum LiveBustCooldownKind {
    Fixed = 'fixed',
    ReturnByNewEvaluation = 'return-by-new-evaluation',
    TimeLiveReduced = 'time-live-reduced',
    Unknown = 'unknown',
    UpTo = 'up-to',
}

export enum SimAccountEffect {
    Closed = 'closed',
    Dormant = 'dormant',
    Unknown = 'unknown',
    UpgradedAccountOnHold = 'upgraded-account-on-hold',
}

export interface LiveExclusivityPolicy {
    readonly cooldown: LiveBustCooldown;
    readonly evalPurchaseEffect: EvalPurchaseEffect;
    readonly household: boolean;
    readonly simAccountEffect: SimAccountEffect;
    readonly source: FirmPolicySource | undefined;
}

export interface TimeLiveReducedCooldownStep {
    readonly cooldownDays: number;
    readonly minDaysLive: number;
}

export abstract class LiveBustCooldown {
    abstract readonly kind: LiveBustCooldownKind;

    abstract isActive(daysSinceBust: number, daysLive: number): boolean;
}

export class FixedCooldown extends LiveBustCooldown {
    readonly kind = LiveBustCooldownKind.Fixed;

    constructor(readonly cooldownDays: number) {
        super();
    }

    isActive(daysSinceBust: number, _daysLive: number): boolean {
        return daysSinceBust < this.cooldownDays;
    }
}

export class ReturnByNewEvaluationCooldown extends LiveBustCooldown {
    readonly kind = LiveBustCooldownKind.ReturnByNewEvaluation;

    isActive(_daysSinceBust: number, _daysLive: number): boolean {
        return true;
    }
}

export class TimeLiveReducedCooldown extends LiveBustCooldown {
    readonly kind = LiveBustCooldownKind.TimeLiveReduced;

    readonly steps: readonly TimeLiveReducedCooldownStep[];

    constructor(steps: readonly TimeLiveReducedCooldownStep[]) {
        super();
        this.steps = steps.toSorted(
            (a, b) => b.minDaysLive - a.minDaysLive,
        );
    }

    isActive(daysSinceBust: number, daysLive: number): boolean {
        const applicableStep = this.steps.find(
            (step) => daysLive >= step.minDaysLive,
        );
        return (
            applicableStep === undefined ||
            daysSinceBust < applicableStep.cooldownDays
        );
    }
}

export class UnknownCooldown extends LiveBustCooldown {
    readonly kind = LiveBustCooldownKind.Unknown;

    isActive(_daysSinceBust: number, _daysLive: number): boolean {
        return true;
    }
}

export class UpToCooldown extends LiveBustCooldown {
    readonly kind = LiveBustCooldownKind.UpTo;

    constructor(readonly maxCooldownDays: number) {
        super();
    }

    isActive(daysSinceBust: number, _daysLive: number): boolean {
        return daysSinceBust < this.maxCooldownDays;
    }
}

export const UNVERIFIED_LIVE_EXCLUSIVITY_POLICY: LiveExclusivityPolicy = {
    cooldown: new UnknownCooldown(),
    evalPurchaseEffect: EvalPurchaseEffect.Unknown,
    household: false,
    simAccountEffect: SimAccountEffect.Unknown,
    source: undefined,
};
