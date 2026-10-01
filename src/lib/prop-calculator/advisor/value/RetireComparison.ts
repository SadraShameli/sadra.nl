import {
    type DocumentedPolicySpec,
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
    readonly keepRate: UncertainValue;
    readonly reason: null | RetireComparisonReason;
    readonly remainingDays: number;
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
    const { basis, slotRatePerDay } = slotRateFor(request, spec);
    const switchCost =
        request.replacementPlan.retryFee() +
        spec.enginePolicy.rebuyLagDays * slotRatePerDay.value;
    if (remainingDays <= 0) {
        return {
            basis,
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
): { basis: RetireComparisonBasis; slotRatePerDay: UncertainValue } {
    if (request.validatedSlotRate !== undefined) {
        return {
            basis: RetireComparisonBasis.AverageRewardDp,
            slotRatePerDay: request.validatedSlotRate,
        };
    }
    const freshOutputs = simulate(toSimInputs(request.replacementPlan, spec));
    return {
        basis: RetireComparisonBasis.Simulator,
        slotRatePerDay: {
            standardError:
                freshOutputs.estimates.expectedMonthlyNet.standardError /
                TRADING_DAYS_PER_MONTH,
            value: freshOutputs.expectedMonthlyNet / TRADING_DAYS_PER_MONTH,
        },
    };
}
