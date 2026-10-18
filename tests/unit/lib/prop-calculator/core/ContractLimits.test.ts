import { describe, expect, it } from 'vitest';

import {
    type ContractLimitConfig,
    ContractLimitKind,
    contractLimitTierBreakpoints,
    contracts,
    dollars,
    maxContractsAt,
    TierBasis,
    tierContextFromProfits,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

describe('maxContractsAt', () => {
    it('returns null for a null config', () => {
        expect(maxContractsAt(null, tierContextFromProfits(50_000))).toBeNull();
    });

    it('returns the flat cap regardless of balance', () => {
        const config = {
            kind: ContractLimitKind.Flat,
            maxContracts: contracts(4),
        } as const;
        expect(maxContractsAt(config, tierContextFromProfits(0))).toBe(4);
        expect(maxContractsAt(config, tierContextFromProfits(1_000_000))).toBe(
            4,
        );
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
        expect(maxContractsAt(config, tierContextFromProfits(0))).toBe(2);
        expect(maxContractsAt(config, tierContextFromProfits(1499))).toBe(2);
        expect(maxContractsAt(config, tierContextFromProfits(1500))).toBe(3);
        expect(maxContractsAt(config, tierContextFromProfits(1999))).toBe(3);
        expect(maxContractsAt(config, tierContextFromProfits(2000))).toBe(5);
        expect(maxContractsAt(config, tierContextFromProfits(50_000))).toBe(5);
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
        expect(maxContractsAt(outOfOrder, tierContextFromProfits(-500))).toBe(
            2,
        );
        expect(maxContractsAt(outOfOrder, tierContextFromProfits(1500))).toBe(
            3,
        );
        expect(maxContractsAt(outOfOrder, tierContextFromProfits(2000))).toBe(
            5,
        );
    });
});

describe('maxContractsAt with a session-start-frozen tier (SessionOpenProfit)', () => {
    const LIVE_TIERS = {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(5), minBalance: dollars(2000) },
        ],
    } as const;

    const OPTED_OUT_TIERS = {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.LiveProfit,
        tiers: LIVE_TIERS.tiers,
    } as const;

    const FROZEN_TIERS = {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: LIVE_TIERS.tiers,
    } as const;

    it('ignores profitAtSessionStart entirely when the basis is unset, so every firm that has not opted in still keys its tier on live intraday balance', () => {
        expect(
            maxContractsAt(LIVE_TIERS, tierContextFromProfits(2000, 0)),
        ).toBe(5);
        expect(
            maxContractsAt(LIVE_TIERS, tierContextFromProfits(0, 2000)),
        ).toBe(2);
    });

    it('treats an explicit LiveProfit basis exactly like an unset basis', () => {
        expect(
            maxContractsAt(OPTED_OUT_TIERS, tierContextFromProfits(2000, 0)),
        ).toBe(5);
        expect(
            maxContractsAt(OPTED_OUT_TIERS, tierContextFromProfits(0, 2000)),
        ).toBe(2);
    });

    it("holds the session's cap at the lower session-start tier when intraday profit crosses up into a higher tier, because the firm only re-tiers at session close", () => {
        expect(
            maxContractsAt(FROZEN_TIERS, tierContextFromProfits(2000, 0)),
        ).toBe(2);
        expect(
            maxContractsAt(FROZEN_TIERS, tierContextFromProfits(5000, 1999)),
        ).toBe(2);
    });

    it("holds the session's cap at the higher session-start tier when intraday profit falls out of it, so a losing session never shrinks the cap mid-day either", () => {
        expect(
            maxContractsAt(FROZEN_TIERS, tierContextFromProfits(0, 2000)),
        ).toBe(5);
        expect(
            maxContractsAt(FROZEN_TIERS, tierContextFromProfits(-5000, 2000)),
        ).toBe(5);
    });

    it('defaults profitAtSessionStart to balance when the third argument is omitted, keeping every existing two-argument call site identical', () => {
        expect(maxContractsAt(FROZEN_TIERS, tierContextFromProfits(0))).toBe(2);
        expect(maxContractsAt(FROZEN_TIERS, tierContextFromProfits(1999))).toBe(
            2,
        );
        expect(maxContractsAt(FROZEN_TIERS, tierContextFromProfits(2000))).toBe(
            5,
        );
    });

    it('never consults profitAtSessionStart for a flat cap, which has no tier to freeze', () => {
        const flat = {
            kind: ContractLimitKind.Flat,
            maxContracts: contracts(4),
        } as const;
        expect(maxContractsAt(flat, tierContextFromProfits(0, 2000))).toBe(4);
    });

    it('still returns null for a null config regardless of profitAtSessionStart', () => {
        expect(
            maxContractsAt(null, tierContextFromProfits(0, 2000)),
        ).toBeNull();
    });
});

