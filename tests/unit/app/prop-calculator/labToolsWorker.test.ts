import { afterAll, describe, expect, it, vi } from 'vitest';

import { computeToolsResult } from '~/app/(app)/prop-calculator/_workers/toolsWorker';
import {
    type LabRunInputs,
    type LabScenarioInputs,
    parseToolsRequest,
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import * as propCalculator from '~/lib/prop-calculator';
import {
    CorrelationMode,
    DayStopRuleKind,
    FirmId,
    LiveTransferContinuationKind,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

const simulations = vi.spyOn(propCalculator, 'simulatePortfolio');

const MFFU_PRO_50K_SERIAL = serializePlanId({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});

const defaultRun: LabRunInputs = {
    activationDiscountPercent: 0,
    commissionPerRoundTrip: 0,
    discountPercent: 0,
    fundedHorizonDays: 60,
    linkActivationDiscount: false,
    maxEvalDays: 30,
    monthlySubscriptionDiscountPercent: 0,
    plan: {
        firmId: FirmId.Mffu,
        optIns: {
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        },
        planSerial: MFFU_PRO_50K_SERIAL,
    },
    resetDiscountPercent: 0,
    seed: 7,
};

const defaultScenario: LabScenarioInputs = {
    accounts: 1,
    correlation: CorrelationMode.Copy,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 1,
    instrument: null,
    riskPerTrade: 250,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 1,
    winrate: 0.55,
};

function labRequest(
    seed: number,
    {
        run = {},
        runId = 1,
        scenario = {},
    }: {
        run?: Partial<LabRunInputs>;
        runId?: number;
        scenario?: Partial<LabScenarioInputs>;
    } = {},
) {
    return {
        kind: ToolsRequestKind.Lab,
        run: { ...defaultRun, ...run, seed },
        runId,
        scenario: { ...defaultScenario, ...scenario },
    };
}

function labResult(request: ReturnType<typeof labRequest>) {
    const result = computeToolsResult(request);
    if (result.kind !== ToolsResponseKind.Lab) {
        throw new Error(
            `expected a lab result, got ${result.kind}: ${JSON.stringify(result)}`,
        );
    }
    return result;
}

function measured<T>(action: () => T): { calls: number; value: T } {
    const before = simulations.mock.calls.length;
    const value = action();
    return { calls: simulations.mock.calls.length - before, value };
}

afterAll(() => {
    simulations.mockRestore();
});

describe('the tools worker answers a lab request (PT-73e)', () => {
    it('returns the portfolio result for one scenario with its theoretical pass probability and no baseline without a hazard', () => {
        const result = labResult(labRequest(9001));

        expect(result.runId).toBe(1);
        expect(result.result.noTransferMonthlyNet).toBeNull();
        expect(result.result.liveTransferContinuation).toBe(
            LiveTransferContinuationKind.Off,
        );
        expect(result.result.theoreticalPassProb).toBeGreaterThan(0);
        expect(result.result.theoreticalPassReason).toBeUndefined();
        expect(result.result.accountsPassDistribution).toHaveLength(2);
        expect(result.result.lifetimeCapPoolingGap).toBeNull();
    });

    it('is deterministic for one request', () => {
        expect(labResult(labRequest(9002)).result).toStrictEqual(
            labResult(labRequest(9002)).result,
        );
    });

    it('discloses the per-user lifetime cap pooling on a multi-account scenario', () => {
        const pooled = labResult(
            labRequest(9003, { scenario: { accounts: 2 } }),
        );

        expect(pooled.result.lifetimeCapPoolingGap).toContain(
            'lifetime cap is per user',
        );
    });

    it('names the reason for a missing theoretical pass probability instead of a number', () => {
        const unrepresentable = labResult(
            labRequest(9004, { scenario: { rrRatio: 1.333 } }),
        );
        const invalid = labResult(
            labRequest(9005, { scenario: { riskPerTrade: 0 } }),
        );

        expect(unrepresentable.result.theoreticalPassProb).toBeUndefined();
        expect(unrepresentable.result.theoreticalPassReason).toBe(
            EconomicsReason.UnsupportedRatio,
        );
        expect(invalid.result.theoreticalPassReason).toBe(
            EconomicsReason.InvalidInput,
        );
    });

    it('fails with the plan reason for a plan the registry does not hold', () => {
        const result = computeToolsResult(
            labRequest(9006, {
                run: {
                    plan: { ...defaultRun.plan, planSerial: 'no-such-plan' },
                },
            }),
        );

        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });

    it('accepts a hazard inside 0 to 1 and refuses one outside it at the request boundary', () => {
        expect(
            parseToolsRequest(
                labRequest(9007, { run: { liveTransferHazard: 0.5 } }),
            ),
        ).toMatchObject({ run: { liveTransferHazard: 0.5 } });
        expect(() =>
            parseToolsRequest(
                labRequest(9007, { run: { liveTransferHazard: 1.5 } }),
            ),
        ).toThrow();
    });
});

describe('the tools worker simulates the hazard-0 baseline once per scenario (PT-73e)', () => {
    it('costs two simulations the first time a hazard is priced and one for every later hazard edit', () => {
        const priced = measured(() =>
            labResult(labRequest(9101, { run: { liveTransferHazard: 0.5 } })),
        );
        const edited = measured(() =>
            labResult(labRequest(9101, { run: { liveTransferHazard: 0.7 } })),
        );

        expect(priced.calls).toBe(2);
        expect(edited.calls).toBe(1);
        expect(priced.value.result.noTransferMonthlyNet).not.toBeNull();
        expect(edited.value.result.noTransferMonthlyNet).toBe(
            priced.value.result.noTransferMonthlyNet,
        );
    });

    it('takes the baseline from an unpriced run of the same scenario with no extra simulation', () => {
        const unpriced = labResult(labRequest(9102));
        const priced = measured(() =>
            labResult(labRequest(9102, { run: { liveTransferHazard: 0.5 } })),
        );

        expect(priced.calls).toBe(1);
        expect(priced.value.result.noTransferMonthlyNet).toBe(
            unpriced.result.expectedMonthlyNet,
        );
    });

    it('does not reuse a baseline across a different scenario input', () => {
        const run = { liveTransferHazard: 0.5 };
        labResult(labRequest(9103, { run }));

        const other = measured(() =>
            labResult(labRequest(9103, { run, scenario: { winrate: 0.6 } })),
        );

        expect(other.calls).toBe(2);
    });

    it('does not reuse a baseline across a different run input', () => {
        const run = { liveTransferHazard: 0.5 };
        labResult(labRequest(9104, { run }));

        const other = measured(() =>
            labResult(
                labRequest(9104, { run: { ...run, fundedHorizonDays: 90 } }),
            ),
        );

        expect(other.calls).toBe(2);
    });
});
