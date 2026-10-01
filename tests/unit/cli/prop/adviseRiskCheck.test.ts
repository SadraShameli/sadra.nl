import { parseArgs, runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import advise, {
    adviceJson,
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    nextTradeRiskReport,
    NextTradeRiskReportKind,
    nextTradeRiskReportLines,
    readAdviseInputs,
    readNextTradeRiskInputs,
} from '~/cli/commands/prop/advise/command';
import { dollars } from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    createSizingAdvisor,
    NextTradeRiskVerdict,
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

const FRESH_EVAL_MFF_RAPID_EOD = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
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

interface CapturedRun {
    readonly exitCode: number | string | undefined;
    readonly stderr: string;
    readonly stdout: string;
}

function adviceFor(
    argv: string[],
    overrides: Partial<SizingAdvisorCreateOptions> = {},
) {
    const { options, plan, snapshot } = readAdviseInputs(parseAdvise(argv));
    const account = AccountReconstruction.rebuild(snapshot, plan);
    const advisor = createSizingAdvisor(account, { ...options, ...overrides });
    return { advisor, plan };
}

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

async function runAdvise(argv: string[]): Promise<CapturedRun> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdout.push(String(chunk));
        return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr.push(String(chunk));
        return true;
    });
    try {
        await runCommand(advise, { rawArgs: argv });
        return {
            exitCode: process.exitCode,
            stderr: stderr.join(''),
            stdout: stdout.join(''),
        };
    } finally {
        process.exitCode = previousExitCode;
    }
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('prop advise on a fresh 50K eval (PT-24c step 1)', () => {
    it.each([
        ['apex eod', FRESH_EVAL_APEX_EOD],
        ['mffu rapid-eod', FRESH_EVAL_MFF_RAPID_EOD],
    ])(
        '%s exits 0 with the documented rule, a ladder line and a verdict',
        async (_label, base) => {
            const run = await runAdvise([...base, ...RISK_CHECK_FLAGS]);

            expect(run.stderr).toBe('');
            expect(run.exitCode).toBeUndefined();
            expect(run.stdout).toContain('your documented rule');
            expect(run.stdout).toMatch(
                /ladder-search-fresh: \d+ ladders scored/,
            );
            expect(run.stdout).toContain('ladder grid:');
            expect(run.stdout).toContain('next-trade risk check:');
            expect(run.stdout).not.toContain('above the 2,000 limit');
        },
        60_000,
    );
});

describe('the ladder search refusal is stated, never silent (PT-24c step 1)', () => {
    it('prints "ladder search not run: grid too large" with the size and the limit', () => {
        const { advisor, plan } = adviceFor(FRESH_EVAL_APEX_EOD);
        const requests = advisor.optimumRequests().map((request) => ({
            ...request,
            maxGridSize: 10,
        }));
        const results = requests.map((request) =>
            runEngineOptimum(plan, request),
        );

        const advice = { ...advisor.assemble(results), requests };
        const lines = adviceReportLines(advice);

        const refusal = lines.find((line) =>
            line.includes('ladder search not run: grid too large'),
        );
        expect(refusal).toBeDefined();
        expect(refusal).toContain('10');
        expect(lines.some((line) => line.includes('ladders scored'))).toBe(
            false,
        );
    });

    it('discloses the grid the ladder search ran on, including a widened step', () => {
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

        const gridLine = lines.find((line) => line.startsWith('ladder grid:'));
        expect(gridLine).toBeDefined();
        expect(gridLine).toContain(`$${request.grid.step}`);
        expect(gridLine).toContain(`$${request.grid.max}`);
        expect(request.grid.step).toBeGreaterThan(100);
    });
});

