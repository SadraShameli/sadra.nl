import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    firmPayoutCountLines,
    nextTradeRiskReport,
    NextTradeRiskReportKind,
    nextTradeRiskReportLines,
    readAdviseInputs,
} from '~/cli/commands/prop/advise/command';
import {
    dollars,
    FirmAccountPolicy,
    InstrumentSymbol,
    type LiveTransitionTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    createSizingAdvisor,
    LiveTriggerCoverage,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const FUNDED_APEX_EOD = [
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

const EVAL_APEX_EOD = [
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
    '10',
];

const NQ_AT_20_POINTS = ['--instrument', 'NQ', '--stop-points', '20'];
const MNQ_AT_20_POINTS = ['--instrument', 'MNQ', '--stop-points', '20'];

function advisorFor(argv: string[]) {
    const { options, plan, snapshot } = readAdviseInputs(parseAdvise(argv));
    return createSizingAdvisor(
        AccountReconstruction.rebuild(snapshot, plan),
        options,
    );
}

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

function reportLinesFor(argv: string[]): string[] {
    const { options } = readAdviseInputs(parseAdvise(argv));
    const advisor = advisorFor(argv);
    return adviceReportLines(
        advisor.assemble([]),
        options.positionSizing?.stopPoints ?? null,
        options.positionSizing?.instrument ?? null,
    );
}

describe('prop advise takes the firm-wide payout count since the last live account (PT-36h, F-145)', () => {
    it('hands the entered count to the advisor so a verified firm-total trigger is enforced', () => {
        const { options } = readAdviseInputs(
            parseAdvise([...FUNDED_APEX_EOD, '--firm-payouts-since-live', '9']),
        );

        expect(options.paidPayoutsSinceLastLiveAccount).toBe(9);
    });

    it('accepts a count of zero', () => {
        const { options } = readAdviseInputs(
            parseAdvise([...FUNDED_APEX_EOD, '--firm-payouts-since-live', '0']),
        );

        expect(options.paidPayoutsSinceLastLiveAccount).toBe(0);
    });

    it('passes an explicit null, never an omission, when no count is entered', () => {
        const { options } = readAdviseInputs(parseAdvise(FUNDED_APEX_EOD));

        expect(options).toHaveProperty('paidPayoutsSinceLastLiveAccount', null);
    });

    it.each(['-1', '1.5', 'many', ''])('rejects the count "%s"', (count) => {
        expect(() =>
            readAdviseInputs(
                parseAdvise([
                    ...FUNDED_APEX_EOD,
                    '--firm-payouts-since-live',
                    count,
                ]),
            ),
        ).toThrow(/firm-payouts-since-live/);
    });

    it('enforces a firm-total trigger once the count is entered and leaves it unchecked without one', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const coverageFor = (extra: string[]) => {
            const { options, plan, snapshot } = readAdviseInputs(
                parseAdvise([...FUNDED_APEX_EOD, ...extra]),
            );
            const advisor = createSizingAdvisor(
                AccountReconstruction.rebuild(snapshot, plan),
                { ...options, accountPolicy: policy },
            );
            return advisor.assemble([]).payoutAdvice?.assumptions.length === 0
                ? LiveTriggerCoverage.Enforced
                : LiveTriggerCoverage.NotChecked;
        };

        expect(coverageFor(['--firm-payouts-since-live', '9'])).toBe(
            LiveTriggerCoverage.Enforced,
        );
        expect(coverageFor([])).toBe(LiveTriggerCoverage.NotChecked);
    });

    it('prints the entered count, or that it is unchecked, for a firm with a firm-total trigger on a funded account', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const { options: entered, plan } = readAdviseInputs(
            parseAdvise([...FUNDED_APEX_EOD, '--firm-payouts-since-live', '9']),
        );
        const { options: omitted } = readAdviseInputs(
            parseAdvise(FUNDED_APEX_EOD),
        );

        const enteredLines = firmPayoutCountLines(plan, SizingStage.Funded, {
            ...entered,
            accountPolicy: policy,
        });
        const omittedLines = firmPayoutCountLines(plan, SizingStage.Funded, {
            ...omitted,
            accountPolicy: policy,
        });

        expect(enteredLines.join(' ')).toContain('9');
        expect(enteredLines.join(' ')).toContain('firm-total');
        expect(omittedLines.join(' ')).toContain('not entered');
        expect(omittedLines.join(' ')).toContain('--firm-payouts-since-live');
    });

    it('says the firm-total trigger is unverified, never applied, and asks for no count when no source confirms it', () => {
        const unverified = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, {
                verification: PolicyVerification.NeedsPaste,
            }),
        ]);
        const { options: entered, plan } = readAdviseInputs(
            parseAdvise([...FUNDED_APEX_EOD, '--firm-payouts-since-live', '9']),
        );
        const { options: omitted } = readAdviseInputs(
            parseAdvise(FUNDED_APEX_EOD),
        );

        for (const options of [entered, omitted]) {
            const text = firmPayoutCountLines(plan, SizingStage.Funded, {
                ...options,
                accountPolicy: unverified,
            }).join(' ');

            expect(text).toContain('not verified');
            expect(text).toContain('not checked');
            expect(text).not.toContain('applied');
            expect(text).not.toContain('--firm-payouts-since-live');
        }
    });

    it('prints nothing about the count for a firm with no firm-total trigger, and for an evaluation', () => {
        const { options, plan } = readAdviseInputs(
            parseAdvise(FUNDED_APEX_EOD),
        );
        const singleDay = new StubTriggerPolicy([
            new SingleDayProfitTrigger(
                dollars(250),
                true,
                false,
                CONFIRMED_SOURCE,
            ),
        ]);
        const total = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);

        expect(
            firmPayoutCountLines(plan, SizingStage.Funded, {
                ...options,
                accountPolicy: singleDay,
            }),
        ).toEqual([]);
        expect(
            firmPayoutCountLines(plan, SizingStage.Eval, {
                ...options,
                accountPolicy: total,
            }),
        ).toEqual([]);
    });
});

