import { describe, expect, it } from 'vitest';

import {
    payoutOutlookCacheKey,
    payoutOutlookPlan,
    type PayoutOutlookRequest,
    payoutSweepCacheKey,
    payoutSweepPlan,
    type PayoutSweepRequest,
} from '~/app/(app)/prop-calculator/_workers/payoutSweepWorkerMessages';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    PAYOUT_SIZE_SWEEP_GRID,
    PayoutSizeSweepResultKind,
    type RulebookParameters,
    runPayoutSizeSweep,
} from '~/lib/prop-calculator/advisor';
import { type Plan, TopStepVariant } from '~/lib/prop-calculator/core';

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

function outlookRequest(
    overrides: Partial<PayoutOutlookRequest> = {},
): PayoutOutlookRequest {
    return {
        asOf: '2026-06-01',
        balance: TOPSTEP_50K.accountSize + 15_000,
        firmId: FirmId.TopStep,
        floorAtLastPayout: null,
        isEligible: true,
        lastPayoutOn: null,
        payoutsTaken: 0,
        peak: null,
        planSerial: serializePlanId(TOPSTEP_50K.id),
        qualifyingDaysSinceLastPayout: 10,
        requestSize: 750,
        spec: specFor(2000),
        ...overrides,
    };
}

function request(
    overrides: Partial<PayoutSweepRequest> = {},
): PayoutSweepRequest {
    return {
        firmId: FirmId.TopStep,
        personalOverrideRequest: null,
        planSerial: serializePlanId(TOPSTEP_50K.id),
        spec: specFor(2000),
        ...overrides,
    };
}

function specFor(
    retainedCushionRequest: number,
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 90,
        plan: TOPSTEP_50K,
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        enginePolicy: { ...policy, retainedCushionRequest },
        rulebook,
        run: { maxEvalDays: 150, seed: 42, trials: 500 },
    };
}

const RULEBOOK_VARIANTS: readonly (readonly [string, RulebookParameters])[] = [
    [
        'strategy win rate',
        {
            ...DEFAULT_RULEBOOK,
            strategy: {
                ...DEFAULT_RULEBOOK.strategy,
                winrate: DEFAULT_RULEBOOK.strategy.winrate + 0.05,
            },
        },
    ],
    [
        'strategy reward to risk',
        {
            ...DEFAULT_RULEBOOK,
            strategy: {
                ...DEFAULT_RULEBOOK.strategy,
                rr: DEFAULT_RULEBOOK.strategy.rr + 0.5,
            },
        },
    ],
    [
        'funded trades a day',
        {
            ...DEFAULT_RULEBOOK,
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                tradesPerDayMax: DEFAULT_RULEBOOK.funded.tradesPerDayMax + 1,
            },
        },
    ],
    [
        'eval sizing mode fields',
        {
            ...DEFAULT_RULEBOOK,
            eval: {
                ...DEFAULT_RULEBOOK.eval,
                maxRiskDailyCapMultiple:
                    DEFAULT_RULEBOOK.eval.maxRiskDailyCapMultiple + 0.25,
            },
        },
    ],
    [
        'execution trades per window',
        {
            ...DEFAULT_RULEBOOK,
            execution: {
                ...DEFAULT_RULEBOOK.execution,
                maxTradesPerWindow:
                    DEFAULT_RULEBOOK.execution.maxTradesPerWindow + 1,
            },
        },
    ],
];

describe('PayoutSweepRequest wire safety', () => {
    it('survives structuredClone: no Plan instance anywhere in the request', () => {
        const built = request();
        expect(() => structuredClone(built)).not.toThrow();
        expect(built).not.toHaveProperty('plan');
        expect(typeof built.planSerial).toBe('string');
    });

    it('carries the full EnginePolicy (retained cushion, lifetime cap basis)', () => {
        const built = request();
        expect(built.spec.enginePolicy.retainedCushionRequest).not.toBeNull();
        expect(built.spec.enginePolicy.lifetimePayoutCapBasis).toBeDefined();
    });
});

describe('payoutSweepPlan', () => {
    it('resolves the plan by firm id and serial', () => {
        expect(payoutSweepPlan(request())).toBe(TOPSTEP_50K);
    });

    it('gives null for an unknown serial', () => {
        expect(
            payoutSweepPlan(request({ planSerial: 'not-a-real-plan' })),
        ).toBeNull();
    });
});

