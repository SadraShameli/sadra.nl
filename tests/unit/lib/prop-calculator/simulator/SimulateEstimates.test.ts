import { createHash } from 'node:crypto';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    FUNDED_PAYOUT_COUNT_TAIL_BUCKET as ROOT_TAIL_BUCKET,
    type SimEstimates as RootSimEstimates,
} from '~/lib/prop-calculator';
import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    LucidVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    PolicySizing,
    RungSizing,
    TopStepVariant,
    TradeifyVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    FUNDED_PAYOUT_COUNT_TAIL_BUCKET,
    type SimEstimates,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator/simulator';
import {
    binomialStandardError,
    type Estimate,
    mean,
    meanStandardError,
    NoiseVerdict,
    noiseVerdict,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

interface PinnedCase {
    digest: string;
    digestWithThreeCopies: string;
    id: PlanId;
    label: string;
}

const ADDED_KEYS: ReadonlySet<string> = new Set([
    'anyPayoutGivenFundedProbability',
    'attemptPassProbability',
    'attemptPaysProbability',
    'costPerAttempt',
    'estimates',
    'expectedLiveTransferCapitalReturned',
    'expectedLiveTransferCash',
    'expectedLiveTransferLiquidationPayout',
    'expectedLiveTransferTransitionCredit',
    'expectedNetPerAttempt',
    'fundedPayoutCountDistribution',
    'fundedPayoutValues',
    'liveTransferContinuation',
    'liveTransferProbability',
    'netValues',
    'payoutsPerFundedAccount',
]);

const CASES: readonly PinnedCase[] = [
    {
        digest: 'd2ed0c1c670ece5f166475eca8bdbe81df57111682e494f8d34da8f9debd228d',
        digestWithThreeCopies:
            '983888db306feb82ccad2e595ea385f89089df51841b1023301dfc9309dc896c',
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
        label: 'Apex EOD',
    },
    {
        digest: '245b46c24c9521382290d414a93001de341b129fca8b01f78186960bd5e96521',
        digestWithThreeCopies:
            'e8d63aa4ebd14a9de0cd283cb0af71d4b4cbbbc02517842dfc4b7e34c3c32de7',
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        },
        label: 'MFFU Rapid EOD',
    },
    {
        digest: '891604e6c3614fb92645acf2c20efcdcd316bbf36a702a07606c662f7fe4dff6',
        digestWithThreeCopies:
            '38099c4d247ca82d9dee8d8222d6e799fe64f8c582c9e0943f255f6bcd3f9c01',
        id: {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        },
        label: 'TopStep Standard XFA',
    },
];

function canonical(value: unknown): unknown {
    if (typeof value === 'number') return canonicalNumber(value);
    if (Array.isArray(value)) return value.map(canonical);
    return value !== null && typeof value === 'object'
        ? Object.fromEntries(
              Object.entries(value)
                  .toSorted(([a], [b]) => compareText(a, b))
                  .map(([key, entry]) => [key, canonical(entry)]),
          )
        : value;
}

function canonicalNumber(value: number): number | string {
    return Number.isFinite(value) && !Object.is(value, -0)
        ? value
        : String(value);
}

function characterizationInputs(
    id: PlanId,
    overrides: Partial<SimInputs> = {},
): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan: planFor(id),
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.5,
        ...overrides,
    };
}

function compareText(a: string, b: string): number {
    return a < b ? -1 : 1;
}

function estimateOf(out: SimOutputs, key: EstimateKey): UncertainValue {
    return out.estimates[key];
}

function existingFieldsDigest(out: SimOutputs): string {
    const existing = Object.fromEntries(
        Object.entries(out).filter(([key]) => !ADDED_KEYS.has(key)),
    );
    return createHash('sha256')
        .update(JSON.stringify(canonical(existing)))
        .digest('hex');
}

