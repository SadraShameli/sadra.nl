import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    computedDayPolicy,
    type ComputeRisk,
    DayStopRuleKind,
    type Dollars,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    InstrumentSymbol,
    type Plan,
    PolicySizing,
    policySizingOf,
    resolvePositionSizing,
    resolveRiskAt,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    NO_PERSONAL_CAPS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    applyPersonalDayLimits,
    documentedDayRisk,
    type EnginePolicy,
    ladderUnderPersonalDayLimits,
    LifetimePayoutCapBasis,
    personalDayLimitsOf,
    personalDayLimitsOfPolicy,
    RebuyLagBasis,
    withPersonalDayLimits,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { type SimInputs } from '~/lib/prop-calculator/simulator';

type Outcome = 'loss' | 'win';

function registryPlan(variant: ApexVariant): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === FirmId.Apex);
    const plan = firm?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant,
    });
    if (!plan) throw new Error('Apex 50K plan not found');
    return plan;
}

const apexEod = registryPlan(ApexVariant.Eod);

const BASE_POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 60,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

const FUNDED_RISK = 250;
const FUNDED_TRADES = 4;
const FUNDED_RR = 2;
const NO_STOP = { kind: DayStopRuleKind.None } as const;

function flatFunded(): ReturnType<typeof flatDayPolicy> {
    return flatDayPolicy(
        FUNDED_RISK,
        FUNDED_TRADES,
        NO_STOP,
        policySizingOf(TradingPhase.Funded),
    );
}

function fundedStateOf(): AccountState {
    const state = apexEod.initialState();
    apexEod.beginFundedPhase(state);
    return state;
}

function limitsOf(
    dailyLossLimit: Dollars | null,
    dailyProfitCap: Dollars | null,
) {
    return { dailyLossLimit, dailyProfitCap };
}

function policyWith(
    dailyLossLimit: Dollars | null,
    dailyProfitCap: Dollars | null,
): EnginePolicy {
    return {
        ...BASE_POLICY,
        personalCaps: { ...NO_PERSONAL_CAPS, dailyProfitCap },
        personalDll: dailyLossLimit,
    };
}

const LOOSE_LIMITS = limitsOf(dollars(10_000), dollars(10_000));
const LOSS_600 = limitsOf(dollars(600), null);
const LOSS_700 = limitsOf(dollars(700), null);
const CAP_300 = limitsOf(null, dollars(300));

function appliedRisksOf(
    applied: SimInputs,
    outcomes: readonly Outcome[],
    rewardMultiple: number = FUNDED_RR,
): number[] {
    const policy = applied.fundedDayPolicy ?? flatFunded();
    return tradeDay(
        riskFunctionOf(policy),
        fundedStateOf(),
        outcomes,
        rewardMultiple,
    );
}

function riskFunctionOf(policy: { computeRisk?: ComputeRisk }): ComputeRisk {
    if (policy.computeRisk === undefined) {
        throw new Error('expected a computed day policy');
    }
    return policy.computeRisk;
}

function tradeDay(
    risk: ComputeRisk,
    state: AccountState,
    outcomes: readonly Outcome[],
    rewardMultiple: number = FUNDED_RR,
): number[] {
    const risks: number[] = [];
    for (const [index, outcome] of outcomes.entries()) {
        const next = risk(state, index);
        if (next <= 0) break;
        risks.push(next);
        const pnl = outcome === 'win' ? next * rewardMultiple : -next;
        state.balance += pnl;
        state.todayPnL += pnl;
    }
    return risks;
}

describe('personalDayLimitsOf (PT-68h, F-V16)', () => {
    it('is null when neither a daily loss limit nor a daily profit cap is set, even with a max risk and max trades', () => {
        expect(personalDayLimitsOf(undefined, null)).toBeNull();
        expect(personalDayLimitsOf(undefined, undefined)).toBeNull();
        expect(
            personalDayLimitsOf(
                {
                    dailyProfitCap: null,
                    maxRiskPerTrade: dollars(100),
                    maxTradesPerDay: 2,
                },
                null,
            ),
        ).toBeNull();
        expect(personalDayLimitsOfPolicy(BASE_POLICY)).toBeNull();
    });

    it('carries the daily loss limit and the daily profit cap when either is set', () => {
        expect(personalDayLimitsOf(undefined, dollars(600))).toStrictEqual(
            limitsOf(dollars(600), null),
        );
        const both = policyWith(dollars(600), dollars(700));
        const capOnly = policyWith(null, dollars(700));

        expect(personalDayLimitsOfPolicy(both)).toStrictEqual(
            limitsOf(dollars(600), dollars(700)),
        );
        expect(personalDayLimitsOfPolicy(capOnly)).toStrictEqual(
            limitsOf(null, dollars(700)),
        );
    });
});

