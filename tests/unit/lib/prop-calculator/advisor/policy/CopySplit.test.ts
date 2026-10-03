import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    PayoutRequestPolicy,
    type Plan,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    DEFAULT_RULEBOOK,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { RUIN_FIRST_NOT_APPLICABLE_REASON } from '~/lib/prop-calculator/advisor/actions';
import {
    COPY_SPLIT_CORRELATION_NOTE,
    COPY_SPLIT_MIN_TRIALS,
    COPY_SPLIT_NOISE_SIGMAS,
    copySplitBasisLines,
    copySplitCandidates,
    type CopySplitFundedSizing,
    CopySplitFundedSource,
    CopySplitRowKind,
    copySplitTrials,
    type EnginePolicy,
    rankCopySplitRows,
    runCopySplit,
} from '~/lib/prop-calculator/advisor/policy';
import * as copySplitModule from '~/lib/prop-calculator/advisor/policy/CopySplit';
import {
    flatDayPolicy,
    policySizingOf,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { resolveDayPolicy } from '~/lib/prop-calculator/simulator';

const DOCUMENTED_FUNDED_RISK = DEFAULT_RULEBOOK.funded.riskCents / 100;

const ADVISOR_ROOT = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
);

const COPY_SPLIT_USE =
    /from '[^']*\/CopySplit'|\b(?:COPY_SPLIT_\w+|copySplit\w+|CopySplit(?:Candidate|Funded\w*|Placement|Refused\w*|Result|Row\w*|Simulated\w*)|DEFAULT_COPY_SPLIT_FUNDED|rankCopySplitRows|RankedCopySplitRows|runCopySplit)\b/;

const POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 30,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: 500,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: 2000,
};

function advisorSourceFiles(): string[] {
    return readdirSync(ADVISOR_ROOT, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

function baseInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 30,
        maxEvalDays: 30,
        payoutRequestSize: 500,
        plan: topStepPlan(),
        riskPerTrade: 2000,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 1,
        trials: 260,
        winrate: 0.4,
        ...overrides,
    };
}

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan not found');
    return plan;
}

function userFunded(
    overrides: Partial<typeof DEFAULT_RULEBOOK.funded>,
): CopySplitFundedSizing {
    return {
        parameters: { ...DEFAULT_RULEBOOK.funded, ...overrides },
        source: CopySplitFundedSource.UserRulebook,
    };
}

describe('copySplitTrials', () => {
    it('divides the trial budget by the sum of account counts across every split, rounded down', () => {
        expect(copySplitTrials(4000, [1, 2, 10])).toBe(307);
    });

    it('never goes below the floor of 50 trials', () => {
        expect(COPY_SPLIT_MIN_TRIALS).toBe(50);
        expect(copySplitTrials(100, [1, 2, 10])).toBe(50);
    });
});

