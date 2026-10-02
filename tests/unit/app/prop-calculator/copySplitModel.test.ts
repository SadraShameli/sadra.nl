import { describe, expect, it } from 'vitest';

import {
    COPY_SPLIT_DEFAULT_SPLITS,
    copySplitHeader,
    copySplitRequest,
    copySplitRowViews,
    defaultCopySplitInputs,
    parseCopySplitInputs,
} from '~/app/(app)/prop-calculator/_components/copySplitModel';
import {
    type BankrollPlanVariantInputs,
    type CopySplitToolsResult,
    ToolsRequestKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { FirmId } from '~/lib/prop-calculator';
import {
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    CopySplitRowKind,
    SIZING_OBJECTIVE_LABEL,
} from '~/lib/prop-calculator/advisor/policy';

function variant(): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 500,
            winrate: 0.4,
        },
        plan: {
            firmId: FirmId.TopStep,
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: 'topstep-50000-standard-standard',
        },
        policy: {
            commissionPerRoundTrip: 0,
            fundedHorizonDays: 30,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: 500,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        },
    };
}

const RESULT: CopySplitToolsResult['result'] = {
    basisLines: [
        'win rate 40% at 1:2, 30 funded days',
        'funded risk $250 per account, the Hard Rule 5 fixed amount, not divided by the split',
        'the copies are engine copies that take identical trades, so they win and bust together',
    ],
    indistinguishableSplits: [1],
    note: null,
    objective: SizingObjective.MonthlyNet,
    requestedObjective: SizingObjective.MonthlyNet,
    rows: [
        {
            cycleNet: { standardError: 20, value: 150 },
            daysToPassP50: 8,
            kind: CopySplitRowKind.Simulated,
            netPerFeeDollar: 1.5,
            passRate: 0.4,
            placement: { contracts: 2, placedRiskPerAccount: 800 },
            riskPerAccount: 1000,
            splitCount: 2,
            totalFees: 100,
            totalMonthlyNet: { standardError: 15, value: 300 },
            trials: 150,
        },
        {
            cycleNet: { standardError: null, value: 90 },
            daysToPassP50: 0,
            kind: CopySplitRowKind.Simulated,
            netPerFeeDollar: null,
            passRate: 0,
            placement: null,
            riskPerAccount: 2000,
            splitCount: 1,
            totalFees: 0,
            totalMonthlyNet: { standardError: null, value: 200 },
            trials: 150,
        },
        {
            kind: CopySplitRowKind.Refused,
            reason: 'risk per account $200 is below one NQ contract',
            riskPerAccount: 200,
            splitCount: 10,
        },
    ],
    trialsPerSplit: 150,
};

describe('defaultCopySplitInputs', () => {
    it('totals the calculator risk across its copy accounts and offers the standard splits', () => {
        expect(defaultCopySplitInputs(250, 5)).toStrictEqual({
            splits: COPY_SPLIT_DEFAULT_SPLITS,
            totalRisk: 1250,
        });
    });

    it('adds the calculator copy count to the splits once, in order', () => {
        expect(defaultCopySplitInputs(250, 3).splits).toStrictEqual([
            1, 2, 3, 5, 10,
        ]);
        expect(defaultCopySplitInputs(250, 5).splits).toStrictEqual([
            1, 2, 5, 10,
        ]);
    });
});

describe('parseCopySplitInputs', () => {
    it('parses a total risk and a comma list of splits', () => {
        expect(
            parseCopySplitInputs({ splits: '1, 2,10', totalRisk: '2000' }),
        ).toStrictEqual({
            inputs: { splits: [1, 2, 10], totalRisk: 2000 },
            issue: null,
        });
    });

    it.each([
        ['', '2000', /split/],
        ['1,x', '2000', /split/],
        ['1,1.5', '2000', /whole/],
        ['2,2', '2000', /more than once/],
        ['1,2', '0', /total risk/],
        ['1,2', 'abc', /total risk/],
        ['1,21', '2000', /1 to 20/],
    ])('rejects splits %j with total risk %j', (splits, totalRisk, issue) => {
        const parsed = parseCopySplitInputs({ splits, totalRisk });
        expect(parsed.inputs).toBeNull();
        expect(parsed.issue).toMatch(issue);
    });
});