describe('prop advise flags a funded rung below one contract at the entered stop (PT-36h, F-154)', () => {
    it('says the rung cannot be placed when one contract at the entered stop risks more than the rung', () => {
        const lines = reportLinesFor([...FUNDED_APEX_EOD, ...NQ_AT_20_POINTS]);
        const rungLines = lines.filter((line) => line.startsWith('rung '));

        expect(rungLines.length).toBeGreaterThan(0);
        for (const line of rungLines) {
            expect(line).toContain('cannot be placed');
        }
    });

    it('says nothing when one contract fits inside the rung', () => {
        const lines = reportLinesFor([...FUNDED_APEX_EOD, ...MNQ_AT_20_POINTS]);

        expect(lines.join('\n')).not.toContain('cannot be placed');
    });

    it('says nothing while no stop is entered', () => {
        const lines = reportLinesFor(FUNDED_APEX_EOD);

        expect(lines.join('\n')).not.toContain('cannot be placed');
    });

    it('never flags an evaluation rung', () => {
        const lines = reportLinesFor([...EVAL_APEX_EOD, ...NQ_AT_20_POINTS]);

        expect(lines.join('\n')).not.toContain('cannot be placed');
    });

    it('carries the typed flag and the words on the next-trade risk check', () => {
        const argv = [...FUNDED_APEX_EOD, ...NQ_AT_20_POINTS];
        const { options } = readAdviseInputs(parseAdvise(argv));
        const report = nextTradeRiskReport(
            advisorFor(argv),
            { losses: 0, proposedRisk: dollars(200), wins: 0 },
            options.positionSizing ?? null,
        );

        expect(report.kind).toBe(NextTradeRiskReportKind.Checked);
        if (report.kind !== NextTradeRiskReportKind.Checked) return;
        expect(report.result.documentedRungPlacement).toBe(
            'below-one-contract',
        );
        expect(nextTradeRiskReportLines(report).join('\n')).toContain(
            'cannot be placed',
        );
    });

    it('does not flag the risk check when a contract fits', () => {
        const argv = [...FUNDED_APEX_EOD, ...MNQ_AT_20_POINTS];
        const { options } = readAdviseInputs(parseAdvise(argv));
        const report = nextTradeRiskReport(
            advisorFor(argv),
            { losses: 0, proposedRisk: dollars(200), wins: 0 },
            options.positionSizing ?? null,
        );

        expect(nextTradeRiskReportLines(report).join('\n')).not.toContain(
            'cannot be placed',
        );
        expect(InstrumentSymbol.MNQ).toBe(options.positionSizing?.instrument);
    });
});