describe('copySplitCandidates', () => {
    it('splits the total risk evenly across the copied accounts', () => {
        const candidates = copySplitCandidates(
            baseInputs(),
            POLICY,
            2000,
            [1, 2, 10],
        );
        expect(
            candidates.map((candidate) => candidate.splitCount),
        ).toStrictEqual([1, 2, 10]);
        expect(
            candidates.map((candidate) => candidate.riskPerAccount),
        ).toStrictEqual([2000, 1000, 200]);
    });

    it('builds each candidate through applyEnginePolicy with copyAccounts set to the split', () => {
        const base = baseInputs();
        const [, two] = copySplitCandidates(base, POLICY, 2000, [1, 2]);
        if (two?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated candidate');
        }
        const expected = applyEnginePolicy(base.plan, POLICY, {
            ...base,
            copyAccounts: 2,
            fundedRiskPerTrade: DOCUMENTED_FUNDED_RISK,
            riskPerTrade: 1000,
            trials: copySplitTrials(base.trials, [1, 2]),
        });
        expect(two.inputs).toStrictEqual(expected);
        expect(two.inputs.copyAccounts).toBe(2);
        expect(two.inputs.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
    });

    it('puts every split on the same seed and the same trial count', () => {
        const candidates = copySplitCandidates(
            baseInputs({ trials: 2600 }),
            POLICY,
            2000,
            [1, 2, 10],
        );
        const seeds = new Set<number>();
        const trials = new Set<number>();
        for (const candidate of candidates) {
            if (candidate.kind !== CopySplitRowKind.Simulated) {
                continue;
            }

            seeds.add(candidate.inputs.seed);
            trials.add(candidate.inputs.trials);
        }
        expect([...seeds]).toStrictEqual([7]);
        expect([...trials]).toStrictEqual([200]);
    });

    it('keeps an explicit funded risk per account, never divided by the split (Hard Rule 5)', () => {
        const [one, four] = copySplitCandidates(
            baseInputs({ fundedRiskPerTrade: 800 }),
            POLICY,
            2000,
            [1, 4],
        );
        if (
            one?.kind !== CopySplitRowKind.Simulated ||
            four?.kind !== CopySplitRowKind.Simulated
        ) {
            throw new Error('expected simulated candidates');
        }
        expect(one.inputs.fundedRiskPerTrade).toBe(800);
        expect(four.inputs.fundedRiskPerTrade).toBe(800);
        expect(four.inputs.riskPerTrade).toBe(500);
    });

    it('runs the funded phase at the documented fixed funded risk when the base has none, not at the eval total over the split', () => {
        const candidates = copySplitCandidates(
            baseInputs(),
            POLICY,
            2000,
            [1, 2, 10],
        );
        const funded = candidates.map((candidate) =>
            candidate.kind === CopySplitRowKind.Simulated
                ? candidate.inputs.fundedRiskPerTrade
                : null,
        );
        expect(DOCUMENTED_FUNDED_RISK).toBe(250);
        expect(funded).toStrictEqual([250, 250, 250]);
    });

    it('divides a fixed-dollar after-target day cap across the accounts in the eval, together with the risk', () => {
        const candidates = copySplitCandidates(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            }),
            POLICY,
            2000,
            [1, 4, 10],
        );
        const stops = candidates.map((candidate) =>
            candidate.kind === CopySplitRowKind.Simulated
                ? resolveDayPolicy(candidate.inputs, TradingPhase.Eval).stopRule
                : null,
        );
        expect(stops).toStrictEqual([
            { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            { dollars: 250, kind: DayStopRuleKind.AfterTarget },
            { dollars: 100, kind: DayStopRuleKind.AfterTarget },
        ]);
    });

    it('keeps the eval risk per account on the eval day policy the divided cap rides on', () => {
        const [four] = copySplitCandidates(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
                tradesPerDay: 2,
            }),
            POLICY,
            2000,
            [4],
        );
        if (four?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated candidate');
        }
        const policy = resolveDayPolicy(four.inputs, TradingPhase.Eval);
        expect(policy.ladder).toStrictEqual([500, 500]);
        expect(four.inputs.riskPerTrade).toBe(500);
    });

    it('runs the funded phase at the documented funded stop, never the cap divided by the split', () => {
        const candidates = copySplitCandidates(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            }),
            POLICY,
            2000,
            [1, 10],
        );
        const stops = candidates.map((candidate) =>
            candidate.kind === CopySplitRowKind.Simulated
                ? resolveDayPolicy(candidate.inputs, TradingPhase.Funded)
                      .stopRule
                : null,
        );
        expect(stops).toStrictEqual([
            { kind: DayStopRuleKind.None },
            { kind: DayStopRuleKind.None },
        ]);
    });

    it('takes the funded stop from the rulebook funded sizing it is given, in dollars and not divided', () => {
        const candidates = copySplitCandidates(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            }),
            POLICY,
            2000,
            [1, 10],
            userFunded({
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 30_000,
                },
            }),
        );
        const stops = candidates.map((candidate) =>
            candidate.kind === CopySplitRowKind.Simulated
                ? resolveDayPolicy(candidate.inputs, TradingPhase.Funded)
                      .stopRule
                : null,
        );
        expect(stops).toStrictEqual([
            { dollars: 300, kind: DayStopRuleKind.AfterTarget },
            { dollars: 300, kind: DayStopRuleKind.AfterTarget },
        ]);
    });

    it('takes the funded risk from the rulebook funded sizing it is given, and an explicit funded risk still wins', () => {
        const funded = userFunded({ riskCents: 40_000 });
        const [fromRulebook] = copySplitCandidates(
            baseInputs(),
            POLICY,
            2000,
            [2],
            funded,
        );
        const [explicit] = copySplitCandidates(
            baseInputs({ fundedRiskPerTrade: 800 }),
            POLICY,
            2000,
            [2],
            funded,
        );
        if (
            fromRulebook?.kind !== CopySplitRowKind.Simulated ||
            explicit?.kind !== CopySplitRowKind.Simulated
        ) {
            throw new Error('expected simulated candidates');
        }
        expect(fromRulebook.inputs.fundedRiskPerTrade).toBe(400);
        expect(explicit.inputs.fundedRiskPerTrade).toBe(800);
    });

    it('does not refuse every split for a contract-sized instrument when the rulebook funded risk is at least one contract', () => {
        const candidates = copySplitCandidates(
            baseInputs({ instrument: InstrumentSymbol.NQ, stopPoints: 20 }),
            POLICY,
            2000,
            [1, 2],
            userFunded({ riskCents: 80_000 }),
        );
        expect(candidates.map((candidate) => candidate.kind)).toStrictEqual([
            CopySplitRowKind.Simulated,
            CopySplitRowKind.Simulated,
        ]);
    });

    it('keeps the eval on the entered day stop and the funded phase on the rulebook funded stop for a stop that is not an after-target cap', () => {
        const candidates = copySplitCandidates(
            baseInputs({ dayStop: { kind: DayStopRuleKind.FirstWin } }),
            POLICY,
            2000,
            [1, 4],
            userFunded({
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            }),
        );
        const stops = candidates.map((candidate) =>
            candidate.kind === CopySplitRowKind.Simulated
                ? [
                      resolveDayPolicy(candidate.inputs, TradingPhase.Eval)
                          .stopRule,
                      resolveDayPolicy(candidate.inputs, TradingPhase.Funded)
                          .stopRule,
                  ]
                : null,
        );
        const expected = [
            { kind: DayStopRuleKind.FirstWin },
            { k: 2, kind: DayStopRuleKind.AfterKLosses },
        ];
        expect(stops).toStrictEqual([expected, expected]);
    });

    it('applies a rulebook funded stop when no day stop is entered, leaving the eval unstopped', () => {
        const [candidate] = copySplitCandidates(
            baseInputs(),
            POLICY,
            2000,
            [4],
            userFunded({
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            }),
        );
        if (candidate?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated candidate');
        }
        expect(
            resolveDayPolicy(candidate.inputs, TradingPhase.Eval).stopRule,
        ).toStrictEqual({ kind: DayStopRuleKind.None });
        expect(
            resolveDayPolicy(candidate.inputs, TradingPhase.Funded).stopRule,
        ).toStrictEqual({ k: 2, kind: DayStopRuleKind.AfterKLosses });
    });

    it('leaves the eval day policy unset when the entered stop already equals the funded stop and is not a cap', () => {
        const [candidate] = copySplitCandidates(
            baseInputs({
                dayStop: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            }),
            POLICY,
            2000,
            [4],
            userFunded({
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            }),
        );
        if (candidate?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated candidate');
        }
        expect(candidate.inputs.evalDayPolicy).toBeUndefined();
        expect(candidate.inputs.dayStop).toStrictEqual({
            k: 2,
            kind: DayStopRuleKind.AfterKLosses,
        });
    });

    it('refuses a split whose per-account risk is below one contract at the stop', () => {
        const candidates = copySplitCandidates(
            baseInputs({
                fundedRiskPerTrade: 800,
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            }),
            POLICY,
            2000,
            [1, 5, 10],
        );
        const [one, five, ten] = candidates;
        expect(one?.kind).toBe(CopySplitRowKind.Simulated);
        expect(five?.kind).toBe(CopySplitRowKind.Simulated);
        expect(ten?.kind).toBe(CopySplitRowKind.Refused);
        if (ten?.kind !== CopySplitRowKind.Refused) throw new Error('refused');
        expect(ten.reason).toContain('below one NQ contract');
        expect(ten.reason).toContain('$400');
        expect(ten.reason).not.toContain('\u{2014}');
        expect(ten.riskPerAccount).toBe(200);
    });

    it('refuses every split when the documented funded risk is below one contract at the stop, and says it is the funded risk', () => {
        const candidates = copySplitCandidates(
            baseInputs({
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            }),
            POLICY,
            2000,
            [1, 2],
        );
        for (const candidate of candidates) {
            if (candidate.kind !== CopySplitRowKind.Refused) {
                throw new Error('expected a refused candidate');
            }
            expect(candidate.reason).toMatch(/funded/i);
            expect(candidate.reason).toContain('$250');
        }
    });

    it('places whole contracts per account when an instrument and stop are set', () => {
        const [two] = copySplitCandidates(
            baseInputs({
                fundedRiskPerTrade: 800,
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            }),
            POLICY,
            2000,
            [2],
        );
        if (two?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated candidate');
        }
        expect(two.placement).toStrictEqual({
            contracts: 2,
            placedRiskPerAccount: 800,
        });
    });

    it('has no placement without an instrument and stop', () => {
        const [two] = copySplitCandidates(baseInputs(), POLICY, 2000, [2]);
        if (two?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated candidate');
        }
        expect(two.placement).toBeNull();
    });

    it('rejects an empty split list, a non-integer or repeated split and a non-positive total risk', () => {
        expect(() =>
            copySplitCandidates(baseInputs(), POLICY, 2000, []),
        ).toThrow(/at least one split/);
        expect(() =>
            copySplitCandidates(baseInputs(), POLICY, 2000, [1.5]),
        ).toThrow(/whole number/);
        expect(() =>
            copySplitCandidates(baseInputs(), POLICY, 2000, [2, 2]),
        ).toThrow(/more than once/);
        expect(() => copySplitCandidates(baseInputs(), POLICY, 0, [1])).toThrow(
            /total risk/,
        );
    });
});

