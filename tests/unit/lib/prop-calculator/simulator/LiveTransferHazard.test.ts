import { describe, expect, it } from 'vitest';

import {
    CumulativeAmountTrigger,
    DayStopRuleKind,
    DiscretionaryTrigger,
    dollars,
    type Dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    FundedNextVariant,
    InstrumentSymbol,
    LucidVariant,
    MffuVariant,
    NotCheckedLiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    type Plan,
    PolicySizing,
    PolicySourceKind,
    PolicyVerification,
    resolvePositionSizing,
    RungSizing,
    TopStepVariant,
    verifiedCumulativePayoutLimit,
} from '~/lib/prop-calculator/core';
import {
    buildLucidDailyLivePlan,
    buildLucidLivePlan,
    findFirm,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    CorrelationMode,
    type LiveTransferOptions,
    runEvalWithRetries,
    runFundedHorizon,
    type SimInputs,
    type SimOutputs,
    simulate,
    simulatePortfolio,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';
import { resolveLiveTransferSetup } from '~/lib/prop-calculator/simulator/LiveTransfer';

import { payoutCapToyPlan } from './toyPlans';

const FIRST_PAYOUT = 150;
const TWO_PAYOUT_TOTAL = 250;
const LIVE_TRANSFER_OUTPUT_FIELDS = [
    'expectedLiveTransferCapitalReturned',
    'expectedLiveTransferCash',
    'expectedLiveTransferLiquidationPayout',
    'expectedLiveTransferTransitionCredit',
    'liveTransferContinuation',
    'liveTransferProbability',
] as const;
const MONTH = 21;

interface CountedRng {
    draws: () => number;
    rng: Rng;
}

function continuationOf(
    livePlanAt: () => ReturnType<typeof buildLucidLivePlan>,
    extra: { payoutRequestSize?: Dollars; retainedCushion?: number } = {},
): NonNullable<LiveTransferOptions['continuation']> {
    const positionSizing = resolvePositionSizing(
        InstrumentSymbol.MNQ,
        10,
    );
    if (positionSizing === null) throw new Error('no MNQ sizing');
    return {
        commission: dollars(0),
        livePlanAt,
        positionSizing,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: fraction(1),
        ...extra,
    };
}

function countedRng(seed: number): CountedRng {
    const inner = mulberry32(seed);
    let count = 0;
    return {
        draws: () => count,
        rng: () => {
            count += 1;
            return inner();
        },
    };
}

function fundedRun(liveTransfer: LiveTransferOptions | undefined) {
    const plan = lucidPro();
    const trade = countedRng(42);
    const retry = runEvalWithRetries({
        commission: dollars(0),
        dayPolicy: flatDayPolicy(
            400,
            2,
            { kind: DayStopRuleKind.None },
            PolicySizing.ContractCapped,
        ),
        maxAttempts: 3,
        maxEvalDays: 150,
        plan,
        positionSizing: null,
        rng: trade.rng,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        shouldCaptureEquity: false,
        totals: new TradeTotals(),
        winrate: fraction(0.5),
    });
    const result = runFundedHorizon({
        attempt: retry.attempt,
        commission: dollars(0),
        dayPolicy: flatDayPolicy(
            400,
            2,
            { kind: DayStopRuleKind.None },
            PolicySizing.ContractCapped,
        ),
        discounts: undefined,
        fundedHorizonDays: 60,
        liveTransfer,
        minRetainedCushion: dollars(2000),
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        rng: trade.rng,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: fraction(0.5),
    });
    return { result, tradeDraws: trade.draws() };
}

function lucidPro(): Plan {
    const plan = findFirm(FirmId.Lucid)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.Pro,
    });
    if (!plan) throw new Error('Lucid Pro 50K plan not found');
    return plan;
}

function planOf(
    firm: FirmId,
    variant: FundedNextVariant | LucidVariant | MffuVariant | TopStepVariant,
): Plan {
    const plan = findFirm(firm)?.plans.find(
        (candidate) =>
            'variant' in candidate.id && candidate.id.variant === variant,
    );
    if (!plan) throw new Error(`${firm} ${variant} plan not found`);
    return plan;
}

