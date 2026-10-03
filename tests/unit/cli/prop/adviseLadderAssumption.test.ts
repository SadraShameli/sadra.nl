import { parseArgs } from 'citty';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    type CheckedNextTradeRiskReport,
    engineResultsFor,
    ledgerLadderLine,
    nextTradeRiskReport,
    type NextTradeRiskReport,
    NextTradeRiskReportKind,
    type NotRunNextTradeRiskReport,
    readAdviseInputs,
    readNextTradeRiskInputs,
} from '~/cli/commands/prop/advise/command';
import { FirmId } from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AdviceStalenessReason,
    createSizingAdvisor,
    LEDGER_FILE,
    LEDGER_SECTION,
    ledgerRecordedLadderFor,
    NO_PENDING_PAYOUT_COUNTS,
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

const FRESH_FUNDED_APEX_EOD = [
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
    const account = AccountReconstruction.rebuild(
        snapshot,
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
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
    it('a fresh 50K apex eval names the coarser step and the grid step', () => {
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
    }, 10_000);

    it('says the step from the assumption itself, with no engine requests on the advice', () => {
        const { advisor } = adviceFor(FRESH_EVAL_APEX_EOD);

        const lines = adviceReportLines({
            ...advisor.assemble([]),
            requests: [],
        });

        const assumption = lines.find((line) => line.includes('coarser'));
        expect(assumption).toContain('The grid step is $140.');
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
        const widened = lines.find((line) => line.includes('coarser'));
        expect(widened).toContain('The grid step is $140.');
        expect(widened).not.toContain('searched');
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

describe('stale advice shows no engine optimum beside its stale line (PT-24d review)', () => {
    const REWRITTEN_RULES = {
        planRulesFingerprint: { atAdvice: 'before', current: 'after' },
    };

    it('the report keeps the headline, the stale line and the provenance, and drops the optima, reasons and assumptions', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD, {
            ...REWRITTEN_RULES,
            sims: 5,
        });
        const results = advisor
            .optimumRequests()
            .map((request) => runEngineOptimum(plan, request));

        const lines = adviceReportLines(advisor.assemble(results));

        expect(lines).toHaveLength(3);
        expect(lines[1]).toContain('Stale as of');
        expect(
            lines.some((line) =>
                /ladders scored|ladder grid|ladder search not run/.test(line),
            ),
        ).toBe(false);
        expect(lines.some((line) => line.includes('coarser'))).toBe(false);
    });

    it('a stale advisor runs no engine optimum at all', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD, {
            ...REWRITTEN_RULES,
            sims: 5,
        });

        expect(engineResultsFor(advisor, plan)).toStrictEqual([]);
    });

    it('a fresh advisor runs one engine optimum per request', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD, { sims: 5 });

        const results = engineResultsFor(advisor, plan);

        expect(results.map((result) => result.source)).toStrictEqual(
            advisor.optimumRequests().map((request) => request.source),
        );
        expect(results.length).toBeGreaterThan(0);
    });
});

describe('the next-trade report admits no impossible state (PT-24d)', () => {
    it('is exactly a checked report with a result or a not-run report with a reason', () => {
        expectTypeOf<NextTradeRiskReport>().toEqualTypeOf<
            CheckedNextTradeRiskReport | NotRunNextTradeRiskReport
        >();
        expectTypeOf<CheckedNextTradeRiskReport>().not.toHaveProperty('reason');
        expectTypeOf<NotRunNextTradeRiskReport>().not.toHaveProperty('result');
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

function apexEodRow() {
    const row = ledgerRecordedLadderFor(FirmId.Apex, 'eod');
    if (row === null) throw new Error('expected the Apex EOD ledger row');
    return row;
}

describe('prop advise prints the ledger-recorded ladder of an eval plan with its source and stale mark (PT-109 step 4, F-156)', () => {
    it('prints the recorded rungs, days to funded, pass rate, cost and the cited file, row and section', () => {
        const line = ledgerLadderLine(apexEodRow());

        expect(line).toContain('[800, 200, 100, 800]');
        expect(line).toContain('days to funded 8.5');
        expect(line).toContain('pass rate 40.8%');
        expect(line).toContain('cost/funded $1,535');
        expect(line).toContain(LEDGER_FILE);
        expect(line).toContain('row "apex eod"');
        expect(line).toContain(LEDGER_SECTION);
        expect(line).not.toContain('stale');
    });

    it('marks a row stale when the ledger index says its run is no longer current', () => {
        const line = ledgerLadderLine({ ...apexEodRow(), stale: true });

        expect(line).toContain('stale');
    });

    it('adds the line to a fresh eval advice report for that plan, once', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD);

        const lines = adviceReportLines(advisor.assemble([]), null, null, plan);

        expect(
            lines.filter((line) => line.startsWith('ledger-recorded ladder')),
        ).toStrictEqual([ledgerLadderLine(apexEodRow())]);
    });

    it('adds nothing for a funded stage or when no plan is given', () => {
        const eval_ = adviceFor(FRESH_EVAL_APEX_EOD);
        const funded = adviceFor(FRESH_FUNDED_APEX_EOD);

        expect(
            adviceReportLines(eval_.advisor.assemble([])).some((line) =>
                line.startsWith('ledger-recorded ladder'),
            ),
        ).toBe(false);
        expect(
            adviceReportLines(
                funded.advisor.assemble([]),
                null,
                null,
                funded.plan,
            ).some((line) => line.startsWith('ledger-recorded ladder')),
        ).toBe(false);
    });

    it('adds nothing to a stale eval advice, which carries no amount', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        });

        const lines = adviceReportLines(advisor.assemble([]), null, null, plan);

        expect(
            lines.some((line) => line.startsWith('ledger-recorded ladder')),
        ).toBe(false);
    });
});
