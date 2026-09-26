import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    AlphaFuturesVariant,
    DEFAULT_PAYOUT_REQUEST_POLICY,
    dollars,
    effectivePayoutRequest,
    FirmId,
    type FundedCycleTracker,
    FundedNextVariant,
    type FundedPayoutOptions,
    LucidVariant,
    MffuVariant,
    minimumPayoutRequest,
    newFundedCycleTracker,
    PayoutEvaluationKind,
    PayoutGate,
    PayoutRequestPolicy,
    PayoutRequestPolicyError,
    payoutRequestSizeSchema,
    type Plan,
    type PlanId,
    profitShareMultiplier,
    serializePlanId,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { buildMffuRapidLivePlan } from '~/lib/prop-calculator/firms/mffu/MffuRapidLive';

const START = 50_000;
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const POLICY_MODULE = path.join(
    'src',
    'lib',
    'prop-calculator',
    'core',
    'PayoutRequestPolicy.ts',
);

function fullRequest(
    plan: Plan,
    state: AccountState,
    payoutRequestSize: number | undefined,
): FundedPayoutOptions {
    return {
        minRetainedCushion: 0,
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
        payoutRequestSize,
        plan,
        state,
    };
}

function funded(
    plan: Plan,
    profit: number,
    threshold: number,
): { state: AccountState; tracker: FundedCycleTracker } {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = START + profit;
    state.threshold = threshold;
    state.qualifyingDays = 99;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = START;
    tracker.qualifyingDaysAtLastPayout = 0;
    return { state, tracker };
}

function rapidEod(): Plan {
    return registryPlan({
        accountSize: START,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function topStep(): Plan {
    return registryPlan({
        accountSize: START,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
}

describe('minimumPayoutRequest: one minimum-request rule for the engine and the web (W4, PD-40)', () => {
    it('reads the plan minimum when the plan has no ladder (MFF Rapid EOD $500, MyFundedFutures.ts)', () => {
        const plan = rapidEod();
        expect(plan.payoutLadder).toBeNull();
        expect(minimumPayoutRequest(plan)).toBe(500);
    });

    it('lets the ladder minimum win over a different plan minimum on a withOverrides plan', () => {
        const plan = rapidEod().withOverrides({
            minPayoutRequest: dollars(250),
            payoutLadder: { minRequestAmount: dollars(400), steps: [1000] },
        });
        expect(plan.minPayoutRequest).toBe(250);
        expect(minimumPayoutRequest(plan)).toBe(400);
    });

    it('leaves no second copy of the rule anywhere in src', () => {
        const copies = readdirSync(path.join(REPO_ROOT, 'src'), {
            recursive: true,
        })
            .map(String)
            .filter((file) => /\.tsx?$/.test(file))
            .map((file) => path.join('src', file))
            .filter((file) => file !== POLICY_MODULE)
            .filter((file) =>
                /minRequestAmount\s*\?\?/.test(
                    readFileSync(path.join(REPO_ROOT, file), 'utf8'),
                ),
            );
        expect(copies).toStrictEqual([]);
    });

    it('reads a LivePlan minimum too (MFF Rapid Live $250, MffuRapidLive.ts)', () => {
        const live = buildMffuRapidLivePlan();
        expect(live.minPayoutRequest).toBe(250);
        expect(minimumPayoutRequest(live)).toBe(250);
    });
});

describe('effectivePayoutRequest raises a $500 request to the plan minimum, never lowers it (PD-40)', () => {
    it.each([
        {
            expected: 500,
            minimum: 125,
            plan: topStep,
            title: 'TopStep keeps $500 above its $125 minimum (TopStep.ts TOPSTEP_PAYOUT_POLICY)',
        },
        {
            expected: 500,
            minimum: 250,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.FundedNext,
                    variant: FundedNextVariant.Legacy,
                }),
            title: 'FundedNext Legacy keeps $500 above its $250 minimum (FundedNext.ts)',
        },
        {
            expected: 1000,
            minimum: 1000,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.Mffu,
                    variant: MffuVariant.Pro,
                }),
            title: 'MFF Pro raises $500 to its $1,000 minimum (MyFundedFutures.ts)',
        },
        {
            expected: 1000,
            minimum: 1000,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.Tradeify,
                    variant: TradeifyVariant.Lightning,
                }),
            title: 'Tradeify Lightning raises $500 to its $1,000 ladder minimum (Tradeify.ts)',
        },
        {
            expected: 1000,
            minimum: 1000,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.AlphaFutures,
                    variant: AlphaFuturesVariant.Advanced,
                }),
            title: 'AlphaFutures Advanced raises $500 to its $1,000 minimum (AlphaFutures.ts)',
        },
        {
            expected: 800,
            minimum: 800,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.FundedNext,
                    variant: FundedNextVariant.Fnl003,
                }),
            title: 'FundedNext FNL:003 raises $500 to its $800 minimum (FundedNext.ts FNL003_MIN_REQUEST)',
        },
    ])('$title', ({ expected, minimum, plan }) => {
        const target = plan();
        expect(minimumPayoutRequest(target)).toBe(minimum);
        expect(effectivePayoutRequest(target, 500)).toBe(expected);
    });

    it('raises a request on a LivePlan to its minimum', () => {
        expect(effectivePayoutRequest(buildMffuRapidLivePlan(), 100)).toBe(250);
        expect(effectivePayoutRequest(buildMffuRapidLivePlan(), 600)).toBe(600);
    });

    it.each([0, -1, NaN, Infinity])(
        'rejects a request of %s with a typed error',
        (requested) => {
            expect(() => effectivePayoutRequest(topStep(), requested)).toThrow(
                PayoutRequestPolicyError,
            );
        },
    );
});

