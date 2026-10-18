import { describe, expect, it } from 'vitest';

import {
    FirmPayoutCountResultKind,
    firmPayoutCountResultOf,
    firmPayoutCounts,
} from '~/lib/prop-accounts/advice';
import { AccountStage, PayoutStatus } from '~/lib/prop-accounts/core';

import { account, EVAL_PLAN, ledger, payout } from '../metrics/ledgerFixtures';

const ASOF = '2026-09-30';

describe('the ledger firm counts follow the one membership and validity rule (PT-36n, F-145)', () => {
    it('counts every account of the firm, archived ones included, like the shared rule', () => {
        const live = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const archived = account(EVAL_PLAN, {
            archivedAt: new Date('2026-09-01T00:00:00Z'),
            stage: AccountStage.Funded,
        });
        const built = ledger({
            accounts: [live, archived],
            payouts: [
                payout(live, 50_000, { paidOn: '2026-09-05' }),
                payout(archived, 50_000, { paidOn: '2026-09-06' }),
                payout(archived, 50_000, {
                    paidOn: null,
                    requestedOn: '2026-09-20',
                    status: PayoutStatus.Requested,
                }),
            ],
        });
        const counts = firmPayoutCounts(built, ASOF);
        const shared = firmPayoutCountResultOf(
            EVAL_PLAN.firm.id,
            built.accounts.map((entry) => ({
                account: entry.row,
                events: entry.events,
                payouts: entry.payouts,
            })),
            ASOF,
        );
        expect(shared.kind).toBe(FirmPayoutCountResultKind.Known);
        expect(counts).toEqual(
            shared.kind === FirmPayoutCountResultKind.Known
                ? [shared.count]
                : [],
        );
        expect(counts).toEqual([
            expect.objectContaining({
                paidPayoutsSinceLastLiveAccount: 2,
                requestedPayoutsSinceLastLiveAccount: 1,
            }),
        ]);
    });

    it('computes no count for a firm whose payout has a malformed date, never a quiet undercount', () => {
        const live = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const sibling = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const counts = firmPayoutCounts(
            ledger({
                accounts: [live, sibling],
                payouts: [
                    payout(live, 50_000, { paidOn: '2026-09-05' }),
                    payout(sibling, 50_000, {
                        paidOn: 'sometime in September',
                    }),
                ],
            }),
            ASOF,
        );
        expect(counts).toEqual([]);
    });
});