function lucidDailyRequestFiveHundred(): SimOutputs {
    const dayGreen = { kind: DayStopRuleKind.DayGreen } as const;
    return simulate({
        dayStop: dayGreen,
        evalDayPolicy: {
            ladder: [800, 400, 800, 400],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: dayGreen,
        },
        fundedHorizonDays: 252,
        fundedRiskPerTrade: 1000,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        payoutRequestSize: 500,
        plan: planFor({
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.DailyEod,
        }),
        riskPerTrade: 800,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 400,
        winrate: 0.4,
    });
}

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

function relativeGap(a: number, b: number): number {
    return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1);
}

function sampleEstimate(values: readonly number[]): Estimate {
    return {
        standardError: meanStandardError(
            values.reduce((sum, value) => sum + value, 0),
            values.reduce((sum, value) => sum + value * value, 0),
            values.length,
        ),
        value: mean(values),
    };
}

function sampleStandardDeviation(values: readonly number[]): number {
    const center = mean(values);
    return Math.sqrt(
        values.reduce((sum, value) => sum + (value - center) ** 2, 0) /
            (values.length - 1),
    );
}

describe.each(CASES)('simulate estimates: $label', (pinned) => {
    const out = simulate(characterizationInputs(pinned.id));
    const tripled = simulate(
        characterizationInputs(pinned.id, { copyAccounts: 3 }),
    );

    it('leaves every existing field, arrays included, byte-identical to the pins taken before estimates were added', () => {
        expect(existingFieldsDigest(out)).toBe(pinned.digest);
        expect(existingFieldsDigest(tripled)).toBe(
            pinned.digestWithThreeCopies,
        );
    });
});

type EstimateKey = keyof SimEstimates;

const ESTIMATE_KEYS: readonly EstimateKey[] = [
    'anyPayoutGivenFundedProbability',
    'attemptPassProbability',
    'attemptPaysProbability',
    'costPerAttempt',
    'evalPassProbability',
    'expectedAttempts',
    'expectedGrossPayout',
    'expectedHorizonCredit',
    'expectedMonthlyNet',
    'expectedMonthlyRealizedNet',
    'expectedNet',
    'expectedNetPerAttempt',
    'expectedPayoutCount',
    'expectedPayoutPerFundedAccount',
    'fundedBustProbability',
    'fundedSurvivalProbability',
    'payoutsPerFundedAccount',
];

const COPY_SCALED_KEYS = [
    'costPerAttempt',
    'expectedGrossPayout',
    'expectedHorizonCredit',
    'expectedMonthlyNet',
    'expectedMonthlyRealizedNet',
    'expectedNet',
    'expectedNetPerAttempt',
] as const satisfies readonly EstimateKey[];

const FUNDED_CONDITIONAL_KEYS = [
    'anyPayoutGivenFundedProbability',
    'expectedPayoutPerFundedAccount',
    'payoutsPerFundedAccount',
] as const satisfies readonly EstimateKey[];

const UNCONDITIONAL_KEYS = ESTIMATE_KEYS.filter(
    (key) => !(FUNDED_CONDITIONAL_KEYS as readonly EstimateKey[]).includes(key),
);

const ONE_SAMPLE_RIVAL: UncertainValue = { standardError: 100, value: 2500 };

const TRIAL_PROBABILITY_KEYS = [
    'evalPassProbability',
    'fundedBustProbability',
    'fundedSurvivalProbability',
] as const satisfies readonly EstimateKey[];

const CALIBRATION_SEEDS = Array.from(
    { length: 20 },
    (_, index) => 1000 + index,
);
const CALIBRATED_KEYS = [
    'expectedMonthlyNet',
    'expectedNet',
    'fundedBustProbability',
] as const satisfies readonly EstimateKey[];

const APEX_EOD: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

describe('SimEstimates type surface', () => {
    it('names only numeric SimOutputs fields and is re-exported by the root barrel with the tail bucket', () => {
        expectTypeOf<EstimateKey>().toExtend<keyof SimOutputs>();
        expectTypeOf<RootSimEstimates>().toEqualTypeOf<SimEstimates>();
        expect(ROOT_TAIL_BUCKET).toBe(FUNDED_PAYOUT_COUNT_TAIL_BUCKET);
        expect(FUNDED_PAYOUT_COUNT_TAIL_BUCKET).toBe(10);
    });
});