describe('PayoutRequestPolicy.FullRequestOnly pays only the full effective request (F-149, PD-40)', () => {
    it('defaults to UpToRequest, a string enum, so options stay serializable', () => {
        expect(DEFAULT_PAYOUT_REQUEST_POLICY).toBe(
            PayoutRequestPolicy.UpToRequest,
        );
        for (const member of Object.values(PayoutRequestPolicy)) {
            expect(typeof member).toBe('string');
        }
        const serializable = {
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
        };
        expect(structuredClone(serializable)).toStrictEqual(serializable);
        const serialized = JSON.stringify(serializable);
        expect(JSON.parse(serialized)).toStrictEqual(serializable);
    });

    it('waits on TopStep when its 50% balance-share cap leaves $400 of a $500 request, where UpToRequest pays the $400', () => {
        const plan = topStep();
        const waiting = funded(plan, 800, 48_000);
        expect(
            waiting.tracker.evaluatePayout(
                fullRequest(plan, waiting.state, 500),
            ),
        ).toStrictEqual({
            gate: PayoutGate.BelowFullRequest,
            kind: PayoutEvaluationKind.Blocked,
        });
        expect(
            waiting.tracker.tryPayout(fullRequest(plan, waiting.state, 500)),
        ).toBeNull();

        const upTo = funded(plan, 800, 48_000);
        expect(
            upTo.tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: 500,
                plan,
                state: upTo.state,
            })?.debited,
        ).toBe(400);
    });

    it('pays exactly $500 on TopStep once the cap leaves $600', () => {
        const plan = topStep();
        const { state, tracker } = funded(plan, 1200, 48_000);

        const payout = tracker.tryPayout(fullRequest(plan, state, 500));

        expect(payout?.debited).toBe(500);
        expect(payout?.traderReceives).toBeCloseTo(0.9 * 500 - 30, 9);
        expect(state.balance).toBe(START + 700);
    });

    it('takes a $300 ladder step as the full amount of a $500 request', () => {
        const plan = rapidEod().withOverrides({
            minPayoutRequest: dollars(300),
            payoutLadder: { minRequestAmount: dollars(300), steps: [300, 300] },
        });
        const { state, tracker } = funded(plan, 3000, 50_100);
        state.thresholdLocked = true;

        expect(tracker.tryPayout(fullRequest(plan, state, 500))?.debited).toBe(
            300,
        );
    });

    it('takes a per-request cap below the request as the full amount', () => {
        const plan = topStep().withOverrides({
            payoutRequestCap: dollars(400),
        });
        const { state, tracker } = funded(plan, 3000, 48_000);

        expect(tracker.tryPayout(fullRequest(plan, state, 500))?.debited).toBe(
            400,
        );
    });

    it('waits when the payout profit share leaves less than the request', () => {
        const plan = rapidEod().withOverrides({
            minPayoutProfit: dollars(0),
            minPayoutRequest: dollars(100),
            payoutProfitShare: profitShareMultiplier(0.5),
        });
        const { state, tracker } = funded(plan, 800, 48_000);

        expect(
            tracker.evaluatePayout(fullRequest(plan, state, 500)),
        ).toStrictEqual({
            gate: PayoutGate.BelowFullRequest,
            kind: PayoutEvaluationKind.Blocked,
        });
        expect(
            tracker.evaluatePayout({
                ...fullRequest(plan, state, 500),
                payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
            }),
        ).toMatchObject({ debited: 400, kind: PayoutEvaluationKind.Eligible });
    });

    it('waits when the cycle-profit pool leaves less than the request', () => {
        const plan = rapidEod();
        const { state, tracker } = funded(plan, 5000, 48_000);
        tracker.payoutsIssued = 1;
        tracker.lastPayoutBalance = state.balance - 600;

        expect(
            tracker.evaluatePayout(fullRequest(plan, state, 1000)),
        ).toStrictEqual({
            gate: PayoutGate.BelowFullRequest,
            kind: PayoutEvaluationKind.Blocked,
        });
        expect(
            tracker.evaluatePayout({
                ...fullRequest(plan, state, 1000),
                payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
            }),
        ).toMatchObject({ debited: 600, kind: PayoutEvaluationKind.Eligible });
    });

    it('waits when the one-time early withdrawal allowance leaves less than the request', () => {
        const pro = registryPlan({
            accountSize: START,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        }).withOverrides({
            takesOneTimeEarlyWithdrawal: true,
        });
        const { state, tracker } = funded(pro, 2000, 48_000);
        tracker.sessionDaysSinceAnchor = 20;

        expect(
            tracker.evaluatePayout(fullRequest(pro, state, 1500)),
        ).toStrictEqual({
            gate: PayoutGate.BelowFullRequest,
            kind: PayoutEvaluationKind.Blocked,
        });
        expect(
            tracker.evaluatePayout(fullRequest(pro, state, 1000)),
        ).toMatchObject({
            debited: 1000,
            isEarlyWithdrawal: true,
            kind: PayoutEvaluationKind.Eligible,
        });
    });

    it('compares the available room with the request within the cent tolerance', () => {
        const plan = topStep();
        const { state, tracker } = funded(plan, 1000 - 1e-9, 48_000);

        expect(tracker.tryPayout(fullRequest(plan, state, 500))?.debited).toBe(
            500,
        );

        const short = funded(plan, 999.98, 48_000);
        expect(
            short.tracker.evaluatePayout(fullRequest(plan, short.state, 500)),
        ).toStrictEqual({
            gate: PayoutGate.BelowFullRequest,
            kind: PayoutEvaluationKind.Blocked,
        });
    });

    it.each([
        {
            minimum: 1000,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.Mffu,
                    variant: MffuVariant.Pro,
                }),
            title: 'MFF Pro ($1,000 minimum, MyFundedFutures.ts)',
        },
        {
            minimum: 1000,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.AlphaFutures,
                    variant: AlphaFuturesVariant.Advanced,
                }),
            title: 'AlphaFutures Advanced ($1,000 minimum, AlphaFutures.ts)',
        },
        {
            minimum: 1000,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.Tradeify,
                    variant: TradeifyVariant.Lightning,
                }),
            title: 'Tradeify Lightning ($1,000 ladder minimum, Tradeify.ts)',
        },
        {
            minimum: 800,
            plan: () =>
                registryPlan({
                    accountSize: START,
                    firm: FirmId.FundedNext,
                    variant: FundedNextVariant.Fnl003,
                }),
            title: 'FundedNext FNL:003 ($800 minimum, FundedNext.ts FNL003_MIN_REQUEST)',
        },
    ])(
        'fails loud on a raw 500 dollar request below the minimum of $title instead of waiting forever',
        ({ minimum, plan }) => {
            const target = plan();
            const { state, tracker } = funded(target, 20_000, 48_000);
            const message = `${target.label}: a payout request of $500 is below the $${minimum} minimum payout request, so it could never be paid`;

            expect(() =>
                tracker.evaluatePayout(fullRequest(target, state, 500)),
            ).toThrow(new PayoutRequestPolicyError(message));
            expect(() =>
                tracker.tryPayout(fullRequest(target, state, 500)),
            ).toThrow(PayoutRequestPolicyError);
            expect(() =>
                tracker.evaluatePayout(
                    fullRequest(
                        target,
                        state,
                        effectivePayoutRequest(target, 500),
                    ),
                ),
            ).not.toThrow();
            expect(() =>
                tracker.evaluatePayout({
                    ...fullRequest(target, state, 500),
                    payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
                }),
            ).not.toThrow();
        },
    );

    it.each([0, -1, NaN, Infinity])(
        'fails loud on a request of %s under FullRequestOnly',
        (requested) => {
            const plan = topStep();
            const { state, tracker } = funded(plan, 1200, 48_000);

            expect(() =>
                tracker.evaluatePayout(fullRequest(plan, state, requested)),
            ).toThrow(PayoutRequestPolicyError);
        },
    );

    it('fails loud when FullRequestOnly has no request size', () => {
        const plan = topStep();
        const { state, tracker } = funded(plan, 1200, 48_000);

        expect(() =>
            tracker.evaluatePayout(fullRequest(plan, state, undefined)),
        ).toThrow(PayoutRequestPolicyError);
        expect(() =>
            tracker.tryPayout(fullRequest(plan, state, undefined)),
        ).toThrow(PayoutRequestPolicyError);
    });
});

