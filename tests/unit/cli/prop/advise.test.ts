import { parseArgs } from 'citty';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import advise, {
    adviceJson,
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    coverageMatrixLines,
    firmOpenItemLines,
    nextTradeRiskCheckLines,
    readAdviseInputs,
    readSignedNumber,
    swingLines,
} from '~/cli/commands/prop/advise/command';
import {
    describeStopRule,
    formatCurrencyWithSe,
    formatPercentWithSe,
} from '~/cli/commands/prop/shared';
import { formatCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    dollars,
    findFirm,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountSubstate,
    type Advice,
    AdviceSource,
    ConsistencyCeilingNote,
    createSizingAdvisor,
    DAY_STOP_REASON_TEXT,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    type EngineOptimumRunnerResult,
    FundedSweepOptimumResultKind,
    type FundedWinnerPolicy,
    FundedWinnerPolicyKind,
    type NextPayoutProjection,
    NextTradeRiskVerdict,
    NO_PENDING_PAYOUT_COUNTS,
    type PayoutAdvice,
    PayoutCapKind,
    PayoutRequestDecisionKind,
    PayoutSizeSweepResultKind,
    type PayoutSizeSweepRow,
    personalPayoutOverrideWarningText,
    RetainedCushionBasis,
    RuleSource,
    runEngineOptimum,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    SizingAssumption,
    SizingConstraint,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { dayProgressFromCounts } from '~/lib/prop-calculator/advisor/actions';
import {
    TRADE_VALUE_SWING_ASSUMPTION,
    type TradeValueSwingResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { planRulesFingerprint } from '~/lib/prop-calculator/describe';

function instantFundedPlan(): Plan {
    const plan = ALL_FIRMS.flatMap((firm) => firm.plans).find(
        (candidate) => candidate.isInstantFunded,
    );
    if (!plan) throw new Error('No instant-funded plan found in ALL_FIRMS');
    return plan;
}

function mffPlan(variant: MffuVariant): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFF ${variant} 50K plan not found`);
    return plan;
}

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

const FRESH_FUNDED_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'funded',
    '--balance',
    '50000',
    '--highest-eod',
    '50000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--snapshot-date',
    '2024-01-02',
    '--trials',
    '50',
];

const FRESH_FUNDED_APEX_EOD_TODAY = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'funded',
    '--balance',
    '52000',
    '--highest-eod',
    '52000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--trials',
    '10',
];

describe('adviseArguments (F-133)', () => {
    it('exposes --stage with every SizingStage option', () => {
        expect(adviseArguments.stage.options).toStrictEqual(
            Object.values(SizingStage),
        );
    });

    it('has no citty default for --retain-cushion, --request-size or --rebuy-lag-days', () => {
        expect(adviseArguments['retain-cushion']).not.toHaveProperty('default');
        expect(adviseArguments['request-size']).not.toHaveProperty('default');
        expect(adviseArguments['rebuy-lag-days']).not.toHaveProperty('default');
    });

    it('defaults --dashboard-convention, --eval-mode and --ladder-fractions from the rulebook', () => {
        expect(adviseArguments['dashboard-convention'].default).toBe('nominal');
        expect(adviseArguments['eval-mode'].default).toBe(
            DEFAULT_RULEBOOK.eval.mode,
        );
        expect(adviseArguments['ladder-fractions'].default).toBe(
            DEFAULT_RULEBOOK.eval.ladderFractionSource,
        );
    });
});

describe('readAdviseInputs: reader (F-133 step 1a)', () => {
    it('parses a fresh funded snapshot into dollars plus a stage', () => {
        const { plan, snapshot, stage } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD),
        );
        expect(plan.id.firm).toBe(FirmId.Apex);
        expect(stage).toBe(SizingStage.Funded);
        expect(snapshot.balance).toBe(50_000);
        expect(snapshot.highestEodBalance).toBe(50_000);
        expect(snapshot.tradingDays).toBe(5);
        expect(snapshot.payoutsTaken).toBe(0);
        expect(snapshot.asOf).toBe('2024-01-02');
    });

    it('defaults --snapshot-date to today when omitted', () => {
        const { snapshot } = readAdviseInputs(
            parseAdvise(
                FRESH_FUNDED_APEX_EOD.filter(
                    (part, index, all) =>
                        !(
                            part === '--snapshot-date' ||
                            all[index - 1] === '--snapshot-date'
                        ),
                ),
            ),
        );
        expect(snapshot.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rejects a missing --stage', () => {
        expect(() =>
            readAdviseInputs(
                parseAdvise(
                    FRESH_FUNDED_APEX_EOD.filter((part) => part !== 'funded'),
                ),
            ),
        ).toThrow('--stage');
    });

    it('builds a positionSizing option only when --stop-points is given', () => {
        const withoutStop = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD),
        );
        expect(withoutStop.options.positionSizing).toBeUndefined();

        const withStop = readAdviseInputs(
            parseAdvise([
                ...FRESH_FUNDED_APEX_EOD,
                '--instrument',
                'MNQ',
                '--stop-points',
                '40',
            ]),
        );
        expect(withStop.options.positionSizing).toStrictEqual({
            instrument: 'MNQ',
            stopPoints: 40,
        });
    });

    it('passes a given --retain-cushion as a personal override', () => {
        const { options } = readAdviseInputs(
            parseAdvise([...FRESH_FUNDED_APEX_EOD, '--retain-cushion', '2500']),
        );
        expect(options.personalRetainedCushion).toBe(2500);
    });

    it('passes a given --request-size as a personal payout override', () => {
        const { options } = readAdviseInputs(
            parseAdvise([...FRESH_FUNDED_APEX_EOD, '--request-size', '750']),
        );
        expect(options.personalPayoutOverride).toBe(750);
    });

    it('a given --rebuy-lag-days is a measured override; omitted assumes 0 with 1 sample less trust', () => {
        const omitted = readAdviseInputs(parseAdvise(FRESH_FUNDED_APEX_EOD));
        expect(omitted.options.measuredRebuyLag).toBeUndefined();

        const { options } = readAdviseInputs(
            parseAdvise([...FRESH_FUNDED_APEX_EOD, '--rebuy-lag-days', '3']),
        );
        expect(options.measuredRebuyLag).toStrictEqual({ days: 3, samples: 1 });
    });
});

describe('readAdviseInputs: required-flag failures name the flag (F-133 step 1b)', () => {
    it('fails without --balance, naming the flag', () => {
        expect(() =>
            readAdviseInputs(
                parseAdvise(
                    FRESH_FUNDED_APEX_EOD.filter(
                        (part, index, all) =>
                            !(
                                part === '--balance' ||
                                all[index - 1] === '--balance'
                            ) &&
                            !(
                                part === '50000' &&
                                all[index - 1] === '--balance'
                            ),
                    ),
                ),
            ),
        ).toThrow('--balance');
    });

    it('Apex intraday without --highest-intraday or --dashboard-floor names both as one-of', () => {
        const argv = [
            '--firm',
            'apex',
            '--variant',
            'intraday',
            '--stage',
            'funded',
            '--balance',
            '50000',
            '--highest-eod',
            '50000',
            '--trading-days',
            '5',
            '--payouts',
            '0',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).toThrow(
            /highest-intraday.*dashboard-floor|dashboard-floor.*highest-intraday/,
        );
    });

    it('a hidden flag for the stage is rejected (--cycle-best-day on eval)', () => {
        const argv = [
            '--firm',
            'apex',
            '--variant',
            'eod',
            '--stage',
            'eval',
            '--balance',
            '48000',
            '--highest-eod',
            '48000',
            '--trading-days',
            '3',
            '--cycle-best-day',
            '500',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).toThrow(
            '--cycle-best-day',
        );
    });

    it('rejects eval on an instant-funded plan via describeLifecycleRejection', () => {
        const plan = instantFundedPlan();
        const argv = [
            '--firm',
            plan.id.firm,
            '--variant',
            'variant' in plan.id ? plan.id.variant : '',
            '--stage',
            'eval',
            '--balance',
            String(plan.accountSize),
            '--trading-days',
            '1',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).toThrow(
            /instant-funded/,
        );
    });

    it('rejects an unoffered opt-in by name (--early-withdrawal on MFF Rapid)', () => {
        const plan = mffPlan(MffuVariant.Rapid);
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'rapid',
            '--stage',
            'funded',
            '--balance',
            String(plan.accountSize),
            '--highest-eod',
            String(plan.accountSize),
            '--trading-days',
            '5',
            '--payouts',
            '0',
            '--early-withdrawal',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).toThrow(
            '--early-withdrawal',
        );
    });

    it('accepts --early-withdrawal on MFF Pro, which offers it', () => {
        const plan = mffPlan(MffuVariant.Pro);
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'pro',
            '--stage',
            'funded',
            '--balance',
            String(plan.accountSize),
            '--highest-eod',
            String(plan.accountSize),
            '--trading-days',
            '5',
            '--payouts',
            '0',
            '--early-withdrawal',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).not.toThrow();
    });

    it('flags a nominal balance that looks zero-based, mapped to --balance', () => {
        const argv = [
            '--firm',
            'apex',
            '--variant',
            'eod',
            '--stage',
            'funded',
            '--balance',
            '2400',
            '--highest-eod',
            '2400',
            '--trading-days',
            '5',
            '--payouts',
            '0',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).toThrow('--balance');
    });

    it('flags a zero-based balance that looks nominal, mapped to --balance', () => {
        const argv = [
            '--firm',
            'apex',
            '--variant',
            'eod',
            '--stage',
            'funded',
            '--dashboard-convention',
            'zero-based',
            '--balance',
            '52400',
            '--highest-eod',
            '52400',
            '--trading-days',
            '5',
            '--payouts',
            '0',
        ];
        expect(() => readAdviseInputs(parseAdvise(argv))).toThrow('--balance');
    });
});

describe('readAdviseInputs: rulebook overrides (F-133 step 1a/1b)', () => {
    it('a --retain-cushion below $2,000 fails with the Hard Rule 2 message', () => {
        expect(() =>
            readAdviseInputs(
                parseAdvise([
                    ...FRESH_FUNDED_APEX_EOD,
                    '--retain-cushion',
                    '1500',
                ]),
            ),
        ).toThrow(/Hard Rule 2/);
    });

    it('--allow-below-hard-rule-2 permits a --retain-cushion below $2,000', () => {
        expect(() =>
            readAdviseInputs(
                parseAdvise([
                    ...FRESH_FUNDED_APEX_EOD,
                    '--retain-cushion',
                    '1500',
                    '--allow-below-hard-rule-2',
                ]),
            ),
        ).not.toThrow();
    });

    it('--eval-mode max-risk with --rr above the daily cap multiple fails with the Hard Rule 4 message', () => {
        expect(() =>
            readAdviseInputs(
                parseAdvise([
                    ...FRESH_FUNDED_APEX_EOD,
                    '--eval-mode',
                    'max-risk',
                    '--rr',
                    '10',
                ]),
            ),
        ).toThrow(/Hard Rule 4/);
    });
});

describe('the full advise pipeline produces real Advice (F-133 step 1c/2/3)', () => {
    it('runs the engine and assembles Advice whose headline leads the report', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(withFlag(FRESH_FUNDED_APEX_EOD, '--trials', '10')),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const requests = advisor.optimumRequests();
        const results = requests.map((request) =>
            runEngineOptimum(plan, request),
        );
        const advice = advisor.assemble(results);

        const lines = adviceReportLines(advice);
        expect(lines[0]).toBe(advice.headline);
        expect(lines.length).toBeGreaterThan(1);
    }, 10_000);

    it('adviceJson round-trips through JSON.parse to the same Advice shape', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const advice = advisor.assemble([]);

        const json = adviceJson(advice);
        expect(JSON.stringify(JSON.parse(json))).toBe(JSON.stringify(advice));
    });

    it('stale advice reports "enter today\'s balance" and withholds rung amounts', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise([
                ...FRESH_FUNDED_APEX_EOD.filter(
                    (part, index, all) =>
                        !(
                            part === '--snapshot-date' ||
                            all[index - 1] === '--snapshot-date'
                        ),
                ),
                '--snapshot-date',
                '2000-01-03',
            ]),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const advice = advisor.assemble([]);

        expect(advice.staleness.kind).toBe('stale');
        expect(advice.documented).toBeNull();
        const lines = adviceReportLines(advice);
        const staleLine = lines.find((line) =>
            line.includes("enter today's balance"),
        );
        expect(staleLine).toBeDefined();
        expect(
            lines.some((line) => /\$[0-9]/.test(line) && line !== staleLine),
        ).toBe(false);
    });

    it('the command is wired into the default export', () => {
        expect(advise.args).toBe(adviseArguments);
        expect(typeof advise.run).toBe('function');
    });
});

const SWING_FIXTURE: TradeValueSwingResult = {
    afterLoss: {
        creditFree: { standardError: null, value: 600 },
        creditInclusive: { standardError: null, value: 900 },
        kind: ValueResultKind.Value as const,
        seed: 1,
        trials: 1,
    },
    afterLossBusted: false,
    afterLossRebuyLagDays: null,
    afterWin: {
        creditFree: { standardError: null, value: 1000 },
        creditInclusive: { standardError: null, value: 1100 },
        kind: ValueResultKind.Value as const,
        seed: 1,
        trials: 1,
    },
    assumption: TRADE_VALUE_SWING_ASSUMPTION,
    deltaLoss: { standardError: null, value: -100 },
    deltaWin: { standardError: null, value: 100 },
    kind: ValueResultKind.Swing as const,
    now: {
        creditFree: { standardError: null, value: 800 },
        creditInclusive: { standardError: null, value: 1000 },
        kind: ValueResultKind.Value as const,
        seed: 1,
        trials: 1,
    },
    winProbability: 0.4,
};

describe('swingLines (F-V17 addendum: EV swing at --risk)', () => {
    it('renders now/after-win/after-loss values and flags a --rr that differs from the documented rule as a what-if', () => {
        const assumption: typeof TRADE_VALUE_SWING_ASSUMPTION =
            TRADE_VALUE_SWING_ASSUMPTION;
        const outcome = {
            afterLoss: {
                creditFree: { standardError: null, value: 900 },
                creditInclusive: { standardError: null, value: 900 },
                kind: ValueResultKind.Value as const,
                seed: 1,
                trials: 1,
            },
            afterLossBusted: false,
            afterLossRebuyLagDays: null,
            afterWin: {
                creditFree: { standardError: null, value: 1100 },
                creditInclusive: { standardError: null, value: 1100 },
                kind: ValueResultKind.Value as const,
                seed: 1,
                trials: 1,
            },
            assumption,
            deltaLoss: { standardError: null, value: -100 },
            deltaWin: { standardError: null, value: 100 },
            kind: ValueResultKind.Swing as const,
            now: {
                creditFree: { standardError: null, value: 1000 },
                creditInclusive: { standardError: null, value: 1000 },
                kind: ValueResultKind.Value as const,
                seed: 1,
                trials: 1,
            },
            winProbability: 0.4,
        };

        const sameRr = swingLines(outcome, 2, 2, 0);
        expect(sameRr[0]).not.toContain('what-if');

        const differentRr = swingLines(outcome, 3, 2, 0);
        expect(differentRr[0]).toContain('what-if');
        expect(differentRr[0]).toContain('documented 1:2');
    });

    it('states the session boundary and the credit basis, and prints the credit-free figures', () => {
        const lines = swingLines(SWING_FIXTURE, 2, 2, 0);

        expect(lines[0]).toContain(TRADE_VALUE_SWING_ASSUMPTION);
        expect(lines[0]).toContain('credit-free');
        expect(lines[0]).toContain('now $800');
        expect(lines[0]).toContain('after a win $1,000');
        expect(lines[0]).toContain('after a loss $600');
        expect(lines[0]).not.toContain('$1,000.00');
    });

    it('nets the replacement fee on a busting loss, as the web panel does', () => {
        const busted = {
            ...SWING_FIXTURE,
            afterLossBusted: true,
            afterLossRebuyLagDays: 3,
        };

        const withoutFee = swingLines(busted, 2, 2, 0)[0];
        const withFee = swingLines(busted, 2, 2, 150)[0];

        expect(withoutFee).toContain('after a loss $600');
        expect(withFee).toContain('after a loss $450');
        expect(withFee).toContain('replacement fee $150');
        expect(withFee).toContain('rebuy lag 3 days');
    });

    it('leaves a loss that does not bust untouched by the replacement fee', () => {
        expect(swingLines(SWING_FIXTURE, 2, 2, 150)[0]).toContain(
            'after a loss $600',
        );
    });

    it('reports not-modeled outcomes without formatting them as dollars', () => {
        const lines = swingLines(
            {
                kind: ValueResultKind.NotModeled,
                reason: 'live-not-modeled' as never,
            },
            2,
            null,
            0,
        );
        expect(lines[0]).toContain('not modeled');
    });
});

describe('--wins-today, --losses-today, --proposed-risk (F-V18, F-V19, PT-24b step 2)', () => {
    it('adviseArguments exposes the three flags as plain strings with no citty default', () => {
        expect(adviseArguments['wins-today'].type).toBe('string');
        expect(adviseArguments['losses-today'].type).toBe('string');
        expect(adviseArguments['proposed-risk'].type).toBe('string');
    });

    it('dayProgressFromCounts walks the daily plan card rungs for the given losses and prices wins at the next rung', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const rungs = advisor.dailyPlanCard()?.rungs ?? [];
        if (rungs.length < 2) {
            throw new Error('expected at least two rungs in this fixture');
        }

        const day = dayProgressFromCounts(advisor, 1, 1);

        expect(day.losses).toBe(1);
        expect(day.wins).toBe(1);
        expect(day.runningLoss).toBe(rungs[0]?.runningLossAfter);
        expect(day.dayPnL).toBe(
            dollars(
                (rungs[1]?.takeProfit ?? 0) - (rungs[0]?.runningLossAfter ?? 0),
            ),
        );
    });

    it('dayProgressFromCounts with zero wins and losses is the zero day', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);

        const day = dayProgressFromCounts(advisor, 0, 0);

        expect(day).toStrictEqual({
            dayPnL: dollars(0),
            losses: 0,
            runningLoss: dollars(0),
            wins: 0,
        });
    });

    it('nextTradeRiskCheckLines prints the verdict and the excess above the documented rung', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const day = dayProgressFromCounts(advisor, 1, 1);
        const result = advisor.checkNextTradeRisk(dollars(600), day);
        if (result === null) throw new Error('expected a risk-check result');

        const lines = nextTradeRiskCheckLines(result);

        expect(result.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(lines[0]).toContain(NextTradeRiskVerdict.AboveDocumented);
        expect(lines.join(' ')).toContain('excess');
        expect(result.excessCents).toBeGreaterThan(0);
    });

    it('never reports within-plan for a proposed risk once losses-today exhausts the documented rungs (review CRITICAL)', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const rungs = advisor.dailyPlanCard()?.rungs ?? [];
        if (rungs.length === 0) {
            throw new Error('expected at least one rung in this fixture');
        }

        const day = dayProgressFromCounts(advisor, 0, rungs.length);
        const result = advisor.checkNextTradeRisk(dollars(10_000), day);
        if (result === null) throw new Error('expected a risk-check result');

        const lines = nextTradeRiskCheckLines(result, day);

        expect(result.verdict).not.toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result.verdict).not.toBe(NextTradeRiskVerdict.AboveDp);
        expect(lines.join(' ')).not.toContain('within-plan');
        expect(result.excessCents).toBeGreaterThan(0);
    });

    it('says the documented plan is to stop for today, with the reason and the loss-first ordering assumption, for $600 once the rungs are exhausted', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const rungs = advisor.dailyPlanCard()?.rungs ?? [];

        const day = dayProgressFromCounts(advisor, 0, rungs.length + 1);
        const result = advisor.checkNextTradeRisk(dollars(600), day);
        if (result === null) throw new Error('expected a risk-check result');
        if (result.stopReason === null) {
            throw new Error('expected the day to be stopped');
        }

        const lines = nextTradeRiskCheckLines(result, day);

        expect(result.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(result.excessCents).toBe(60_000);
        expect(lines).toContain(
            'the documented plan is to stop for today, so no risk is within the plan',
        );
        expect(lines).toContain(DAY_STOP_REASON_TEXT[result.stopReason]);
        expect(lines).toContain('excess above the cap: $600');
        expect(lines).toContain(
            SIZING_ASSUMPTION_TEXT[SizingAssumption.RungsAssumeEarlierLosses],
        );
        expect(lines.join(' ')).not.toContain('documented rung');
    });

    it('nextTradeRiskCheckLines discloses the loss-first, no-room-for-wins assumption whenever wins or losses are entered', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const activeDay = dayProgressFromCounts(advisor, 1, 1);
        const activeResult = advisor.checkNextTradeRisk(
            dollars(600),
            activeDay,
        );
        if (activeResult === null) throw new Error('expected a result');
        const zeroDay = dayProgressFromCounts(advisor, 0, 0);
        const zeroResult = advisor.checkNextTradeRisk(dollars(100), zeroDay);
        if (zeroResult === null) throw new Error('expected a result');

        const activeLines = nextTradeRiskCheckLines(activeResult, activeDay);
        const zeroLines = nextTradeRiskCheckLines(zeroResult, zeroDay);

        expect(activeLines).toContain(
            SIZING_ASSUMPTION_TEXT[SizingAssumption.RungsAssumeEarlierLosses],
        );
        expect(activeLines).toContain(
            SIZING_ASSUMPTION_TEXT[SizingAssumption.WinsAddNoLossRoom],
        );
        expect(zeroLines).not.toContain(
            SIZING_ASSUMPTION_TEXT[SizingAssumption.RungsAssumeEarlierLosses],
        );
    });
});

describe('coverageMatrixLines (F-V20 addendum: coverage matrix, extended to every substate by PT-24b)', () => {
    it('prints one line per rankable plan x stage x substate for a firm, each advice or a typed unsupported reason', () => {
        const lines = coverageMatrixLines(FirmId.Apex);
        expect(lines.length).toBeGreaterThan(1);
        expect(lines[0]).toBe('-- apex --');
        for (const line of lines.slice(1)) {
            expect(line).toMatch(/: (advice \(|unsupported \()/);
        }
    });

    it('never throws for an instant-funded plan at eval stage, printing a single fresh line', () => {
        const plan = instantFundedPlan();
        const lines = coverageMatrixLines(plan.id.firm);
        const evalLines = lines.filter(
            (line) =>
                line.startsWith(`${plan.label} x`) &&
                line.includes(' x eval x '),
        );
        expect(evalLines).toHaveLength(1);
        expect(evalLines[0]).toContain('unsupported (instant-funded, no eval)');
    });

    it('reports live not modeled for a firm with no live program at all, never a false advice line (review finding HIGH-1)', () => {
        const lines = coverageMatrixLines(FirmId.E8Futures);
        const liveLines = lines.filter(
            (line) =>
                line.includes(' x live x ') && !line.includes(' x suspended:'),
        );
        expect(liveLines.length).toBeGreaterThan(0);
        for (const line of liveLines) {
            expect(line).toContain('unsupported (live not modeled)');
        }
    });

    it('prints every AccountSubstate for a stage that is not instant-funded eval', () => {
        const plan = instantFundedPlan();
        const lines = coverageMatrixLines(plan.id.firm);
        const fundedLines = lines.filter(
            (line) =>
                line.startsWith(`${plan.label} x`) &&
                line.includes(' x funded x '),
        );
        expect(fundedLines).toHaveLength(Object.values(AccountSubstate).length);
    });
});

describe('readSignedNumber (review finding HIGH-2: empty string must not coerce to $0)', () => {
    it('rejects an empty string instead of silently returning 0', () => {
        expect(() => readSignedNumber('', 'balance')).toThrow('--balance');
    });

    it('rejects a whitespace-only string instead of silently returning 0', () => {
        expect(() => readSignedNumber(' '.repeat(3), 'balance')).toThrow(
            '--balance',
        );
    });

    it('still accepts a real signed number', () => {
        expect(readSignedNumber('-42.5', 'balance')).toBe(-42.5);
        expect(readSignedNumber('42.5', 'balance')).toBe(42.5);
    });
});

function evalAdviceForLadderSearch() {
    const { options, plan, snapshot } = readAdviseInputs(
        parseAdvise([
            '--firm',
            'apex',
            '--variant',
            'eod',
            '--stage',
            'eval',
            '--balance',
            '48500',
            '--highest-eod',
            '48500',
            '--trading-days',
            '3',
            '--trials',
            '50',
            '--seed',
            '1',
        ]),
    );
    const account = AccountReconstruction.rebuild(
        snapshot,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    const advisor = createSizingAdvisor(account, options);
    const requests = advisor.optimumRequests();
    const results = requests.map((request) => runEngineOptimum(plan, request));
    return advisor.assemble(results);
}

function fundedAdviceWithOverride(requestSize: string, trials: string) {
    const { options, plan, snapshot } = readAdviseInputs(
        parseAdvise([
            ...withoutSnapshotDate(),
            '--trials',
            trials,
            '--request-size',
            requestSize,
        ]),
    );
    const account = AccountReconstruction.rebuild(
        snapshot,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    const advisor = createSizingAdvisor(account, options);
    const requests = advisor.optimumRequests();
    const results = requests.map((request) => runEngineOptimum(plan, request));
    return advisor.assemble(results);
}

const OVERRIDE_ADVICE_CACHE = new Map<string, Advice>();

function overrideAdvice(): Advice {
    const cached = OVERRIDE_ADVICE_CACHE.get('1000');
    if (cached !== undefined) return cached;
    const advice = fundedAdviceWithOverride('1000', '40');
    OVERRIDE_ADVICE_CACHE.set('1000', advice);
    return advice;
}

function withoutSnapshotDate(): string[] {
    return FRESH_FUNDED_APEX_EOD.filter(
        (part, index) =>
            part !== '--snapshot-date' &&
            FRESH_FUNDED_APEX_EOD[index - 1] !== '--snapshot-date',
    );
}

describe('adviceReportLines: engine optima disclose their basis and standard error (review findings HIGH-1, HIGH-2, MEDIUM)', () => {
    it('prints the payout-size sweep winner value and a losing --request-size override with its warning (HIGH-1)', () => {
        const advice = overrideAdvice();
        const lines = adviceReportLines(advice);

        const winnerLine = lines.find(
            (line) =>
                line.startsWith('payout-size sweep:') &&
                !line.includes('personal override'),
        );
        expect(winnerLine).toBeDefined();
        expect(winnerLine).toContain('expected cash from here');

        const overrideLine = lines.find(
            (line) =>
                line.includes('personal override') &&
                line.includes('expected cash from here'),
        );
        expect(overrideLine).toBeDefined();

        const warningLine = lines.find((line) =>
            line.includes('underperforms'),
        );
        expect(warningLine).toBeDefined();
        expect(warningLine).toContain('bust probability');
    }, 10_000);

    it('prints the request sizes, the funded horizon and the retained cushion with its basis in the override warning, as the panel does (PT-19i review)', () => {
        const advice = overrideAdvice();
        const warning = advice.payoutAdvice?.personalOverrideWarning;
        if (warning === undefined) {
            throw new Error('expected a personal override warning');
        }
        const warningLine = adviceReportLines(advice).find((line) =>
            line.includes('underperforms'),
        );
        expect(warningLine).toBeDefined();
        expect(warningLine).toContain(
            `payout-size sweep over ${String(warning.horizonDays)} funded days`,
        );
        expect(warningLine).toContain(
            `${formatCurrency(warning.overrideMonthlyNet, 0)} at a ${formatCurrency(warning.overrideRequestSize, 0)} request`,
        );
        expect(warningLine).toContain(
            `${formatCurrency(warning.optimumMonthlyNet, 0)} at ${formatCurrency(warning.optimumRequestSize, 0)}`,
        );
        expect(warningLine).toContain(
            `retaining ${formatCurrency(warning.retainedCushion, 0)} (`,
        );
        expect(warningLine).toBe(personalPayoutOverrideWarningText(warning));
    });

    it('omits the override warning line when the personal override does not underperform (HIGH-1)', () => {
        const advice = fundedAdviceWithOverride('3000', '20');
        const lines = adviceReportLines(advice);
        expect(lines.some((line) => line.includes('underperforms'))).toBe(
            false,
        );
    }, 10_000);

    it('discloses the winning ladder from a LadderSearchFresh/FromState optimum, not just the scored count (HIGH-2)', () => {
        const advice = evalAdviceForLadderSearch();
        const lines = adviceReportLines(advice);

        const summaryLine = lines.find((line) =>
            line.includes('ladders scored'),
        );
        expect(summaryLine).toBeDefined();

        const winnerLine = lines.find((line) =>
            line.includes('days to funded'),
        );
        expect(winnerLine).toBeDefined();
        expect(winnerLine).toContain('cost/funded');
        expect(winnerLine).toContain('pass rate');
    });

    it('never calls the fastest-to-funded ladder "the winning ladder": it is an eval-stage proxy for MonthlyNet (Hard Rule 3, trader re-review HIGH, wf_1fb46eb7-e95)', () => {
        const advice = evalAdviceForLadderSearch();
        const lines = adviceReportLines(advice);

        expect(lines.some((line) => line.includes('winning ladder'))).toBe(
            false,
        );
        const winnerLine = lines.find((line) =>
            line.includes('eval-stage proxy'),
        );
        expect(winnerLine).toBeDefined();
        expect(winnerLine).toContain('days to funded');
        expect(winnerLine).toContain('cost/funded');
    });

    it('prints a standard error beside the fresh funded sweep and from-state funded sweep monthly net (MEDIUM)', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise([...withoutSnapshotDate(), '--trials', '20']),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const requests = advisor.optimumRequests();
        const results = requests.map((request) =>
            runEngineOptimum(plan, request),
        );
        const advice = advisor.assemble(results);
        const lines = adviceReportLines(advice);

        const freshLine = lines.find((line) =>
            line.startsWith('fresh funded sweep:'),
        );
        expect(freshLine).toBeDefined();
        expect(freshLine).toContain('SE');

        const fromStateLine = lines.find((line) =>
            line.startsWith('from-state funded sweep:'),
        );
        expect(fromStateLine).toBeDefined();
        expect(fromStateLine).toContain('SE');
    });
});

describe('command.ts does not duplicate TRADING_DAYS_PER_YEAR (review finding MEDIUM)', () => {
    it('imports the shared constant instead of declaring its own funded-horizon-days default', () => {
        const source = readFileSync(
            path.join(process.cwd(), 'src/cli/commands/prop/advise/command.ts'),
            'utf8',
        );
        expect(source).not.toContain('DEFAULT_ADVISE_FUNDED_HORIZON_DAYS');
        expect(source).toContain('TRADING_DAYS_PER_YEAR');
    });
});

describe('command.ts does not duplicate the advisor default eval-days constant (PT-24b step 4)', () => {
    it('imports DEFAULT_MAX_EVAL_DAYS from createSizingAdvisor instead of declaring its own copy', () => {
        const source = readFileSync(
            path.join(process.cwd(), 'src/cli/commands/prop/advise/command.ts'),
            'utf8',
        );
        expect(source).not.toContain('DEFAULT_ADVISE_MAX_EVAL_DAYS');
        expect(source).toContain('DEFAULT_MAX_EVAL_DAYS');
    });
});

describe('adviceReportLines: minStopPointsAtCap flagged only above the entered stop (review finding MEDIUM, audit T33)', () => {
    const EVAL_NEAR_CONTRACT_CAP = [
        '--firm',
        'apex',
        '--variant',
        'eod',
        '--stage',
        'eval',
        '--balance',
        '48500',
        '--highest-eod',
        '48500',
        '--trading-days',
        '3',
        '--trials',
        '50',
        '--seed',
        '1',
        '--instrument',
        'MNQ',
    ];

    function adviceAtStop(stopPoints: string) {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise([
                ...EVAL_NEAR_CONTRACT_CAP,
                '--stop-points',
                stopPoints,
            ]),
        );
        const account = AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(account, options);
        const requests = advisor.optimumRequests();
        const results = requests.map((request) =>
            runEngineOptimum(plan, request),
        );
        const advice = advisor.assemble(results);
        return {
            advice,
            enteredStopPoints: options.positionSizing?.stopPoints ?? null,
        };
    }

    it('a real scenario actually produces a non-null minStopPointsAtCap', () => {
        const { advice } = adviceAtStop('1');
        expect(advice.documented?.minStopPointsAtCap).not.toBeNull();
    });

    it('flags the contract-cap minimum stop when the entered stop is below it', () => {
        const { advice, enteredStopPoints } = adviceAtStop('1');
        const lines = adviceReportLines(advice, enteredStopPoints);
        expect(
            lines.some((line) =>
                line.includes('minimum stop to stay at the contract cap'),
            ),
        ).toBe(true);
    });

    it('suppresses the line when the entered stop already meets the minimum', () => {
        const { advice, enteredStopPoints } = adviceAtStop('5');
        expect(enteredStopPoints).toBe(5);
        const lines = adviceReportLines(advice, enteredStopPoints);
        expect(
            lines.some((line) =>
                line.includes('minimum stop to stay at the contract cap'),
            ),
        ).toBe(false);
    });
});

function nextPayoutProjectionLine(value: NextPayoutProjection): string {
    const { options, plan, snapshot } = readAdviseInputs(
        parseAdvise(FRESH_FUNDED_APEX_EOD_TODAY),
    );
    const account = AccountReconstruction.rebuild(
        snapshot,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    const advice = createSizingAdvisor(account, options).assemble([
        { projection: value, source: AdviceSource.NextPayoutProjection },
    ]);
    const line = adviceReportLines(advice).find((candidate) =>
        candidate.startsWith('next payout projection:'),
    );
    if (line === undefined) throw new Error('no projection line');
    return line;
}

function nextPayoutProjectionWith(
    overrides: Partial<NextPayoutProjection>,
): NextPayoutProjection {
    return {
        accountLostBeforeFirstPayoutProbability: 0.1,
        accountLostBeforeFirstPayoutStandardError: 0.01,
        alreadyEligible: false,
        expectedCalendarDaysToFirstPayout: {
            standardError: 0.5,
            value: 12.3,
        },
        expectedResetFeeBeforeFirstPayout: { standardError: 0, value: 0 },
        expectedSessionDaysToFirstPayout: { standardError: 0.4, value: 9 },
        firstPayoutCausedBreachProbability: 0,
        firstPayoutCausedBreachStandardError: 0,
        payingTrials: 150,
        trials: 200,
        ...overrides,
    };
}

describe('adviceReportLines: the next payout projection line reads the engine eligibility (PT-68c, F-V18)', () => {
    it('says eligible now instead of 0.0 calendar days for an already-eligible projection', () => {
        const line = nextPayoutProjectionLine(
            nextPayoutProjectionWith({
                accountLostBeforeFirstPayoutProbability: 0,
                alreadyEligible: true,
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                payingTrials: 200,
            }),
        );
        expect(line).toContain('eligible now');
        expect(line).not.toContain('calendar days');
    });

    it('attributes an already-eligible line to the eligibility check, with no simulated trial count and no zero loss figure', () => {
        const line = nextPayoutProjectionLine(
            nextPayoutProjectionWith({
                accountLostBeforeFirstPayoutProbability: 0,
                alreadyEligible: true,
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                payingTrials: 200,
            }),
        );
        expect(line).toContain("the engine's payout eligibility check");
        expect(line).toContain('no trials were simulated');
        expect(line).not.toContain('trials reached a payout');
        expect(line).not.toContain('account lost before first payout');
    });

    it('says no simulated trial reached a payout instead of 0.0 calendar days', () => {
        const line = nextPayoutProjectionLine(
            nextPayoutProjectionWith({
                expectedCalendarDaysToFirstPayout: {
                    standardError: null,
                    value: 0,
                },
                payingTrials: 0,
            }),
        );
        expect(line).toContain('no simulated trial reached a payout');
        expect(line).not.toContain('calendar days');
    });

    it('keeps the projected calendar days and adds the paying share for a projection that pays', () => {
        const line = nextPayoutProjectionLine(nextPayoutProjectionWith({}));
        expect(line).toContain('12.3 calendar days among the trials that paid');
        expect(line).toContain('150 of 200 trials reached a payout (75.0%)');
    });
});

async function adviseOutput(argv: readonly string[]): Promise<string> {
    const written: string[] = [];
    const previousExitCode = process.exitCode;
    const stdout = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(recordInto(written));
    const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(recordInto(written));
    try {
        await advise.run?.({
            args: parseArgs<typeof adviseArguments>([...argv], adviseArguments),
            cmd: advise,
            rawArgs: [...argv],
        });
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
        process.exitCode = previousExitCode;
    }
    return stripVTControlCharacters(written.join(''));
}

function baseFundedAdvice() {
    const { options, plan, snapshot } = readAdviseInputs(
        parseAdvise([...FRESH_FUNDED_APEX_EOD_TODAY]),
    );
    const advice = createSizingAdvisor(
        AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        ),
        options,
    ).assemble([]);
    return { advice, plan };
}

function fundedSweepResultWith(
    policy: FundedWinnerPolicy,
    label: string,
): EngineOptimumRunnerResult {
    return {
        source: AdviceSource.FundedSweepFresh,
        sweep: {
            kind: FundedSweepOptimumResultKind.Optimum,
            optimum: {
                expectedHorizonCredit: 0,
                expectedHorizonCreditStandardError: null,
                expectedMonthlyNet: 1200,
                expectedMonthlyNetStandardError: 40,
                expectedMonthlyRealizedNet: 1000,
                expectedMonthlyRealizedNetStandardError: 35,
                label,
                policy,
                rows: [],
                survivors: 150,
            },
        },
    };
}

function recordInto(written: string[]) {
    return (chunk: string | Uint8Array): boolean => {
        written.push(String(chunk));
        return true;
    };
}

function withFlag(
    argv: readonly string[],
    flag: string,
    value: string,
): string[] {
    return [
        ...argv.filter(
            (part, index) => part !== flag && argv[index - 1] !== flag,
        ),
        flag,
        value,
    ];
}

describe('prop advise prints the funded winner in dollars at the current cushion (PT-109 step 1, F-121)', () => {
    it('prints a percent-of-cushion winner as dollars at the day-start cushion', () => {
        const { advice } = baseFundedAdvice();
        if (advice.dailyPlanCard === null) throw new Error('expected a card');
        const lines = adviceReportLines({
            ...advice,
            dailyPlanCard: { ...advice.dailyPlanCard, cushion: dollars(1700) },
            optima: [
                fundedSweepResultWith(
                    {
                        kind: FundedWinnerPolicyKind.PercentOfCushion,
                        percent: 10,
                    },
                    '10% cushion',
                ),
            ],
        });

        const line = lines.find((candidate) =>
            candidate.startsWith('fresh funded sweep:'),
        );
        expect(line).toContain(
            '10% cushion = $170.00 at your cushion of $1,700.00',
        );
        expect(line).toContain('monthly net');
    });

    it('prints a flat winner by its label alone, since the label already is the dollars', () => {
        const { advice } = baseFundedAdvice();
        const lines = adviceReportLines({
            ...advice,
            optima: [
                fundedSweepResultWith(
                    { dollars: 250, kind: FundedWinnerPolicyKind.Flat },
                    'flat $250',
                ),
            ],
        });

        const line = lines.find((candidate) =>
            candidate.startsWith('fresh funded sweep:'),
        );
        expect(line).toContain('fresh funded sweep: flat $250, monthly net');
        expect(line).not.toContain('at your cushion');
    });

    it('never prints a made-up dollar figure for a percent winner when the cushion is unknown', () => {
        const { advice } = baseFundedAdvice();
        const lines = adviceReportLines({
            ...advice,
            dailyPlanCard: null,
            optima: [
                fundedSweepResultWith(
                    {
                        kind: FundedWinnerPolicyKind.PercentOfCushion,
                        percent: 10,
                    },
                    '10% cushion',
                ),
            ],
        });

        const line = lines.find((candidate) =>
            candidate.startsWith('fresh funded sweep:'),
        );
        expect(line).toContain('fresh funded sweep: 10% cushion, monthly net');
        expect(line).not.toContain('at your cushion');
    });
});

function expectedFigures(row: PayoutSizeSweepRow) {
    const bust = `bust rate ${formatPercentWithSe(
        row.out.fundedBustProbability,
        row.out.estimates.fundedBustProbability.standardError,
    )}`;
    if (row.kind === StartBasis.Fresh) {
        const { estimates } = row.out;
        return {
            bust,
            creditFree: `monthly ex-credit ${formatCurrencyWithSe(
                row.out.expectedMonthlyRealizedNet,
                estimates.expectedMonthlyRealizedNet.standardError,
            )}`,
            creditInclusive: `monthly net ${formatCurrencyWithSe(
                row.out.expectedMonthlyNet,
                estimates.expectedMonthlyNet.standardError,
            )}`,
        };
    }
    const { estimates } = row.out;
    return {
        bust,
        creditFree: `ex-credit ${formatCurrencyWithSe(
            row.out.fromStateExpectedRealizedCash,
            estimates.fromStateExpectedRealizedCash.standardError,
        )}`,
        creditInclusive: `expected cash from here ${formatCurrencyWithSe(
            row.out.fromStateExpectedCash,
            estimates.fromStateExpectedCash.standardError,
        )}`,
    };
}

function payoutSweepOptimum(advice: Advice) {
    const result = advice.optima.find(
        (candidate) => candidate.source === AdviceSource.PayoutSizeSweep,
    );
    return result?.source === AdviceSource.PayoutSizeSweep &&
        result.sweep.kind === PayoutSizeSweepResultKind.Optimum
        ? result.sweep.optimum
        : null;
}

describe('prop advise prints the payout-size figures the web prints (PT-109 step 2, F-123)', () => {
    it('prints the winner with its monthly net and credit-free figure and its bust rate, each with the standard error', () => {
        const advice = overrideAdvice();
        const optimum = payoutSweepOptimum(advice);
        if (optimum === null) throw new Error('expected a payout-size optimum');
        const figures = expectedFigures(optimum.winner);

        const line = adviceReportLines(advice).find(
            (candidate) =>
                candidate.startsWith('payout-size sweep:') &&
                !candidate.includes('personal override'),
        );

        expect(line).toContain(figures.creditInclusive);
        expect(line).toContain(figures.creditFree);
        expect(line).toContain(figures.bust);
    });

    it('labels a fresh-start sweep per month and a from-state sweep as cash from here, never one as the other', () => {
        const freshStart = withFlag(
            withFlag(FRESH_FUNDED_APEX_EOD_TODAY, '--trading-days', '0'),
            '--trials',
            '20',
        );
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise(freshStart),
        );
        const advisor = createSizingAdvisor(
            AccountReconstruction.rebuild(
                snapshot,
                plan,
                null,
                NO_PENDING_PAYOUT_COUNTS,
            ),
            options,
        );
        const fresh = advisor.assemble(
            advisor
                .optimumRequests()
                .map((request) => runEngineOptimum(plan, request)),
        );
        const freshWinner = payoutSweepOptimum(fresh)?.winner;
        const fromStateWinner = payoutSweepOptimum(overrideAdvice())?.winner;

        const freshLine = adviceReportLines(fresh).find((candidate) =>
            candidate.startsWith('payout-size sweep:'),
        );
        const fromStateLine = adviceReportLines(overrideAdvice()).find(
            (candidate) => candidate.startsWith('payout-size sweep:'),
        );

        expect(freshWinner?.kind).toBe(StartBasis.Fresh);
        expect(fromStateWinner?.kind).toBe(StartBasis.FromState);
        expect(freshLine).toContain('monthly net');
        expect(freshLine).not.toContain('cash from here');
        expect(fromStateLine).toContain('expected cash from here');
        expect(fromStateLine).not.toContain('monthly net');
    });

    it('prints the personal override with the same three figures', () => {
        const advice = overrideAdvice();
        const optimum = payoutSweepOptimum(advice);
        if (optimum?.personalOverride == null) {
            throw new Error('expected a personal override');
        }
        const figures = expectedFigures(optimum.personalOverride.row);

        const line = adviceReportLines(advice).find((candidate) =>
            candidate.startsWith('payout-size sweep personal override:'),
        );

        expect(line).toContain(figures.creditInclusive);
        expect(line).toContain(figures.creditFree);
        expect(line).toContain(figures.bust);
    });
});

describe('prop advise provenance carries the trials, seed and plan-rules fingerprint end to end (PT-109 step 3, F-126, F-98)', () => {
    const SMALL_RUN = withFlag(
        withFlag(FRESH_FUNDED_APEX_EOD_TODAY, '--trials', '20'),
        '--seed',
        '7',
    );

    it('prints the trials, seed and the current plan-rules fingerprint, and never marks the advice stale', async () => {
        const { plan } = readAdviseInputs(parseAdvise(SMALL_RUN));
        const fingerprint = await planRulesFingerprint(plan);

        const output = await adviseOutput(SMALL_RUN);

        expect(output).toContain(`plan rules fingerprint ${fingerprint}`);
        expect(output).toContain('trials 20');
        expect(output).toContain('seed 7');
        expect(output).not.toContain('Stale as of');
    }, 10_000);

    it('carries the same fingerprint, trials and seed in the JSON advice', async () => {
        const { plan } = readAdviseInputs(parseAdvise(SMALL_RUN));
        const fingerprint = await planRulesFingerprint(plan);

        const output = await adviseOutput([...SMALL_RUN, '--json']);

        const { provenance, staleness } = JSON.parse(output) as {
            provenance: {
                planRulesFingerprint: null | string;
                seed: null | number;
                trials: null | number;
            };
            staleness: { kind: string };
        };
        expect(provenance.planRulesFingerprint).toBe(fingerprint);
        expect(provenance.trials).toBe(20);
        expect(provenance.seed).toBe(7);
        expect(staleness.kind).toBe('fresh');
    }, 10_000);
});

describe('prop advise prints the firm open items beside the verified date (PT-109 addendum, F-98)', () => {
    const STALE_TOPSTEP_EVAL = [
        '--firm',
        'topstep',
        '--variant',
        'standard-standard',
        '--stage',
        'eval',
        '--balance',
        '50000',
        '--highest-eod',
        '50000',
        '--trading-days',
        '3',
        '--snapshot-date',
        '2000-01-03',
        '--trials',
        '5',
    ];

    it('names every open item of a TopStep account', async () => {
        const output = await adviseOutput(STALE_TOPSTEP_EVAL);

        expect(output).toContain('firm data verified');
        expect(output).toContain('U32');
        expect(output).toContain('U33');
        expect(output).toContain('N-53');
    });

    it('says there are no open items for a firm that has none', () => {
        expect(firmOpenItemLines([])).toStrictEqual([
            'firm data: no open items',
        ]);
        expect(firmOpenItemLines(['U1: one', 'U2: two'])).toStrictEqual([
            'firm data open item: U1: one',
            'firm data open item: U2: two',
        ]);
    });
});

function cardOf() {
    const { advice } = baseFundedAdvice();
    if (advice.dailyPlanCard === null) throw new Error('expected a card');
    return { advice, card: advice.dailyPlanCard };
}

describe('prop advise prints the daily card and payout figures the web prints (PT-109 step 5, F-127, F-128, F-146, F-154)', () => {
    it('prints the window rule, the daily loss cap and the day-start loss room', () => {
        const { advice, card } = cardOf();
        const lines = adviceReportLines(advice);

        expect(lines).toContain('window rule: one trade per window');
        expect(lines).toContain(
            `daily loss cap: ${formatCurrency(card.dailyLossCap.amount, 2)} (${SIZING_CONSTRAINT_TEXT[card.dailyLossCap.constraint]})`,
        );
    });

    it('prints a window of more than one trade in words', () => {
        const { advice, card } = cardOf();

        const lines = adviceReportLines({
            ...advice,
            dailyPlanCard: { ...card, maxTradesPerWindow: 2 },
        });

        expect(lines).toContain('window rule: 2 trades per window');
    });

    it('prints the day-start loss room when the day has one', () => {
        const { advice, card } = cardOf();

        const lines = adviceReportLines({
            ...advice,
            dailyPlanCard: { ...card, dailyLossRoom: dollars(600) },
        });

        expect(lines).toContain(
            'daily loss room at the start of the day: $600.00',
        );
    });

    it('prints the consistency ceiling with its constraint text', () => {
        const { advice, card } = cardOf();

        const lines = adviceReportLines({
            ...advice,
            dailyPlanCard: {
                ...card,
                profitCeiling: {
                    amount: dollars(400),
                    constraint: SizingConstraint.ConsistencyCap,
                },
            },
        });

        expect(lines).toContain(
            `profit ceiling today: $400.00 (${SIZING_CONSTRAINT_TEXT[SizingConstraint.ConsistencyCap]})`,
        );
    });

    it('says the payout is already pushed out, and that a fresh cycle is not an early exit', () => {
        const { advice, card } = cardOf();

        const pushedOut = adviceReportLines({
            ...advice,
            dailyPlanCard: {
                ...card,
                consistencyNote: ConsistencyCeilingNote.AlreadyPushedOut,
            },
        }).join('\n');
        const freshCycle = adviceReportLines({
            ...advice,
            dailyPlanCard: {
                ...card,
                consistencyNote: ConsistencyCeilingNote.FreshCycle,
            },
        }).join('\n');

        expect(pushedOut).toContain('already pushed out');
        expect(freshCycle).toContain('checked at the payout request');
        expect(freshCycle).not.toContain('stop for today');
        expect(adviceReportLines(advice).join('\n')).not.toContain(
            'already pushed out',
        );
    });

    it('prints the rule-capped withdrawable, each cap and what limits it, the engine credit and the net after the split', () => {
        const { advice } = baseFundedAdvice();
        const payout: PayoutAdvice = {
            assumptions: [],
            caps: [
                {
                    amount: dollars(2000),
                    kind: PayoutCapKind.RequestCap,
                    limitsWithdrawable: true,
                },
                {
                    amount: dollars(2600),
                    kind: PayoutCapKind.BalanceShare,
                    limitsWithdrawable: false,
                    share: fraction(0.5),
                },
                { kind: PayoutCapKind.RemainingPayouts, remaining: 3 },
            ],
            documented: {
                kind: PayoutRequestDecisionKind.Request,
                notice: null,
                requestAmount: dollars(1500),
                retainedCushion: dollars(2000),
                retainedCushionBasis: RetainedCushionBasis.RulebookSize,
                sources: [RuleSource.PayoutSize],
            },
            engineHorizonCredit: dollars(1250),
            netAfterSplit: dollars(1350),
            ruleCappedWithdrawable: dollars(1800),
        };

        const lines = adviceReportLines({ ...advice, payoutAdvice: payout });

        expect(lines).toContain('rule-capped withdrawable: $1,800.00');
        expect(lines).toContain(
            'payout cap: $2,000.00 per request, limits the withdrawable',
        );
        expect(lines).toContain(
            'payout cap: 50.0% of the account profit, $2,600.00',
        );
        expect(lines).toContain('payouts left before the lifetime cap: 3');
        expect(lines).toContain('engine horizon credit: $1,250.00');
        expect(lines).toContain('net after the payout split: $1,350.00');
        expect(lines.join('\n')).not.toContain(
            RetainedCushionBasis.RulebookSize,
        );
    });

    it('prints no withdrawable line when the payout is not a request', () => {
        const { advice } = baseFundedAdvice();

        const text = adviceReportLines(advice).join('\n');

        expect(text).not.toContain('rule-capped withdrawable');
    });
});

describe('prop advise text carries no raw JSON or policy key (PT-109 step 6, F-133 (7))', () => {
    it('prints the documented stop rule through describeStopRule, not as JSON', () => {
        const { advice } = baseFundedAdvice();
        if (advice.documented === null) throw new Error('expected sizing');

        const line = adviceReportLines(advice).find((candidate) =>
            candidate.startsWith('provenance: '),
        );

        expect(line).toContain(
            `stop ${describeStopRule(advice.documented.stopRule)}`,
        );
        expect(line).not.toContain('{"kind"');
    });

    it('prints a payout-policy difference from the typed request sizes', () => {
        const { advice } = baseFundedAdvice();

        const lines = adviceReportLines({
            ...advice,
            differenceReasons: [
                {
                    engineRequest: dollars(3000),
                    headlineRequest: dollars(500),
                    kind: DifferenceReason.PayoutPolicyDiffers,
                },
            ],
        });

        const line = lines.find((candidate) =>
            candidate.includes('documented payout request'),
        );
        expect(line).toContain('$500.00');
        expect(line).toContain('$3000.00');
        expect(lines.join('\n')).not.toContain('documented-$');
        expect(lines.join('\n')).not.toContain('payout-size-sweep-optimum');
    });
});

describe('command.ts keeps the cents factor and the staleness kind typed (PT-109 step 7, F-133 (8))', () => {
    const source = readFileSync(
        path.join(process.cwd(), 'src/cli/commands/prop/advise/command.ts'),
        'utf8',
    );

    it('has no bare 100 as a cents factor', () => {
        expect(source).not.toMatch(/[*/] 100\b/);
        expect(source).toContain('CENTS_PER_DOLLAR');
    });

    it('compares the staleness kind through the enum, never a literal', () => {
        expect(source).not.toMatch(/kind (===|!==) 'stale'/);
        expect(source).not.toMatch(/kind (===|!==) 'fresh'/);
        expect(source).toContain('AdviceStalenessKind.Stale');
    });
});
