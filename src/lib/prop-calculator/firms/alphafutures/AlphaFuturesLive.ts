import {
    type ContractCount,
    ContractLimitKind,
    contracts,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type InstrumentSpec,
    type LiveAccountState,
    type LiveCushionPercent,
    LivePlan,
    type LivePlanInit,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt } from '../shared';

export const ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(2000);

interface LockedContractCaps {
    readonly micros: ContractCount;
    readonly minis: ContractCount;
}

const LOCKED_CONTRACT_CAPS: LockedContractCaps = {
    micros: contracts(40),
    minis: contracts(4),
};

class AlphaFuturesLivePlan extends LivePlan {
    constructor(
        init: LivePlanInit,
        private readonly lockedContractCaps: LockedContractCaps,
    ) {
        super(init);
    }

    override maxContractsFor(
        state: LiveAccountState,
        instrument: InstrumentSpec,
    ): ContractCount | null {
        if (!state.thresholdLocked) {
            return super.maxContractsFor(state, instrument);
        }
        return instrument.isMicro
            ? this.lockedContractCaps.micros
            : this.lockedContractCaps.minis;
    }
}

export function buildAlphaFuturesLivePlan(
    cushionPercent: LiveCushionPercent = ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new AlphaFuturesLivePlan(
        {
            contractLimits: {
                micros: {
                    kind: ContractLimitKind.Flat,
                    maxContracts: contracts(20),
                },
                minis: {
                    kind: ContractLimitKind.Flat,
                    maxContracts: contracts(2),
                },
            },
            cushionPercent,
            label: 'Alpha Futures Live',
            liveDailyLossLimit: null,
            liveDrawdown: new EodTrailingDrawdown({
                amount: DRAWDOWN_AMOUNT,
                lock: {
                    atProfit: DRAWDOWN_AMOUNT,
                    lockedThreshold: lockThresholdAt(0),
                },
            }),
            payoutFloor: dollars(0),
            payoutTiers: [
                { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
            ],
            requiresLockForWithdrawal: false,
        },
        LOCKED_CONTRACT_CAPS,
    );
}