describe('copySplitRequest', () => {
    it('builds one CopySplit request carrying the variant, inputs and objective', () => {
        const theVariant = variant();
        const request = copySplitRequest(
            theVariant,
            { splits: [1, 2], totalRisk: 2000 },
            SizingObjective.CycleCash,
            5,
        );
        expect(request.kind).toBe(ToolsRequestKind.CopySplit);
        expect(request.splits).toStrictEqual([1, 2]);
        expect(request.totalRisk).toBe(2000);
        expect(request.objective).toBe(SizingObjective.CycleCash);
        expect(request.runId).toBe(5);
        expect(request.variant).toBe(theVariant);
    });
});

describe('copySplitHeader', () => {
    it('names the active objective and the trials per split', () => {
        const header = copySplitHeader(RESULT);
        expect(header.title).toContain(
            SIZING_OBJECTIVE_LABEL[SizingObjective.MonthlyNet],
        );
        expect(header.title).toContain('objective');
        expect(header.trialsText).toContain('150');
        expect(header.note).toBeNull();
    });

    it('carries the fallback note and the effective objective under RuinFirst', () => {
        const header = copySplitHeader({
            ...RESULT,
            note: 'falls back',
            requestedObjective: SizingObjective.RuinFirst,
        });
        expect(header.title).toContain('monthly net');
        expect(header.note).toContain('falls back');
        expect(header.note).toContain('ranked by monthly net instead');
    });

    it('carries the basis lines of the run, including the funded risk and the correlation of the copies', () => {
        const header = copySplitHeader(RESULT);
        expect(header.basisLines).toStrictEqual(RESULT.basisLines);
    });

    it('explains the noise marks only when a row is within noise', () => {
        expect(copySplitHeader(RESULT).noiseNote).toContain(
            'combined standard errors',
        );
        expect(copySplitHeader(RESULT).noiseNote).toContain(
            'do not read their order as a ranking',
        );
        expect(
            copySplitHeader({ ...RESULT, indistinguishableSplits: [] })
                .noiseNote,
        ).toBeNull();
    });

    it('has no em dash', () => {
        const header = copySplitHeader(RESULT);
        expect(header.noiseNote ?? '').not.toContain('\u{2014}');
        expect(header.title).not.toContain('\u{2014}');
        expect(header.trialsText).not.toContain('\u{2014}');
    });
});

describe('copySplitRowViews', () => {
    const views = copySplitRowViews(RESULT);

    it('keeps the ranked order and marks the refused row with its reason', () => {
        expect(views.map((view) => view.splitCount)).toStrictEqual([2, 1, 10]);
        const refused = views[2];
        expect(refused?.isRefused).toBe(true);
        expect(refused?.refusal).toContain('below one NQ contract');
    });

    it('shows the whole group: total monthly net with its SE, total fees, net per fee dollar, cycle net beside', () => {
        const [two] = views;
        expect(two?.label).toBe('2 accounts at $1,000');
        expect(two?.monthlyNet).toBe('$300 (SE $15)');
        expect(two?.cycleNet).toBe('$150 (SE $20)');
        expect(two?.totalFees).toBe('$100');
        expect(two?.netPerFeeDollar).toBe('1.50');
        expect(two?.passRate).toBe('40.0%');
        expect(two?.daysToPass).toBe('8');
        expect(two?.contracts).toBe(
            '2 contracts at the eval limit, $800 placed per account, $1,600 for the group',
        );
    });

    it('marks the rows within noise of the best row, and only those', () => {
        expect(views.map((view) => view.isWithinNoise)).toStrictEqual([
            false,
            true,
            false,
        ]);
    });

    it('shows n/a for what the run cannot give: no pass, no fees, no stop', () => {
        const single = views[1];
        expect(single?.label).toBe('1 account at $2,000');
        expect(single?.daysToPass).toBe('n/a');
        expect(single?.netPerFeeDollar).toBe('n/a');
        expect(single?.contracts).toBe('n/a');
        expect(single?.monthlyNet).toBe('$200');
    });
});