describe('withPersonalDayLimits (PT-68h, F-V16)', () => {
    const options = { commission: 0, rewardMultiple: FUNDED_RR };

    it('ends a losing day once the realised loss reaches the daily loss limit, sizing the last trade so it cannot cross', () => {
        const policy = withPersonalDayLimits(
            flatFunded(),
            limitsOf(dollars(400), null),
            options,
        );

        expect(
            tradeDay(riskFunctionOf(policy), fundedStateOf(), [
                'loss',
                'loss',
                'loss',
                'loss',
            ]),
        ).toEqual([250, 150]);
    });

    it('sizes the last winning trade so the day cannot pass the daily profit cap, then ends the day', () => {
        const policy = withPersonalDayLimits(
            flatFunded(),
            limitsOf(null, dollars(700)),
            options,
        );

        expect(
            tradeDay(riskFunctionOf(policy), fundedStateOf(), [
                'win',
                'win',
                'win',
                'win',
            ]),
        ).toEqual([250, 100]);
    });

    it('does not let a win add loss room back: after a win and a loss the loss limit counts only the loss', () => {
        const policy = withPersonalDayLimits(
            flatFunded(),
            limitsOf(dollars(300), null),
            options,
        );

        expect(
            tradeDay(riskFunctionOf(policy), fundedStateOf(), [
                'win',
                'loss',
                'loss',
                'loss',
            ]),
        ).toEqual([250, 250, 50]);
    });

    it('keeps the candidate slot count, stop rule, sizing and loss count', () => {
        const base = {
            ...computedDayPolicy(
                () => 100,
                3,
                { dollars: 900, kind: DayStopRuleKind.AfterTarget },
                PolicySizing.WholeContracts,
            ),
            maxLossesPerDay: 2,
        };

        const wrapped = withPersonalDayLimits(
            base,
            limitsOf(dollars(400), null),
            options,
        );

        expect(wrapped.ladder).toHaveLength(3);
        expect(wrapped.stopRule).toStrictEqual(base.stopRule);
        expect(wrapped.sizing).toBe(PolicySizing.WholeContracts);
        expect(wrapped.maxLossesPerDay).toBe(2);
    });

    it('leaves a risk the limits do not bind exactly as the candidate gave it, with no cent rounding', () => {
        const base = computedDayPolicy(
            () => 123.456,
            2,
            NO_STOP,
            PolicySizing.WholeContracts,
        );
        const wrapped = withPersonalDayLimits(
            base,
            limitsOf(dollars(10_000), dollars(10_000)),
            options,
        );

        expect(
            tradeDay(riskFunctionOf(wrapped), fundedStateOf(), [
                'loss',
                'loss',
            ]),
        ).toEqual([123.456, 123.456]);
    });

    it('reads the candidate risk of a computed policy at the state of each trade', () => {
        const base = computedDayPolicy(
            (state) => (state.todayPnL === 0 ? 100 : 40),
            3,
            NO_STOP,
            PolicySizing.WholeContracts,
        );
        const wrapped = withPersonalDayLimits(
            base,
            limitsOf(dollars(10_000), null),
            options,
        );

        expect(
            tradeDay(riskFunctionOf(wrapped), fundedStateOf(), [
                'loss',
                'loss',
                'loss',
            ]),
        ).toEqual([100, 40, 40]);
    });

    it('fails loudly when a trade index arrives without the trade before it', () => {
        const wrapped = withPersonalDayLimits(
            flatFunded(),
            limitsOf(dollars(400), null),
            options,
        );

        expect(() => riskFunctionOf(wrapped)(fundedStateOf(), 2)).toThrow(
            /trade index 2 arrived without trade index 1/,
        );
    });

    it.each([
        ['a loss limit', limitsOf(dollars(400), null)],
        ['a profit cap', limitsOf(null, dollars(700))],
        ['both limits', limitsOf(dollars(450), dollars(650))],
    ])(
        'sizes every funded path like the documented rule with %s',
        (_name, limits) => {
            const paths: readonly (readonly Outcome[])[] = [
                ['loss', 'loss', 'loss', 'loss'],
                ['win', 'win', 'win', 'win'],
                ['loss', 'win', 'win', 'win'],
                ['win', 'loss', 'loss', 'loss'],
                ['win', 'win', 'loss', 'loss'],
            ];
            const documented = documentedDayRisk(
                apexEod,
                SizingStage.Funded,
                DEFAULT_RULEBOOK,
                policyWith(limits.dailyLossLimit, limits.dailyProfitCap),
            );
            const wrapped = riskFunctionOf(
                withPersonalDayLimits(flatFunded(), limits, options),
            );

            for (const path of paths) {
                expect(tradeDay(wrapped, fundedStateOf(), path)).toEqual(
                    tradeDay(documented, fundedStateOf(), path),
                );
            }
        },
    );
});

