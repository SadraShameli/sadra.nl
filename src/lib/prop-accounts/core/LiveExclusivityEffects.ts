import {
    EvalPurchaseEffect,
    type FirmAccountPolicy,
    type FirmId,
    isoDaysBetween,
    type Plan,
    PolicyVerification,
    SimAccountEffect,
} from '~/lib/prop-calculator';

import { AccountEventKind } from './AccountEventKind';
import { AccountStage } from './AccountStage';
import { type KindDatedEvent, latestEventOn } from './AccountStageOnDate';
import { AccountStatus } from './AccountStatus';

export enum LiveExclusivityAction {
    Flag = 'flag',
    None = 'none',
    Suspend = 'suspend',
}

export enum PurchaseBlockReason {
    Cooldown = 'cooldown',
    LiveExclusivity = 'live-exclusivity',
}

export interface ExclusivityAccount {
    readonly accountPolicy: FirmAccountPolicy;
    readonly events: readonly KindDatedEvent[];
    readonly firmId: FirmId;
    readonly id: string;
    readonly plan: Plan;
    readonly stage: AccountStage;
    readonly status: AccountStatus;
}

export interface LiveBustCooldownState {
    readonly bustedOn: string;
    readonly daysLive: number;
    readonly daysSinceBust: number;
    readonly movedLiveOn: string;
}

export interface LiveExclusivityEffect {
    readonly accountId: string;
    readonly action: LiveExclusivityAction;
}

export interface LiveExclusivityOutcome {
    readonly effects: readonly LiveExclusivityEffect[];
    readonly householdDisclosed: boolean;
}

export interface PurchaseBlockedFirm {
    readonly firmId: FirmId;
    readonly reason: PurchaseBlockReason;
}

export function isConfirmedPolicySource(
    source: undefined | { readonly verification: PolicyVerification },
): boolean {
    return source?.verification === PolicyVerification.Confirmed;
}

export function liveBustCooldownStateOf(
    events: readonly KindDatedEvent[],
    today: string,
): LiveBustCooldownState | null {
    const bustedOn = latestEventOn(events, AccountEventKind.Busted);
    if (bustedOn === null) return null;
    const movedLiveOn = latestEventOn(
        events,
        AccountEventKind.MovedLive,
        bustedOn,
    );
    if (movedLiveOn === null) return null;
    return {
        bustedOn,
        daysLive: isoDaysBetween(movedLiveOn, bustedOn),
        daysSinceBust: isoDaysBetween(bustedOn, today),
        movedLiveOn,
    };
}

export function liveExclusivityEffectsOf(
    accounts: readonly ExclusivityAccount[],
    movedLiveAccountId: string,
): LiveExclusivityOutcome {
    const movedLive = accounts.find(
        (account) => account.id === movedLiveAccountId,
    );
    if (movedLive === undefined) {
        return { effects: [], householdDisclosed: false };
    }
    const policy = movedLive.accountPolicy.liveExclusivityFor(movedLive.plan);
    if (!isConfirmedPolicySource(policy.source)) {
        return { effects: [], householdDisclosed: policy.household };
    }
    const action = siblingActionFor(policy.simAccountEffect);
    const siblings = accounts.filter(
        (account) =>
            account.id !== movedLiveAccountId &&
            account.firmId === movedLive.firmId &&
            account.status === AccountStatus.Active &&
            (account.stage === AccountStage.Eval ||
                account.stage === AccountStage.Funded),
    );
    return {
        effects:
            action === LiveExclusivityAction.None
                ? []
                : siblings.map((account) => ({
                      accountId: account.id,
                      action,
                  })),
        householdDisclosed: policy.household,
    };
}

export function purchaseBlockedFirms(
    accounts: readonly ExclusivityAccount[],
    today: string,
): readonly PurchaseBlockedFirm[] {
    const byFirm = Map.groupBy(accounts, (account) => account.firmId);
    const blocked: PurchaseBlockedFirm[] = [];
    for (const [firmId, group] of byFirm) {
        const activeLive = group.find(
            (account) =>
                account.stage === AccountStage.Live &&
                account.status === AccountStatus.Active,
        );
        if (activeLive !== undefined && isPurchaseBlockedBy(activeLive)) {
            blocked.push({
                firmId,
                reason: PurchaseBlockReason.LiveExclusivity,
            });
            continue;
        }
        if (group.some((account) => isInActiveCooldown(account, today))) {
            blocked.push({ firmId, reason: PurchaseBlockReason.Cooldown });
        }
    }
    return blocked;
}

function isInActiveCooldown(
    account: ExclusivityAccount,
    today: string,
): boolean {
    const state = liveBustCooldownStateOf(account.events, today);
    if (state === null) return false;
    const policy = account.accountPolicy.liveExclusivityFor(account.plan);
    return (
        isConfirmedPolicySource(policy.source) &&
        policy.cooldown.isActive(state.daysSinceBust, state.daysLive)
    );
}

function isPurchaseBlockedBy(account: ExclusivityAccount): boolean {
    const policy = account.accountPolicy.liveExclusivityFor(account.plan);
    return (
        isConfirmedPolicySource(policy.source) &&
        (policy.evalPurchaseEffect === EvalPurchaseEffect.ActivationBlocked ||
            policy.evalPurchaseEffect === EvalPurchaseEffect.Blocked)
    );
}

function siblingActionFor(effect: SimAccountEffect): LiveExclusivityAction {
    switch (effect) {
        case SimAccountEffect.Closed:
        case SimAccountEffect.Dormant: {
            return LiveExclusivityAction.Suspend;
        }
        case SimAccountEffect.Unknown: {
            return LiveExclusivityAction.None;
        }
        case SimAccountEffect.UpgradedAccountOnHold: {
            return LiveExclusivityAction.Flag;
        }
    }
}
