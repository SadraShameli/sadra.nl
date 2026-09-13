import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    ContractLimitKind,
    contracts,
    dollars,
    FirmId,
    fraction,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';

const apex = new ApexTraderFunding();

function eodPlan() {
    const plan = apex.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('apex eod missing');
    if (!plan.contractLimits) throw new Error('apex eod has no contractLimits');
    return { contractLimits: plan.contractLimits, plan };
}

describe('Plan constructor: empty-array invariants (a config that silently behaves like no restriction is rejected instead)', () => {
    it('throws when contractLimits.fundedMicros is a Tiered config with an empty tiers array', () => {
        const { contractLimits, plan } = eodPlan();
        expect(() =>
            plan.withOverrides({
                contractLimits: {
                    ...contractLimits,
                    fundedMicros: { kind: ContractLimitKind.Tiered, tiers: [] },
                },
            }),
        ).toThrow('contractLimits.fundedMicros.tiers must not be empty');
    });

    it('throws when contractLimits.fundedMinis is a Tiered config with an empty tiers array', () => {
        const { contractLimits, plan } = eodPlan();
        expect(() =>
            plan.withOverrides({
                contractLimits: {
                    ...contractLimits,
                    fundedMinis: { kind: ContractLimitKind.Tiered, tiers: [] },
                },
            }),
        ).toThrow('contractLimits.fundedMinis.tiers must not be empty');
    });

    it('does not throw for a non-empty Tiered contract-limit config', () => {
        const { contractLimits, plan } = eodPlan();
        expect(() =>
            plan.withOverrides({
                contractLimits: {
                    ...contractLimits,
                    fundedMicros: {
                        kind: ContractLimitKind.Tiered,
                        tiers: [
                            {
                                maxContracts: contracts(2),
                                minBalance: dollars(0),
                            },
                        ],
                    },
                },
            }),
        ).not.toThrow();
    });

    it('throws when fundedConsistencyLadder.steps is an empty array', () => {
        const { plan } = eodPlan();
        expect(() =>
            plan.withOverrides({ fundedConsistencyLadder: { steps: [] } }),
        ).toThrow('fundedConsistencyLadder.steps must not be empty');
    });

    it('does not throw for a non-empty fundedConsistencyLadder', () => {
        const { plan } = eodPlan();
        expect(() =>
            plan.withOverrides({
                fundedConsistencyLadder: {
                    steps: [fraction(0.2), fraction(0.3)],
                },
            }),
        ).not.toThrow();
    });
});