interface DayExtremes {
    readonly highestDayPnL: number;
    readonly highestRunningLoss: number;
    readonly lowestDayPnL: number;
}

interface PlacedDay {
    readonly highestDayPnL: number;
    readonly lowestDayPnL: number;
    readonly placed: number;
}

function dayGreenExtremes(
    ladder: readonly number[],
    rewardMultiple: number,
): DayExtremes {
    let highestDayPnL = 0;
    let highestRunningLoss = 0;
    let lowestDayPnL = 0;
    const walk = (index: number, dayPnL: number, runningLoss: number): void => {
        highestDayPnL = Math.max(highestDayPnL, dayPnL);
        highestRunningLoss = Math.max(highestRunningLoss, runningLoss);
        lowestDayPnL = Math.min(lowestDayPnL, dayPnL);
        const rung = ladder[index];
        if (rung === undefined || dayPnL > 0) return;
        walk(index + 1, dayPnL - rung, runningLoss + rung);
        walk(index + 1, dayPnL + rung * rewardMultiple, runningLoss);
    };
    walk(0, 0, 0);
    return { highestDayPnL, highestRunningLoss, lowestDayPnL };
}

function placedDay(
    policy: { computeRisk?: ComputeRisk; sizing: PolicySizing },
    outcome: Outcome,
    rewardMultiple: number,
    sizing: { instrument: InstrumentSymbol; stopPoints: number },
): PlacedDay {
    const risk = riskFunctionOf(policy);
    const positionSizing = resolvePositionSizing(
        sizing.instrument,
        sizing.stopPoints,
    );
    const state = fundedStateOf();
    let highestDayPnL = 0;
    let lowestDayPnL = 0;
    let placed = 0;
    for (let index = 0; index < 20; index++) {
        const { rewardRisk, risk: placedRisk } = resolveRiskAt({
            commission: 0,
            intendedRisk: risk(state, index),
            phase: TradingPhase.Funded,
            plan: apexEod,
            positionSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: policy.sizing,
            state,
        });
        if (placedRisk <= 0) break;
        const pnl =
            outcome === 'win' ? rewardMultiple * rewardRisk : -placedRisk;
        state.balance += pnl;
        state.todayPnL += pnl;
        placed += 1;
        highestDayPnL = Math.max(highestDayPnL, state.todayPnL);
        lowestDayPnL = Math.min(lowestDayPnL, state.todayPnL);
    }
    return { highestDayPnL, lowestDayPnL, placed };
}

describe('ladderUnderPersonalDayLimits on every day-green path (PT-68h, F-V16)', () => {
    it('sizes the rungs after a partial recovery so a later win cannot pass the daily profit cap', () => {
        const limited = ladderUnderPersonalDayLimits(
            [100, 100, 300, 300],
            limitsOf(null, dollars(100)),
            1,
        );

        expect(limited).toEqual([100, 100, 100, 200]);
    });

    it.each([
        [[100, 100, 300, 300], 1],
        [[200, 400, 600, 800], 1],
        [[150, 250, 350, 450], 1.5],
        [[100, 200, 400, 800], 2],
        [[300, 300, 300, 300], 0.5],
    ])(
        'keeps every day-green path of %j at reward multiple %s inside both limits',
        (ladder, rewardMultiple) => {
            for (const limits of [
                limitsOf(null, dollars(100)),
                limitsOf(null, dollars(300)),
                limitsOf(dollars(500), null),
                limitsOf(dollars(700), dollars(250)),
                limitsOf(dollars(450), dollars(650)),
            ]) {
                const limited = ladderUnderPersonalDayLimits(
                    ladder,
                    limits,
                    rewardMultiple,
                );
                const extremes = dayGreenExtremes(limited, rewardMultiple);

                expect(extremes.highestDayPnL).toBeLessThanOrEqual(
                    (limits.dailyProfitCap ?? Infinity) + 1e-9,
                );
                expect(extremes.highestRunningLoss).toBeLessThanOrEqual(
                    (limits.dailyLossLimit ?? Infinity) + 1e-9,
                );
                expect(-extremes.lowestDayPnL).toBeLessThanOrEqual(
                    (limits.dailyLossLimit ?? Infinity) + 1e-9,
                );
            }
        },
    );
});

