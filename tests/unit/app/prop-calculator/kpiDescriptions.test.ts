import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    kpiDescriptions,
    panelDescriptions,
} from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    ALL_FIRMS,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    dollars,
    flatDayPolicy,
    fraction,
    newFundedCycleTrackerAfterReset,
    PolicySizing,
    RetryKind,
    SIM_DEFAULTS,
    TRADING_DAYS_PER_MONTH,
    withFundedResetTaken,
} from '~/lib/prop-calculator';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    FundedStage,
    LossStreak,
    newPhaseStats,
    PayoutTotals,
    runFundedDays,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

const EM_DASH = '\u{2014}';
const PROP_CALCULATOR_WEB_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
);

function namesIn(text: string, names: readonly string[]): string[] {
    return names.filter((name) =>
        new RegExp(String.raw`\b${name}\b`, 'i').test(text),
    );
}

const GENERIC_FIRM_NAME_WORDS = new Set([
    'funded',
    'funding',
    'futures',
    'my',
    'profit',
    'take',
    'trader',
    'trading',
]);

function firmNameForms(displayName: string): string[] {
    const words = displayName.split(/\s+/);
    const prefixes = words.map((_word, index) =>
        words.slice(0, index + 1).join(' '),
    );
    const initials =
        words.length > 1 ? [words.map((word) => word[0]).join('')] : [];
    return [...prefixes, ...words, ...initials].filter(
        (form) => !GENERIC_FIRM_NAME_WORDS.has(form.toLowerCase()),
    );
}