describe('runCopySplit', () => {
    it('compares the whole group: total monthly net, total fees and cycle net across the N accounts', () => {
        const base = baseInputs({ trials: 200 });
        const result = runCopySplit(
            base,
            POLICY,
            2000,
            [1, 2],
            SizingObjective.MonthlyNet,
        );
        const two = result.rows.find((row) => row.splitCount === 2);
        if (two?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated row');
        }
        const out = simulate(
            applyEnginePolicy(base.plan, POLICY, {
                ...base,
                copyAccounts: 2,
                fundedRiskPerTrade: DOCUMENTED_FUNDED_RISK,
                riskPerTrade: 1000,
                trials: copySplitTrials(base.trials, [1, 2]),
            }),
        );
        expect(two.totalMonthlyNet.value).toBe(out.expectedMonthlyNet);
        expect(two.cycleNet.value).toBe(out.expectedNet);
        expect(two.totalFees).toBe(out.expectedTotalCost);
        expect(two.daysToPassP50).toBe(out.daysToPassP50);
        expect(two.passRate).toBe(out.evalPassProbability);
        expect(two.trials).toBe(copySplitTrials(base.trials, [1, 2]));
        if (out.expectedTotalCost > 0) {
            expect(two.netPerFeeDollar).toBe(
                out.expectedNet / out.expectedTotalCost,
            );
        }
    });

    it('prices the one-account split as the plain engine run of the concentrated risk', () => {
        const base = baseInputs({ trials: 130 });
        const result = runCopySplit(
            base,
            POLICY,
            2000,
            [1, 2],
            SizingObjective.MonthlyNet,
        );
        const one = result.rows.find((row) => row.splitCount === 1);
        if (one?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated row');
        }
        const out = simulate(
            applyEnginePolicy(base.plan, POLICY, {
                ...base,
                copyAccounts: 1,
                fundedRiskPerTrade: DOCUMENTED_FUNDED_RISK,
                riskPerTrade: 2000,
                trials: copySplitTrials(base.trials, [1, 2]),
            }),
        );
        expect(one.totalMonthlyNet.value).toBe(out.expectedMonthlyNet);
        expect(one.totalMonthlyNet.standardError).toBe(
            out.estimates.expectedMonthlyNet.standardError,
        );
    });

    it('simulates a divided split with the eval cap divided, not the cap undivided', () => {
        const base = baseInputs({
            dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            rrRatio: 0.25,
            tradesPerDay: 3,
            trials: 200,
        });
        const result = runCopySplit(
            base,
            POLICY,
            2000,
            [1, 4],
            SizingObjective.MonthlyNet,
        );
        const four = result.rows.find((row) => row.splitCount === 4);
        if (four?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated row');
        }
        const withCap = (cap: number) => {
            const inputs = applyEnginePolicy(base.plan, POLICY, {
                ...base,
                copyAccounts: 4,
                dayStop: { kind: DayStopRuleKind.None },
                evalDayPolicy: flatDayPolicy(
                    500,
                    3,
                    { dollars: cap, kind: DayStopRuleKind.AfterTarget },
                    policySizingOf(TradingPhase.Eval),
                ),
                fundedRiskPerTrade: DOCUMENTED_FUNDED_RISK,
                riskPerTrade: 500,
                trials: four.trials,
            });
            return simulate(inputs).expectedMonthlyNet;
        };
        expect(four.totalMonthlyNet.value).toBe(withCap(250));
        expect(withCap(250)).not.toBe(withCap(1000));
    });

    it('simulates the funded phase on the rulebook funded stop, not on the stop entered for the eval', () => {
        const base = baseInputs({
            dayStop: { dollars: 600, kind: DayStopRuleKind.AfterTarget },
            tradesPerDay: 3,
            trials: 200,
        });
        const funded = userFunded({
            stopRule: { k: 1, kind: DayStopRuleKind.AfterKLosses },
        });
        const withStop = runCopySplit(
            base,
            POLICY,
            2000,
            [1],
            SizingObjective.MonthlyNet,
            funded,
        );
        const withoutStop = runCopySplit(
            base,
            POLICY,
            2000,
            [1],
            SizingObjective.MonthlyNet,
        );
        const [row] = withStop.rows;
        const [plain] = withoutStop.rows;
        if (
            row?.kind !== CopySplitRowKind.Simulated ||
            plain?.kind !== CopySplitRowKind.Simulated
        ) {
            throw new Error('expected simulated rows');
        }
        const evalDayPolicy = flatDayPolicy(
            2000,
            3,
            { dollars: 600, kind: DayStopRuleKind.AfterTarget },
            policySizingOf(TradingPhase.Eval),
        );
        const inputs = applyEnginePolicy(base.plan, POLICY, {
            ...base,
            copyAccounts: 1,
            dayStop: { k: 1, kind: DayStopRuleKind.AfterKLosses },
            evalDayPolicy,
            fundedRiskPerTrade: DOCUMENTED_FUNDED_RISK,
            riskPerTrade: 2000,
            trials: row.trials,
        });
        const expected = simulate(inputs);
        expect(row.totalMonthlyNet.value).toBe(expected.expectedMonthlyNet);
        expect(row.totalMonthlyNet.value).not.toBe(plain.totalMonthlyNet.value);
    });

    it('is deterministic for one seed', () => {
        const base = baseInputs({ trials: 130 });
        const first = runCopySplit(
            base,
            POLICY,
            2000,
            [1, 2],
            SizingObjective.MonthlyNet,
        );
        const second = runCopySplit(
            base,
            POLICY,
            2000,
            [1, 2],
            SizingObjective.MonthlyNet,
        );
        expect(second).toStrictEqual(first);
    });

    it('ranks by monthly net under MonthlyNet and names the objective', () => {
        const result = runCopySplit(
            baseInputs({ trials: 130 }),
            POLICY,
            2000,
            [1, 2],
            SizingObjective.MonthlyNet,
        );
        expect(result.objective).toBe(SizingObjective.MonthlyNet);
        expect(result.note).toBeNull();
        const monthly = result.rows.flatMap((row) =>
            row.kind === CopySplitRowKind.Simulated
                ? [row.totalMonthlyNet.value]
                : [],
        );
        expect(monthly).toStrictEqual(monthly.toSorted((a, b) => b - a));
    });
});

