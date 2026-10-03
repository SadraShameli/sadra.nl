import {
    type AccountState,
    dollars,
    type Dollars,
    type FirmAccountPolicy,
    type Fraction0to1,
    isAtOrBelowWithinCentTolerance,
    LifetimePayoutCapOverrideKind,
    type LiveTransitionTrigger,
    LiveTriggerKind,
    ONE_CENT,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    type PolicyQuote,
    PolicyVerification,
    resolveLifetimePayoutCapOverride,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator/core';

import { type Assumption, AssumptionBias, inputAssumption } from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { isConfirmedTrigger } from './ConfirmedTrigger';
import { combinedProfitCeiling, liveTriggerCeilingFor } from './DailyPlanCard';
import { type PolicyCitation } from './PayoutBlockReason';
import { type LiveTriggerCountLimit } from './PayoutReadiness';
import {
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
} from './PayoutRequestDecision';
import {
    type FundedPayoutRuleContext,
    PayoutRequestRule,
    type PayoutRuleContext,
    ruleCappedWithdrawable,
} from './PayoutRequestRule';
import { type PersonalPayoutOverrideWarning } from './PayoutSizeSweep';
import {
    advisorPlaceableMinimum,
    type SizingPlacement,
} from './PlaceableMinimum';
import { type RulebookParameters } from './Rulebook';
import { SizingStage } from './SizingStage';

export enum LiveTriggerCoverage {
    Enforced = 'enforced',
    NotChecked = 'not-checked',
}

export enum PayoutCapKind {
    BalanceShare = 'balance-share',
    RemainingPayouts = 'remaining-payouts',
    RequestCap = 'request-cap',
}

export interface LiveTriggerLimits extends LiveTriggerCountLimit {
    readonly coverage: LiveTriggerCoverage;
    readonly singleDayCeiling: Dollars | null;
}

export interface LiveTriggerRuleCaps {
    readonly ceiling: Dollars | null;
    readonly consistencyCeiling: Dollars | null;
    readonly placeableMinimum: Dollars;
}

export interface PayoutAdvice {
    readonly assumptions: readonly Assumption[];
    readonly caps: readonly PayoutCap[];
    readonly documented: PayoutRequestDecision;
    readonly engineHorizonCredit: Dollars | null;
    readonly netAfterSplit: Dollars | null;
    readonly personalOverrideWarning?: PersonalPayoutOverrideWarning;
    readonly ruleCappedWithdrawable: Dollars | null;
}

export type PayoutCap =
    | {
          readonly amount: Dollars;
          readonly kind: PayoutCapKind.BalanceShare;
          readonly limitsWithdrawable: boolean;
          readonly share: Fraction0to1;
      }
    | {
          readonly amount: Dollars;
          readonly kind: PayoutCapKind.RequestCap;
          readonly limitsWithdrawable: boolean;
      }
    | {
          readonly kind: PayoutCapKind.RemainingPayouts;
          readonly remaining: number;
      };

interface CappedBySource {
    readonly cap: number;
    readonly isConfirmed: boolean;
    readonly source: null | PolicyCitation;
}

interface LiveTriggerHandling {
    readonly isEnforcedByRule: boolean;
    readonly isEnginePriced: boolean;
}

interface PayoutNumbers {
    readonly caps: readonly PayoutCap[];
    readonly engineHorizonCredit: Dollars | null;
    readonly netAfterSplit: Dollars | null;
    readonly ruleCappedWithdrawable: Dollars | null;
}

const NO_PAYOUT_NUMBERS: PayoutNumbers = {
    caps: [],
    engineHorizonCredit: null,
    netAfterSplit: null,
    ruleCappedWithdrawable: null,
};

export const LIVE_TRIGGER_NOT_CHECKED: LiveTriggerLimits = {
    coverage: LiveTriggerCoverage.NotChecked,
    firmTotalCap: null,
    firmTotalSource: null,
    paidPayoutsSinceLastLiveAccount: null,
    perAccountCap: null,
    perAccountSource: null,
    singleDayCeiling: null,
};

export function areLiveTriggersEnginePriced(
    accountPolicy: FirmAccountPolicy | undefined,
    plan: Plan,
): boolean {
    const triggers = accountPolicy?.liveTriggersFor(plan) ?? [];
    return (
        triggers.length > 0 &&
        triggers.every(
            (trigger) =>
                isConfirmedTrigger(trigger) &&
                liveTriggerHandlingOf(trigger).isEnginePriced,
        )
    );
}

export function liveTriggerLimitsFor(
    accountPolicy: FirmAccountPolicy | undefined,
    plan: Plan,
    paidPayoutsSinceLastLiveAccount: null | number,
): LiveTriggerLimits {
    const triggers = accountPolicy?.liveTriggersFor(plan) ?? [];
    const perAccountCaps = triggers.flatMap((trigger) => {
        if (!(trigger instanceof PayoutCountPerAccountTrigger)) return [];
        const override = resolveLifetimePayoutCapOverride(plan, [trigger]);
        return override.kind === LifetimePayoutCapOverrideKind.Capped
            ? [
                  {
                      cap: override.cap,
                      isConfirmed: isConfirmedTrigger(trigger),
                      source: citedSourceOf(trigger),
                  },
              ]
            : [];
    });
    const firmTotalCaps = triggers.flatMap((trigger) =>
        trigger instanceof PayoutCountTotalTrigger &&
        isConfirmedTrigger(trigger)
            ? [
                  {
                      cap: trigger.cap,
                      isConfirmed: true,
                      source: confirmedCitationOf(trigger),
                  },
              ]
            : [],
    );
    const singleDayCeiling = triggers.reduce<Dollars | null>(
        (ceiling, trigger) =>
            trigger instanceof SingleDayProfitTrigger
                ? combinedProfitCeiling(ceiling, liveTriggerCeilingFor(trigger))
                : ceiling,
        null,
    );
    const isEnforced =
        triggers.length > 0 &&
        triggers.every(
            (trigger) => isConfirmedTrigger(trigger) && isEnforcedKind(trigger),
        ) &&
        (firmTotalCaps.length === 0 ||
            paidPayoutsSinceLastLiveAccount !== null);
    const firmTotal = tightestOf(firmTotalCaps);
    const perAccount = tightestOf(perAccountCaps);
    return {
        coverage: isEnforced
            ? LiveTriggerCoverage.Enforced
            : LiveTriggerCoverage.NotChecked,
        firmTotalCap: firmTotal?.cap ?? null,
        firmTotalSource: firmTotal?.source ?? null,
        paidPayoutsSinceLastLiveAccount,
        perAccountCap: perAccount?.cap ?? null,
        perAccountSource: perAccount?.source ?? null,
        singleDayCeiling,
    };
}

export function liveTriggerRuleCaps(
    consistencyCeiling: Dollars | null,
    limits: LiveTriggerLimits,
    positionSizing: null | SizingPlacement | undefined,
): LiveTriggerRuleCaps {
    const hasCeiling =
        combinedProfitCeiling(consistencyCeiling, limits.singleDayCeiling) !==
        null;
    return {
        ceiling: limits.singleDayCeiling,
        consistencyCeiling,
        placeableMinimum: hasCeiling
            ? advisorPlaceableMinimum(positionSizing)
            : ONE_CENT,
    };
}

export function payoutAdvice(
    rulebook: RulebookParameters,
    context: PayoutRuleContext,
    coverage: LiveTriggerCoverage = LiveTriggerCoverage.NotChecked,
): PayoutAdvice {
    const rule = new PayoutRequestRule(rulebook);
    const documented = rule.decide(context);
    return {
        assumptions:
            coverage === LiveTriggerCoverage.Enforced
                ? []
                : [
                      inputAssumption(
                          AssumptionKind.LiveTriggersNotChecked,
                          AssumptionBias.Optimistic,
                      ),
                  ],
        documented,
        ...numbersFor(context, documented),
    };
}

function citationOf(source: PolicyQuote): PolicyCitation {
    return {
        fetchedOn: source.fetchedOn,
        quote: source.quote,
        url: source.url,
    };
}

function citedSourceOf(trigger: LiveTransitionTrigger): null | PolicyCitation {
    const confirmed = confirmedCitationOf(trigger);
    if (confirmed !== null) return confirmed;
    const { source } = trigger;
    return source?.verification === PolicyVerification.Conflict
        ? citationOf(source)
        : null;
}

function confirmedCitationOf(
    trigger: LiveTransitionTrigger,
): null | PolicyCitation {
    return isConfirmedTrigger(trigger) ? citationOf(trigger.source) : null;
}

function isEnforcedKind(trigger: LiveTransitionTrigger): boolean {
    return liveTriggerHandlingOf(trigger).isEnforcedByRule;
}

function liveTriggerHandlingOf(
    trigger: LiveTransitionTrigger,
): LiveTriggerHandling {
    switch (trigger.kind) {
        case LiveTriggerKind.CumulativeAmount: {
            return { isEnforcedByRule: false, isEnginePriced: true };
        }
        case LiveTriggerKind.Discretionary: {
            return { isEnforcedByRule: false, isEnginePriced: false };
        }
        case LiveTriggerKind.NotChecked: {
            return { isEnforcedByRule: false, isEnginePriced: false };
        }
        case LiveTriggerKind.PayoutCountPerAccount: {
            return { isEnforcedByRule: true, isEnginePriced: true };
        }
        case LiveTriggerKind.PayoutCountTotal: {
            return { isEnforcedByRule: true, isEnginePriced: false };
        }
        case LiveTriggerKind.SingleDayProfit: {
            return { isEnforcedByRule: true, isEnginePriced: false };
        }
    }
}

function netStateOf(context: FundedPayoutRuleContext): AccountState {
    return context.pendingPayouts > 0
        ? {
              ...context.state,
              balance: dollars(context.state.balance - context.pendingPayouts),
          }
        : context.state;
}

function numbersFor(
    context: PayoutRuleContext,
    documented: PayoutRequestDecision,
): PayoutNumbers {
    if (documented.kind !== PayoutRequestDecisionKind.Request) {
        return NO_PAYOUT_NUMBERS;
    }
    switch (context.stage) {
        case SizingStage.Funded: {
            const { plan, state, tracker } = context;
            const withdrawable = ruleCappedWithdrawable(
                plan,
                tracker,
                netStateOf(context),
                documented.retainedCushion,
            );
            return {
                caps: payoutCapsOf(context, withdrawable),
                engineHorizonCredit: dollars(
                    tracker.closeoutCredit({
                        minRetainedCushion: documented.retainedCushion,
                        payoutRequestSize: documented.requestAmount,
                        plan,
                        state,
                    }),
                ),
                netAfterSplit: dollars(
                    plan.payoutFromProfit(
                        documented.requestAmount,
                        tracker.payoutsIssued,
                    ),
                ),
                ruleCappedWithdrawable: withdrawable,
            };
        }
        case SizingStage.Live: {
            return {
                ...NO_PAYOUT_NUMBERS,
                netAfterSplit: dollars(
                    context.livePlan.payoutFromProfit(documented.requestAmount),
                ),
            };
        }
    }
}

function payoutCapsOf(
    context: FundedPayoutRuleContext,
    withdrawable: Dollars,
): readonly PayoutCap[] {
    const { plan, tracker } = context;
    const netState = netStateOf(context);
    const regime = plan.resolvedPayoutCap(netState, tracker.payoutsIssued);
    const isLimiting = (amount: number): boolean =>
        isAtOrBelowWithinCentTolerance(amount, withdrawable);
    const caps: PayoutCap[] = [];
    if (regime.requestCap !== null) {
        caps.push({
            amount: regime.requestCap,
            kind: PayoutCapKind.RequestCap,
            limitsWithdrawable: isLimiting(regime.requestCap),
        });
    }
    if (regime.balanceShareCap !== null) {
        const amount = dollars(
            regime.balanceShareCap * Math.max(0, plan.accountProfit(netState)),
        );
        caps.push({
            amount,
            kind: PayoutCapKind.BalanceShare,
            limitsWithdrawable: isLimiting(amount),
            share: regime.balanceShareCap,
        });
    }
    if (plan.maxLifetimePayouts !== null) {
        caps.push({
            kind: PayoutCapKind.RemainingPayouts,
            remaining: Math.max(
                0,
                plan.maxLifetimePayouts - tracker.payoutsIssued,
            ),
        });
    }
    return caps;
}

function tightestOf(caps: readonly CappedBySource[]): CappedBySource | null {
    return caps.reduce<CappedBySource | null>(
        (tightest, candidate) =>
            tightest === null ||
            candidate.cap < tightest.cap ||
            (candidate.cap === tightest.cap &&
                !tightest.isConfirmed &&
                candidate.isConfirmed)
                ? candidate
                : tightest,
        null,
    );
}
