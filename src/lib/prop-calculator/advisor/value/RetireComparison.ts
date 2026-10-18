import {
    type CumulativePayoutTriggerAssumption,
    liveTransferAssumptionOf,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor/Assumption';
import {
    type DocumentedPolicySpec,
    pricedCumulativeTriggerAssumptionOf,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { type Plan, TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';
import {
    type FromStateSimInputs,
    simulate,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';
import {
    isBeyondNoise,
    NoiseVerdict,
    noiseVerdict,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import { startStateOf } from './ValueAtState';
import {
    notModeled,
    type ValueNotModeledResult,
    ValueUnavailableReason,
} from './ValueEstimate';

export enum RetireComparisonBasis {
    AverageRewardDp = 'average-reward-dp',
    Simulator = 'simulator',
}

export enum RetireComparisonReason {
    NoRemainingHorizon = 'no-remaining-horizon',
    NotCapacityBound = 'not-capacity-bound',
    SwitchBehind = 'switch-behind',
    Unknown = 'unknown',
    WithinNoise = 'within-noise',
}

export enum RetireComparisonVerdict {
    Keep = 'keep',
    SwitchBeatsKeep = 'switch-beats-keep',
}

export type RetireComparisonOutcome =
    RetireComparisonResult | ValueNotModeledResult;

export interface RetireComparisonRequest {
    readonly isCapacityBound: boolean;
    readonly replacementPlan: Plan;
    readonly validatedSlotRate?: UncertainValue;
}

export interface RetireComparisonResult {
    readonly basis: RetireComparisonBasis;
    readonly cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption;
    readonly isSlotRateHazardFree?: true;
    readonly isSlotRateTriggerFree?: true;
    readonly keepRate: UncertainValue;
    readonly liveTransfer?: LiveTransferHazardAssumption;
    readonly reason: null | RetireComparisonReason;
    readonly remainingDays: number;
    readonly replacementCumulativePayoutTrigger?: CumulativePayoutTriggerAssumption;
    readonly replacementLiveTransfer?: LiveTransferHazardAssumption;
    readonly switchCost: number;
    readonly switchRate: UncertainValue;
    readonly verdict: RetireComparisonVerdict;
}

export function retireComparison(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
    request: RetireComparisonRequest,
): RetireComparisonOutcome {
    if (account.kind === ReconstructedLiveKind.Live) {
        return notModeled(ValueUnavailableReason.LiveNotModeled);
    }
    const base = toSimInputs(account.plan, spec);
    const inputs: FromStateSimInputs = {
        ...base,
        start: startStateOf(base.plan, account),
    };
    const out = simulateFromState(inputs);
    const remainingDays = out.fromStateWindowDays;
    const {
        basis,
        replacementCumulativePayoutTrigger,
        replacementLiveTransfer,
        slotRatePerDay,
    } = slotRateFor(request, spec);
    const cumulativePayoutTrigger = pricedCumulativeTriggerAssumptionOf(base);
    const liveTransfer = liveTransferAssumptionOf(
        base,
        out.liveTransferProbability,
    );
    const disclosures = {
        ...(liveTransfer !== undefined &&
            basis === RetireComparisonBasis.AverageRewardDp && {
                isSlotRateHazardFree: true as const,
            }),
        ...(cumulativePayoutTrigger !== undefined &&
            basis === RetireComparisonBasis.AverageRewardDp && {
                isSlotRateTriggerFree: true as const,
            }),
        ...(cumulativePayoutTrigger !== undefined && {
            cumulativePayoutTrigger,
        }),
        ...(liveTransfer !== undefined && { liveTransfer }),
        ...(replacementCumulativePayoutTrigger !== undefined && {
            replacementCumulativePayoutTrigger,
        }),
        ...(replacementLiveTransfer !== undefined && {
            replacementLiveTransfer,
        }),
    };
    const switchCost =
        request.replacementPlan.retryFee() +
        spec.enginePolicy.rebuyLagDays * slotRatePerDay.value;
    if (remainingDays <= 0) {
        return {
            basis,
            ...disclosures,
            keepRate: { standardError: null, value: 0 },
            reason: RetireComparisonReason.NoRemainingHorizon,
            remainingDays,
            switchCost,
            switchRate: { standardError: null, value: 0 },
            verdict: RetireComparisonVerdict.Keep,
        };
    }
    const keepRate: UncertainValue = {
        standardError:
            out.estimates.fromStateExpectedCash.standardError === null
                ? null
                : out.estimates.fromStateExpectedCash.standardError /
                  remainingDays,
        value: out.fromStateExpectedCash / remainingDays,
    };
    const switchRateSensitivity = Math.abs(
        1 - spec.enginePolicy.rebuyLagDays / remainingDays,
    );
    const switchRate: UncertainValue = {
        standardError:
            slotRatePerDay.standardError === null
                ? null
                : slotRatePerDay.standardError * switchRateSensitivity,
        value: slotRatePerDay.value - switchCost / remainingDays,
    };

    const comparison = noiseVerdict(switchRate, keepRate, {
        sharedSeed: false,
    });
    const isSwitchAhead =
        isBeyondNoise(switchRate, keepRate, { sharedSeed: false }) &&
        switchRate.value > keepRate.value;
    const verdict =
        isSwitchAhead && request.isCapacityBound
            ? RetireComparisonVerdict.SwitchBeatsKeep
            : RetireComparisonVerdict.Keep;
    const reason = reasonFor(verdict, comparison, isSwitchAhead);

    return {
        basis,
        ...disclosures,
        keepRate,
        reason,
        remainingDays,
        switchCost,
        switchRate,
        verdict,
    };
}

function reasonFor(
    verdict: RetireComparisonVerdict,
    comparison: NoiseVerdict,
    isSwitchAhead: boolean,
): null | RetireComparisonReason {
    if (verdict === RetireComparisonVerdict.SwitchBeatsKeep) return null;
    switch (comparison) {
        case NoiseVerdict.BeyondNoise: {
            return isSwitchAhead
                ? RetireComparisonReason.NotCapacityBound
                : RetireComparisonReason.SwitchBehind;
        }
        case NoiseVerdict.Unknown: {
            return RetireComparisonReason.Unknown;
        }
        case NoiseVerdict.WithinNoise: {
            return RetireComparisonReason.WithinNoise;
        }
    }
}

function slotRateFor(
    request: RetireComparisonRequest,
    spec: DocumentedPolicySpec,
): {
    basis: RetireComparisonBasis;
    replacementCumulativePayoutTrigger?: CumulativePayoutTriggerAssumption;
    replacementLiveTransfer?: LiveTransferHazardAssumption;
    slotRatePerDay: UncertainValue;
} {
    if (request.validatedSlotRate !== undefined) {
        return {
            basis: RetireComparisonBasis.AverageRewardDp,
            slotRatePerDay: request.validatedSlotRate,
        };
    }
    const replacementInputs = toSimInputs(request.replacementPlan, spec);
    const freshOutputs = simulate(replacementInputs);
    const replacementLiveTransfer = liveTransferAssumptionOf(
        replacementInputs,
        freshOutputs.liveTransferProbability,
    );
    const replacementCumulativePayoutTrigger =
        pricedCumulativeTriggerAssumptionOf(replacementInputs);
    return {
        basis: RetireComparisonBasis.Simulator,
        ...(replacementCumulativePayoutTrigger !== undefined && {
            replacementCumulativePayoutTrigger,
        }),
        ...(replacementLiveTransfer !== undefined && {
            replacementLiveTransfer,
        }),
        slotRatePerDay: {
            standardError:
                freshOutputs.estimates.expectedMonthlyNet.standardError /
                TRADING_DAYS_PER_MONTH,
            value: freshOutputs.expectedMonthlyNet / TRADING_DAYS_PER_MONTH,
        },
    };
}