describe('payoutSweepCacheKey', () => {
    it('is stable for the same request', () => {
        const built = request();
        expect(payoutSweepCacheKey(built)).toBe(payoutSweepCacheKey(built));
    });

    it('changes with the retained cushion (keyed by the EnginePolicy)', () => {
        const a = payoutSweepCacheKey(request({ spec: specFor(2000) }));
        const b = payoutSweepCacheKey(request({ spec: specFor(3000) }));
        expect(a).not.toBe(b);
    });

    it('changes with the plan serial', () => {
        const a = payoutSweepCacheKey(request());
        const b = payoutSweepCacheKey(
            request({ planSerial: 'a-different-plan-serial' }),
        );
        expect(a).not.toBe(b);
    });

    it('changes with the personal override request', () => {
        const a = payoutSweepCacheKey(
            request({ personalOverrideRequest: null }),
        );
        const b = payoutSweepCacheKey(
            request({ personalOverrideRequest: 750 }),
        );
        expect(a).not.toBe(b);
    });
});

describe('the sweep runs over PAYOUT_SIZE_SWEEP_GRID under the full EnginePolicy', () => {
    it('produces one row per distinct effective request size on the grid', () => {
        const result = runPayoutSizeSweep(TOPSTEP_50K, {
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(2000),
        });
        expect(result.kind).toBe(PayoutSizeSweepResultKind.Optimum);
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) return;
        const distinctEffectiveSizes = new Set(
            PAYOUT_SIZE_SWEEP_GRID.map((size) => size),
        );
        expect(result.optimum.rows.length).toBeGreaterThan(0);
        expect(result.optimum.rows.length).toBeLessThanOrEqual(
            distinctEffectiveSizes.size,
        );
    });
});

describe('PayoutOutlookRequest wire safety (F-V19)', () => {
    it('survives structuredClone: no Plan instance anywhere in the request', () => {
        const built = outlookRequest();
        expect(() => structuredClone(built)).not.toThrow();
        expect(built).not.toHaveProperty('plan');
        expect(typeof built.planSerial).toBe('string');
    });
});

describe('payoutOutlookPlan', () => {
    it('resolves the plan by firm id and serial', () => {
        expect(payoutOutlookPlan(outlookRequest())).toBe(TOPSTEP_50K);
    });

    it('gives null for an unknown serial', () => {
        expect(
            payoutOutlookPlan(
                outlookRequest({ planSerial: 'not-a-real-plan' }),
            ),
        ).toBeNull();
    });
});

describe('payoutOutlookCacheKey', () => {
    it('is stable for the same request', () => {
        const built = outlookRequest();
        expect(payoutOutlookCacheKey(built)).toBe(payoutOutlookCacheKey(built));
    });

    it('changes with the account snapshot (balance)', () => {
        const a = payoutOutlookCacheKey(outlookRequest({ balance: 60_000 }));
        const b = payoutOutlookCacheKey(outlookRequest({ balance: 61_000 }));
        expect(a).not.toBe(b);
    });

    it('changes with eligibility (the stakeComparison is eligible-only)', () => {
        const a = payoutOutlookCacheKey(outlookRequest({ isEligible: true }));
        const b = payoutOutlookCacheKey(outlookRequest({ isEligible: false }));
        expect(a).not.toBe(b);
    });

    it('changes with the retained cushion (keyed by the EnginePolicy)', () => {
        const a = payoutOutlookCacheKey(
            outlookRequest({ spec: specFor(2000) }),
        );
        const b = payoutOutlookCacheKey(
            outlookRequest({ spec: specFor(3000) }),
        );
        expect(a).not.toBe(b);
    });
});

describe.each(RULEBOOK_VARIANTS)(
    'the worker-message keys hash the whole simulation-relevant rulebook: %s',
    (_name, variant) => {
        it('changes the sweep key when only the rulebook differs', () => {
            const a = payoutSweepCacheKey(request({ spec: specFor(2000) }));
            const b = payoutSweepCacheKey(
                request({ spec: specFor(2000, variant) }),
            );
            expect(a).not.toBe(b);
        });

        it('changes the outlook key when only the rulebook differs', () => {
            const a = payoutOutlookCacheKey(
                outlookRequest({ spec: specFor(2000) }),
            );
            const b = payoutOutlookCacheKey(
                outlookRequest({ spec: specFor(2000, variant) }),
            );
            expect(a).not.toBe(b);
        });
    },
);