describe.each(CASES)(
    'simulate estimates on the characterization runs: $label',
    (pinned) => {
        const inputs = characterizationInputs(pinned.id);
        const out = simulate(inputs);
        const tripled = simulate(
            characterizationInputs(pinned.id, { copyAccounts: 3 }),
        );

        it('carries exactly the listed estimates', () => {
            expect(
                Object.keys(out.estimates).toSorted(compareText),
            ).toStrictEqual([...ESTIMATE_KEYS].toSorted(compareText));
        });

        it.each(ESTIMATE_KEYS)(
            'reports %s with a value strictly equal to the output field',
            (key) => {
                expect(estimateOf(out, key).value).toBe(out[key]);
                expect(estimateOf(tripled, key).value).toBe(tripled[key]);
            },
        );

        it.each(TRIAL_PROBABILITY_KEYS)(
            'gives %s the binomial SE over the trial count',
            (key) => {
                expect(estimateOf(out, key).standardError).toBe(
                    binomialStandardError(out[key], inputs.trials),
                );
            },
        );

        it.each(COPY_SCALED_KEYS)(
            'scales %s value and SE exactly 3x with three copy accounts on the same seed',
            (key) => {
                expect(tripled.estimates[key].value).toBe(
                    out.estimates[key].value * 3,
                );
                expect(tripled.estimates[key].standardError).toBe(
                    out.estimates[key].standardError * 3,
                );
            },
        );

        it.each(
            ESTIMATE_KEYS.filter(
                (key) =>
                    !(COPY_SCALED_KEYS as readonly EstimateKey[]).includes(key),
            ),
        )('leaves %s unscaled with three copy accounts', (key) => {
            expect(estimateOf(tripled, key)).toStrictEqual(
                estimateOf(out, key),
            );
        });

        it.each(ESTIMATE_KEYS)('reports a finite SE >= 0 for %s', (key) => {
            const { standardError } = estimateOf(out, key);
            expect(standardError).not.toBeNull();
            expect(Number.isFinite(standardError)).toBe(true);
            expect(standardError ?? -1).toBeGreaterThanOrEqual(0);
        });

        it('gives the per-trial means their sample SEs, recomputed from the per-trial arrays', () => {
            expect(out.estimates.expectedNet.standardError).toBeCloseTo(
                sampleEstimate(out.netValues).standardError,
                9,
            );
            expect(
                out.estimates.expectedPayoutPerFundedAccount.standardError,
            ).toBeCloseTo(
                sampleEstimate(out.fundedPayoutValues).standardError,
                9,
            );
            expect(out.estimates.expectedNet.standardError).toBeGreaterThan(0);
        });

        it('gives the monthly figures positive SEs that account for the slot days moving with the net', () => {
            expect(
                out.estimates.expectedMonthlyNet.standardError,
            ).toBeGreaterThan(0);
            expect(
                out.estimates.expectedMonthlyRealizedNet.standardError,
            ).toBeGreaterThan(0);
        });
    },
);

describe('simulate estimates are calibrated: across 20 seeds at 400 trials the spread of each figure matches its reported SE', () => {
    describe.each(CASES)('$label', (pinned) => {
        const runs = CALIBRATION_SEEDS.map((seed) =>
            simulate(characterizationInputs(pinned.id, { seed, trials: 400 })),
        );

        it.each(CALIBRATED_KEYS)(
            '%s sample SD across seeds lies within [0.6, 1.6] x the mean reported SE',
            (key) => {
                const spread = sampleStandardDeviation(
                    runs.map((run) => run[key]),
                );
                const reported = mean(
                    runs.map((run) => run.estimates[key].standardError),
                );
                if (spread === 0) {
                    expect(reported).toBe(0);
                    return;
                }
                expect(spread / reported).toBeGreaterThanOrEqual(0.6);
                expect(spread / reported).toBeLessThanOrEqual(1.6);
            },
        );
    });
});