function portfolioInputs(correlation: CorrelationMode) {
    return {
        accounts: 4,
        correlation,
        fundedHorizonDays: 50,
        groups: 2,
        liveTransferHazard: fraction(0.5),
        maxEvalDays: 1,
        plan: payoutCapToyPlan(),
        riskPerTrade: 100,
        rrRatio: 1,
        seed: 3,
        tradesPerDay: 1,
        trials: 400,
        winrate: 0.9,
    };
}

function shareOf(distribution: readonly number[], count: number): number {
    const share = distribution[count];
    if (share === undefined) throw new Error(`no share for ${count} accounts`);
    return share;
}

function toyInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 50,
        maxEvalDays: 1,
        plan: payoutCapToyPlan(),
        riskPerTrade: 100,
        rrRatio: 1,
        seed: 7,
        tradesPerDay: 1,
        trials: 40,
        winrate: fraction(1),
        ...overrides,
    };
}

function transferOutputs(plan: Plan): SimOutputs {
    return simulate({
        fundedHorizonDays: 30,
        instrument: InstrumentSymbol.MNQ,
        liveTransferHazard: fraction(1),
        maxEvalDays: 5,
        plan,
        riskPerTrade: 100,
        rrRatio: 1,
        seed: 1,
        stopPoints: 10,
        tradesPerDay: 1,
        trials: 5,
        winrate: 0.5,
    });
}

function transferRun(
    continuation: NonNullable<LiveTransferOptions['continuation']>,
) {
    return fundedRun({
        continuation,
        cumulativePayoutLimit: null,
        hazard: fraction(1),
        rng: mulberry32(5),
    }).result;
}

function withoutLiveTransferFields(output: SimOutputs): Partial<SimOutputs> {
    const copy: Partial<SimOutputs> = { ...output };
    for (const field of LIVE_TRANSFER_OUTPUT_FIELDS) {
        Reflect.deleteProperty(copy, field);
    }
    return copy;
}

describe('the live-transfer hazard is absent by default', () => {
    it('reports a zero transfer probability and leaves every other output alone', () => {
        const baseline = simulate(toyInputs());
        const zero = simulate(toyInputs({ liveTransferHazard: fraction(0) }));
        expect(baseline.liveTransferProbability).toBe(0);
        expect(baseline.expectedLiveTransferCash).toBe(0);
        expect(baseline.expectedGrossPayout).toBeCloseTo(TWO_PAYOUT_TOTAL, 10);
        expect(zero).toStrictEqual(baseline);
    });

    it('keeps the trade stream when a hazard is set but never fires', () => {
        const baseline = simulate(toyInputs());
        const tiny = simulate(toyInputs({ liveTransferHazard: fraction(1e-12) }));
        expect(withoutLiveTransferFields(tiny)).toStrictEqual(
            withoutLiveTransferFields(baseline),
        );
        expect(tiny.liveTransferProbability).toBe(0);
    });
});

describe('a transfer ends the simulated payouts', () => {
    it('with hazard 1 stops after the first paid payout and values the rest at 0 when no live plan applies', () => {
        const out = simulate(toyInputs({ liveTransferHazard: fraction(1) }));
        expect(out.liveTransferProbability).toBe(1);
        expect(out.expectedPayoutCount).toBe(1);
        expect(out.expectedGrossPayout).toBeCloseTo(FIRST_PAYOUT, 10);
        expect(out.expectedHorizonCredit).toBe(0);
        expect(out.expectedLiveTransferCash).toBe(0);
        expect(out.liveTransferContinuation).toBe('not-modeled');
        expect(out.fundedBustProbability).toBe(0);
    });

    it('lowers the funded value as the hazard rises', () => {
        const none = simulate(toyInputs({ seed: 11, winrate: 0.9 }));
        const some = simulate(
            toyInputs({ liveTransferHazard: fraction(0.4), seed: 11, winrate: 0.9 }),
        );
        const all = simulate(
            toyInputs({ liveTransferHazard: fraction(1), seed: 11, winrate: 0.9 }),
        );
        expect(some.liveTransferProbability).toBeGreaterThan(0);
        expect(some.liveTransferProbability).toBeLessThan(1);
        expect(some.expectedGrossPayout).toBeLessThan(none.expectedGrossPayout);
        expect(all.expectedGrossPayout).toBeLessThan(some.expectedGrossPayout);
    });

    it('is reproducible for one seed', () => {
        const first = simulate(
            toyInputs({ liveTransferHazard: fraction(0.4), winrate: 0.9 }),
        );
        const second = simulate(
            toyInputs({ liveTransferHazard: fraction(0.4), winrate: 0.9 }),
        );
        expect(second).toStrictEqual(first);
    });
});

