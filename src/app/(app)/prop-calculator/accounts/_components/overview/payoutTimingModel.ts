import { NOT_APPLICABLE } from '~/lib/format';
import {
    compareText,
    sampleAdequacy,
    SampleKind,
    type SampleLevel,
} from '~/lib/prop-accounts/core';
import {
    type PayoutTiming,
    type PlanPayoutTiming,
    type SampledEstimate,
} from '~/lib/prop-accounts/metrics';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

export interface PayoutTimingCardModel {
    readonly explanation: string;
    readonly rows: readonly PayoutTimingRow[];
}

export interface PayoutTimingFigure {
    readonly mean: string;
    readonly n: number;
    readonly sampleLevel: null | SampleLevel;
    readonly standardError: string;
}

export interface PayoutTimingRow {
    readonly betweenPayouts: PayoutTimingFigure;
    readonly key: string;
    readonly plan: string;
    readonly toFirstPayout: PayoutTimingFigure;
    readonly unpaidNote: null | string;
}

interface PlanNames {
    of(planSerial: string): string;
}

const PAYOUT_TIMING_EXPLANATION =
    'Days from funded to the first payout, against days between later payouts, per plan. Accounts that have not paid yet are left out of the first payout mean.';

export function payoutTimingCardOf(
    timing: PayoutTiming,
    names: PlanNames,
    thresholds: SampleThresholds,
): PayoutTimingCardModel {
    return {
        explanation: PAYOUT_TIMING_EXPLANATION,
        rows: timing.perPlan
            .map((plan) => payoutTimingRow(plan, names, thresholds))
            .toSorted((a, b) => compareText(a.plan, b.plan)),
    };
}

function days(value: number): string {
    return `${value.toFixed(1)} days`;
}

function endedSentenceOf(plan: PlanPayoutTiming): null | string {
    if (plan.endedWithoutPayout === 0) return null;
    const account =
        plan.endedWithoutPayout === 1 ? 'account' : 'accounts';
    return `${String(plan.endedWithoutPayout)} funded ${account} ended without a payout, not in the mean`;
}

function figureOf(
    estimate: null | SampledEstimate,
    thresholds: SampleThresholds,
): PayoutTimingFigure {
    const n = estimate?.n ?? 0;
    const standardError = estimate?.standardError ?? null;
    return {
        mean: estimate === null ? NOT_APPLICABLE : days(estimate.value),
        n,
        sampleLevel: sampleAdequacy(SampleKind.FundedAccounts, n, thresholds),
        standardError:
            standardError === null ? NOT_APPLICABLE : days(standardError),
    };
}

function payoutTimingRow(
    plan: PlanPayoutTiming,
    names: PlanNames,
    thresholds: SampleThresholds,
): PayoutTimingRow {
    return {
        betweenPayouts: figureOf(plan.betweenPayouts, thresholds),
        key: plan.planSerial,
        plan: names.of(plan.planSerial),
        toFirstPayout: figureOf(plan.toFirstPayout, thresholds),
        unpaidNote: unpaidNoteOf(plan),
    };
}

function unpaidNoteOf(plan: PlanPayoutTiming): null | string {
    const sentences = [waitingSentenceOf(plan), endedSentenceOf(plan)].flatMap(
        (sentence) => (sentence === null ? [] : [sentence]),
    );
    return sentences.length === 0 ? null : sentences.join('. ');
}

function waitingSentenceOf(plan: PlanPayoutTiming): null | string {
    if (plan.fundedWithoutPayout === 0 || plan.oldestUnpaidDays === null) {
        return null;
    }
    const isSingular = plan.fundedWithoutPayout === 1;
    const account = isSingular ? 'account has' : 'accounts have';
    const day = plan.oldestUnpaidDays === 1 ? 'day' : 'days';
    return `${String(plan.fundedWithoutPayout)} funded ${account} not paid yet (oldest ${String(plan.oldestUnpaidDays)} ${day}), not in the mean`;
}
