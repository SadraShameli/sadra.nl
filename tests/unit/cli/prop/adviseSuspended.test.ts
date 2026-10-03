import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    engineResultsFor,
    nextTradeRiskReport,
    NextTradeRiskReportKind,
    readAdviseInputs,
    rejectRiskWithSuspended,
} from '~/cli/commands/prop/advise/command';
import {
    AccountReconstruction,
    AccountSubstate,
    createSizingAdvisor,
    DifferenceReason,
    differenceReasonText,
    NO_PENDING_PAYOUT_COUNTS,
} from '~/lib/prop-calculator/advisor';
import { dollars } from '~/lib/prop-calculator/core';

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

function adviceFor(argv: string[]) {
    const { options, plan, snapshot } = readAdviseInputs(parseAdvise(argv));
    const advisor = createSizingAdvisor(
        AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        ),
        options,
    );
    return {
        advice: advisor.assemble(engineResultsFor(advisor, plan)),
        options,
    };
}

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

describe('advise --suspended (PT-19h, F-118)', () => {
    it('is a boolean flag that is off by default', () => {
        expect(adviseArguments.suspended.type).toBe('boolean');
        expect(adviseArguments.suspended.default).toBe(false);
        expect(
            readAdviseInputs(parseAdvise(FRESH_FUNDED_APEX_EOD)).options
                .substate,
        ).toBeNull();
    });

    it('passes the Suspended substate to the advisor', () => {
        const { options } = readAdviseInputs(
            parseAdvise([...FRESH_FUNDED_APEX_EOD, '--suspended']),
        );

        expect(options.substate).toBe(AccountSubstate.Suspended);
    });

    it('prints no sizing, no payout advice and no engine optimum for a suspended account, and says why', () => {
        const { advice } = adviceFor([...FRESH_FUNDED_APEX_EOD, '--suspended']);

        expect(advice.documented).toBeNull();
        expect(advice.payoutAdvice).toBeNull();
        expect(advice.dailyPlanCard).toBeNull();
        expect(advice.optima).toEqual([]);
        const lines = adviceReportLines(advice);
        expect(lines.some((line) => line.includes('suspended'))).toBe(true);
    });

    it('prints the typed Suspended reason text, not a refusal with free text', () => {
        const { advice } = adviceFor([...FRESH_FUNDED_APEX_EOD, '--suspended']);

        expect(advice.differenceReasons).toEqual([
            { kind: DifferenceReason.Suspended },
        ]);
        const lines = adviceReportLines(advice);
        const text = differenceReasonText({ kind: DifferenceReason.Suspended });
        expect(lines.some((line) => line.includes(text))).toBe(true);
        expect(lines.some((line) => line.includes('engine refused'))).toBe(
            false,
        );
    });

    it('still sizes the same account without the flag', () => {
        const { advice } = adviceFor(FRESH_FUNDED_APEX_EOD);

        expect(advice.documented).not.toBeNull();
        expect(advice.optima.length).toBeGreaterThan(0);
    });

    it('rejects --risk together with --suspended, since a suspended account is never sized', () => {
        expect(() =>
            rejectRiskWithSuspended(
                parseAdvise([
                    ...FRESH_FUNDED_APEX_EOD,
                    '--suspended',
                    '--risk',
                    '500',
                ]),
            ),
        ).toThrow(/--risk.*--suspended/);
    });

    it('accepts --risk alone and --suspended alone', () => {
        expect(() =>
            rejectRiskWithSuspended(
                parseAdvise([...FRESH_FUNDED_APEX_EOD, '--risk', '500']),
            ),
        ).not.toThrow();
        expect(() =>
            rejectRiskWithSuspended(
                parseAdvise([...FRESH_FUNDED_APEX_EOD, '--suspended']),
            ),
        ).not.toThrow();
    });

    it('says the account is suspended when the next-trade risk check does not run, not that no rung applies', () => {
        const { options, plan, snapshot } = readAdviseInputs(
            parseAdvise([...FRESH_FUNDED_APEX_EOD, '--suspended']),
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

        const report = nextTradeRiskReport(advisor, {
            losses: 0,
            proposedRisk: dollars(500),
            wins: 0,
        });

        expect(report.kind).toBe(NextTradeRiskReportKind.NotRun);
        if (report.kind !== NextTradeRiskReportKind.NotRun) return;
        expect(report.reason).toContain('suspended');
        expect(report.reason).not.toContain('no documented rung');
    });
});
