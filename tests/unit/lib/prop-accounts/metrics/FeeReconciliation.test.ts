import { describe, expect, it } from 'vitest';

import { FeeKind, feePrefillCents } from '~/lib/prop-accounts/core';
import { FeePriceCheck, feeReconciliation } from '~/lib/prop-accounts/metrics';

import { account, EVAL_PLAN, fee, ledger, purchased } from './ledgerFixtures';

describe('feeReconciliation', () => {
    const listCents = feePrefillCents(EVAL_PLAN.plan, FeeKind.EvalPurchase);
    if (listCents === null) throw new Error('fixture needs a list price');

    it('flags a fee paid below list as discounted, at list as at list and above list as above list', () => {
        const discounted = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const atList = account(EVAL_PLAN, { purchasedOn: '2026-06-02' });
        const aboveList = account(EVAL_PLAN, { purchasedOn: '2026-06-03' });
        const result = feeReconciliation(
            ledger({
                accounts: [discounted, atList, aboveList],
                events: [
                    purchased(discounted),
                    purchased(atList),
                    purchased(aboveList),
                ],
                fees: [
                    fee(
                        discounted,
                        FeeKind.EvalPurchase,
                        listCents - 1000,
                        '2026-06-01',
                    ),
                    fee(atList, FeeKind.EvalPurchase, listCents, '2026-06-02'),
                    fee(
                        aboveList,
                        FeeKind.EvalPurchase,
                        listCents + 1000,
                        '2026-06-03',
                    ),
                ],
            }),
        );
        expect(
            result.rows.map((row) => [
                row.kind,
                row.check,
                row.differenceCents,
            ]),
        ).toEqual([
            [FeeKind.EvalPurchase, FeePriceCheck.Discounted, -1000],
            [FeeKind.EvalPurchase, FeePriceCheck.AtList, 0],
            [FeeKind.EvalPurchase, FeePriceCheck.AboveList, 1000],
        ]);
    });

    it('flags no list price when the plan has none for that kind', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const result = feeReconciliation(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                fees: [fee(owner, FeeKind.Other, 500, '2026-06-01')],
            }),
        );
        expect(result.rows[0]?.check).toBe(FeePriceCheck.NoListPrice);
        expect(result.rows[0]?.differenceCents).toBeNull();
    });

    it('captures the total discount per firm', () => {
        const discounted = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const result = feeReconciliation(
            ledger({
                accounts: [discounted],
                events: [purchased(discounted)],
                fees: [
                    fee(
                        discounted,
                        FeeKind.EvalPurchase,
                        listCents - 1500,
                        '2026-06-01',
                    ),
                ],
            }),
        );
        expect(result.byFirm).toHaveLength(1);
        expect(result.byFirm[0]).toMatchObject({
            discountCents: 1500,
            feesChecked: 1,
        });
    });
});