describe('the next-trade risk check says when it was not run (PT-24c step 2)', () => {
    it('a stale snapshot with --proposed-risk prints "not run" and why', () => {
        const { advisor } = adviceFor(STALE_FUNDED_APEX_EOD);
        const inputs = readNextTradeRiskInputs(parseAdvise(RISK_CHECK_FLAGS));
        if (inputs === null) throw new Error('expected check inputs');

        const report = nextTradeRiskReport(advisor, inputs);
        const lines = nextTradeRiskReportLines(report);

        if (report.kind !== NextTradeRiskReportKind.NotRun) {
            throw new Error('expected a not-run report');
        }
        expect(report.reason).toContain('stale');
        expect(lines[0]).toBe('next-trade risk check: not run');
        expect(lines.join(' ')).toContain("enter today's balance");
    });

    it('the run on a stale snapshot ends with the not-run line and exit code 0', async () => {
        const run = await runAdvise([
            ...STALE_FUNDED_APEX_EOD,
            ...RISK_CHECK_FLAGS,
        ]);

        expect(run.exitCode).toBeUndefined();
        expect(run.stdout).toContain('next-trade risk check: not run');
    }, 60_000);

    it('a fresh snapshot reports the verdict instead', () => {
        const { advisor } = adviceFor(FRESH_EVAL_APEX_EOD);
        const inputs = readNextTradeRiskInputs(parseAdvise(RISK_CHECK_FLAGS));
        if (inputs === null) throw new Error('expected check inputs');

        const report = nextTradeRiskReport(advisor, inputs);

        if (report.kind !== NextTradeRiskReportKind.Checked) {
            throw new Error('expected a checked report');
        }
        expect(report.result.verdict).toBe(
            NextTradeRiskVerdict.AboveDocumented,
        );
        expect(nextTradeRiskReportLines(report)[0]).toContain(
            NextTradeRiskVerdict.AboveDocumented,
        );
    });

    it('a plan rules change is not cured by a fresh balance: the reason says the rules changed', () => {
        const { advisor } = adviceFor(FRESH_EVAL_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        });
        const inputs = readNextTradeRiskInputs(parseAdvise(RISK_CHECK_FLAGS));
        if (inputs === null) throw new Error('expected check inputs');

        const report = nextTradeRiskReport(advisor, inputs);

        if (report.kind !== NextTradeRiskReportKind.NotRun) {
            throw new Error('expected a not-run report');
        }
        expect(report.reason).toContain('plan rules changed');
        expect(report.reason).not.toContain("enter today's balance");
    });

    it('the stale advice line asks for a fresh balance only when the snapshot is stale', () => {
        const rulesChanged = adviceFor(FRESH_EVAL_APEX_EOD, {
            planRulesFingerprint: { atAdvice: 'before', current: 'after' },
        }).advisor.assemble([]);
        const snapshotStale = adviceFor(STALE_FUNDED_APEX_EOD).advisor.assemble(
            [],
        );

        const rulesChangedText = adviceReportLines(rulesChanged).join(' ');
        const snapshotStaleText = adviceReportLines(snapshotStale).join(' ');

        expect(rulesChangedText).toContain('plan rules changed');
        expect(rulesChangedText).not.toContain("enter today's balance");
        expect(snapshotStaleText).toContain("enter today's balance");
    });
});

