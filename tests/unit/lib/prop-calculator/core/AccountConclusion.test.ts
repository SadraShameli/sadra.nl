import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    FundedNextVariant,
    LucidVariant,
    MffuVariant,
    type Plan,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';

const apex = new ApexTraderFunding();
const fundedNext = new FundedNext();
const lucid = new LucidTrading();
const mffu = new MyFundedFutures();
const tradeify = new Tradeify();

function apexPlan(variant: ApexVariant): Plan {
    return require50k(
        apex.findPlan({ accountSize: 50_000, firm: FirmId.Apex, variant }),
    );
}

function fundedNextPlan(variant: FundedNextVariant): Plan {
    return require50k(
        fundedNext.findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant,
        }),
    );
}

function lucidPlan(variant: LucidVariant): Plan {
    return require50k(
        lucid.findPlan({ accountSize: 50_000, firm: FirmId.Lucid, variant }),
    );
}

function mffuPlan(variant: MffuVariant): Plan {
    return require50k(
        mffu.findPlan({ accountSize: 50_000, firm: FirmId.Mffu, variant }),
    );
}

function require50k(plan: Plan | undefined): Plan {
    if (!plan) throw new Error('50K plan not found');
    return plan;
}

function tradeifyPlan(variant: TradeifyVariant): Plan {
    return require50k(
        tradeify.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant,
        }),
    );
}

describe('account conclusion', () => {
    it('closes a finite ladder once its last rung is paid', () => {
        const plan = apexPlan(ApexVariant.Eod);
        const rungs = plan.payoutLadder?.steps.length ?? 0;
        expect(rungs).toBe(6);
        expect(plan.isAccountConcluded(rungs - 1)).toBe(false);
        expect(plan.isAccountConcluded(rungs)).toBe(true);
    });

    it('never closes on rung count alone when the ladder caps at its last rung', () => {
        for (const plan of [
            lucidPlan(LucidVariant.Pro),
            tradeifyPlan(TradeifyVariant.Growth),
            tradeifyPlan(TradeifyVariant.Lightning),
        ]) {
            expect(plan.payoutLadder?.capsAtLastStep).toBe(true);
            const rungs = plan.payoutLadder?.steps.length ?? 0;
            expect(plan.isAccountConcluded(rungs)).toBe(false);
        }
    });

    it('closes a capped-ladder plan on its lifetime payout cap instead', () => {
        const lucidPro = lucidPlan(LucidVariant.Pro);
        expect(lucidPro.maxLifetimePayouts).toBe(5);
        expect(lucidPro.isAccountConcluded(4)).toBe(false);
        expect(lucidPro.isAccountConcluded(5)).toBe(true);
    });

    it('never closes a capped-ladder plan with no lifetime cap', () => {
        for (const plan of [
            tradeifyPlan(TradeifyVariant.Growth),
            tradeifyPlan(TradeifyVariant.Lightning),
        ]) {
            expect(plan.maxLifetimePayouts).toBeNull();
            expect(plan.isAccountConcluded(500)).toBe(false);
        }
    });

    it('closes FundedNext Rapid Daily after its fifth withdrawal', () => {
        const plan = fundedNextPlan(FundedNextVariant.RapidDaily);
        expect(plan.payoutLadder).toBeNull();
        expect(plan.maxLifetimePayouts).toBe(5);
        expect(plan.isAccountConcluded(4)).toBe(false);
        expect(plan.isAccountConcluded(5)).toBe(true);
    });

    it('closes FundedNext Rapid Pro after its fifth withdrawal', () => {
        const plan = fundedNextPlan(FundedNextVariant.RapidPro);
        expect(plan.payoutLadder).toBeNull();
        expect(plan.maxLifetimePayouts).toBe(5);
        expect(plan.isAccountConcluded(4)).toBe(false);
        expect(plan.isAccountConcluded(5)).toBe(true);
    });

    it('never closes a ladderless plan with no lifetime cap', () => {
        const plan = fundedNextPlan(FundedNextVariant.Legacy);
        expect(plan.payoutLadder).toBeNull();
        expect(plan.maxLifetimePayouts).toBeNull();
        expect(plan.isAccountConcluded(0)).toBe(false);
        expect(plan.isAccountConcluded(500)).toBe(false);
    });

    it('closes a plain finite ladder that sets no cap flag', () => {
        const plan = mffuPlan(MffuVariant.Flex);
        const rungs = plan.payoutLadder?.steps.length ?? 0;
        expect(rungs).toBe(5);
        expect(plan.payoutLadder?.capsAtLastStep).toBeUndefined();
        expect(plan.isAccountConcluded(rungs)).toBe(true);
    });
});