describe('only an account that was paid can be sent live', () => {
    it('never sends more runs live than runs that reached funded and got a payout', () => {
        const rapidEod = findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        });
        if (!rapidEod) throw new Error('MFFU Rapid EOD 50K plan not found');
        const out = simulate({
            fundedHorizonDays: 120,
            liveTransferHazard: fraction(0.3),
            maxEvalDays: 40,
            plan: rapidEod,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 4,
            trials: 400,
            winrate: 0.45,
        });
        const paid = out.evalPassProbability * out.anyPayoutGivenFundedProbability;
        expect(out.liveTransferProbability).toBeGreaterThan(0);
        expect(out.liveTransferProbability).toBeLessThanOrEqual(paid + 1e-9);
    });
});

describe('a transfer continues through the live plan where one is modeled', () => {
    const sized = {
        instrument: InstrumentSymbol.MNQ,
        stopPoints: 10,
    } as const;

    it('adds the live cash on top of the first simulated payout', () => {
        const modeled = simulate(
            toyInputs({ liveTransferHazard: fraction(1), ...sized, winrate: 1 }),
        );
        const unmodeled = simulate(
            toyInputs({ liveTransferHazard: fraction(1), winrate: 1 }),
        );
        expect(modeled.liveTransferContinuation).toBe('modeled');
        expect(modeled.expectedLiveTransferCash).toBeGreaterThan(0);
        expect(modeled.expectedGrossPayout).toBeCloseTo(FIRST_PAYOUT, 10);
        expect(modeled.expectedNet).toBeCloseTo(
            unmodeled.expectedNet + modeled.expectedLiveTransferCash,
            8,
        );
    });

    it('values the rest at 0 on a plan whose live program is not modeled, even with sizing', () => {
        const pro = findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        });
        if (!pro) throw new Error('MFFU Pro 50K plan not found');
        const out = simulate({
            fundedHorizonDays: 120,
            instrument: InstrumentSymbol.MNQ,
            liveTransferHazard: fraction(1),
            maxEvalDays: 60,
            plan: pro,
            riskPerTrade: 200,
            rrRatio: 2,
            seed: 5,
            stopPoints: 20,
            tradesPerDay: 2,
            trials: 200,
            winrate: 0.6,
        });
        expect(out.liveTransferProbability).toBeGreaterThan(0);
        expect(out.liveTransferContinuation).toBe('not-modeled');
        expect(out.expectedLiveTransferCash).toBe(0);
    });
});

describe('the transfer draw is one correlated draw per group', () => {
    it('under Copy mode every account of the group transfers together or none does', () => {
        const out = simulatePortfolio(portfolioInputs(CorrelationMode.Copy));
        const distribution = out.accountsLiveTransferDistribution;
        expect(distribution).toHaveLength(5);
        expect(shareOf(distribution, 0) + shareOf(distribution, 4)).toBeCloseTo(
            1,
            10,
        );
        expect(shareOf(distribution, 1)).toBe(0);
        expect(shareOf(distribution, 2)).toBe(0);
        expect(shareOf(distribution, 3)).toBe(0);
        expect(out.liveTransferProbability).toBeCloseTo(
            shareOf(distribution, 4),
            10,
        );
    });

    it('under Independent mode the transfers spread over the accounts', () => {
        const out = simulatePortfolio(
            portfolioInputs(CorrelationMode.Independent),
        );
        const distribution = out.accountsLiveTransferDistribution;
        const middle =
            shareOf(distribution, 1) +
            shareOf(distribution, 2) +
            shareOf(distribution, 3);
        const ends = shareOf(distribution, 0) + shareOf(distribution, 4);
        expect(middle).toBeCloseTo(1 - ends, 10);
        expect(shareOf(distribution, 2)).toBeGreaterThan(0);
    });

    it('carries no transfer when the hazard is absent', () => {
        const out = simulatePortfolio({
            ...portfolioInputs(CorrelationMode.Copy),
            liveTransferHazard: undefined,
        });
        expect(out.liveTransferProbability).toBe(0);
        expect(out.accountsLiveTransferDistribution[0]).toBe(1);
    });
});

