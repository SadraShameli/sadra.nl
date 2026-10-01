import { parseArgs } from 'citty';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    type CheckedNextTradeRiskReport,
    nextTradeRiskReport,
    type NextTradeRiskReport,
    NextTradeRiskReportKind,
    type NotRunNextTradeRiskReport,
    readAdviseInputs,
    readNextTradeRiskInputs,
} from '~/cli/commands/prop/advise/command';
import {
    AccountReconstruction,
    AdviceStalenessReason,
    createSizingAdvisor,
    runEngineOptimum,
    type SizingAdvisorCreateOptions,
} from '~/lib/prop-calculator/advisor';

const FRESH_EVAL_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'eval',
    '--balance',
    '50000',
    '--highest-eod',
    '50000',
    '--trading-days',
    '0',
    '--trials',
    '50',
];

const STALE_FUNDED_APEX_EOD = [
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
    '2000-01-03',
    '--trials',
    '10',
];

const RISK_CHECK_FLAGS = [
    '--wins-today',
    '0',
    '--losses-today',
    '1',
    '--proposed-risk',
    '600',
];

const RAW_STALENESS_VALUES: readonly string[] = Object.values(
    AdviceStalenessReason,
);

function adviceFor(
    argv: string[],
    overrides: Partial<SizingAdvisorCreateOptions> = {},
) {
    const { options, plan, snapshot } = readAdviseInputs(parseAdvise(argv));
    const account = AccountReconstruction.rebuild(snapshot, plan);
    const advisor = createSizingAdvisor(account, { ...options, ...overrides });
    return { advisor, plan };
}

function hasRawStalenessValue(text: string): boolean {
    return RAW_STALENESS_VALUES.some((value) => text.includes(value));
}

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

function riskReportFor(
    argv: string[],
    overrides: Partial<SizingAdvisorCreateOptions> = {},
): NotRunNextTradeRiskReport {
    const { advisor } = adviceFor(argv, overrides);
    const inputs = readNextTradeRiskInputs(parseAdvise(RISK_CHECK_FLAGS));
    if (inputs === null) throw new Error('expected check inputs');
    const report = nextTradeRiskReport(advisor, inputs);
    if (report.kind !== NextTradeRiskReportKind.NotRun) {
        throw new Error('expected a not-run report');
    }
    return report;
}

describe('prop advise lists the widened ladder step as an assumption (PT-24d, F-133)', () => {
    it('a fresh 50K apex eval names the coarser step and the step it searched in', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD);
        const [request] = advisor.optimumRequests();
        if (request === undefined || !('grid' in request)) {
            throw new Error('expected a ladder request');
        }
        const results = [
            runEngineOptimum(plan, {
                ...request,
                score: { ...request.score, sims: 5 },
            }),
        ];

        const lines = adviceReportLines(advisor.assemble(results));

        const assumption = lines.find((line) => line.includes('coarser'));
        expect(assumption).toBeDefined();
        expect(assumption).toContain(`$${request.grid.step}`);
    });

    it('a refused ladder still lists the widened step beside the refusal', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD);
        const requests = advisor.optimumRequests().map((request) => ({
            ...request,
            maxGridSize: 10,
        }));
        const results = requests.map((request) =>
            runEngineOptimum(plan, request),
        );

        const lines = adviceReportLines({
            ...advisor.assemble(results),
            requests,
        });

        expect(
            lines.some((line) =>
                line.includes('ladder search not run: grid too large'),
            ),
        ).toBe(true);
        expect(lines.some((line) => line.includes('coarser'))).toBe(true);
    });
});

describe('the stale reasons are named in words, never as raw enum values (PT-24d)', () => {
    it('a stale funded snapshot names the snapshot age in the not-run reason', () => {
        const report = riskReportFor(STALE_FUNDED_APEX_EOD);

        expect(hasRawStalenessValue(report.reason)).toBe(false);
        expect(report.reason).toContain('balance snapshot');
        expect(report.reason).toContain("enter today's balance");
    });

    it('a changed plan rulebook names the change in words and does not ask for a balance', () => {
        const report = riskReportFor(FRESH_EVAL_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        });

        expect(hasRawStalenessValue(report.reason)).toBe(false);
        expect(report.reason).toContain('plan rules changed');
        expect(report.reason).not.toContain("enter today's balance");
    });

    it('both reasons together name both in words and ask for a balance because the snapshot is one of them', () => {
        const report = riskReportFor(STALE_FUNDED_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        });

        expect(hasRawStalenessValue(report.reason)).toBe(false);
        expect(report.reason).toContain('balance snapshot');
        expect(report.reason).toContain('plan rules changed');
        expect(report.reason).toContain("enter today's balance");
    });

    it('the stale advice line names its reasons in words too', () => {
        const stale = adviceFor(STALE_FUNDED_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        }).advisor.assemble([]);

        const staleLine = adviceReportLines(stale).find((line) =>
            line.startsWith('Stale as of'),
        );

        expect(staleLine).toBeDefined();
        expect(hasRawStalenessValue(staleLine ?? '')).toBe(false);
        expect(staleLine).toContain('balance snapshot');
        expect(staleLine).toContain('plan rules changed');
    });
});

describe('the next-trade report admits no impossible state (PT-24d)', () => {
    it('is exactly a checked report with a result or a not-run report with a reason', () => {
        expectTypeOf<NextTradeRiskReport>().toEqualTypeOf<
            CheckedNextTradeRiskReport | NotRunNextTradeRiskReport
        >();
        expectTypeOf<CheckedNextTradeRiskReport>().not.toHaveProperty(
            'reason',
        );
        expectTypeOf<NotRunNextTradeRiskReport>().not.toHaveProperty(
            'result',
        );
        expectTypeOf<
            NotRunNextTradeRiskReport['reason']
        >().toEqualTypeOf<string>();
    });

    it('every not-run report carries a non-empty reason', () => {
        const stale = riskReportFor(STALE_FUNDED_APEX_EOD);
        const rulesChanged = riskReportFor(FRESH_EVAL_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        });

        expect(stale.reason.length).toBeGreaterThan(0);
        expect(rulesChanged.reason.length).toBeGreaterThan(0);
    });
});
