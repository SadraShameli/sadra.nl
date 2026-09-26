import { type Plan } from '~/lib/prop-calculator';

import { AccountEventKind } from './AccountEventKind';
import { AccountStage } from './AccountStage';
import { AccountStatus } from './AccountStatus';

export enum LifecycleOutcomeKind {
    Accepted = 'accepted',
    Rejected = 'rejected',
}

export enum LifecycleRejection {
    AccountAlreadyOpen = 'account-already-open',
    AccountNotOpen = 'account-not-open',
    AlreadyEnded = 'already-ended',
    BustedAccountStaysBusted = 'busted-account-stays-busted',
    EvalCannotConclude = 'eval-cannot-conclude',
    EvalOnInstantFundedPlan = 'eval-on-instant-funded-plan',
    FundedResetNotOffered = 'funded-reset-not-offered',
    LiveBustIsFinal = 'live-bust-is-final',
    NotActive = 'not-active',
    NotBusted = 'not-busted',
    NotEval = 'not-eval',
    NotFunded = 'not-funded',
    NotReopenable = 'not-reopenable',
    NotSuspended = 'not-suspended',
    UseFundedReset = 'use-funded-reset',
}

export interface AccountLifecycleState {
    readonly stage: AccountStage;
    readonly status: AccountStatus;
}

export type LifecycleOutcome =
    | {
          readonly kind: LifecycleOutcomeKind.Accepted;
          readonly state: AccountLifecycleState;
      }
    | {
          readonly kind: LifecycleOutcomeKind.Rejected;
          readonly reason: LifecycleRejection;
      };

export interface LifecycleRejectionContext {
    readonly facts: PlanLifecycleFacts;
    readonly stage: AccountStage | null;
}

export type PlanLifecycleFacts = Pick<Plan, 'fundedReset' | 'isInstantFunded'>;

const ENDED_STATUSES: ReadonlySet<AccountStatus> = new Set([
    AccountStatus.Closed,
    AccountStatus.Concluded,
]);

const REOPENABLE_STATUSES: ReadonlySet<AccountStatus> = new Set([
    AccountStatus.Busted,
    AccountStatus.Closed,
]);

export function applyLifecycleEvent(
    facts: PlanLifecycleFacts,
    state: AccountLifecycleState | null,
    event: AccountEventKind,
): LifecycleOutcome {
    if (state === null) {
        return event === AccountEventKind.Purchased
            ? accepted(
                  facts.isInstantFunded
                      ? AccountStage.Funded
                      : AccountStage.Eval,
                  AccountStatus.Active,
              )
            : rejected(LifecycleRejection.AccountNotOpen);
    }
    const stageRejection = validateStageForPlan(state.stage, facts);
    return stageRejection === null
        ? transition(facts, state, event)
        : rejected(stageRejection);
}

export function describeLifecycleRejection(
    reason: LifecycleRejection,
    context: LifecycleRejectionContext,
): string {
    switch (reason) {
        case LifecycleRejection.AccountAlreadyOpen: {
            return 'The account is already open; a re-buy is a new account';
        }
        case LifecycleRejection.AccountNotOpen: {
            return 'The account has no purchase recorded yet';
        }
        case LifecycleRejection.AlreadyEnded: {
            return 'The account has already ended';
        }
        case LifecycleRejection.BustedAccountStaysBusted: {
            return describeStayingBusted(context);
        }
        case LifecycleRejection.EvalCannotConclude: {
            return 'An evaluation cannot conclude; only funded or live accounts do';
        }
        case LifecycleRejection.EvalOnInstantFundedPlan: {
            return 'This plan is instant-funded and has no evaluation stage';
        }
        case LifecycleRejection.FundedResetNotOffered: {
            return 'This plan offers no funded reset';
        }
        case LifecycleRejection.LiveBustIsFinal: {
            return 'A busted live account comes back only through a bust reversal';
        }
        case LifecycleRejection.NotActive: {
            return 'The account is not active';
        }
        case LifecycleRejection.NotBusted: {
            return 'Only a busted account can take a funded reset or a bust reversal';
        }
        case LifecycleRejection.NotEval: {
            return 'The account is not in its evaluation';
        }
        case LifecycleRejection.NotFunded: {
            return 'The account is not funded';
        }
        case LifecycleRejection.NotReopenable: {
            return 'Only a closed or busted account can be reopened';
        }
        case LifecycleRejection.NotSuspended: {
            return 'The account is not suspended';
        }
        case LifecycleRejection.UseFundedReset: {
            return 'A busted funded account comes back only through a funded reset or a bust reversal';
        }
    }
}

export function validateStageForPlan(
    stage: AccountStage,
    facts: PlanLifecycleFacts,
): LifecycleRejection | null {
    switch (stage) {
        case AccountStage.Eval: {
            return facts.isInstantFunded
                ? LifecycleRejection.EvalOnInstantFundedPlan
                : null;
        }
        case AccountStage.Funded:
        case AccountStage.Live: {
            return null;
        }
    }
}

function accepted(
    stage: AccountStage,
    status: AccountStatus,
): LifecycleOutcome {
    return { kind: LifecycleOutcomeKind.Accepted, state: { stage, status } };
}

