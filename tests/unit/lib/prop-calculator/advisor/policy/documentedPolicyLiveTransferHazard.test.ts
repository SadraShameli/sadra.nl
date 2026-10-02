import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
    type SimInputs,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    applicableTimelineGaps,
    DOCUMENTED_POLICY_TIMELINE_GAP_TEXT,
    type DocumentedPolicySpec,
    DocumentedPolicyTimelineGap,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import {
    freshFundedAccount,
    isValueResult,
    valueAtState,
} from '~/lib/prop-calculator/advisor/value';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const mffuRapid = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
});
const apexEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

const POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 252,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

function rulebookWithHazards(
    hazards: Partial<Record<FirmId, number>>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        liveTransfer: { hazardPerPaidPayoutByFirm: hazards },
    };
}

function specOf(hazards: Partial<Record<FirmId, number>> = {}) {
    const spec: DocumentedPolicySpec = {
        enginePolicy: POLICY,
        rulebook: rulebookWithHazards(hazards),
        run: { maxEvalDays: 60, seed: 42, trials: 400 },
    };
    return spec;
}

function valueOf(plan: Plan, spec: DocumentedPolicySpec): number {
    const outcome = valueAtState(freshFundedAccount(plan), spec);
    if (!isValueResult(outcome)) throw new Error('expected a value result');
    return outcome.creditFree.value;
}

function withoutDayPolicies(inputs: Omit<SimInputs, 'liveTransferHazard'>) {
    const { evalDayPolicy, fundedDayPolicy, ...rest } = inputs;
    return {
        ...rest,
        evalDayPolicy: typeof evalDayPolicy,
        fundedDayPolicy: typeof fundedDayPolicy,
    };
}

describe('toSimInputs prices the rulebook live-transfer hazard of the account firm (PT-73b, QV-11)', () => {
    it('sets liveTransferHazard from the hazard entered for the account firm', () => {
        const inputs = toSimInputs(mffuRapid, specOf({ [FirmId.Mffu]: 0.3 }));

        expect(inputs.liveTransferHazard).toBe(0.3);
    });

    it('leaves liveTransferHazard absent when no hazard is entered, so every no-hazard input stays byte-identical', () => {
        const inputs = toSimInputs(mffuRapid, specOf());

        expect('liveTransferHazard' in inputs).toBe(false);
    });

    it('changes nothing for a hazard entered for another firm', () => {
        const none = toSimInputs(mffuRapid, specOf());
        const other = toSimInputs(mffuRapid, specOf({ [FirmId.Apex]: 0.3 }));

        expect(withoutDayPolicies(other)).toEqual(withoutDayPolicies(none));
        expect('liveTransferHazard' in other).toBe(false);
    });

    it('keeps every other simulation input equal with and without the hazard', () => {
        const none = toSimInputs(mffuRapid, specOf());
        const hazard = toSimInputs(mffuRapid, specOf({ [FirmId.Mffu]: 0.3 }));
        const { liveTransferHazard, ...rest } = hazard;

        expect(liveTransferHazard).toBe(0.3);
        expect(withoutDayPolicies(rest)).toEqual(withoutDayPolicies(none));
    });

    it('gives an MFFU account a different value with a 30% MFFU hazard than with none', () => {
        const none = valueOf(mffuRapid, specOf());
        const hazard = valueOf(mffuRapid, specOf({ [FirmId.Mffu]: 0.3 }));

        expect(hazard).not.toBe(none);
    });

    it('gives an MFFU account the same value when the hazard is entered for another firm', () => {
        const none = valueOf(mffuRapid, specOf());
        const other = valueOf(mffuRapid, specOf({ [FirmId.Apex]: 0.3 }));

        expect(other).toBe(none);
    });

    it('prices the hazard on the account own firm only', () => {
        const none = valueOf(apexEod, specOf());
        const apex = valueOf(apexEod, specOf({ [FirmId.Apex]: 0.3 }));
        const mffu = valueOf(apexEod, specOf({ [FirmId.Mffu]: 0.3 }));

        expect(apex).not.toBe(none);
        expect(mffu).toBe(none);
    });
});

describe('the portfolio timeline says it does not price the live-transfer hazard (PT-73b, QV-11)', () => {
    it('lists the hazard gap when any firm hazard is entered', () => {
        expect(applicableTimelineGaps(specOf({ [FirmId.Mffu]: 0.3 }))).toEqual([
            DocumentedPolicyTimelineGap.LiveTransferHazard,
        ]);
    });

    it('lists no hazard gap when no hazard is entered', () => {
        expect(applicableTimelineGaps(specOf())).toEqual([]);
    });

    it('words the gap as not pricing a transfer, without a dash', () => {
        const text =
            DOCUMENTED_POLICY_TIMELINE_GAP_TEXT[
                DocumentedPolicyTimelineGap.LiveTransferHazard
            ];

        expect(text).toContain('live-transfer hazard');
        expect(text).not.toContain('\u{2014}');
    });
});
