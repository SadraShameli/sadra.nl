import {
    dollars,
    type Dollars,
    type FirmAccountPolicy,
    LifetimePayoutCapOverrideKind,
    type LiveTransitionTrigger,
    ONE_CENT,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    PolicyVerification,
    resolveLifetimePayoutCapOverride,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator/core';

import { type Assumption, AssumptionBias, inputAssumption } from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { combinedProfitCeiling, liveTriggerCeilingFor } from './DailyPlanCard';
import { type PolicyCitation } from './PayoutBlockReason';
import {
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
} from './PayoutRequestDecision';
import { PayoutRequestRule, type PayoutRuleContext } from './PayoutRequestRule';
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

export interface LiveTriggerLimits {
    readonly coverage: LiveTriggerCoverage;
    readonly firmTotalCap: null | number;
    readonly firmTotalSource: null | PolicyCitation;
    readonly perAccountCap: null | number;
    readonly perAccountSource: null | PolicyCitation;
    readonly singleDayCeiling: Dollars | null;
}

export interface LiveTriggerRuleCaps {
    readonly ceiling: Dollars | null;
    readonly placeableMinimum: Dollars;
}

export interface PayoutAdvice {
    readonly assumptions: readonly Assumption[];
    readonly documented: PayoutRequestDecision;
    readonly engineHorizonCredit: Dollars | null;
    readonly netAfterSplit: Dollars | null;
    readonly personalOverrideWarning?: PersonalPayoutOverrideWarning;
}

interface CappedBySource {
    readonly cap: number;
    readonly source: null | PolicyCitation;
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
            ? [{ cap: override.cap, source: confirmedCitationOf(trigger) }]
            : [];
    });
    const firmTotalCaps = triggers.flatMap((trigger) =>
        trigger instanceof PayoutCountTotalTrigger && isConfirmed(trigger)
            ? [{ cap: trigger.cap, source: confirmedCitationOf(trigger) }]
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
            (trigger) => isConfirmed(trigger) && isEnforcedKind(trigger),
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
    const ceiling = combinedProfitCeiling(
        consistencyCeiling,
        limits.singleDayCeiling,
    );
    return {
        ceiling,
        placeableMinimum:
            ceiling === null
                ? ONE_CENT
                : advisorPlaceableMinimum(positionSizing),
    };
}

export function payoutAdvice(
    rulebook: RulebookParameters,
    context: PayoutRuleContext,
    coverage: LiveTriggerCoverage = LiveTriggerCoverage.NotChecked,
): PayoutAdvice {
    const rule = new PayoutRequestRule(rulebook);
    const documented = rule.decide(context);
    const { engineHorizonCredit, netAfterSplit } = numbersFor(
        context,
        documented,
    );
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
        engineHorizonCredit,
        netAfterSplit,
    };
}

function confirmedCitationOf(
    trigger: LiveTransitionTrigger,
): null | PolicyCitation {
    const { source } = trigger;
    return source?.verification === PolicyVerification.Confirmed
        ? {
              fetchedOn: source.fetchedOn,
              quote: source.quote,
              url: source.url,
          }
        : null;
}

function isConfirmed(trigger: LiveTransitionTrigger): boolean {
    return confirmedCitationOf(trigger) !== null;
}

function isEnforcedKind(trigger: LiveTransitionTrigger): boolean {
    return (
        trigger instanceof PayoutCountPerAccountTrigger ||
        trigger instanceof PayoutCountTotalTrigger ||
        trigger instanceof SingleDayProfitTrigger
    );
}

function numbersFor(
    context: PayoutRuleContext,
    documented: PayoutRequestDecision,
): { engineHorizonCredit: Dollars | null; netAfterSplit: Dollars | null } {
    if (documented.kind !== PayoutRequestDecisionKind.Request) {
        return { engineHorizonCredit: null, netAfterSplit: null };
    }
    switch (context.stage) {
        case SizingStage.Funded: {
            const { plan, state, tracker } = context;
            return {
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
            };
        }
        case SizingStage.Live: {
            return {
                engineHorizonCredit: null,
                netAfterSplit: dollars(
                    context.livePlan.payoutFromProfit(documented.requestAmount),
                ),
            };
        }
    }
}

function tightestOf(
    caps: readonly CappedBySource[],
): CappedBySource | null {
    return caps.reduce<CappedBySource | null>(
        (tightest, candidate) =>
            tightest === null ||
            candidate.cap < tightest.cap ||
            (candidate.cap === tightest.cap &&
                tightest.source === null &&
                candidate.source !== null)
                ? candidate
                : tightest,
        null,
    );
}