const simulatedRow = (
    splitCount: number,
    monthly: number,
    cycle: number,
    standardError: null | number = null,
) => ({
    cycleNet: { standardError, value: cycle },
    daysToPassP50: 10,
    kind: CopySplitRowKind.Simulated as const,
    netPerFeeDollar: 1,
    passRate: 0.5,
    placement: null,
    riskPerAccount: 100,
    splitCount,
    totalFees: 100,
    totalMonthlyNet: { standardError, value: monthly },
    trials: 100,
});
const refusedRow = (splitCount: number) => ({
    kind: CopySplitRowKind.Refused as const,
    reason: 'below one contract',
    riskPerAccount: 10,
    splitCount,
});

describe('rankCopySplitRows', () => {
    it('ranks by monthly net for MonthlyNet and by cycle net for CycleCash', () => {
        const rows = [
            simulatedRow(1, 300, 100),
            simulatedRow(2, 200, 900),
            simulatedRow(3, 100, 500),
        ];
        expect(
            rankCopySplitRows(rows, SizingObjective.MonthlyNet).rows.map(
                (row) => row.splitCount,
            ),
        ).toStrictEqual([1, 2, 3]);
        expect(
            rankCopySplitRows(rows, SizingObjective.CycleCash).rows.map(
                (row) => row.splitCount,
            ),
        ).toStrictEqual([2, 3, 1]);
    });

    it('breaks a cycle net tie by monthly net, then by fewer accounts', () => {
        const rows = [
            simulatedRow(2, 100, 500),
            simulatedRow(3, 300, 500),
            simulatedRow(1, 300, 500),
        ];
        expect(
            rankCopySplitRows(rows, SizingObjective.CycleCash).rows.map(
                (row) => row.splitCount,
            ),
        ).toStrictEqual([1, 3, 2]);
    });

    it('lists refused rows last in their input order, whatever the objective', () => {
        const rows = [
            refusedRow(10),
            simulatedRow(1, 100, 100),
            refusedRow(5),
            simulatedRow(2, 300, 300),
        ];
        expect(
            rankCopySplitRows(rows, SizingObjective.MonthlyNet).rows.map(
                (row) => row.splitCount,
            ),
        ).toStrictEqual([2, 1, 10, 5]);
    });

    it('falls back to MonthlyNet with the not-applicable note under RuinFirst', () => {
        const rows = [simulatedRow(1, 100, 900), simulatedRow(2, 300, 100)];
        const ranked = rankCopySplitRows(rows, SizingObjective.RuinFirst);
        expect(ranked.objective).toBe(SizingObjective.MonthlyNet);
        expect(ranked.requestedObjective).toBe(SizingObjective.RuinFirst);
        expect(ranked.note).toBe(RUIN_FIRST_NOT_APPLICABLE_REASON);
        expect(ranked.rows.map((row) => row.splitCount)).toStrictEqual([2, 1]);
    });
});

