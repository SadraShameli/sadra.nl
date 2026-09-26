import { describe, expect, it } from 'vitest';

import { formatCurrency, formatPercent } from '~/lib/format';
import {
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    type SimInputs,
    type SimOutputs,
    simulate,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    buildFundedCandidates,
    FUNDED_SORT_KEYS,
    type FundedCandidate,
    FundedCandidateBuildKind,
    fundedRowCells,
    fundedSortDescription,
    FundedSortKey,
    type FundedSweepRow,
    runFundedCandidateSweep,
    sortFundedResults,
    survivorCount,
} from '~/lib/prop-calculator/optimize';

const stopRule = { kind: DayStopRuleKind.DayGreen } as const;

function baseSimInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 40,
        plan: rapidEodPlan(),
        rebuyLagDays: 0,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 100,
        winrate: 0.4,
        ...overrides,
    };
}

function candidatesFor(
    positionSizing: null | PositionSizingConfig,
    lists: {
        flat?: number[];
        fundedLadder?: null | number[];
        percent?: number[];
    },
): FundedCandidate[] {
    const build = buildFundedCandidates({
        fundedLadder: null,
        plan: null,
        positionSizing,
        stopRule,
        ...lists,
    });
    if (build.kind !== FundedCandidateBuildKind.Built) {
        throw new Error(`refused: ${build.refusal.kind}`);
    }
    return build.candidates;
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function row(label: string, expectedNet: number, expectedMonthlyNet: number) {
    return {
        candidate: { label, overrides: {} },
        out: { expectedMonthlyNet, expectedNet },
    };
}

describe('FundedSortKey and FUNDED_SORT_KEYS', () => {
    it('keeps the CLI sort values and lists monthly first', () => {
        expect(FundedSortKey.Cycle).toBe('cycle');
        expect(FundedSortKey.Monthly).toBe('monthly');
        expect(FUNDED_SORT_KEYS).toStrictEqual([
            FundedSortKey.Monthly,
            FundedSortKey.Cycle,
        ]);
    });
});

describe('sortFundedResults', () => {
    const rows = [row('a', 100, 900), row('b', 300, 100), row('c', 200, 500)];

    it('ranks cycle descending on the per-cycle expected net', () => {
        expect(
            sortFundedResults(rows, FundedSortKey.Cycle).map(
                (entry) => entry.candidate.label,
            ),
        ).toStrictEqual(['b', 'c', 'a']);
    });

    it('ranks monthly descending on the credit-inclusive expectedMonthlyNet (T32)', () => {
        expect(
            sortFundedResults(rows, FundedSortKey.Monthly).map(
                (entry) => entry.candidate.label,
            ),
        ).toStrictEqual(['a', 'c', 'b']);
    });

    it('returns a sorted copy and leaves its input in place', () => {
        const input = [...rows];
        const sorted = sortFundedResults(input, FundedSortKey.Cycle);
        expect(sorted).not.toBe(input);
        expect(input.map((entry) => entry.candidate.label)).toStrictEqual([
            'a',
            'b',
            'c',
        ]);
    });

    it.each(FUNDED_SORT_KEYS)(
        'keeps tied rows in input order under %s',
        (sort) => {
            const tied = [
                row('first', 50, 50),
                row('top', 90, 90),
                row('second', 50, 50),
                row('third', 50, 50),
            ];
            expect(
                sortFundedResults(tied, sort).map(
                    (entry) => entry.candidate.label,
                ),
            ).toStrictEqual(['top', 'first', 'second', 'third']);
        },
    );
});

describe('runFundedCandidateSweep', () => {
    const base = baseSimInputs({ trials: 30 });

    it.each(FUNDED_SORT_KEYS)(
        'simulates every candidate over the base inputs and ranks them by %s',
        (sort) => {
            const candidates = candidatesFor(null, {
                flat: [150, 250, 400],
                fundedLadder: [400, 600],
            });
            const expected: FundedSweepRow[] = sortFundedResults(
                candidates.map((candidate) => ({
                    candidate,
                    out: simulate({ ...base, ...candidate.overrides }),
                })),
                sort,
            );
            const rows = runFundedCandidateSweep(base, candidates, sort);
            expect(rows).toStrictEqual(expected);
            expect(rows).toHaveLength(candidates.length);
        },
    );

    it('trades a 250/250/250/250 ladder at an NQ 10 point stop exactly like flat $250 (T33)', () => {
        const nqAtTen = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        const sized = baseSimInputs({
            dayStop: stopRule,
            instrument: InstrumentSymbol.NQ,
            stopPoints: 10,
            trials: 40,
        });
        const [ladder] = runFundedCandidateSweep(
            sized,
            candidatesFor(nqAtTen, {
                flat: [],
                fundedLadder: [250, 250, 250, 250],
                percent: [],
            }),
            FundedSortKey.Monthly,
        );
        const [flat] = runFundedCandidateSweep(
            sized,
            candidatesFor(nqAtTen, { flat: [250], percent: [] }),
            FundedSortKey.Monthly,
        );
        expect(ladder?.candidate.label).toBe(
            'ladder 250/250/250/250 (1/1/1/1 NQ = $200/$200/$200/$200)',
        );
        expect(flat?.candidate.label).toBe('flat $250 (1 NQ = $200)');
        expect(ladder?.out).toStrictEqual(flat?.out);
    });
});

describe('survivorCount', () => {
    it.each([
        [0.25, 400, 100],
        [0, 400, 0],
        [0.054, 2000, 108],
        [0.0025, 200, 1],
    ])(
        'rounds a funded survival probability of %d over %d trials to %d',
        (fundedSurvivalProbability, trials, expected) => {
            expect(survivorCount({ fundedSurvivalProbability }, trials)).toBe(
                expected,
            );
            expect(expected).toBe(
                Math.round(fundedSurvivalProbability * trials),
            );
        },
    );
});

describe('fundedRowCells', () => {
    it('formats the seven CLI columns from their own SimOutputs fields', () => {
        const out = {
            ...simulate(baseSimInputs({ trials: 5 })),
            expectedHorizonCredit: 4012.4,
            expectedMonthlyNet: 7129.2,
            expectedMonthlyRealizedNet: 2356.3,
            expectedNet: 1987.1,
            fundedBustProbability: 0.25,
            fundedSurvivalProbability: 0.054,
        } satisfies SimOutputs;
        expect(fundedRowCells('flat $1000', out, 2000)).toStrictEqual([
            'flat $1000',
            formatCurrency(1987.1),
            formatCurrency(4012.4),
            formatCurrency(7129.2),
            formatCurrency(2356.3),
            formatPercent(0.25),
            '108/2000',
        ]);
        expect(fundedRowCells('flat $1000', out, 2000).slice(1)).toStrictEqual([
            '$1,987',
            '$4,012',
            '$7,129',
            '$2,356',
            '25.0%',
            '108/2000',
        ]);
    });
});

const MONTHLY_TAIL = `monthly net = (per-cycle net + horizon credit) x ${TRADING_DAYS_PER_MONTH} / slot days, where slot days are the expected days per run (slot refilled after every failed eval, funded bust or 252-day horizon end, plus 0 rebuy-lag-days of empty slot time per eval attempt); the horizon credit is one more payout request for an account still open at the horizon, net of the split and the payout method fee: its withdrawable balance capped by the ladder step, request size, profit share and request caps, and capped by the payout profit pool (cycle profit since funding, a funded reset or the last payout on cycle-pool plans, account profit on account-profit plans) only when there is no payout ladder and no payout profit share; a payout ladder that denies an unaffordable step credits 0 when the step is above what the account could withdraw (its withdrawable balance, or its profit share if lower), and the credit is 0 once a lifetime payout cap is reached or the payout ladder is exhausted; the credit ignores the payout day and qualifying-day gate, the consistency rule, the minimum payout profit and the minimum request, since continued trading would clear them; monthly ex-credit = per-cycle net x ${TRADING_DAYS_PER_MONTH} / slot days, leaving the horizon credit out\n`;

describe('fundedSortDescription', () => {
    it('describes the cycle ranking with the eval cap and funded horizon', () => {
        expect(
            fundedSortDescription(FundedSortKey.Cycle, baseSimInputs()),
        ).toBe(
            '  ranked by per-cycle expected net for THIS run only (40-day eval cap + 252-day funded horizon, no assumption you repeat this indefinitely)\n',
        );
    });

    it('describes the monthly ranking for one account slot', () => {
        expect(
            fundedSortDescription(FundedSortKey.Monthly, baseSimInputs()),
        ).toBe(
            `  ranked by steady-state expected net per month for one account slot: ${MONTHLY_TAIL}`,
        );
    });

    it('names the copy-traded slots when --copy-accounts is above one', () => {
        expect(
            fundedSortDescription(
                FundedSortKey.Monthly,
                baseSimInputs({ copyAccounts: 3 }),
            ),
        ).toBe(
            `  ranked by steady-state expected net per month for 3 copy-traded account slots together (the per-cycle net, horizon credit and monthly figures are one slot x 3): ${MONTHLY_TAIL}`,
        );
    });

    it('states the configured rebuy lag, and 0 when the input omits it', () => {
        expect(
            fundedSortDescription(
                FundedSortKey.Monthly,
                baseSimInputs({ rebuyLagDays: 3 }),
            ),
        ).toContain(
            'plus 3 rebuy-lag-days of empty slot time per eval attempt);',
        );
        expect(
            fundedSortDescription(
                FundedSortKey.Monthly,
                baseSimInputs({ rebuyLagDays: undefined }),
            ),
        ).toContain(
            'plus 0 rebuy-lag-days of empty slot time per eval attempt);',
        );
    });
});
