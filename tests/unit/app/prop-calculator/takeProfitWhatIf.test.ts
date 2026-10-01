import { describe, expect, it } from 'vitest';

import {
    DEFAULT_TAKE_PROFIT_RR_CANDIDATES,
    defaultTakeProfitWhatIfInputs,
    takeProfitWhatIfNonAnchorLabel,
    takeProfitWhatIfRequest,
    takeProfitWhatIfRowViews,
    YOUR_DOCUMENTED_RR_LABEL,
} from '~/app/(app)/prop-calculator/_components/takeProfitWhatIfModel';
import { computeToolsResult } from '~/app/(app)/prop-calculator/_workers/toolsWorker';
import {
    type BankrollPlanVariantInputs,
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';
import { TopStepVariant } from '~/lib/prop-calculator/core';
import { TAKE_PROFIT_WHAT_IF_LABEL } from '~/lib/prop-calculator/economics';

const TOPSTEP_50K_SERIAL = serializePlanId({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

function variant(
    overrides: Partial<BankrollPlanVariantInputs['base']> = {},
): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 200,
            winrate: 0.4,
            ...overrides,
        },
        plan: {
            firmId: FirmId.TopStep,
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: TOPSTEP_50K_SERIAL,
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

describe('defaultTakeProfitWhatIfInputs', () => {
    it('anchors on the calculator rr and includes the default candidates plus the anchor', () => {
        const inputs = defaultTakeProfitWhatIfInputs(2);
        expect(inputs.anchorRrRatio).toBe(2);
        for (const candidate of DEFAULT_TAKE_PROFIT_RR_CANDIDATES) {
            expect(inputs.rrCandidates).toContain(candidate);
        }
    });

    it('includes an anchor rr outside the default candidate list exactly once', () => {
        const inputs = defaultTakeProfitWhatIfInputs(2.5);
        expect(inputs.rrCandidates.filter((rr) => rr === 2.5)).toHaveLength(1);
    });
});

describe('takeProfitWhatIfRequest', () => {
    it('builds one TakeProfitRows request carrying the full variant, anchor and candidates', () => {
        const theVariant = variant();
        const request = takeProfitWhatIfRequest(
            theVariant,
            { anchorRrRatio: 2, rrCandidates: [1, 2, 3] },
            5,
        );
        expect(request.kind).toBe(ToolsRequestKind.TakeProfitRows);
        expect(request.anchorRrRatio).toBe(2);
        expect(request.rrCandidates).toStrictEqual([1, 2, 3]);
        expect(request.runId).toBe(5);
        expect(request.variant).toBe(theVariant);
    });
});

describe('takeProfitWhatIfRowViews', () => {
    it('marks the row at the anchor rr as "your documented rr" and every other row with the what-if label', () => {
        const views = takeProfitWhatIfRowViews(
            [
                {
                    attemptPassProbability: 0.3,
                    daysToPassP50: 10,
                    expectedMonthlyNet: 100,
                    expectedNet: 90,
                    label: TAKE_PROFIT_WHAT_IF_LABEL,
                    rrRatio: 1,
                    winrate: 0.5486,
                },
                {
                    attemptPassProbability: 0.35,
                    daysToPassP50: 12,
                    expectedMonthlyNet: 120,
                    expectedNet: 110,
                    label: TAKE_PROFIT_WHAT_IF_LABEL,
                    rrRatio: 2,
                    winrate: 0.4,
                },
            ],
            2,
        );
        const anchorRow = views.find((row) => row.rrRatio === 2);
        const otherRow = views.find((row) => row.rrRatio === 1);
        expect(anchorRow?.label).toBe(YOUR_DOCUMENTED_RR_LABEL);
        expect(anchorRow?.isAnchor).toBe(true);
        expect(otherRow?.label).toBe(takeProfitWhatIfNonAnchorLabel(2));
        expect(otherRow?.isAnchor).toBe(false);
    });

    it('labels non-anchor rows against the actual anchor rr, not a hardcoded 1:2', () => {
        const views = takeProfitWhatIfRowViews(
            [
                {
                    attemptPassProbability: 0.3,
                    daysToPassP50: 10,
                    expectedMonthlyNet: 100,
                    expectedNet: 90,
                    label: TAKE_PROFIT_WHAT_IF_LABEL,
                    rrRatio: 1,
                    winrate: 0.6,
                },
                {
                    attemptPassProbability: 0.2,
                    daysToPassP50: 14,
                    expectedMonthlyNet: 80,
                    expectedNet: 70,
                    label: TAKE_PROFIT_WHAT_IF_LABEL,
                    rrRatio: 3,
                    winrate: 0.3,
                },
            ],
            3,
        );
        const anchorRow = views.find((row) => row.rrRatio === 3);
        const otherRow = views.find((row) => row.rrRatio === 1);
        expect(anchorRow?.label).toBe(YOUR_DOCUMENTED_RR_LABEL);
        expect(otherRow?.label).toBe(takeProfitWhatIfNonAnchorLabel(3));
        expect(otherRow?.label).toContain('1:3.00');
        expect(otherRow?.label).not.toContain('fixed 1:2');
    });

    it('ranks rows by expected monthly net, descending', () => {
        const views = takeProfitWhatIfRowViews(
            [
                {
                    attemptPassProbability: 0.3,
                    daysToPassP50: 10,
                    expectedMonthlyNet: 50,
                    expectedNet: 40,
                    label: TAKE_PROFIT_WHAT_IF_LABEL,
                    rrRatio: 1,
                    winrate: 0.5486,
                },
                {
                    attemptPassProbability: 0.35,
                    daysToPassP50: 12,
                    expectedMonthlyNet: 200,
                    expectedNet: 180,
                    label: TAKE_PROFIT_WHAT_IF_LABEL,
                    rrRatio: 3,
                    winrate: 0.3271,
                },
            ],
            2,
        );
        expect(views.map((row) => row.rrRatio)).toStrictEqual([3, 1]);
    });
});

describe('computeToolsResult: TakeProfitRows (thin call into TakeProfitWhatIf)', () => {
    it('computes one ranked, labelled row per candidate rr off the main thread', () => {
        const result = computeToolsResult({
            anchorRrRatio: 2,
            kind: ToolsRequestKind.TakeProfitRows,
            rrCandidates: [1, 2, 3],
            runId: 1,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.TakeProfitRows);
        if (result.kind !== ToolsResponseKind.TakeProfitRows)
            throw new Error('unreachable');
        expect(result.rows).toHaveLength(3);
        expect(
            result.rows.every((row) => row.label === TAKE_PROFIT_WHAT_IF_LABEL),
        ).toBe(true);
        const anchorRow = result.rows.find((row) => row.rrRatio === 2);
        expect(anchorRow?.winrate).toBeCloseTo(0.4, 6);
        const rrOne = result.rows.find((row) => row.rrRatio === 1);
        expect(rrOne?.winrate).toBeCloseTo(0.5486, 4);
        const rrThree = result.rows.find((row) => row.rrRatio === 3);
        expect(rrThree?.winrate).toBeCloseTo(0.3271, 4);
    });

    it('fails with a named reason when the plan does not resolve', () => {
        const result = computeToolsResult({
            anchorRrRatio: 2,
            kind: ToolsRequestKind.TakeProfitRows,
            rrCandidates: [1, 2],
            runId: 2,
            variant: {
                ...variant(),
                plan: { ...variant().plan, planSerial: 'no-such-plan' },
            },
        });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });

    it('fails with a named reason instead of throwing when the stated win rate cannot be fitted (0 or 1)', () => {
        const result = computeToolsResult({
            anchorRrRatio: 2,
            kind: ToolsRequestKind.TakeProfitRows,
            rrCandidates: [1, 2],
            runId: 3,
            variant: variant({ winrate: 1 }),
        });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });

    it('never edits the base SimInputs winrate or rr: every candidate is a fresh row', () => {
        const result = computeToolsResult({
            anchorRrRatio: 2,
            kind: ToolsRequestKind.TakeProfitRows,
            rrCandidates: [1, 2],
            runId: 4,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.TakeProfitRows);
        if (result.kind !== ToolsResponseKind.TakeProfitRows)
            throw new Error('unreachable');
        expect(result.rows.map((row) => row.rrRatio)).toContain(1);
        expect(result.rows.map((row) => row.rrRatio)).toContain(2);
    });
});

describe('resolving the requested plan', () => {
    it('resolves the same TopStep 50K plan the catalog exposes', () => {
        const firm = findFirm(FirmId.TopStep);
        expect(firm?.findPlanBySerial(TOPSTEP_50K_SERIAL)).not.toBeNull();
    });
});
