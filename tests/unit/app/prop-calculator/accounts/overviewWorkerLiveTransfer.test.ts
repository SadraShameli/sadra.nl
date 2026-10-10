import { describe, expect, it } from 'vitest';

import {
    type DocumentedRunFigures,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    overviewPlanValueRequestsFor,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    type PayoutSizeOptimumFigures,
    type PlanValuesFigures,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    findFirm,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    assumptionText,
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

function topStep50k(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan not found');
    return plan;
}

const PLAN = topStep50k();
const SMALL_RUN = { maxEvalDays: 150, seed: 7, trials: 40 } as const;

function documentedOf(rulebook: RulebookParameters): DocumentedRunFigures {
    const request = small(
        overviewRequestsFor(plansOf(), rulebook).find(
            (candidate) => candidate.kind === OverviewRequestKind.DocumentedRun,
        ),
    );
    const result = figuresOf(request);
    if (result.kind !== OverviewRequestKind.DocumentedRun) {
        throw new Error('expected a documented run');
    }
    return result.figures;
}

function figuresOf(request: OverviewRequest) {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    return outcome.result;
}

function optimumOf(rulebook: RulebookParameters): PayoutSizeOptimumFigures {
    const request = small(
        overviewRequestsFor(plansOf(), rulebook).find(
            (candidate) =>
                candidate.kind === OverviewRequestKind.PayoutSizeOptimum,
        ),
    );
    const result = figuresOf(request);
    if (result.kind !== OverviewRequestKind.PayoutSizeOptimum) {
        throw new Error('expected a payout-size optimum');
    }
    return result.figures;
}

function plansOf() {
    return [
        {
            firmId: PLAN.id.firm,
            measuredRebuyLag: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: serializePlanId(PLAN.id),
        },
    ];
}

function planValuesOf(rulebook: RulebookParameters): PlanValuesFigures {
    const request = small(overviewPlanValueRequestsFor(plansOf(), rulebook)[0]);
    const result = figuresOf(request);
    if (result.kind !== OverviewRequestKind.PlanValues) {
        throw new Error('expected plan values');
    }
    return result.figures;
}

function requestKeyOf(rulebook: RulebookParameters): string {
    const [first] = overviewRequestsFor(plansOf(), rulebook);
    return overviewRequestKey(small(first));
}

function rulebookWith(
    hazards: Partial<Record<FirmId, number>>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        liveTransfer: { hazardPerPaidPayoutByFirm: hazards },
    };
}

function small(request: OverviewRequest | undefined): OverviewRequest {
    if (request === undefined) throw new Error('missing request');
    return { ...request, spec: { ...request.spec, run: SMALL_RUN } };
}

const TOPSTEP_30 = rulebookWith({ [FirmId.TopStep]: 0.3 });

describe('the overview figures priced with the rulebook live-transfer hazard say so (PT-73d step 1)', () => {
    it('carries a typed assumption on the documented run, with the share of runs sent live', () => {
        const { liveTransfer } = documentedOf(TOPSTEP_30);
        if (liveTransfer === undefined) throw new Error('expected a hazard');

        expect(liveTransfer).toMatchObject({ hazard: 0.3 });
        expect(liveTransfer.sentLiveShare).toBeGreaterThan(0);
        expect(assumptionText(liveTransfer)).toContain('30.0% per paid payout');
    });

    it('carries none on the documented run of a firm without a hazard', () => {
        expect('liveTransfer' in documentedOf(DEFAULT_RULEBOOK)).toBe(false);
        expect(
            'liveTransfer' in
                documentedOf(rulebookWith({ [FirmId.Apex]: 0.3 })),
        ).toBe(false);
    });

    it('carries it on the payout-size optimum', () => {
        expect(optimumOf(TOPSTEP_30).liveTransfer).toMatchObject({
            hazard: 0.3,
        });
        expect('liveTransfer' in optimumOf(DEFAULT_RULEBOOK)).toBe(false);
    });

    it('carries it on the plan values through their value results', () => {
        const priced = planValuesOf(TOPSTEP_30);

        expect(priced.freshFundedValue.liveTransfer).toMatchObject({
            hazard: 0.3,
        });
        expect(priced.valueFreshEval.liveTransfer).toMatchObject({
            hazard: 0.3,
        });
        expect(
            'liveTransfer' in planValuesOf(DEFAULT_RULEBOOK).freshFundedValue,
        ).toBe(false);
    });

    it('keys a priced run apart from an unpriced one, so a hazard edit re-runs the overview', () => {
        expect(requestKeyOf(TOPSTEP_30)).not.toBe(
            requestKeyOf(DEFAULT_RULEBOOK),
        );
    });
});