describe('simulate estimates at the edges', () => {
    it('gives every unconditional estimate SE 0 from a single trial', () => {
        const out = simulate(characterizationInputs(APEX_EOD, { trials: 1 }));
        for (const key of UNCONDITIONAL_KEYS) {
            expect(estimateOf(out, key).standardError, key).toBe(0);
        }
    });

    it('gives the funded-conditional estimates a null SE when only one trial reached funded, so a noise check on them is Unknown, never a verdict', () => {
        const out = simulate(
            characterizationInputs(APEX_EOD, { trials: 1, winrate: 0.6 }),
        );
        expect(out.evalPassProbability).toBe(1);
        expect(out.fundedPayoutValues).toHaveLength(1);
        expect(out.expectedPayoutPerFundedAccount).toBeGreaterThan(0);
        for (const key of FUNDED_CONDITIONAL_KEYS) {
            expect(out.estimates[key].value, key).toBe(out[key]);
            expect(out.estimates[key].standardError, key).toBeNull();
        }
        expect(
            noiseVerdict(
                out.estimates.expectedPayoutPerFundedAccount,
                ONE_SAMPLE_RIVAL,
                { sharedSeed: false },
            ),
        ).toBe(NoiseVerdict.Unknown);
    });

    it('stays finite on an instant-funded plan with no funded horizon, where no slot day elapses and the monthly figures fall back to one slot day per trial', () => {
        const out = simulate(
            characterizationInputs(
                {
                    accountSize: 50_000,
                    firm: FirmId.Tradeify,
                    variant: TradeifyVariant.Lightning,
                },
                { fundedHorizonDays: 0 },
            ),
        );
        expect(out.expectedMonthlyRealizedNet).toBe(
            out.expectedNet * TRADING_DAYS_PER_MONTH,
        );
        expect(
            relativeGap(
                out.estimates.expectedMonthlyRealizedNet.standardError,
                out.estimates.expectedNet.standardError *
                    TRADING_DAYS_PER_MONTH,
            ),
        ).toBeLessThan(1e-9);
        for (const key of ESTIMATE_KEYS) {
            const estimate = estimateOf(out, key);
            expect(estimate.value, key).toBe(out[key]);
            expect(Number.isFinite(estimate.standardError), key).toBe(true);
        }
    });
});

