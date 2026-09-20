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

    it('falls back to the true lowest-minBalance tier below every threshold, regardless of declaration order', () => {
        const outOfOrder = {
            kind: ContractLimitKind.Tiered,
            tiers: [
                { maxContracts: contracts(5), minBalance: dollars(2000) },
                { maxContracts: contracts(2), minBalance: dollars(0) },
                { maxContracts: contracts(3), minBalance: dollars(1500) },
            ],
        } as const;
        expect(maxContractsAt(outOfOrder, -500)).toBe(2);
        expect(maxContractsAt(outOfOrder, 1500)).toBe(3);
        expect(maxContractsAt(outOfOrder, 2000)).toBe(5);
    });
});

describe('maxContractsAt with a session-start-frozen tier (isEffectiveNextSession)', () => {
    const LIVE_TIERS = {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(5), minBalance: dollars(2000) },
        ],
    } as const;

    const OPTED_OUT_TIERS = {
        isEffectiveNextSession: false,
        kind: ContractLimitKind.Tiered,
        tiers: LIVE_TIERS.tiers,
    } as const;

    const FROZEN_TIERS = {
        isEffectiveNextSession: true,
        kind: ContractLimitKind.Tiered,
        tiers: LIVE_TIERS.tiers,
    } as const;

    it('ignores profitAtSessionStart entirely when the flag is unset, so every firm that has not opted in still keys its tier on live intraday balance', () => {
        expect(maxContractsAt(LIVE_TIERS, 2000, 0)).toBe(5);
        expect(maxContractsAt(LIVE_TIERS, 0, 2000)).toBe(2);
    });

    it('treats an explicit isEffectiveNextSession: false exactly like an unset flag', () => {
        expect(maxContractsAt(OPTED_OUT_TIERS, 2000, 0)).toBe(5);
        expect(maxContractsAt(OPTED_OUT_TIERS, 0, 2000)).toBe(2);
    });

    it("holds the session's cap at the lower session-start tier when intraday profit crosses up into a higher tier, because the firm only re-tiers at session close", () => {
        expect(maxContractsAt(FROZEN_TIERS, 2000, 0)).toBe(2);
        expect(maxContractsAt(FROZEN_TIERS, 5000, 1999)).toBe(2);
    });

    it("holds the session's cap at the higher session-start tier when intraday profit falls out of it, so a losing session never shrinks the cap mid-day either", () => {
        expect(maxContractsAt(FROZEN_TIERS, 0, 2000)).toBe(5);
        expect(maxContractsAt(FROZEN_TIERS, -5000, 2000)).toBe(5);
    });

    it('defaults profitAtSessionStart to balance when the third argument is omitted, keeping every existing two-argument call site identical', () => {
        expect(maxContractsAt(FROZEN_TIERS, 0)).toBe(2);
        expect(maxContractsAt(FROZEN_TIERS, 1999)).toBe(2);
        expect(maxContractsAt(FROZEN_TIERS, 2000)).toBe(5);
    });

    it('never consults profitAtSessionStart for a flat cap, which has no tier to freeze', () => {
        const flat = {
            kind: ContractLimitKind.Flat,
            maxContracts: contracts(4),
        } as const;
        expect(maxContractsAt(flat, 0, 2000)).toBe(4);
    });

    it('still returns null for a null config regardless of profitAtSessionStart', () => {
        expect(maxContractsAt(null, 0, 2000)).toBeNull();
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
