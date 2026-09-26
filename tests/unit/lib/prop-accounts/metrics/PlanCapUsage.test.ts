import { describe, expect, it } from 'vitest';

import { AccountStage, AccountStatus } from '~/lib/prop-accounts/core';
import { planCapUsage } from '~/lib/prop-accounts/metrics';

import { account, EVAL_PLAN, INSTANT_PLAN, ledger } from './ledgerFixtures';

const ARCHIVED_AT = new Date('2026-09-25T00:00:00Z');

describe('planCapUsage', () => {
    const cap = EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan);

    it('counts active and suspended funded accounts against the firm cap and never reports negative free slots', () => {
        const usage = planCapUsage(
            ledger({
                accounts: [
                    account(EVAL_PLAN, { stage: AccountStage.Funded }),
                    account(EVAL_PLAN, {
                        stage: AccountStage.Funded,
                        status: AccountStatus.Suspended,
                    }),
                    account(EVAL_PLAN, { stage: AccountStage.Live }),
                    account(EVAL_PLAN),
                    account(EVAL_PLAN, {
                        stage: AccountStage.Funded,
                        status: AccountStatus.Busted,
                    }),
                    account(EVAL_PLAN, {
                        archivedAt: ARCHIVED_AT,
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        expect(usage.pooledCapsModeled).toBe(false);
        expect(usage.plans).toEqual([
            {
                cap,
                firmId: EVAL_PLAN.firm.id,
                freeSlots: Math.max(0, cap - 2),
                overCap: 2 > cap,
                planLabel: EVAL_PLAN.plan.label,
                planSerial: EVAL_PLAN.serial,
                suspended: 1,
                used: 2,
            },
        ]);
    });

    it('clamps free slots at zero and flags a plan over its cap', () => {
        const accounts = Array.from({ length: cap + 1 }, () =>
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
        );
        const [row] = planCapUsage(ledger({ accounts })).plans;
        expect(row?.used).toBe(cap + 1);
        expect(row?.freeSlots).toBe(0);
        expect(row?.overCap).toBe(true);
    });

    it('lists every held plan, including ones with no funded account, and keeps unresolved accounts apart', () => {
        const usage = planCapUsage(
            ledger({
                accounts: [
                    account(EVAL_PLAN),
                    account(INSTANT_PLAN, { planSerial: 'retired-plan' }),
                ],
            }),
        );
        expect(
            usage.plans.map((p) => [p.planSerial, p.used, p.freeSlots]),
        ).toEqual([[EVAL_PLAN.serial, 0, cap]]);
        expect(usage.unresolvedAccounts).toBe(1);
    });
});
