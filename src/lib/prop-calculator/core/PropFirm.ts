import { type Plan } from './Plan';

export enum FirmId {
    AlphaFutures = 'alphafutures',
    Apex = 'apex',
    FundedNext = 'fundednext',
    Lucid = 'lucid',
    Mffu = 'mffu',
    TopStep = 'topstep',
    Tpt = 'tpt',
    Tradeify = 'tradeify',
}

export abstract class PropFirm {
    abstract readonly id: FirmId;
    abstract readonly displayName: string;
    abstract readonly website: string;
    abstract readonly plans: readonly Plan[];

    findPlan(planId: string): Plan | undefined {
        return this.plans.find((p) => p.id === planId);
    }

    abstract maxFundedAccounts(plan: Plan): number;
}
