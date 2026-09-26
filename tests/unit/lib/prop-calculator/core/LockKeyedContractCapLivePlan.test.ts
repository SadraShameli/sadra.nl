import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    contracts,
    dollars,
    EodTrailingDrawdown,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    LivePlan,
    LockKeyedContractCapLivePlan,
    type LockKeyedContractCapLivePlanInit,
    TierBasis,
} from '~/lib/prop-calculator/core';
import { buildAlphaFuturesLivePlan } from '~/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive';
import { buildFundedNextLivePlan } from '~/lib/prop-calculator/firms/fundednext/FundedNextLive';

const NQ = INSTRUMENTS[InstrumentSymbol.NQ];
const MNQ = INSTRUMENTS[InstrumentSymbol.MNQ];

function lockKeyedInit(
    overrides: Partial<LockKeyedContractCapLivePlanInit> = {},
): LockKeyedContractCapLivePlanInit {
    return {
        contractLimits: {
            micros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(20),
            },
            minis: { kind: ContractLimitKind.Flat, maxContracts: contracts(2) },
        },
        cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
        label: 'Test Lock-Keyed Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: { atProfit: dollars(2000), lockedThreshold: () => 0 },
        }),
        lockedContractCaps: { micros: contracts(70), minis: contracts(7) },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        ...overrides,
    };
}

describe('LockKeyedContractCapLivePlan', () => {
    it('is a LivePlan', () => {
        expect(
            new LockKeyedContractCapLivePlan(lockKeyedInit()),
        ).toBeInstanceOf(LivePlan);
    });

    it('uses the base contract limits while the threshold is not locked', () => {
        const plan = new LockKeyedContractCapLivePlan(lockKeyedInit());
        const state = { ...plan.initialState(), balance: 5000 };

        expect(plan.maxContractsFor(state, NQ)).toBe(2);
        expect(plan.maxContractsFor(state, MNQ)).toBe(20);
    });

    it('uses the locked caps once the threshold locks, whatever the balance', () => {
        const plan = new LockKeyedContractCapLivePlan(lockKeyedInit());
        const low = {
            ...plan.initialState(),
            balance: 100,
            thresholdLocked: true,
        };
        const high = { ...low, balance: 50_000 };

        expect(plan.maxContractsFor(low, NQ)).toBe(7);
        expect(plan.maxContractsFor(low, MNQ)).toBe(70);
        expect(plan.maxContractsFor(high, NQ)).toBe(7);
        expect(plan.maxContractsFor(high, MNQ)).toBe(70);
    });

    it('follows tiered base limits before the lock and ignores them after it', () => {
        const plan = new LockKeyedContractCapLivePlan(
            lockKeyedInit({
                contractLimits: {
                    micros: {
                        kind: ContractLimitKind.Tiered,
                        tierBasis: TierBasis.LiveProfit,
                        tiers: [
                            {
                                maxContracts: contracts(10),
                                minBalance: dollars(0),
                            },
                            {
                                maxContracts: contracts(30),
                                minBalance: dollars(1000),
                            },
                        ],
                    },
                    minis: {
                        kind: ContractLimitKind.Tiered,
                        tierBasis: TierBasis.LiveProfit,
                        tiers: [
                            {
                                maxContracts: contracts(1),
                                minBalance: dollars(0),
                            },
                            {
                                maxContracts: contracts(3),
                                minBalance: dollars(1000),
                            },
                        ],
                    },
                },
            }),
        );
        const initial = plan.initialState();
        const below = { ...initial, balance: 500 };
        const above = { ...initial, balance: 1500 };

        expect(plan.maxContractsFor(below, NQ)).toBe(1);
        expect(plan.maxContractsFor(below, MNQ)).toBe(10);
        expect(plan.maxContractsFor(above, NQ)).toBe(3);
        expect(plan.maxContractsFor(above, MNQ)).toBe(30);
        expect(
            plan.maxContractsFor({ ...below, thresholdLocked: true }, NQ),
        ).toBe(7);
    });

    it('has no pre-lock cap when the base plan sets no contract limits', () => {
        const plan = new LockKeyedContractCapLivePlan(
            lockKeyedInit({ contractLimits: undefined }),
        );
        const state = plan.initialState();

        expect(plan.maxContractsFor(state, NQ)).toBeNull();
        expect(
            plan.maxContractsFor({ ...state, thresholdLocked: true }, NQ),
        ).toBe(7);
    });

    it.each([
        { build: buildFundedNextLivePlan, firm: 'FundedNext' },
        { build: buildAlphaFuturesLivePlan, firm: 'Alpha Futures' },
    ])(
        'is the one lock-keyed cap implementation $firm Live uses',
        ({ build }) => {
            expect(build()).toBeInstanceOf(LockKeyedContractCapLivePlan);
        },
    );
});
