import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountStage,
    AccountStatus,
    compareText,
    type StoredFirmId,
} from '~/lib/prop-accounts/core';
import { type FirmFunding, fundingTotals } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    INSTANT_PLAN,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
} from './ledgerFixtures';

const ARCHIVED_AT = new Date('2026-09-25T00:00:00Z');

describe('fundingTotals', () => {
    it('sums nominal size in cents by stage and firm over active, non-archived accounts, evals separate', () => {
        const size = EVAL_PLAN.plan.id.accountSize * 100;
        const otherSize = OTHER_FIRM_EVAL_PLAN.plan.id.accountSize * 100;
        const totals = fundingTotals(
            ledger({
                accounts: [
                    account(EVAL_PLAN),
                    account(EVAL_PLAN, { stage: AccountStage.Funded }),
                    account(EVAL_PLAN, { stage: AccountStage.Funded }),
                    account(EVAL_PLAN, { stage: AccountStage.Live }),
                    account(OTHER_FIRM_EVAL_PLAN, {
                        stage: AccountStage.Funded,
                    }),
                    account(EVAL_PLAN, {
                        stage: AccountStage.Funded,
                        status: AccountStatus.Busted,
                    }),
                    account(EVAL_PLAN, {
                        stage: AccountStage.Funded,
                        status: AccountStatus.Suspended,
                    }),
                    account(EVAL_PLAN, {
                        stage: AccountStage.Funded,
                        status: AccountStatus.Concluded,
                    }),
                    account(EVAL_PLAN, {
                        archivedAt: ARCHIVED_AT,
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        expect(totals.byStage).toEqual({
            [AccountStage.Eval]: { accounts: 1, nominal: size },
            [AccountStage.Funded]: {
                accounts: 3,
                nominal: 2 * size + otherSize,
            },
            [AccountStage.Live]: { accounts: 1, nominal: size },
        });
        expect(totals.fundedNominal).toBe(3 * size + otherSize);
        expect(totals.evalNominal).toBe(size);
        const firm = totals.byFirm.find((f) => f.firmId === EVAL_PLAN.firm.id);
        expect(firm?.byStage).toEqual({
            [AccountStage.Eval]: { accounts: 1, nominal: size },
            [AccountStage.Funded]: { accounts: 2, nominal: 2 * size },
            [AccountStage.Live]: { accounts: 1, nominal: size },
        });
        const other = totals.byFirm.find(
            (f) => f.firmId === OTHER_FIRM_EVAL_PLAN.firm.id,
        );
        expect(other?.byStage[AccountStage.Funded]).toEqual({
            accounts: 1,
            nominal: otherSize,
        });
        expect(other?.byStage[AccountStage.Eval]).toEqual({
            accounts: 0,
            nominal: 0,
        });
        expect(totals.byFirm.map((f) => f.firmId)).toEqual(
            [EVAL_PLAN.firm.id, OTHER_FIRM_EVAL_PLAN.firm.id].toSorted(
                compareText,
            ),
        );
    });

    it('counts an account whose plan does not resolve, since funding needs only firm, size and stage', () => {
        const totals = fundingTotals(
            ledger({
                accounts: [
                    account(INSTANT_PLAN, { planSerial: 'retired-plan' }),
                ],
            }),
        );
        expect(totals.byStage[AccountStage.Funded].accounts).toBe(1);
    });

    it('counts an account of a removed firm under its stored firm id, typed as a stored id', () => {
        const removed: StoredFirmId = 'gone-firm';
        const totals = fundingTotals(
            ledger({
                accounts: [
                    account(EVAL_PLAN, {
                        firmId: removed,
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        expect(totals.byFirm.map((firm) => firm.firmId)).toEqual([removed]);
        expect(totals.fundedNominal).toBe(EVAL_PLAN.plan.id.accountSize * 100);
        expectTypeOf<FirmFunding['firmId']>().toEqualTypeOf<StoredFirmId>();
    });

    it('is all zeros for an empty ledger', () => {
        const totals = fundingTotals(ledger({}));
        expect(totals.fundedNominal).toBe(0);
        expect(totals.evalNominal).toBe(0);
        expect(totals.byFirm).toEqual([]);
        expect(totals.byStage[AccountStage.Live]).toEqual({
            accounts: 0,
            nominal: 0,
        });
    });
});