function bustedReopenRejection(
    facts: PlanLifecycleFacts,
    stage: AccountStage,
): LifecycleRejection | null {
    switch (stage) {
        case AccountStage.Eval: {
            return null;
        }
        case AccountStage.Funded: {
            return facts.fundedReset === null
                ? LifecycleRejection.FundedResetNotOffered
                : LifecycleRejection.UseFundedReset;
        }
        case AccountStage.Live: {
            return LifecycleRejection.LiveBustIsFinal;
        }
    }
}

function describeStayingBusted(context: LifecycleRejectionContext): string {
    switch (context.stage) {
        case AccountStage.Eval:
        case null: {
            return 'A busted account stays busted; record a bust reversal instead';
        }
        case AccountStage.Funded: {
            return context.facts.fundedReset === null
                ? 'A busted funded account stays busted; only a bust reversal by the firm brings it back'
                : 'A busted funded account stays busted; record a funded reset or a bust reversal instead';
        }
        case AccountStage.Live: {
            return 'A busted live account stays busted; only a bust reversal by the firm brings it back';
        }
    }
}

function isBustFinalUntilReversed(state: AccountLifecycleState): boolean {
    if (state.status !== AccountStatus.Busted) return false;
    switch (state.stage) {
        case AccountStage.Eval: {
            return false;
        }
        case AccountStage.Funded:
        case AccountStage.Live: {
            return true;
        }
    }
}

function rejected(reason: LifecycleRejection): LifecycleOutcome {
    return { kind: LifecycleOutcomeKind.Rejected, reason };
}

function transition(
    facts: PlanLifecycleFacts,
    state: AccountLifecycleState,
    event: AccountEventKind,
): LifecycleOutcome {
    switch (event) {
        case AccountEventKind.Busted: {
            return state.status === AccountStatus.Active
                ? accepted(state.stage, AccountStatus.Busted)
                : rejected(LifecycleRejection.NotActive);
        }
        case AccountEventKind.BustReversed: {
            return state.status === AccountStatus.Busted
                ? accepted(state.stage, AccountStatus.Active)
                : rejected(LifecycleRejection.NotBusted);
        }
        case AccountEventKind.Closed:
        case AccountEventKind.ClosedInactivity:
        case AccountEventKind.Refunded: {
            if (ENDED_STATUSES.has(state.status)) {
                return rejected(LifecycleRejection.AlreadyEnded);
            }
            return isBustFinalUntilReversed(state)
                ? rejected(LifecycleRejection.BustedAccountStaysBusted)
                : accepted(state.stage, AccountStatus.Closed);
        }
        case AccountEventKind.Concluded: {
            if (ENDED_STATUSES.has(state.status)) {
                return rejected(LifecycleRejection.AlreadyEnded);
            }
            if (state.stage === AccountStage.Eval) {
                return rejected(LifecycleRejection.EvalCannotConclude);
            }
            return isBustFinalUntilReversed(state)
                ? rejected(LifecycleRejection.BustedAccountStaysBusted)
                : accepted(state.stage, AccountStatus.Concluded);
        }
        case AccountEventKind.Edited: {
            return accepted(state.stage, state.status);
        }
        case AccountEventKind.EvalPassed: {
            if (state.stage !== AccountStage.Eval) {
                return rejected(LifecycleRejection.NotEval);
            }
            return state.status === AccountStatus.Active
                ? accepted(AccountStage.Funded, AccountStatus.Active)
                : rejected(LifecycleRejection.NotActive);
        }
        case AccountEventKind.FundedReset: {
            if (facts.fundedReset === null) {
                return rejected(LifecycleRejection.FundedResetNotOffered);
            }
            if (state.stage !== AccountStage.Funded) {
                return rejected(LifecycleRejection.NotFunded);
            }
            return state.status === AccountStatus.Busted
                ? accepted(AccountStage.Funded, AccountStatus.Active)
                : rejected(LifecycleRejection.NotBusted);
        }
        case AccountEventKind.MovedLive: {
            if (state.stage !== AccountStage.Funded) {
                return rejected(LifecycleRejection.NotFunded);
            }
            return state.status === AccountStatus.Active
                ? accepted(AccountStage.Live, AccountStatus.Active)
                : rejected(LifecycleRejection.NotActive);
        }
        case AccountEventKind.Purchased: {
            return rejected(LifecycleRejection.AccountAlreadyOpen);
        }
        case AccountEventKind.Reopened: {
            if (!REOPENABLE_STATUSES.has(state.status)) {
                return rejected(LifecycleRejection.NotReopenable);
            }
            const bustRejection =
                state.status === AccountStatus.Busted
                    ? bustedReopenRejection(facts, state.stage)
                    : null;
            return bustRejection === null
                ? accepted(state.stage, AccountStatus.Active)
                : rejected(bustRejection);
        }
        case AccountEventKind.Resumed: {
            return state.status === AccountStatus.Suspended
                ? accepted(state.stage, AccountStatus.Active)
                : rejected(LifecycleRejection.NotSuspended);
        }
        case AccountEventKind.Suspended: {
            return state.status === AccountStatus.Active
                ? accepted(state.stage, AccountStatus.Suspended)
                : rejected(LifecycleRejection.NotActive);
        }
    }
}
