import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type FundedOptimizerCalculatorInputs,
    fundedOptimizerRequest,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { runFundedSweepTask } from '~/app/(app)/prop-calculator/_workers/fundedSweepWorker';
import {
    clampFundedSweepTrials,
    fundedSweepCacheKey,
    type FundedSweepProgress,
    type FundedSweepRequest,
    type FundedSweepResult,
    MAX_FUNDED_SWEEP_TRIALS,
} from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import {
    DayStopRuleKind,
    findFirm,
    FirmId,
    InstrumentSymbol,
    PayoutRequestPolicy,
    PolicySizing,
    RungSizing,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    DEFAULT_RULEBOOK,
} from '~/lib/prop-calculator/advisor';
import { type Plan, TopStepVariant } from '~/lib/prop-calculator/core';
import { FundedCandidateBuildKind } from '~/lib/prop-calculator/optimize';

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

const TOPSTEP_50K = requirePlan(
    findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

function baseInputs(): FundedOptimizerCalculatorInputs {
    const state = defaultCalculatorState();
    return { ...state, plan: TOPSTEP_50K };
}

function request(
    overrides: Partial<FundedOptimizerCalculatorInputs> = {},
): FundedSweepRequest {
    return fundedOptimizerRequest(
        { ...baseInputs(), ...overrides },
        DEFAULT_RULEBOOK,
    );
}

describe('FundedSweepRequest wire safety', () => {
    it('survives structuredClone: no Plan instance, only its serial and opt-ins', () => {
        const built = request();
        expect(() => structuredClone(built)).not.toThrow();
        expect(built).not.toHaveProperty('plan');
        expect(typeof built.planSerial).toBe('string');
        expect(built.optIns).toEqual({
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        });
    });

    it('carries the full EnginePolicy', () => {
        const built = request();
        expect(built.policy.retainedCushionRequest).not.toBeNull();
        expect(built.policy.lifetimePayoutCapBasis).toBeDefined();
        expect(built.policy.rebuyLagBasis).toBeDefined();
    });

    it('never sends a $0 retained cushion for a TopStep request', () => {
        const built = request({ retainedCushion: null });
        expect(built.policy.retainedCushionRequest).toBe(2000);
    });
});

describe('fundedSweepCacheKey', () => {
    it('changes with the retained cushion', () => {
        const a = fundedSweepCacheKey(request({ retainedCushion: 2000 }));
        const b = fundedSweepCacheKey(request({ retainedCushion: 3000 }));
        expect(a).not.toBe(b);
    });

    it('changes with the effective payout request', () => {
        const a = fundedSweepCacheKey(request({ payoutRequestSize: 500 }));
        const b = fundedSweepCacheKey(request({ payoutRequestSize: 750 }));
        expect(a).not.toBe(b);
    });

    it('changes with the instrument and stop', () => {
        const a = fundedSweepCacheKey(
            request({ instrument: InstrumentSymbol.NQ, stopPoints: 7.5 }),
        );
        const b = fundedSweepCacheKey(
            request({ instrument: InstrumentSymbol.ES, stopPoints: 7.5 }),
        );
        const c = fundedSweepCacheKey(
            request({ instrument: InstrumentSymbol.NQ, stopPoints: 10 }),
        );
        expect(a).not.toBe(b);
        expect(a).not.toBe(c);
    });

    it('changes with trials and seed', () => {
        const a = fundedSweepCacheKey(request({ trials: 500 }));
        const b = fundedSweepCacheKey(request({ trials: 800 }));
        const c = fundedSweepCacheKey(request({ seed: 1 }));
        const d = fundedSweepCacheKey(request({ seed: 2 }));
        expect(a).not.toBe(b);
        expect(c).not.toBe(d);
    });

    it('is stable for the same request', () => {
        const built = request();
        expect(fundedSweepCacheKey(built)).toBe(fundedSweepCacheKey(built));
    });

    it('changes with risk per trade', () => {
        const a = fundedSweepCacheKey(request({ riskDollars: 250 }));
        const b = fundedSweepCacheKey(request({ riskDollars: 400 }));
        expect(a).not.toBe(b);
    });

    it('changes with winrate', () => {
        const a = fundedSweepCacheKey(request({ winrate: 0.4 }));
        const b = fundedSweepCacheKey(request({ winrate: 0.55 }));
        expect(a).not.toBe(b);
    });

    it('changes with the reward-to-risk ratio', () => {
        const a = fundedSweepCacheKey(request({ rrRatio: 2 }));
        const b = fundedSweepCacheKey(request({ rrRatio: 3 }));
        expect(a).not.toBe(b);
    });

    it('changes with trades per day', () => {
        const a = fundedSweepCacheKey(request({ tradesPerDay: 1 }));
        const b = fundedSweepCacheKey(request({ tradesPerDay: 4 }));
        expect(a).not.toBe(b);
    });

    it('changes with the commission per round trip', () => {
        const a = fundedSweepCacheKey(request({ commissionPerRoundTrip: 0 }));
        const b = fundedSweepCacheKey(request({ commissionPerRoundTrip: 5 }));
        expect(a).not.toBe(b);
    });

    it('changes with the idle-day probability', () => {
        const a = fundedSweepCacheKey(request({ idleDayProbability: 0 }));
        const b = fundedSweepCacheKey(request({ idleDayProbability: 0.2 }));
        expect(a).not.toBe(b);
    });

    it('changes with max attempts and max eval days', () => {
        const a = fundedSweepCacheKey(request({ maxAttempts: 1 }));
        const b = fundedSweepCacheKey(request({ maxAttempts: 3 }));
        const c = fundedSweepCacheKey(request({ maxEvalDays: 60 }));
        const d = fundedSweepCacheKey(request({ maxEvalDays: 30 }));
        expect(a).not.toBe(b);
        expect(c).not.toBe(d);
    });

    it('changes with copy accounts', () => {
        const a = fundedSweepCacheKey(request({ copyAccounts: 1 }));
        const b = fundedSweepCacheKey(request({ copyAccounts: 2 }));
        expect(a).not.toBe(b);
    });

    it('changes with the day-stop rule', () => {
        const a = fundedSweepCacheKey(
            request({ dayStop: { kind: DayStopRuleKind.None } }),
        );
        const b = fundedSweepCacheKey(
            request({ dayStop: { kind: DayStopRuleKind.DayGreen } }),
        );
        expect(a).not.toBe(b);
    });
});

describe('fundedSweepCacheKey carries every input the sweep now honors (F-27 (1), (2))', () => {
    it('changes with each coupon discount', () => {
        const none = fundedSweepCacheKey(request());
        for (const patch of [
            { evalDiscountPercent: 20 },
            { activationDiscountPercent: 20 },
            { monthlySubscriptionDiscountPercent: 20 },
            { resetDiscountPercent: 20 },
        ]) {
            expect(fundedSweepCacheKey(request(patch))).not.toBe(none);
        }
    });

    it('changes with the rung sizing, the live-transfer hazard and the applied eval ladder', () => {
        const none = fundedSweepCacheKey(request());
        expect(
            fundedSweepCacheKey(
                request({ rungSizing: RungSizing.SkipIfUnaffordable }),
            ),
        ).not.toBe(none);
        expect(
            fundedSweepCacheKey(request({ liveTransferHazard: 0.25 })),
        ).not.toBe(none);
        expect(
            fundedSweepCacheKey(
                request({
                    evalDayPolicy: {
                        ladder: [300, 500],
                        maxLossesPerDay: null,
                        sizing: PolicySizing.ContractCapped,
                        stopRule: { kind: DayStopRuleKind.DayGreen },
                    },
                }),
            ),
        ).not.toBe(none);
    });
});

describe('the funded sweep worker streams one Progress event per candidate (F-27 (10))', () => {
    type Posted = WorkerTaskMessage<FundedSweepProgress, FundedSweepResult>;

    function runTask(
        built: FundedSweepRequest,
        runId: number,
    ): Posted[] {
        const posted: Posted[] = [];
        runFundedSweepTask({ request: built, runId }, (message) => {
            posted.push(message);
        });
        return posted;
    }

    it('posts Progress for every candidate in order, then Done, all under the run id', () => {
        const posted = runTask(request({ trials: 10 }), 4);
        const done = posted.at(-1);
        if (done?.kind !== WorkerTaskEventKind.Done) {
            throw new Error('expected Done last');
        }
        if (done.result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        const total = done.result.rows.length;
        const progress = posted.slice(0, -1);
        expect(progress.every((m) => m.runId === 4 && done.runId === 4)).toBe(
            true,
        );
        expect(
            progress.map((message) =>
                message.kind === WorkerTaskEventKind.Progress
                    ? message.progress
                    : null,
            ),
        ).toStrictEqual(
            Array.from({ length: total }, (_, index) => ({
                completed: index + 1,
                total,
            })),
        );
    });

    it('posts Failed for a request whose plan does not resolve', () => {
        const posted = runTask({ ...request(), planSerial: 'no-such-plan' }, 9);
        expect(posted).toHaveLength(1);
        expect(posted[0]).toMatchObject({
            kind: WorkerTaskEventKind.Failed,
            runId: 9,
        });
    });
});

describe('clampFundedSweepTrials', () => {
    it('passes trials through under the maximum', () => {
        expect(clampFundedSweepTrials(500)).toBe(500);
    });

    it('clamps to the stated maximum', () => {
        expect(clampFundedSweepTrials(999_999)).toBe(MAX_FUNDED_SWEEP_TRIALS);
    });
});

describe('the effective payout request policy', () => {
    it('runs every engine sim under FullRequestOnly, regardless of the base policy', () => {
        const built = request();
        const simInputs = applyEnginePolicy(TOPSTEP_50K, built.policy, {
            ...built.base,
            plan: TOPSTEP_50K,
        });
        expect(simInputs.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
    });
});