describe('ladderUnderPersonalDayLimits (PT-68h, F-V16)', () => {
    it('is the ladder itself when no limit binds', () => {
        expect(
            ladderUnderPersonalDayLimits(
                [400, 600, 900, 100],
                LOOSE_LIMITS,
                FUNDED_RR,
            ),
        ).toEqual([400, 600, 900, 100]);
    });

    it('cuts the ladder where the running loss would pass the daily loss limit', () => {
        expect(
            ladderUnderPersonalDayLimits(
                [400, 600, 900, 100],
                LOSS_700,
                FUNDED_RR,
            ),
        ).toEqual([400, 300]);
    });

    it('keeps the earlier rungs and cuts the rung that would cross a daily loss limit that is not a rung boundary', () => {
        expect(
            ladderUnderPersonalDayLimits(
                [400, 600, 900, 100],
                LOSS_600,
                FUNDED_RR,
            ),
        ).toEqual([400, 200]);
    });

    it('sizes each rung so its win cannot pass the daily profit cap', () => {
        expect(
            ladderUnderPersonalDayLimits(
                [400, 600, 900, 100],
                CAP_300,
                FUNDED_RR,
            ),
        ).toEqual([150, 225, 337.5, 100]);
    });
});

describe('applyPersonalDayLimits (PT-68h, F-V16)', () => {
    const base: SimInputs = {
        fundedHorizonDays: 30,
        maxEvalDays: 5,
        payoutRequestSize: 500,
        plan: apexEod,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 4,
        trials: 10,
        winrate: 0.4,
    };

    it('returns the very same inputs when the policy carries no day limit', () => {
        expect(applyPersonalDayLimits(BASE_POLICY, base)).toBe(base);
        expect(
            applyPersonalDayLimits(
                {
                    ...BASE_POLICY,
                    personalCaps: {
                        ...NO_PERSONAL_CAPS,
                        maxRiskPerTrade: dollars(100),
                    },
                },
                base,
            ),
        ).toBe(base);
    });

    it('moves the funded day onto the limited computed policy and clears the fields it replaces', () => {
        const applied = applyPersonalDayLimits(policyWith(dollars(400), null), {
            ...base,
            fundedRiskPerTrade: 250,
            fundedTradesPerDay: 3,
        });

        expect(applied.fundedDayPolicy?.ladder).toHaveLength(3);
        expect(applied.fundedDayPolicy?.computeRisk).toBeTypeOf('function');
        expect(applied.fundedRiskPerTrade).toBeUndefined();
        expect(applied.fundedTradesPerDay).toBeUndefined();
        expect(applied.fundedCushionPercent).toBeUndefined();
        expect(appliedRisksOf(applied, ['loss', 'loss', 'loss'])).toEqual([
            250, 150,
        ]);
    });

    it('reads the funded reward multiple the simulator pays, not the eval one', () => {
        const applied = applyPersonalDayLimits(policyWith(null, dollars(600)), {
            ...base,
            fundedRrRatio: 3,
        });

        expect(appliedRisksOf(applied, ['win', 'win'], 3)).toEqual([200]);
    });
});