describe('maxContractsAt with a cumulative tier (PeakSessionCloseProfit)', () => {
    const TIERS = [
        { maxContracts: contracts(2), minBalance: dollars(0) },
        { maxContracts: contracts(3), minBalance: dollars(1500) },
        { maxContracts: contracts(4), minBalance: dollars(2000) },
    ] as const;

    const CUMULATIVE: ContractLimitConfig = {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.PeakSessionCloseProfit,
        tiers: TIERS,
    };

    const SESSION_OPEN: ContractLimitConfig = {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: TIERS,
    };

    it('keeps the top tier after a pullback because a prior session closed above it', () => {
        expect(
            maxContractsAt(
                CUMULATIVE,
                tierContextFromProfits(1200, 1200, 2100),
            ),
        ).toBe(4);
    });

    it('keeps the middle tier when the best close only reached the middle breakpoint', () => {
        expect(
            maxContractsAt(
                CUMULATIVE,
                tierContextFromProfits(1200, 1200, 1700),
            ),
        ).toBe(3);
    });

    it('does not raise the cap on an intraday crossing that no session close has confirmed', () => {
        expect(
            maxContractsAt(
                CUMULATIVE,
                tierContextFromProfits(2500, 1200, 1400),
            ),
        ).toBe(2);
    });

    it('defaults the peak to the session-open profit when the fourth argument is omitted', () => {
        expect(
            maxContractsAt(CUMULATIVE, tierContextFromProfits(0, 1500)),
        ).toBe(3);
    });

    it('lets a SessionOpenProfit tier fall back after a pullback, ignoring the peak', () => {
        expect(
            maxContractsAt(
                SESSION_OPEN,
                tierContextFromProfits(1200, 1200, 2100),
            ),
        ).toBe(2);
    });
});

describe('contractLimitTierBreakpoints', () => {
    const CUMULATIVE: ContractLimitConfig = {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.PeakSessionCloseProfit,
        tiers: [
            { maxContracts: contracts(4), minBalance: dollars(2000) },
            { maxContracts: contracts(2), minBalance: dollars(0) },
        ],
    };

    it('returns the tier thresholds when the config uses the requested basis', () => {
        expect(
            contractLimitTierBreakpoints(
                CUMULATIVE,
                TierBasis.PeakSessionCloseProfit,
            ),
        ).toStrictEqual([0, 2000]);
    });

    it('returns no thresholds for a different basis, a flat cap or no config', () => {
        expect(
            contractLimitTierBreakpoints(
                CUMULATIVE,
                TierBasis.SessionOpenProfit,
            ),
        ).toStrictEqual([]);
        expect(
            contractLimitTierBreakpoints(
                { kind: ContractLimitKind.Flat, maxContracts: contracts(4) },
                TierBasis.LiveProfit,
            ),
        ).toStrictEqual([]);
        expect(
            contractLimitTierBreakpoints(null, TierBasis.LiveProfit),
        ).toStrictEqual([]);
    });

    it('treats an unset basis as LiveProfit', () => {
        expect(
            contractLimitTierBreakpoints(
                {
                    kind: ContractLimitKind.Tiered,
                    tiers: [
                        { maxContracts: contracts(2), minBalance: dollars(0) },
                    ],
                },
                TierBasis.LiveProfit,
            ),
        ).toStrictEqual([0]);
    });
});

describe('TopStep funded contract tiers (live-verified)', () => {
    it('resolves the real $50K XFA scaling-plan tiers', () => {
        const firm = new TopStep();
        const plan = firm.plans[0];
        if (!plan) throw new Error('No TopStep plan registered');
        const limits = plan.contractLimits;
        if (!limits) throw new Error('TopStep plan has no contractLimits');

        expect(
            maxContractsAt(limits.fundedMinis, tierContextFromProfits(0)),
        ).toBe(2);
        expect(
            maxContractsAt(limits.fundedMinis, tierContextFromProfits(1500)),
        ).toBe(3);
        expect(
            maxContractsAt(limits.fundedMinis, tierContextFromProfits(2000)),
        ).toBe(5);
        expect(
            maxContractsAt(limits.fundedMicros, tierContextFromProfits(2000)),
        ).toBe(50);
    });
});