describe('attempt economics outputs (video addendum)', () => {
    const threeAttempts = simulate(
        characterizationInputs(APEX_EOD, { maxAttempts: 3, winrate: 0.45 }),
    );
    const threeAttemptsTripled = simulate(
        characterizationInputs(APEX_EOD, {
            copyAccounts: 3,
            maxAttempts: 3,
            winrate: 0.45,
        }),
    );
    const oneAttempt = simulate(characterizationInputs(APEX_EOD));
    const trials = 200;

    it('gives P(pass per attempt) as trials that reached funded over attempts used, below the per-trial pass rate when retries are allowed', () => {
        const out = threeAttempts;
        expect(out.expectedAttempts).toBeGreaterThan(1);
        expect(out.attemptPassProbability).toBeCloseTo(
            out.evalPassProbability / out.expectedAttempts,
            12,
        );
        expect(out.attemptPassProbability).toBeLessThan(
            out.evalPassProbability - 0.05,
        );
        expect(out.estimates.attemptPassProbability.standardError).toBe(
            binomialStandardError(
                out.attemptPassProbability,
                Math.round(out.expectedAttempts * trials),
            ),
        );
    });

    it('equals the per-trial pass rate with a single attempt', () => {
        expect(oneAttempt.attemptPassProbability).toBe(
            oneAttempt.evalPassProbability,
        );
    });

    it('buckets payouts per funded account 0 to 9 and 10 or more, summing to 1, consistent with payouts per funded account', () => {
        const out = oneAttempt;
        const distribution = out.fundedPayoutCountDistribution;
        expect(distribution).toHaveLength(FUNDED_PAYOUT_COUNT_TAIL_BUCKET + 1);
        expect(distribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
        expect(distribution.at(-1)).toBe(0);
        expect(
            distribution.reduce((sum, p, count) => sum + p * count, 0),
        ).toBeCloseTo(out.payoutsPerFundedAccount, 9);
        const reached = Math.round(out.evalPassProbability * trials);
        const counts = distribution.map((p) => Math.round(p * reached));
        expect(out.estimates.payoutsPerFundedAccount.standardError).toBeCloseTo(
            meanStandardError(
                counts.reduce((sum, c, count) => sum + c * count, 0),
                counts.reduce((sum, c, count) => sum + c * count * count, 0),
                reached,
            ),
            12,
        );
        expect(
            out.estimates.payoutsPerFundedAccount.standardError,
        ).toBeGreaterThan(0);
    });

    it('puts accounts with ten or more payouts in the tail bucket', () => {
        const out = lucidDailyRequestFiveHundred();
        const distribution = out.fundedPayoutCountDistribution;
        const tail = distribution.at(-1) ?? 0;
        expect(tail).toBeGreaterThan(0);
        expect(
            distribution.reduce((sum, p, count) => sum + p * count, 0),
        ).toBeLessThan(out.payoutsPerFundedAccount);
        expect(distribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
    });

    it('gives P(payout | funded) as 1 - bucket 0 with its binomial SE over funded accounts', () => {
        const out = oneAttempt;
        const reached = Math.round(out.evalPassProbability * trials);
        expect(out.anyPayoutGivenFundedProbability).toBe(
            1 - (out.fundedPayoutCountDistribution[0] ?? 0),
        );
        expect(
            out.estimates.anyPayoutGivenFundedProbability.standardError,
        ).toBe(
            binomialStandardError(out.anyPayoutGivenFundedProbability, reached),
        );
    });

    it('gives P(attempt pays) as trials with a payout over attempts used, with its binomial SE over attempts', () => {
        const out = threeAttempts;
        const attempts = Math.round(out.expectedAttempts * trials);
        expect(out.attemptPaysProbability).toBeCloseTo(
            out.anyPayoutGivenFundedProbability * out.attemptPassProbability,
            12,
        );
        expect(out.estimates.attemptPaysProbability.standardError).toBe(
            binomialStandardError(out.attemptPaysProbability, attempts),
        );
    });

    it('gives payouts per funded account as the payout count over funded trials', () => {
        const out = threeAttempts;
        expect(out.payoutsPerFundedAccount).toBeCloseTo(
            out.expectedPayoutCount / out.evalPassProbability,
            12,
        );
    });

    it('lists the total payout of every funded trial across its copy accounts, whose mean is the expected payout per funded account x copy accounts', () => {
        for (const out of [threeAttempts, threeAttemptsTripled]) {
            expect(out.fundedPayoutValues).toHaveLength(
                Math.round(out.evalPassProbability * trials),
            );
            expect(
                relativeGap(
                    mean(out.fundedPayoutValues),
                    out.expectedPayoutPerFundedAccount * out.copyAccounts,
                ),
            ).toBeLessThan(1e-12);
        }
    });

    it('lists the credit-free net of every trial, whose mean is the credit-free expected net', () => {
        const out = threeAttempts;
        expect(out.netValues).toHaveLength(trials);
        expect(relativeGap(mean(out.netValues), out.expectedNet)).toBeLessThan(
            1e-12,
        );
    });

    it('gives the attempt count its mean SE: 0 when every trial uses one attempt, positive with retries', () => {
        expect(oneAttempt.estimates.expectedAttempts.standardError).toBe(0);
        expect(
            threeAttempts.estimates.expectedAttempts.standardError,
        ).toBeGreaterThan(0);
    });

    it.each([
        { label: 'one copy account', run: () => threeAttempts },
        { label: 'three copy accounts', run: () => threeAttemptsTripled },
    ])(
        'defines EV per attempt once, as reported expected net over attempts per trial, and attempt cost as reported total cost (activation on pass included) over attempts per trial, with $label',
        ({ run }) => {
            const out = run();
            expect(
                relativeGap(
                    out.expectedNetPerAttempt,
                    out.expectedNet / out.expectedAttempts,
                ),
            ).toBeLessThan(1e-12);
            expect(
                relativeGap(
                    out.costPerAttempt,
                    out.expectedTotalCost / out.expectedAttempts,
                ),
            ).toBeLessThan(1e-12);
        },
    );

    it('decomposes EV per attempt on the credit-free (pre-T32 credit) basis: P(pass per attempt) x payout per funded account x copy accounts - attempt cost', () => {
        for (const out of [threeAttempts, oneAttempt, threeAttemptsTripled]) {
            expect(
                relativeGap(
                    out.attemptPassProbability *
                        out.expectedPayoutPerFundedAccount *
                        out.copyAccounts -
                        out.costPerAttempt,
                    out.expectedNetPerAttempt,
                ),
            ).toBeLessThan(1e-9);
        }
    });

    it('gives the per-attempt dollars ratio SEs that reduce to the mean SE of the net when each trial is one attempt', () => {
        expect(
            relativeGap(
                oneAttempt.estimates.expectedNetPerAttempt.standardError,
                oneAttempt.estimates.expectedNet.standardError,
            ),
        ).toBeLessThan(1e-9);
        expect(
            threeAttempts.estimates.costPerAttempt.standardError,
        ).toBeGreaterThan(0);
        expect(
            threeAttempts.estimates.expectedNetPerAttempt.standardError,
        ).toBeGreaterThan(0);
    });

    it('scales the per-trial dollar lists and the per-attempt dollar figures by the copy accounts exactly as expected net, and never the probabilities or the per-funded-account counts', () => {
        expect(threeAttemptsTripled.netValues).toStrictEqual(
            threeAttempts.netValues.map((value) => value * 3),
        );
        expect(threeAttemptsTripled.fundedPayoutValues).toStrictEqual(
            threeAttempts.fundedPayoutValues.map((value) => value * 3),
        );
        for (const key of [
            'costPerAttempt',
            'expectedNetPerAttempt',
        ] as const) {
            expect(threeAttemptsTripled[key], key).toBe(threeAttempts[key] * 3);
        }
        expect(
            threeAttemptsTripled.fundedPayoutCountDistribution,
        ).toStrictEqual(threeAttempts.fundedPayoutCountDistribution);
        for (const key of [
            'anyPayoutGivenFundedProbability',
            'attemptPassProbability',
            'attemptPaysProbability',
            'expectedPayoutPerFundedAccount',
            'payoutsPerFundedAccount',
        ] as const) {
            expect(threeAttemptsTripled[key], key).toBe(threeAttempts[key]);
        }
    });

    it('reports no payout distribution and zero conditional figures when no trial reaches funded', () => {
        const out = simulate(
            characterizationInputs(APEX_EOD, { trials: 20, winrate: 0.05 }),
        );
        expect(out.evalPassProbability).toBe(0);
        expect(out.fundedPayoutCountDistribution).toStrictEqual([]);
        expect(out.fundedPayoutValues).toStrictEqual([]);
        expect(out.anyPayoutGivenFundedProbability).toBe(0);
        expect(out.payoutsPerFundedAccount).toBe(0);
        expect(out.attemptPassProbability).toBe(0);
        expect(out.attemptPaysProbability).toBe(0);
        for (const key of UNCONDITIONAL_KEYS) {
            expect(
                Number.isFinite(estimateOf(out, key).standardError),
                key,
            ).toBe(true);
        }
        for (const key of FUNDED_CONDITIONAL_KEYS) {
            expect(out.estimates[key], key).toStrictEqual({
                standardError: null,
                value: 0,
            });
            expect(
                noiseVerdict(out.estimates[key], ONE_SAMPLE_RIVAL, {
                    sharedSeed: false,
                }),
                key,
            ).toBe(NoiseVerdict.Unknown);
        }
    });
});