describe('--json carries the risk check result (PT-24c step 3)', () => {
    it('includes the check next to the Advice shape when --proposed-risk is given', async () => {
        const run = await runAdvise([
            ...FRESH_EVAL_APEX_EOD,
            ...RISK_CHECK_FLAGS,
            '--json',
        ]);

        const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
        expect(run.exitCode).toBeUndefined();
        expect(parsed.headline).toBeDefined();
        expect(parsed.nextTradeRiskCheck).toMatchObject({
            day: { losses: 1, wins: 0 },
            kind: NextTradeRiskReportKind.Checked,
            proposedRisk: 600,
            result: { verdict: NextTradeRiskVerdict.AboveDocumented },
        });
        expect(parsed.nextTradeRiskCheck).not.toHaveProperty('reason');
    }, 60_000);

    it('carries the not-run kind and the reason, with no result, on a stale snapshot', async () => {
        const run = await runAdvise([
            ...STALE_FUNDED_APEX_EOD,
            ...RISK_CHECK_FLAGS,
            '--json',
        ]);

        const parsed = JSON.parse(run.stdout) as {
            nextTradeRiskCheck?: { kind: string; reason: string };
        };
        expect(parsed.nextTradeRiskCheck?.kind).toBe(
            NextTradeRiskReportKind.NotRun,
        );
        expect(parsed.nextTradeRiskCheck?.reason).toContain('stale');
        expect(parsed.nextTradeRiskCheck).not.toHaveProperty('result');
    }, 60_000);

    it('adds no key when --proposed-risk is absent, keeping the exact Advice shape', () => {
        const { advisor } = adviceFor(FRESH_EVAL_APEX_EOD);
        const advice = advisor.assemble([]);

        const roundTripped = JSON.stringify(JSON.parse(adviceJson(advice)));
        expect(roundTripped).toBe(JSON.stringify(advice));
        expect(adviceJson(advice, null)).toBe(adviceJson(advice));
    });
});

describe('--wins-today and --losses-today need --proposed-risk (PT-24c step 3)', () => {
    it('--losses-today alone is refused, naming both flags', () => {
        expect(() =>
            readNextTradeRiskInputs(parseAdvise(['--losses-today', '1'])),
        ).toThrow(/--losses-today.*--proposed-risk/);
    });

    it('--wins-today alone is refused, naming both flags', () => {
        expect(() =>
            readNextTradeRiskInputs(parseAdvise(['--wins-today', '2'])),
        ).toThrow(/--wins-today.*--proposed-risk/);
    });

    it('returns null when none of the three flags is given', () => {
        expect(readNextTradeRiskInputs(parseAdvise([]))).toBeNull();
    });

    it('reads counts and the proposed risk, defaulting the missing count to 0', () => {
        expect(
            readNextTradeRiskInputs(
                parseAdvise(['--proposed-risk', '600', '--losses-today', '2']),
            ),
        ).toStrictEqual({ losses: 2, proposedRisk: dollars(600), wins: 0 });
    });

    it('the command refuses before running the engine and exits 1', async () => {
        const run = await runAdvise([
            ...FRESH_EVAL_APEX_EOD,
            '--losses-today',
            '1',
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('--losses-today');
        expect(run.stderr).toContain('--proposed-risk');
        expect(run.stdout).not.toContain('your documented rule');
    });
});

describe('no flag is silently dropped (PT-24c leftovers)', () => {
    it('--risk with --json is refused, naming both flags, before any engine work', async () => {
        const run = await runAdvise([
            ...FRESH_EVAL_APEX_EOD,
            '--json',
            '--risk',
            '500',
        ]);

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain('--risk');
        expect(run.stderr).toContain('--json');
        expect(run.stdout).toBe('');
    });

    it.each([
        ['--proposed-risk', ['--proposed-risk', '600']],
        ['--losses-today', ['--proposed-risk', '600', '--losses-today', '1']],
        ['--wins-today', ['--proposed-risk', '600', '--wins-today', '1']],
        ['--risk', ['--risk', '500']],
    ])(
        '--matrix with %s is refused instead of ignoring it',
        async (flag, extra) => {
            const run = await runAdvise(['--matrix', ...extra]);

            expect(run.exitCode).toBe(1);
            expect(run.stderr).toContain('--matrix');
            expect(run.stderr).toContain(flag);
        },
    );

    it('--matrix alone still prints the coverage matrix', async () => {
        const run = await runAdvise(['--matrix', '--firm', 'apex']);

        expect(run.exitCode).toBeUndefined();
        expect(run.stdout).toContain('-- apex --');
    });

    it('--trials reaches the eval ladder search as its simulation count', () => {
        const { advisor } = adviceFor(FRESH_EVAL_APEX_EOD);

        const [request] = advisor.optimumRequests();

        if (request === undefined || !('grid' in request)) {
            throw new Error('expected a ladder request');
        }
        expect(request.score.sims).toBe(50);
    });
});