describe('rankCopySplitRows noise', () => {
    it('marks rows within about two combined standard errors of the best row as indistinguishable', () => {
        expect(COPY_SPLIT_NOISE_SIGMAS).toBe(2);
        const rows = [
            simulatedRow(1, -128, 0, 1419),
            simulatedRow(2, -495, 0, 761),
            simulatedRow(5, -9000, 0, 100),
        ];
        const ranked = rankCopySplitRows(rows, SizingObjective.MonthlyNet);
        expect(ranked.rows.map((row) => row.splitCount)).toStrictEqual([
            1, 2, 5,
        ]);
        expect(ranked.indistinguishableSplits).toStrictEqual([2]);
    });

    it('never marks the best row and never marks a row without a standard error', () => {
        const rows = [
            simulatedRow(1, 300, 0, 10),
            simulatedRow(2, 299, 0, null),
            simulatedRow(3, 298, 0, 10),
        ];
        const ranked = rankCopySplitRows(rows, SizingObjective.MonthlyNet);
        expect(ranked.indistinguishableSplits).toStrictEqual([3]);
    });

    it('judges the noise on cycle net under CycleCash and lists no refused row', () => {
        const rows = [
            simulatedRow(1, 100, 900, 50),
            simulatedRow(2, 5000, 880, 50),
            refusedRow(10),
        ];
        const ranked = rankCopySplitRows(rows, SizingObjective.CycleCash);
        expect(ranked.indistinguishableSplits).toStrictEqual([2]);
    });

    it('has no indistinguishable row when every gap is large', () => {
        const rows = [simulatedRow(1, 1000, 0, 10), simulatedRow(2, 0, 0, 10)];
        expect(
            rankCopySplitRows(rows, SizingObjective.MonthlyNet)
                .indistinguishableSplits,
        ).toStrictEqual([]);
    });
});