describe('the hazard is validated at the boundary', () => {
    it.each([-0.1, 1.1, NaN, Infinity])(
        'refuses a hazard of %s',
        (hazard) => {
            expect(() =>
                simulate(toyInputs({ liveTransferHazard: fraction(hazard) })),
            ).toThrow(/liveTransferHazard/);
        },
    );
});

describe('a verified cumulative payout trigger ends the simulated payouts', () => {
    const plan: Plan = payoutCapToyPlan();

    it('stops deterministically on the payout that reaches the amount', () => {
        const out = simulate(
            toyInputs({ plan, verifiedCumulativePayoutTrigger: FIRST_PAYOUT }),
        );
        expect(out.liveTransferProbability).toBe(1);
        expect(out.expectedPayoutCount).toBe(1);
        expect(out.expectedGrossPayout).toBeCloseTo(FIRST_PAYOUT, 10);
    });

    it('does not fire below the amount', () => {
        const out = simulate(
            toyInputs({
                plan,
                verifiedCumulativePayoutTrigger: TWO_PAYOUT_TOTAL + 1,
            }),
        );
        expect(out.liveTransferProbability).toBe(0);
        expect(out.expectedPayoutCount).toBe(2);
        expect(out.expectedGrossPayout).toBeCloseTo(TWO_PAYOUT_TOTAL, 10);
    });

    it('needs no hazard to fire', () => {
        const out = simulate(
            toyInputs({ plan, verifiedCumulativePayoutTrigger: dollars(100) }),
        );
        expect(out.liveTransferProbability).toBe(1);
    });
});

describe('the transfer draw comes from a separate stream', () => {
    it('draws once per paid payout and leaves the trade stream draw count alone', () => {
        const baseline = fundedRun(undefined);
        const hazard = countedRng(99);
        const withHazard = fundedRun({
            continuation: null,
            cumulativePayoutLimit: null,
            hazard: fraction(1e-12),
            rng: hazard.rng,
        });
        expect(baseline.result.payoutCount).toBeGreaterThan(0);
        expect(withHazard.tradeDraws).toBe(baseline.tradeDraws);
        expect(withHazard.result).toMatchObject({
            isTransferredLive: false,
            payoutCount: baseline.result.payoutCount,
            totalPayout: baseline.result.totalPayout,
        });
        expect(hazard.draws()).toBe(baseline.result.payoutCount);
    });

    it('draws nothing from the hazard stream when the hazard is 0', () => {
        const hazard = countedRng(99);
        fundedRun({
            continuation: null,
            cumulativePayoutLimit: null,
            hazard: fraction(0),
            rng: hazard.rng,
        });
        expect(hazard.draws()).toBe(0);
    });
});

describe('only a confirmed cumulative amount trigger is enforced in the simulator', () => {
    const confirmed = {
        fetchedOn: '2026-09-26',
        quote: 'quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/rule',
        verification: PolicyVerification.Confirmed as const,
    };

    it('takes the amount of a confirmed cumulative trigger', () => {
        const triggers = [
            new CumulativeAmountTrigger(dollars(20_000), confirmed),
        ];
        expect(verifiedCumulativePayoutLimit(triggers)).toBe(20_000);
    });

    it('takes the tightest of several confirmed amounts', () => {
        const triggers = [
            new CumulativeAmountTrigger(dollars(100_000), confirmed),
            new CumulativeAmountTrigger(dollars(20_000), confirmed),
        ];
        expect(verifiedCumulativePayoutLimit(triggers)).toBe(20_000);
    });

    it.each([
        ['an empty list', []],
        ['the not-checked default', [new NotCheckedLiveTransitionTrigger()]],
        ['a discretionary trigger', [new DiscretionaryTrigger(confirmed)]],
        [
            'a payout count trigger',
            [new PayoutCountPerAccountTrigger(5, confirmed)],
        ],
        [
            'a cumulative trigger with no source',
            [new CumulativeAmountTrigger(dollars(20_000), undefined)],
        ],
        [
            'a cumulative trigger whose pages conflict',
            [
                new CumulativeAmountTrigger(dollars(20_000), {
                    ...confirmed,
                    conflicting: { ...confirmed, quote: 'other' },
                    verification: PolicyVerification.Conflict,
                }),
            ],
        ],
        [
            'a cumulative trigger waiting for a paste',
            [
                new CumulativeAmountTrigger(dollars(20_000), {
                    verification: PolicyVerification.NeedsPaste,
                }),
            ],
        ],
        [
            'a cumulative trigger no firm page states',
            [
                new CumulativeAmountTrigger(dollars(20_000), {
                    verification: PolicyVerification.NotFound,
                }),
            ],
        ],
    ] as const)('stays a disclosure for %s', (_label, triggers) => {
        expect(verifiedCumulativePayoutLimit(triggers)).toBeNull();
    });
});

