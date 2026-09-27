import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    FeeKind,
    FirmEngagementReason,
    FirmEngagementStatus,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import { firmRosterOf } from '~/lib/prop-accounts/firms';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    firmEngagement,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    purchased,
} from '../metrics/ledgerFixtures';

describe('firmRosterOf', () => {
    it('gives first purchase, last activity, account counts and moved-live count and date per firm', () => {
        const failed = account(EVAL_PLAN, {
            purchasedOn: '2026-08-01',
            status: AccountStatus.Busted,
        });
        const live = account(EVAL_PLAN, {
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const result = firmRosterOf(
            ledger({
                accounts: [failed, live],
                events: [
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-08-10'),
                    purchased(live),
                    event(live, AccountEventKind.EvalPassed, '2026-09-10'),
                    event(live, AccountEventKind.MovedLive, '2026-09-20'),
                ],
                fees: [
                    fee(failed, FeeKind.EvalPurchase, 10_000, '2026-08-01'),
                    fee(live, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                ],
            }),
        );
        const firm = result.firms.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm).toMatchObject({
            activeAccounts: 1,
            firstPurchaseOn: '2026-08-01',
            lastActivityOn: '2026-09-20',
            lastMovedLiveOn: '2026-09-20',
            lifetimeAccounts: 2,
            movedLiveCount: 1,
            reason: null,
            status: FirmEngagementStatus.Active,
        });
    });

    it('reads the user status and reason from the firm engagement, defaulting to Active with no reason', () => {
        const withStatus = account(EVAL_PLAN);
        const untouched = account(OTHER_FIRM_EVAL_PLAN);
        const engaged = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Paused,
            {
                externalFirmId: null,
                firmId: EVAL_PLAN.firm.id,
                reason: FirmEngagementReason.Capacity,
            },
        );
        const result = firmRosterOf(
            ledger({
                accounts: [withStatus, untouched],
                events: [purchased(withStatus), purchased(untouched)],
                firmEngagements: [engaged],
            }),
        );
        const paused = result.firms.find(
            (row) =>
                row.firmKey.kind === FirmKeyKind.Modeled &&
                row.firmKey.firmId === EVAL_PLAN.firm.id,
        );
        const untouchedFirm = result.firms.find(
            (row) =>
                row.firmKey.kind === FirmKeyKind.Modeled &&
                row.firmKey.firmId === OTHER_FIRM_EVAL_PLAN.firm.id,
        );
        expect(paused).toMatchObject({
            reason: FirmEngagementReason.Capacity,
            status: FirmEngagementStatus.Paused,
        });
        expect(untouchedFirm).toMatchObject({
            reason: null,
            status: FirmEngagementStatus.Active,
        });
    });

    it('totals firms used, active and sent live', () => {
        const sentLiveAccount = account(EVAL_PLAN, { stage: AccountStage.Live });
        const pausedAccount = account(OTHER_FIRM_EVAL_PLAN);
        const sentLive = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Retired,
            {
                externalFirmId: null,
                firmId: EVAL_PLAN.firm.id,
                reason: FirmEngagementReason.SentLive,
                sentLiveOn: '2026-09-20',
            },
        );
        const paused = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Paused,
            {
                externalFirmId: null,
                firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
                reason: FirmEngagementReason.Capacity,
            },
        );
        const result = firmRosterOf(
            ledger({
                accounts: [sentLiveAccount, pausedAccount],
                events: [purchased(sentLiveAccount), purchased(pausedAccount)],
                firmEngagements: [sentLive, paused],
            }),
        );
        expect(result.totalFirmsUsed).toBe(2);
        expect(result.totalActive).toBe(0);
        expect(result.totalSentLive).toBe(1);
    });

    it('is empty for an empty ledger', () => {
        expect(firmRosterOf(ledger({})).firms).toEqual([]);
    });
});