describe('the day limits hold with a stop in points, where trades place in whole contracts (PT-68h, F-V16)', () => {
    const NQ_10 = { instrument: InstrumentSymbol.NQ, stopPoints: 10 } as const;
    const ONE_CONTRACT = 200;
    const base: SimInputs = {
        ...NQ_10,
        fundedHorizonDays: 30,
        maxEvalDays: 5,
        payoutRequestSize: 500,
        plan: apexEod,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 4,
        trials: 10,
        winrate: 0.4,
    };

    function appliedFunded(
        policy: EnginePolicy,
        inputs: SimInputs = base,
    ): { computeRisk?: ComputeRisk; sizing: PolicySizing } {
        const { fundedDayPolicy } = applyPersonalDayLimits(policy, inputs);
        if (fundedDayPolicy === undefined) {
            throw new Error('expected a funded day policy');
        }
        return fundedDayPolicy;
    }

    function dayUnder(
        limits: { cap: Dollars | null; loss: Dollars | null },
        outcome: Outcome,
        inputs: SimInputs = base,
    ): PlacedDay {
        const policy = appliedFunded(
            policyWith(limits.loss, limits.cap),
            inputs,
        );
        return placedDay(policy, outcome, 2, NQ_10);
    }

    it('never places a losing day past the daily loss limit: a $100 room left is below one $200 contract, so the day ends', () => {
        const day = dayUnder({ cap: null, loss: dollars(300) }, 'loss');

        expect(-day.lowestDayPnL).toBeLessThanOrEqual(300);
        expect(day.placed).toBe(1);
    });

    it('never places a winning day past the daily profit cap: a $100 room left needs less than one contract, so the day ends', () => {
        const day = dayUnder({ cap: dollars(500), loss: null }, 'win');

        expect(day.highestDayPnL).toBeLessThanOrEqual(500);
        expect(day.placed).toBe(1);
    });

    it('places no trade when the daily profit cap is under the reward of one contract', () => {
        const day = dayUnder({ cap: dollars(300), loss: null }, 'win');

        expect(day.placed).toBe(0);
    });

    it('holds both limits for a percent of cushion candidate', () => {
        const percent: SimInputs = {
            ...base,
            fundedCushionPercent: fraction(0.1),
        };

        for (const [limits, outcome] of [
            [limitsOf(dollars(300), null), 'loss'],
            [limitsOf(dollars(500), null), 'loss'],
            [limitsOf(null, dollars(500)), 'win'],
            [limitsOf(null, dollars(700)), 'win'],
        ] as const) {
            const day = dayUnder(
                { cap: limits.dailyProfitCap, loss: limits.dailyLossLimit },
                outcome,
                percent,
            );

            expect(-day.lowestDayPnL).toBeLessThanOrEqual(
                limits.dailyLossLimit ?? Infinity,
            );
            expect(day.highestDayPnL).toBeLessThanOrEqual(
                limits.dailyProfitCap ?? Infinity,
            );
            expect(day.placed).toBeGreaterThan(0);
        }
    });

    it('sizes a limit that is a whole number of contracts exactly, with no cut', () => {
        const day = dayUnder(
            { cap: null, loss: dollars(2 * ONE_CONTRACT) },
            'loss',
        );

        expect(day.placed).toBe(2);
        expect(-day.lowestDayPnL).toBe(2 * ONE_CONTRACT);
    });
});

describe('the evaluation phase runs on the personal day limits too (PT-68h, F-V16)', () => {
    const base: SimInputs = {
        fundedHorizonDays: 30,
        maxEvalDays: 5,
        payoutRequestSize: 500,
        plan: apexEod,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 4,
        trials: 10,
        winrate: 0.4,
    };

    function evalRisksOf(
        applied: SimInputs,
        outcomes: readonly Outcome[],
    ): number[] {
        const risk = riskFunctionOf(applied.evalDayPolicy ?? flatFunded());
        return tradeDay(risk, apexEod.initialState(), outcomes);
    }

    it('ends a losing evaluation day at the daily loss limit, sizing the last trade to fit', () => {
        const applied = applyPersonalDayLimits(
            policyWith(dollars(400), null),
            base,
        );

        expect(applied.evalDayPolicy?.ladder).toHaveLength(4);
        expect(evalRisksOf(applied, ['loss', 'loss', 'loss', 'loss'])).toEqual([
            250, 150,
        ]);
    });

    it('sizes the last winning evaluation trade so the day cannot pass the daily profit cap', () => {
        const applied = applyPersonalDayLimits(
            policyWith(null, dollars(700)),
            base,
        );

        expect(evalRisksOf(applied, ['win', 'win', 'win', 'win'])).toEqual([
            250, 100,
        ]);
    });

    it('reads the evaluation reward multiple, not the funded one', () => {
        const applied = applyPersonalDayLimits(policyWith(null, dollars(600)), {
            ...base,
            fundedRrRatio: 3,
            rrRatio: 2,
        });

        expect(evalRisksOf(applied, ['win', 'win'])).toEqual([250, 50]);
    });
});