describe('copySplitBasisLines', () => {
    it('names the win rate, reward to risk, funded days and the documented funded risk', () => {
        const lines = copySplitBasisLines(baseInputs(), POLICY);
        const text = lines.join('\n');
        expect(text).toContain('win rate 40%');
        expect(text).toContain('1:2');
        expect(text).toContain('30 funded days');
        expect(text).toContain('funded risk $250 per account');
        expect(text).toContain('Hard Rule 5');
        expect(text).not.toContain('\u{2014}');
    });

    it('names an explicit funded risk as per account and not divided', () => {
        const text = copySplitBasisLines(
            baseInputs({ fundedRiskPerTrade: 800 }),
            POLICY,
        ).join('\n');
        expect(text).toContain('funded risk $800 per account');
        expect(text).toContain('not divided by the split');
        expect(text).not.toContain('Hard Rule 5');
    });

    it('names the payout request and the retained cushion request', () => {
        const text = copySplitBasisLines(baseInputs(), POLICY).join('\n');
        expect(text).toContain('payout request $500');
        expect(text).toContain('retained cushion request $2,000');
    });

    it('says the copies are perfectly correlated and wins and busts together', () => {
        const lines = copySplitBasisLines(baseInputs(), POLICY);
        expect(lines).toContain(COPY_SPLIT_CORRELATION_NOTE);
        expect(COPY_SPLIT_CORRELATION_NOTE).toMatch(/identical trades/);
        expect(COPY_SPLIT_CORRELATION_NOTE).toMatch(/together/);
    });

    it('states the assumed zero rebuy lag, the unchecked payout cap and the missing position sizing', () => {
        const text = copySplitBasisLines(baseInputs(), POLICY).join('\n');
        expect(text).toContain('rebuy lag is assumed zero');
        expect(text).toContain('lifetime payout cap triggers are not checked');
        expect(text).toContain('no instrument and stop');
    });

    it('omits the zero rebuy lag and sizing assumptions when they are measured and set', () => {
        const text = copySplitBasisLines(
            baseInputs({ instrument: InstrumentSymbol.NQ, stopPoints: 20 }),
            {
                ...POLICY,
                instrument: InstrumentSymbol.NQ,
                rebuyLagBasis: RebuyLagBasis.Measured,
                rebuyLagDays: 3,
                stopPoints: 20,
            },
        ).join('\n');
        expect(text).not.toContain('rebuy lag is assumed zero');
        expect(text).not.toContain('no instrument and stop');
        expect(text).toContain('rebuy lag 3 days');
    });

    it('explains that a fixed-dollar after-target cap is a group total split with the risk', () => {
        const text = copySplitBasisLines(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            }),
            POLICY,
        ).join('\n');
        expect(text).toContain('after-target day cap $1,000 is a group total');
    });

    it('names the funded risk and the funded stop taken from the rulebook funded sizing it is given', () => {
        const text = copySplitBasisLines(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            }),
            POLICY,
            userFunded({
                riskCents: 40_000,
                stopRule: {
                    kind: DayStopRuleKind.AfterTarget,
                    targetCents: 30_000,
                },
            }),
        ).join('\n');
        expect(text).toContain('funded risk $400 per account');
        expect(text).toContain(
            'the funded phase uses your rulebook funded stop (after-target $300) per account, not the divided cap',
        );
        expect(text).not.toContain('\u{2014}');
    });

    it('says the funded phase has no stop, and that it is the default rulebook, when no funded sizing is given', () => {
        const text = copySplitBasisLines(
            baseInputs({
                dayStop: { dollars: 1000, kind: DayStopRuleKind.AfterTarget },
            }),
            POLICY,
        ).join('\n');
        expect(text).toContain(
            'the funded phase uses the default rulebook funded stop (none) per account, not the divided cap',
        );
        expect(text).not.toContain('documented funded stop');
    });

    it('names the funded stop for a day stop that is not an after-target cap, and for no day stop at all', () => {
        const none = copySplitBasisLines(baseInputs(), POLICY).join('\n');
        const firstWin = copySplitBasisLines(
            baseInputs({ dayStop: { kind: DayStopRuleKind.FirstWin } }),
            POLICY,
            userFunded({
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            }),
        ).join('\n');
        expect(none).toContain(
            'the funded phase uses the default rulebook funded stop (none) per account',
        );
        expect(none).not.toContain('not the divided cap');
        expect(firstWin).toContain(
            'the eval phase uses the day stop entered (first win)',
        );
        expect(firstWin).toContain(
            'the funded phase uses your rulebook funded stop (after 2 losses) per account',
        );
        expect(firstWin).not.toContain('not the divided cap');
    });

    it('says the funded trades per day and reward multiple follow the entered strategy, not the rulebook funded trades', () => {
        const entered = copySplitBasisLines(
            baseInputs({ tradesPerDay: 6 }),
            POLICY,
        ).join('\n');
        const given = copySplitBasisLines(
            baseInputs({
                fundedRrRatio: 3,
                fundedTradesPerDay: 2,
                tradesPerDay: 6,
            }),
            POLICY,
        ).join('\n');
        expect(entered).toContain(
            'funded trades per day 6 and reward multiple 1:2 follow the strategy entered, not the rulebook funded trades per day',
        );
        expect(given).toContain(
            'funded trades per day 2 and reward multiple 1:3 follow the strategy entered',
        );
    });

    it('is carried on the result of a run', () => {
        const base = baseInputs({ trials: 100 });
        const result = runCopySplit(
            base,
            POLICY,
            2000,
            [1, 2],
            SizingObjective.MonthlyNet,
        );
        expect(result.basisLines).toStrictEqual(
            copySplitBasisLines(base, POLICY),
        );
    });
});