describe('an account sent live keeps its slot to the end of the funded horizon', () => {
    const sized = {
        instrument: InstrumentSymbol.MNQ,
        stopPoints: 10,
    } as const;
    const FUNDED_DAYS = 50;

    function expectedMonthly(out: SimOutputs): number {
        return (
            ((out.expectedNet + out.expectedHorizonCredit) * MONTH) /
            (out.expectedDaysToPass + FUNDED_DAYS)
        );
    }

    it('divides the money of a modeled continuation by the whole horizon', () => {
        const out = simulate(
            toyInputs({ liveTransferHazard: fraction(1), ...sized, winrate: 1 }),
        );
        expect(out.liveTransferContinuation).toBe('modeled');
        expect(out.expectedLiveTransferCash).toBeGreaterThan(0);
        expect(out.expectedMonthlyNet).toBeCloseTo(expectedMonthly(out), 8);
        expect(out.expectedMonthlyRealizedNet).toBeCloseTo(
            expectedMonthly(out),
            8,
        );
    });

    it('holds the slot to the horizon too when the rest of the account is valued at 0', () => {
        const out = simulate(toyInputs({ liveTransferHazard: fraction(1), winrate: 1 }));
        expect(out.liveTransferContinuation).toBe('not-modeled');
        expect(out.expectedMonthlyNet).toBeCloseTo(expectedMonthly(out), 8);
    });

    it('does not let a larger hazard raise the monthly figure when nothing is added after the transfer', () => {
        const rapidEod = findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        });
        if (!rapidEod) throw new Error('MFFU Rapid EOD 50K plan not found');
        const base = {
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan: rapidEod,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 4,
            trials: 1000,
            winrate: 0.4,
        };
        const none = simulate(base);
        const some = simulate({ ...base, liveTransferHazard: fraction(0.3) });
        const all = simulate({ ...base, liveTransferHazard: fraction(1) });
        expect(some.expectedMonthlyNet).toBeLessThan(none.expectedMonthlyNet);
        expect(all.expectedMonthlyNet).toBeLessThan(some.expectedMonthlyNet);
    });

    it('applies the same slot basis to a portfolio', () => {
        const out = simulatePortfolio({
            accounts: 2,
            correlation: CorrelationMode.Copy,
            fundedHorizonDays: FUNDED_DAYS,
            groups: 1,
            liveTransferHazard: fraction(1),
            maxEvalDays: 1,
            plan: payoutCapToyPlan(),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 3,
            tradesPerDay: 1,
            trials: 40,
            winrate: 1,
            ...sized,
        });
        expect(out.liveTransferProbability).toBe(1);
        const single = simulate(
            toyInputs({ liveTransferHazard: fraction(1), ...sized, winrate: 1 }),
        );
        expect(out.expectedMonthlyNet).toBeCloseTo(
            (out.expectedNet * MONTH) / (single.expectedDaysToPass + FUNDED_DAYS),
            8,
        );
    });

    it('reports the continuation kind on a portfolio', () => {
        const out = simulatePortfolio({
            ...portfolioInputs(CorrelationMode.Copy),
            ...sized,
        });
        expect(out.liveTransferContinuation).toBe('modeled');
        expect(
            simulatePortfolio({
                ...portfolioInputs(CorrelationMode.Copy),
                liveTransferHazard: undefined,
            }).liveTransferContinuation,
        ).toBe('off');
    });
});

