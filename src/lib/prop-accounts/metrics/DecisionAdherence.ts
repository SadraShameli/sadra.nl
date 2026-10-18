import { type UsdCents } from '~/lib/prop-accounts/core';

export const ADHERENCE_STEP_REASON =
    'one rounding step, because a decision records no stop';

export interface AdherenceDecision {
    readonly acceptedRiskCents: UsdCents;
    readonly accountId: string;
    readonly actualRiskCents: null | UsdCents;
    readonly decidedOn: string;
}

export interface DecisionAdherence {
    readonly followed: number;
    readonly measured: number;
    readonly notRecorded: number;
    readonly rate: null | number;
    readonly total: number;
}

export function decisionAdherenceOf(
    decisions: readonly AdherenceDecision[],
    stepCents: number,
): DecisionAdherence {
    const verdicts = decisions.map((decision) =>
        isDecisionFollowed(decision, stepCents),
    );
    const measured = verdicts.filter((verdict) => verdict !== null).length;
    const followed = verdicts.filter((verdict) => verdict === true).length;
    return {
        followed,
        measured,
        notRecorded: decisions.length - measured,
        rate: measured === 0 ? null : followed / measured,
        total: decisions.length,
    };
}

export function isDecisionFollowed(
    decision: AdherenceDecision,
    stepCents: number,
): boolean | null {
    if (!Number.isFinite(stepCents) || stepCents < 0) {
        throw new RangeError(
            `the adherence step must be a non-negative number of cents, got ${String(stepCents)}`,
        );
    }
    return decision.actualRiskCents === null
        ? null
        : Math.abs(decision.actualRiskCents - decision.acceptedRiskCents) <=
              stepCents;
}