describe('SIZING_OBJECTIVE_LABEL', () => {
    it('names every objective once, with no em dash', () => {
        expect(SIZING_OBJECTIVE_LABEL).toStrictEqual({
            [SizingObjective.CycleCash]: 'cycle cash',
            [SizingObjective.MonthlyNet]: 'monthly net',
            [SizingObjective.RuinFirst]: 'ruin first',
        });
    });
});

describe('CopySplit is never used by the headline, the rulebook or advice', () => {
    it('is imported by no advisor module outside the policy folder', () => {
        const outsidePolicy = advisorSourceFiles().filter(
            (file) => !file.includes(`${path.sep}policy${path.sep}`),
        );
        const offenders = outsidePolicy.filter((file) =>
            COPY_SPLIT_USE.test(readFileSync(file, 'utf8')),
        );
        expect(offenders).toStrictEqual([]);
    });
});

describe('the funded stop stopgap is gone (PT-63d)', () => {
    it('exports no funded stop notice, because the funded phase runs on the rulebook funded stop', () => {
        expect(copySplitModule).not.toHaveProperty('copySplitFundedStopNotice');
        expect(
            readFileSync(
                path.join(ADVISOR_ROOT, 'policy', 'CopySplit.ts'),
                'utf8',
            ),
        ).not.toContain('is not applied to this split yet');
    });
});
