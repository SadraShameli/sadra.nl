import { type InstrumentSpec } from './Instruments';
import { type ContractCount } from './lib/units';
import { type LiveAccountState } from './LiveAccountState';
import { LivePlan, type LivePlanInit } from './LivePlan';

export interface LockedContractCaps {
    readonly micros: ContractCount;
    readonly minis: ContractCount;
}

export interface LockKeyedContractCapLivePlanInit extends LivePlanInit {
    lockedContractCaps: LockedContractCaps;
}

export class LockKeyedContractCapLivePlan extends LivePlan {
    readonly lockedContractCaps: LockedContractCaps;

    constructor(init: LockKeyedContractCapLivePlanInit) {
        super(init);
        this.lockedContractCaps = init.lockedContractCaps;
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
