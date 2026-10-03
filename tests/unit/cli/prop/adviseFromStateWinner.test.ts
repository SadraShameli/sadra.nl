import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    adviceReportLines,
    adviseArguments,
    readAdviseInputs,
} from '~/cli/commands/prop/advise/command';
import { dollars } from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AdviceSource,
    createSizingAdvisor,
    type EngineOptimumRunnerResult,
    FundedFromStateOptimumResultKind,
    type FundedWinnerPolicy,
    FundedWinnerPolicyKind,
    NO_PENDING_PAYOUT_COUNTS,
} from '~/lib/prop-calculator/advisor';

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

const FROM_STATE_LINE_PREFIX = 'from-state funded sweep:';

function fromStateLineOf(
    policy: FundedWinnerPolicy,
    label: string,
    cushion: null | number,
): string {
    const advice = fundedAdvice();
    if (advice.dailyPlanCard === null) throw new Error('expected a card');
    const line = adviceReportLines({
        ...advice,
        dailyPlanCard:
            cushion === null
                ? null
                : { ...advice.dailyPlanCard, cushion: dollars(cushion) },
        optima: [fromStateResultWith(policy, label)],
    }).find((candidate) => candidate.startsWith(FROM_STATE_LINE_PREFIX));
    if (line === undefined) throw new Error('expected a from-state line');
    return line;
}

function fromStateResultWith(
    policy: FundedWinnerPolicy,
    label: string,
): EngineOptimumRunnerResult {
    return {
        source: AdviceSource.FundedSweepFromState,
        sweep: {
            kind: FundedFromStateOptimumResultKind.Optimum,
            optimum: {
                fromStateExpectedCash: 3200,
                fromStateExpectedCashStandardError: 90,
                fromStateExpectedRealizedCash: 2900,
                fromStateExpectedRealizedCashStandardError: 80,
                label,
                policy,
                rows: [],
                survivors: 7,
            },
        },
    };
}

function fundedAdvice() {
    const { options, plan, snapshot } = readAdviseInputs(
        parseArgs<typeof adviseArguments>(
            [...FUNDED_APEX_EOD],
            adviseArguments,
        ),
    );
    return createSizingAdvisor(
        AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        ),
        options,
    ).assemble([]);
}

describe('prop advise prints the from-state funded winner in dollars at the cushion (PT-109b step 2, F-121)', () => {
    it('prints a percent-of-cushion winner as dollars at the day-start cushion', () => {
        const line = fromStateLineOf(
            { kind: FundedWinnerPolicyKind.PercentOfCushion, percent: 7.5 },
            '7.5% cushion',
            1700,
        );

        expect(line).toContain(
            'from-state funded sweep: 7.5% cushion = $127.50 at your cushion of $1,700.00, from-state expected cash',
        );
    });

    it('prints a flat winner by its label alone', () => {
        const line = fromStateLineOf(
            { dollars: 250, kind: FundedWinnerPolicyKind.Flat },
            'flat $250',
            1700,
        );

        expect(line).toContain(
            'from-state funded sweep: flat $250, from-state expected cash',
        );
        expect(line).not.toContain('at your cushion');
    });

    it('never prints a made-up dollar figure for a percent winner when the cushion is unknown', () => {
        const line = fromStateLineOf(
            { kind: FundedWinnerPolicyKind.PercentOfCushion, percent: 7.5 },
            '7.5% cushion',
            null,
        );

        expect(line).toContain(
            'from-state funded sweep: 7.5% cushion, from-state expected cash',
        );
        expect(line).not.toContain('at your cushion');
    });
});