function sourceFilesUnder(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('kpiDescriptions and panelDescriptions (WP21b: no em dashes in writing)', () => {
    it('no KPI or panel description contains an em dash', () => {
        const withEmDash = [
            ...Object.entries(kpiDescriptions),
            ...Object.entries(panelDescriptions),
        ]
            .filter(([, text]) => text.includes(EM_DASH))
            .map(([key]) => key);
        expect(withEmDash).toEqual([]);
    });
});

describe('prop calculator web text (WP23: no em dashes in writing)', () => {
    it('no page, panel or helper under the prop calculator web tree contains an em dash', () => {
        const withEmDash = sourceFilesUnder(PROP_CALCULATOR_WEB_ROOT).flatMap(
            (file) =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .map((line, index) => ({ index, line }))
                    .filter(({ line }) => line.includes(EM_DASH))
                    .map(
                        ({ index }) =>
                            `${file.slice(PROP_CALCULATOR_WEB_ROOT.length + 1)}:${index + 1}`,
                    ),
        );
        expect(withEmDash).toEqual([]);
    });
});

describe('monthlyNet tooltip matches the engine for every plan and form input (T32, N-71, N-72, WP43 to WP43g)', () => {
    afterEach(() => {
        vi.doUnmock('~/lib/prop-calculator');
        vi.resetModules();
    });

    it('is the capped one-request horizon credit, the pool since funding, a funded reset or the last payout, and the per-account formula over the trial duration times the copy-traded accounts', () => {
        expect(kpiDescriptions.monthlyNet).toBe(
            `Expected $ profit per month after all fees, averaged across every trial, whether it passed, busted or timed out, plus a horizon credit: one more payout request for each account still open at the funded horizon end, net of the split and the payout method fee, and capped like a real request by the payout ladder step, request size, profit share and request caps, and by the plan's payout profit pool (the profit made since funding, a funded reset or the last payout, or the whole account profit on plans that pay from account profit) only on plans with no payout ladder and no profit share. The credit is $0 when those caps leave nothing to request (for example an emptied payout profit pool, or, on a plan whose ladder denies an unaffordable step, a step above what the account could withdraw: its withdrawable balance, or its profit share if lower), once a lifetime payout cap is reached or once the payout ladder is exhausted; the payout day, qualifying-day, consistency, minimum profit and minimum request gates are not applied to the credit, since continued trading would clear them. = (avg net + avg horizon credit) per account × ${TRADING_DAYS_PER_MONTH} ÷ avg trial duration in trading days, from the first eval day to the trial's end, times the number of copy-traded accounts when the form sets more than one.`,
        );
    });

    it('takes the trading days per month from TRADING_DAYS_PER_MONTH instead of a duplicated literal', async () => {
        const mockedTradingDaysPerMonth = TRADING_DAYS_PER_MONTH + 1;
        vi.resetModules();
        vi.doMock('~/lib/prop-calculator', async (importOriginal) => ({
            ...(await importOriginal<object>()),
            TRADING_DAYS_PER_MONTH: mockedTradingDaysPerMonth,
        }));
        const reloaded =
            await import('~/app/(app)/prop-calculator/_components/kpiDescriptions');
        expect(reloaded.kpiDescriptions.monthlyNet).toContain(
            `× ${mockedTradingDaysPerMonth} ÷ avg trial duration in trading days,`,
        );
    });

    it('divides by the trial duration alone because the calculator form sets no rebuy lag, so the engine default of 0 applies', () => {
        expect(
            buildSimInputs(defaultCalculatorState()).rebuyLagDays,
        ).toBeUndefined();
        expect(SIM_DEFAULTS.rebuyLagDays).toBe(0);
        expect(kpiDescriptions.monthlyNet).not.toContain('rebuy lag');
    });

    it('a funded reset restarts the cycle profit pool at the reset balance, as the gloss says', () => {
        const plan = ALL_FIRMS.flatMap((firm) => firm.plans).find(
            (candidate) => candidate.fundedReset !== null,
        );
        if (!plan) throw new Error('no plan with a funded reset');
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const tracker = newFundedCycleTrackerAfterReset(state, 1);
        expect(tracker.lastPayoutBalance).toBe(state.balance);
        expect(tracker.payoutsIssued).toBe(0);
    });

    it('the simulator restarts the pool at the reset balance when an account it runs busts and takes a funded reset (WP43h)', () => {
        const withReset = ALL_FIRMS.flatMap((firm) => firm.plans).find(
            (candidate) => candidate.fundedReset !== null,
        );
        if (!withReset) throw new Error('no plan with a funded reset');
        const plan = withFundedResetTaken(withReset, true);
        const losingRun = (maxDays: number) => {
            const state = plan.initialState();
            plan.beginFundedPhase(state);
            const fundedStartBalance = state.balance;
            const totals = new TradeTotals();
            const run = runFundedDays({
                commission: dollars(0),
                dayOffsetBase: 0,
                dayPolicy: flatDayPolicy(
                    plan.fundedDrawdown.amount,
                    1,
                    { kind: DayStopRuleKind.None },
                    PolicySizing.ContractCapped,
                ),
                discounts: undefined,
                equityCurve: null,
                idleDayProbability: 0,
                maxDays,
                minRetainedCushion: plan.resolveRetainedCushion(undefined),
                payoutRequestSize: undefined,
                plan,
                positionSizing: null,
                rng: mulberry32(1),
                rrRatio: 2,
                rungSizing: DEFAULT_RUNG_SIZING,
                sink: new PayoutTotals(),
                state,
                stats: newPhaseStats(
                    state.balance,
                    totals,
                    new LossStreak(totals),
                ),
                winrate: fraction(0),
            });
            return { fundedStartBalance, run, state };
        };
        const firstReset = losingRun(TRADING_DAYS_PER_MONTH).run
            .fundedResets[0];
        if (!firstReset) throw new Error('the losing run never took a reset');

        const { fundedStartBalance, run, state } = losingRun(
            firstReset.dayOffset,
        );
        expect(run.fundedResets).toHaveLength(1);
        expect(run.stage).toBe(FundedStage.HorizonReached);
        expect(state.balance).toBe(fundedStartBalance);
        expect(run.tracker.fundedResetsUsed).toBe(1);
        expect(run.tracker.lastPayoutBalance).toBe(fundedStartBalance);
        expect(run.tracker.payoutsIssued).toBe(0);
    });
});

describe('the cost and cash-flow tooltips name no re-buy firm by hand (N-84, WP52b)', () => {
    const rebuyPlans = ALL_FIRMS.flatMap((firm) =>
        firm.plans
            .filter((plan) => plan.fees.retry === RetryKind.Rebuy)
            .map((plan) => ({ firm, plan })),
    );
    const retryTexts = {
        cashFlow: panelDescriptions.cashFlow,
        totalCost: kpiDescriptions.totalCost,
    };

    it('the firm data still has plans whose every retry is a re-buy', () => {
        expect(rebuyPlans.length).toBeGreaterThan(0);
    });

    function firmMentionsIn(text: string): string[] {
        const firmNames = ALL_FIRMS.flatMap((firm) => [
            firm.id,
            ...firmNameForms(firm.displayName),
        ]);
        const planNames = rebuyPlans.map(({ plan }) =>
            plan.label.replace(/^\$\d+K · /, ''),
        );
        const parenthesised = text.match(/\(\s*[A-Z][^)]*\)/g) ?? [];
        return [
            ...namesIn(text, [...firmNames, ...planNames]),
            ...parenthesised,
        ];
    }

    it.each([
        'on MFF plans every retry is a re-buy',
        'a re-buy on plans where every retry is a re-buy (MFF)',
        'a re-buy on plans where every retry is a re-buy (Acme)',
        'TPT and FTMO re-buy every retry',
        'E8 plans re-buy, as do Alpha plans',
        'Take Profit plans re-buy every retry',
        'plans such as Rapid re-buy every retry',
    ])('the firm-mention check flags %j', (probe) => {
        expect(firmMentionsIn(probe)).not.toEqual([]);
    });

    it.each(Object.entries(retryTexts))(
        '%s names no firm and no re-buy plan',
        (_key, text) => {
            expect(firmMentionsIn(text)).toEqual([]);
        },
    );

    it('totalCost still says a plan whose every retry is a re-buy bills the re-buy', () => {
        expect(kpiDescriptions.totalCost).toContain(
            'a re-buy on plans where every retry is a re-buy, otherwise the cheaper of a reset and a re-buy.',
        );
    });

    it('cashFlow still says the re-buy applies when the plan has no reset or every retry on it is a re-buy', () => {
        expect(panelDescriptions.cashFlow).toContain(
            'or at the re-buy when the plan has no reset or every retry on it is a re-buy, for as long as the timeline has days left;',
        );
    });
});
