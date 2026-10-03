import { describe, expect, it } from 'vitest';

import {
    payoutStakeViewOf,
    riskCandidatesViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import {
    findFirm,
    FirmId,
    type Plan,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    type CumulativePayoutTriggerAssumption,
    RiskDisplayUnit,
} from '~/lib/prop-calculator/advisor';
import {
    RISK_CANDIDATE_LABEL,
    RiskCandidateBasis,
    type RiskCandidateValuesResult,
    valueResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

function topStep50k(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K missing');
    return found;
}

const PLAN = topStep50k();

const TRIGGER: CumulativePayoutTriggerAssumption = {
    amount: 100_000,
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    kind: AssumptionKind.CumulativePayoutTriggerPriced,
    notes: [],
    source: {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic test quote',
        url: 'https://example.test/policy',
    },
};

function candidatesOf(isPriced: boolean): RiskCandidateValuesResult {
    return {
        basis: RiskCandidateBasis.Simulator,
        ...(isPriced && { cumulativePayoutTrigger: TRIGGER }),
        kind: ValueResultKind.Candidates,
        label: RISK_CANDIDATE_LABEL,
        rows: [],
    };
}

function stakeOf(isPriced: boolean) {
    return {
        continueNow: valueOf(1000, isPriced),
        kind: ValueResultKind.PayoutStake as const,
        reducedRiskWhatIf: null,
        requestedAmount: 500,
        requestNow: valueOf(1300, isPriced),
        traderReceivesNow: 450,
    };
}

function valueOf(creditFree: number, isPriced: boolean) {
    return {
        ...valueResult(
            {
                creditFree: { standardError: 5, value: creditFree },
                creditInclusive: { standardError: 5, value: creditFree + 10 },
            },
            9,
            100,
        ),
        ...(isPriced && { cumulativePayoutTrigger: TRIGGER }),
    };
}

describe('the advice values name the cumulative trigger they priced (PT-36r, F-145)', () => {
    it('lists the trigger behind the payout stake comparison, with no hazard entered', () => {
        expect(payoutStakeViewOf(stakeOf(true)).liveTransferNotes).toStrictEqual(
            [assumptionText(TRIGGER)],
        );
    });

    it('lists none for a payout stake that priced no trigger', () => {
        expect(payoutStakeViewOf(stakeOf(false)).liveTransferNotes).toStrictEqual(
            [],
        );
    });

    it('lists the trigger behind the risk candidates', () => {
        const view = riskCandidatesViewOf(candidatesOf(true), null, {
            phase: TradingPhase.Funded,
            plan: PLAN,
            unit: RiskDisplayUnit.AccountDollars,
        });
        expect(view.liveTransferNotes).toStrictEqual([assumptionText(TRIGGER)]);
    });

    it('lists none for risk candidates that priced no trigger', () => {
        const view = riskCandidatesViewOf(candidatesOf(false), null, {
            phase: TradingPhase.Funded,
            plan: PLAN,
            unit: RiskDisplayUnit.AccountDollars,
        });
        expect(view.liveTransferNotes).toStrictEqual([]);
    });
});