describe('one payout request size rule for the funded engine and the live plan', () => {
    it.each([500, 0.01])('accepts a request of %s', (requested) => {
        expect(payoutRequestSizeSchema.safeParse(requested).success).toBe(true);
    });

    it.each([0, -1, NaN, Infinity])('rejects a request of %s', (requested) => {
        expect(payoutRequestSizeSchema.safeParse(requested).success).toBe(
            false,
        );
    });

    it('defines the schema once in src, in core/lib/units.ts', () => {
        const definitions = readdirSync(path.join(REPO_ROOT, 'src'), {
            recursive: true,
        })
            .map(String)
            .filter((file) => /\.tsx?$/.test(file))
            .map((file) => path.join('src', file))
            .filter((file) =>
                /(?:payoutRequestSizeSchema|requestedPayoutSchema)\s*=/.test(
                    readFileSync(path.join(REPO_ROOT, file), 'utf8'),
                ),
            );
        expect(definitions).toStrictEqual([
            path.join(
                'src',
                'lib',
                'prop-calculator',
                'core',
                'lib',
                'units.ts',
            ),
        ]);
    });

    it('rejects a live request below the minimum with the same typed error as the funded engine', () => {
        const live = buildMffuRapidLivePlan();

        expect(() => live.resolvePayoutRequestSize(200)).toThrow(
            new PayoutRequestPolicyError(
                `${live.label}: a payout request of $200 is below the $250 minimum payout request, so it could never be paid`,
            ),
        );
        expect(live.resolvePayoutRequestSize(250)).toBe(250);
        expect(live.resolvePayoutRequestSize(undefined)).toBeUndefined();
    });
});

describe('closeoutCredit ignores the payout request policy and keeps its T32 pins (Q4 default)', () => {
    it('credits TopStep one capped $400 request net of split and the $30 fee under either policy', () => {
        const plan = topStep();
        const { state, tracker } = funded(plan, 800, 48_000);
        const withPolicy = fullRequest(plan, state, 500);

        expect(tracker.closeoutCredit(withPolicy)).toBeCloseTo(330, 9);
        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                payoutRequestSize: 500,
                plan,
                state,
            }),
        ).toBeCloseTo(330, 9);
    });

    it('credits Lucid Daily EOD at 60,000 one $500 request net of split under either policy', () => {
        const plan = registryPlan({
            accountSize: START,
            firm: FirmId.Lucid,
            variant: LucidVariant.DailyEod,
        });
        const { state, tracker } = funded(plan, 10_000, 50_100);
        state.thresholdLocked = true;
        const withPolicy = {
            ...fullRequest(plan, state, 500),
            minRetainedCushion: 2000,
        };

        expect(tracker.closeoutCredit(withPolicy)).toBeCloseTo(450, 9);
        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 2000,
                payoutRequestSize: 500,
                plan,
                state,
            }),
        ).toBeCloseTo(450, 9);
    });
});
