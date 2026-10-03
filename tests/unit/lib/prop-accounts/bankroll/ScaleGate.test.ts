import { describe, expect, it } from 'vitest';

import {
    scaleGateFromLedger,
    type ScaleGateInputs,
    scaleGateOf,
    ScaleGateStatus,
    ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    FeeKind,
    usdCents,
} from '~/lib/prop-accounts/core';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    payout,
    purchased,
} from '../metrics/ledgerFixtures';

const NO_THRESHOLDS: SampleThresholds = {
    minClosedRounds: null,
    minEndedAccounts: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

const THRESHOLDS: SampleThresholds = {
    minClosedRounds: null,
    minEndedAccounts: null,
    minEvalAttempts: 5,
    minFundedAccounts: 2,
    minTrades: 30,
};

const BASE: ScaleGateInputs = {
    cohortMultiple: { interval: { lower: 1, upper: 3 }, n: 10, value: 2 },
    evalAttempts: 10,
    fundedAccounts: 5,
    pooledNetPerSlot: {
        standardError: usdCents(500),
        value: usdCents(5000),
    },
    thresholds: THRESHOLDS,
    trades: 100,
};

describe('scaleGateOf', () => {
    it('is ThresholdsNotSet when any sample threshold is null', () => {
        const result = scaleGateOf({ ...BASE, thresholds: NO_THRESHOLDS });
        expect(result).toEqual({
            status: ScaleGateStatus.ThresholdsNotSet,
            unmetConditions: [],
        });
    });

    it('is NotEnoughSample when a sample count is below its threshold', () => {
        const result = scaleGateOf({ ...BASE, evalAttempts: 3 });
        expect(result.status).toBe(ScaleGateStatus.NotEnoughSample);
        expect(result.unmetConditions).toEqual([
            ScaleGateUnmetCondition.EvalAttemptsBelowThreshold,
        ]);
    });

    it('is NotPositiveAfterCost when the pooled net is not beyond noise or the cohort multiple is not above 1', () => {
        const noNet = scaleGateOf({ ...BASE, pooledNetPerSlot: null });
        expect(noNet.status).toBe(ScaleGateStatus.NotPositiveAfterCost);
        expect(noNet.unmetConditions).toContain(
            ScaleGateUnmetCondition.PooledNetNotBeyondNoise,
        );

        const belowOne = scaleGateOf({
            ...BASE,
            cohortMultiple: {
                interval: { lower: 0, upper: 1 },
                n: 10,
                value: 0.8,
            },
        });
        expect(belowOne.status).toBe(ScaleGateStatus.NotPositiveAfterCost);
        expect(belowOne.unmetConditions).toEqual([
            ScaleGateUnmetCondition.CohortMultipleNotAboveOne,
        ]);
    });

    it('is Ready when every condition passes', () => {
        expect(scaleGateOf(BASE)).toEqual({
            status: ScaleGateStatus.Ready,
            unmetConditions: [],
        });
    });

    it('never lets a first payout alone pass, even with trivial thresholds', () => {
        const trivialThresholds: SampleThresholds = {
            minClosedRounds: null,
            minEndedAccounts: null,
            minEvalAttempts: 1,
            minFundedAccounts: 1,
            minTrades: 1,
        };
        const result = scaleGateOf({
            cohortMultiple: {
                interval: { lower: 2, upper: 2 },
                n: 1,
                value: 2,
            },
            evalAttempts: 1,
            fundedAccounts: 1,
            pooledNetPerSlot: { standardError: null, value: usdCents(5000) },
            thresholds: trivialThresholds,
            trades: 1,
        });
        expect(result.status).not.toBe(ScaleGateStatus.Ready);
        expect(result.unmetConditions).toContain(
            ScaleGateUnmetCondition.PooledNetNotBeyondNoise,
        );
    });

    it('never lets a single ended account drive the cohort multiple to Ready, even with a beyond-noise pooled net', () => {
        const result = scaleGateOf({
            ...BASE,
            cohortMultiple: {
                interval: { lower: 0.1, upper: 10 },
                n: 1,
                value: 2,
            },
        });
        expect(result.status).not.toBe(ScaleGateStatus.Ready);
        expect(result.unmetConditions).toContain(
            ScaleGateUnmetCondition.CohortSampleBelowThreshold,
        );
    });
});

describe('scaleGateFromLedger', () => {
    it('is ThresholdsNotSet for an empty ledger', () => {
        const result = scaleGateFromLedger(
            ledger({}),
            '2026-10-01',
            NO_THRESHOLDS,
            0,
        );
        expect(result.status).toBe(ScaleGateStatus.ThresholdsNotSet);
    });

    it('counts a ledger-only account as one eval attempt, the same rule as every other attempts figure', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const ledgerOnlyAccount = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const built = ledger({
            accounts: [funded, ledgerOnlyAccount],
            events: [
                purchased(funded),
                event(funded, AccountEventKind.EvalPassed, '2026-09-10'),
                purchased(ledgerOnlyAccount),
                event(
                    ledgerOnlyAccount,
                    AccountEventKind.EvalPassed,
                    '2026-09-05',
                ),
            ],
            fees: [fee(funded, FeeKind.EvalPurchase, 10_000, '2026-09-01')],
            payouts: [payout(funded, 60_000, { paidOn: '2026-09-20' })],
        });
        const thresholds = {
            minClosedRounds: null,
            minEndedAccounts: null,
            minEvalAttempts: 2,
            minFundedAccounts: 1,
            minTrades: 5,
        };
        expect(
            scaleGateFromLedger(built, '2026-10-01', thresholds, 5)
                .unmetConditions,
        ).not.toContain(ScaleGateUnmetCondition.EvalAttemptsBelowThreshold);
        expect(
            scaleGateFromLedger(
                built,
                '2026-10-01',
                { ...thresholds, minEvalAttempts: 3 },
                5,
            ).unmetConditions,
        ).toContain(ScaleGateUnmetCondition.EvalAttemptsBelowThreshold);
    });
});
