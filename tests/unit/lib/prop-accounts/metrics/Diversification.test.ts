import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountStage,
    AccountStatus,
    type FirmKey,
    FirmKeyKind,
    type StoredFirmId,
} from '~/lib/prop-accounts/core';
import { diversification, type FirmShare } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
} from './ledgerFixtures';

function modeledFirm(firmId: StoredFirmId): FirmKey {
    return { firmId, kind: FirmKeyKind.Modeled };
}

describe('diversification', () => {
    it('shares active funded and live funding and paid payouts per firm, each summing to 1, largest first', () => {
        const size = EVAL_PLAN.plan.id.accountSize * 100;
        const otherSize = OTHER_FIRM_EVAL_PLAN.plan.id.accountSize * 100;
        const a1 = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const a2 = account(EVAL_PLAN, { stage: AccountStage.Live });
        const b1 = account(OTHER_FIRM_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const result = diversification(
            ledger({
                accounts: [
                    a1,
                    a2,
                    b1,
                    account(OTHER_FIRM_EVAL_PLAN),
                    account(OTHER_FIRM_EVAL_PLAN, {
                        stage: AccountStage.Funded,
                        status: AccountStatus.Busted,
                    }),
                ],
                payouts: [
                    payout(a1, 10_000, { netCents: 9000 }),
                    payout(b1, 30_000, { netCents: 27_000 }),
                ],
            }),
        );
        const fundingTotal = 2 * size + otherSize;
        expect(result.funding.map((s) => [s.firmKey, s.cents])).toEqual([
            [modeledFirm(EVAL_PLAN.firm.id), 2 * size],
            [modeledFirm(OTHER_FIRM_EVAL_PLAN.firm.id), otherSize],
        ]);
        expect(result.funding[0]?.share).toBeCloseTo(
            (2 * size) / fundingTotal,
            12,
        );
        expect(result.funding.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(
            1,
            12,
        );
        expect(
            result.payouts.map((s) => [s.firmKey, s.cents, s.share]),
        ).toEqual([
            [modeledFirm(OTHER_FIRM_EVAL_PLAN.firm.id), 27_000, 0.75],
            [modeledFirm(EVAL_PLAN.firm.id), 9000, 0.25],
        ]);
    });

    it('keeps the funding and payouts of a removed firm under its stored firm id, typed as a stored id', () => {
        const removed: StoredFirmId = 'gone-firm';
        const lost = account(EVAL_PLAN, {
            firmId: removed,
            stage: AccountStage.Funded,
        });
        const result = diversification(
            ledger({
                accounts: [lost],
                payouts: [payout(lost, 10_000, { netCents: 9000 })],
            }),
        );
        expect(result.funding.map((s) => [s.firmKey, s.share])).toEqual([
            [modeledFirm(removed), 1],
        ]);
        expect(result.payouts.map((s) => [s.firmKey, s.share])).toEqual([
            [modeledFirm(removed), 1],
        ]);
        expectTypeOf<FirmShare['firmKey']>().toEqualTypeOf<FirmKey>();
    });

    it('is empty when there is no funding or no payout', () => {
        const result = diversification(
            ledger({ accounts: [account(EVAL_PLAN)] }),
        );
        expect(result).toEqual({ funding: [], payouts: [] });
    });
});