describe('only the recurring live withdrawals enter the money and monthly figures', () => {
    it('keeps the transition credit out of the recurring cash and reports it on its own', () => {
        const result = transferRun(
            continuationOf(() =>
                buildLucidDailyLivePlan(
                    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
                    dollars(5000),
                ),
            ),
        );
        expect(result.isTransferredLive).toBe(true);
        const noCredit = transferRun(
            continuationOf(() =>
                buildLucidDailyLivePlan(
                    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
                    dollars(0),
                ),
            ),
        );
        expect(result.liveTransferOneOff.transitionCredit).toBeCloseTo(4500, 6);
        expect(noCredit.liveTransferOneOff.transitionCredit).toBe(0);
        expect(result.liveTransferCash).toBeGreaterThan(0);
        expect(result.liveTransferCash).toBeCloseTo(
            noCredit.liveTransferCash,
            6,
        );
    });

    it('has no one-off cash when the live plan has no transition credit', () => {
        const result = transferRun(continuationOf(() => buildLucidLivePlan()));
        expect(result.isTransferredLive).toBe(true);
        expect(result.liveTransferOneOff.transitionCredit).toBe(0);
    });

    it('stops withdrawing below the cushion the trader keeps', () => {
        const keepsNothing = transferRun(
            continuationOf(() => buildLucidLivePlan(), { retainedCushion: 0 }),
        );
        const keepsEverything = transferRun(
            continuationOf(() => buildLucidLivePlan(), {
                retainedCushion: 1e9,
            }),
        );
        expect(keepsNothing.liveTransferCash).toBeGreaterThan(0);
        expect(keepsEverything.liveTransferCash).toBe(0);
    });

    it('uses the payout request size the trader asked for and does not throw for a request below the live minimum', () => {
        const unset = transferRun(continuationOf(() => buildLucidLivePlan()));
        const asked = transferRun(
            continuationOf(() => buildLucidLivePlan(), {
                payoutRequestSize: dollars(5),
            }),
        );
        expect(asked.liveTransferCash).not.toBe(unset.liveTransferCash);
        expect(() =>
            transferRun(
                continuationOf(() => buildLucidLivePlan(), {
                    payoutRequestSize: dollars(1),
                }),
            ),
        ).not.toThrow();
    });

    it('hands the retained cushion and the payout request of the simulation to the live continuation', () => {
        const rapidEod = planOf(FirmId.Mffu, MffuVariant.RapidEod);
        const setup = resolveLiveTransferSetup({
            commission: dollars(0),
            fundedRrRatio: 2,
            fundedTradesPerDay: 2,
            idleDayProbability: undefined,
            instrument: InstrumentSymbol.MNQ,
            liveTransferHazard: fraction(0.5),
            minRetainedCushion: 2500,
            payoutRequestSize: 400,
            plan: rapidEod,
            seed: 1,
            stopPoints: 10,
            verifiedCumulativePayoutTrigger: undefined,
            winrate: fraction(0.5),
        });
        expect(setup?.continuation).toMatchObject({
            payoutRequestSize: 400,
            retainedCushion: 2500,
        });
    });

    it('reports capital returned as its own output that the net and the monthly figure leave out', () => {
        const topStep = planOf(FirmId.TopStep, TopStepVariant.StandardStandard);
        const out = simulate({
            fundedHorizonDays: 200,
            instrument: InstrumentSymbol.MNQ,
            liveTransferHazard: fraction(1),
            maxEvalDays: 60,
            plan: topStep,
            riskPerTrade: 150,
            rrRatio: 2,
            seed: 11,
            stopPoints: 10,
            tradesPerDay: 2,
            trials: 200,
            winrate: 0.6,
        });
        expect(out.expectedLiveTransferCapitalReturned).toBeGreaterThan(0);
        expect(out.expectedNet).toBeCloseTo(
            out.expectedGrossPayout +
                out.expectedLiveTransferCash -
                out.expectedTotalCost,
            6,
        );
    });
});

describe('only a verified, exact live plan continues a transferred account', () => {
    it('values the rest at 0 when the firm live model is not verified', () => {
        const flex = planOf(FirmId.FundedNext, FundedNextVariant.Flex);
        expect(transferOutputs(flex).liveTransferContinuation).toBe(
            'not-modeled',
        );
    });

    it('marks a verified model that defaults part of the live state as an approximation', () => {
        const topStep = planOf(FirmId.TopStep, TopStepVariant.StandardStandard);
        expect(transferOutputs(topStep).liveTransferContinuation).toBe(
            'modeled-approximate',
        );
    });

    it('keeps an exact verified model as modeled', () => {
        const lucid = planOf(FirmId.Lucid, LucidVariant.Pro);
        expect(transferOutputs(lucid).liveTransferContinuation).toBe('modeled');
    });
});
