import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    contracts,
    dollars,
    maxContractsAt,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

describe('maxContractsAt', () => {
    it('returns null for a null config', () => {
        expect(maxContractsAt(null, 50_000)).toBeNull();
    });

    it('returns the flat cap regardless of balance', () => {
        const config = {
            kind: ContractLimitKind.Flat,
            maxContracts: contracts(4),
        } as const;
        expect(maxContractsAt(config, 0)).toBe(4);
        expect(maxContractsAt(config, 1_000_000)).toBe(4);
    });

    it('picks the highest tier whose minBalance the balance clears', () => {
        const config = {
            kind: ContractLimitKind.Tiered,
            tiers: [
                { maxContracts: contracts(2), minBalance: dollars(0) },
                { maxContracts: contracts(3), minBalance: dollars(1500) },
                { maxContracts: contracts(5), minBalance: dollars(2000) },
            ],
        } as const;
        expect(maxContractsAt(config, 0)).toBe(2);
        expect(maxContractsAt(config, 1499)).toBe(2);
        expect(maxContractsAt(config, 1500)).toBe(3);
        expect(maxContractsAt(config, 1999)).toBe(3);
        expect(maxContractsAt(config, 2000)).toBe(5);
        expect(maxContractsAt(config, 50_000)).toBe(5);
    });
});

describe('TopStep funded contract tiers (live-verified)', () => {
    it('resolves the real $50K XFA scaling-plan tiers', () => {
        const firm = new TopStep();
        const plan = firm.plans[0];
        if (!plan) throw new Error('No TopStep plan registered');
        const limits = plan.contractLimits;
        if (!limits) throw new Error('TopStep plan has no contractLimits');

        expect(maxContractsAt(limits.fundedMinis, 0)).toBe(2);
        expect(maxContractsAt(limits.fundedMinis, 1500)).toBe(3);
        expect(maxContractsAt(limits.fundedMinis, 2000)).toBe(5);
        expect(maxContractsAt(limits.fundedMicros, 2000)).toBe(50);
    });
});
