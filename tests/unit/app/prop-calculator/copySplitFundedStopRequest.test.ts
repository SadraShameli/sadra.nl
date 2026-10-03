import { describe, expect, it } from 'vitest';

import {
    copySplitRequest,
    defaultCopySplitInputs,
} from '~/app/(app)/prop-calculator/_components/copySplitModel';
import { computeToolsResult } from '~/app/(app)/prop-calculator/_workers/toolsWorker';
import {
    type BankrollPlanVariantInputs,
    parseToolsRequest,
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { DayStopRuleKind, FirmId } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    type CopySplitFundedSizing,
    CopySplitFundedSource,
    DEFAULT_COPY_SPLIT_FUNDED,
} from '~/lib/prop-calculator/advisor/policy';

const USER_FUNDED: CopySplitFundedSizing = {
    parameters: {
        ...DEFAULT_RULEBOOK.funded,
        stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
    },
    source: CopySplitFundedSource.UserRulebook,
};

function request(funded: CopySplitFundedSizing) {
    return copySplitRequest(
        variant(),
        { splits: [1, 2], totalRisk: 2000 },
        SizingObjective.MonthlyNet,
        funded,
        3,
    );
}

function variant(): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 2000,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 130,
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

describe('the copy split request carries the signed-in funded sizing (PT-63c, F-V24)', () => {
    it('puts the funded sizing on the request the section builds', () => {
        expect(request(USER_FUNDED).funded).toStrictEqual(USER_FUNDED);
    });

    it('survives the worker message schema with the rulebook funded stop intact', () => {
        const parsed = parseToolsRequest(structuredClone(request(USER_FUNDED)));
        if (parsed.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(parsed.funded).toStrictEqual(USER_FUNDED);
    });

    it('rejects a CopySplit request that carries no funded sizing, so a funded stop is never silently defaulted', () => {
        expect(() =>
            parseToolsRequest({ ...request(USER_FUNDED), funded: undefined }),
        ).toThrow();
    });

    it('rejects funded parameters that break the rulebook funded schema', () => {
        expect(() =>
            parseToolsRequest({
                ...request(USER_FUNDED),
                funded: {
                    parameters: { ...USER_FUNDED.parameters, riskCents: -1 },
                    source: CopySplitFundedSource.UserRulebook,
                },
            }),
        ).toThrow();
        expect(() =>
            parseToolsRequest({
                ...request(USER_FUNDED),
                funded: { ...USER_FUNDED, source: 'somebody-else' },
            }),
        ).toThrow();
    });

    it('runs the funded phase in the worker on the signed-in rulebook funded stop and says so', () => {
        const result = computeToolsResult(request(USER_FUNDED));
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('expected a CopySplit result');
        }
        const lines = result.result.basisLines.join('\n');
        expect(lines).toContain(
            'the funded phase uses your rulebook funded stop (after 2 losses) per account',
        );
        expect(lines).not.toContain('the default rulebook funded stop');
    });

    it('names the default rulebook when the visitor is signed out', () => {
        const result = computeToolsResult(request(DEFAULT_COPY_SPLIT_FUNDED));
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('expected a CopySplit result');
        }
        expect(result.result.basisLines.join('\n')).toContain(
            'the funded phase uses the default rulebook funded stop',
        );
    });

    it('keeps the defaults helper unchanged for the section inputs', () => {
        expect(defaultCopySplitInputs(250, 1).totalRisk).toBe(250);
    });
});
