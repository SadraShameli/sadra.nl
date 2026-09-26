import { describe, expect, it } from 'vitest';

import * as root from '~/lib/prop-accounts';
import {
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    impliedEvalPassOn,
} from '~/lib/prop-accounts/core';

const PURCHASED_ON = '2026-09-01';
const EVAL_PLAN = { isInstantFunded: false };
const INSTANT_PLAN = { isInstantFunded: true };
const NOTHING_RECORDED: AccountStageStarts = {
    evalPassedOn: null,
    movedLiveOn: null,
};

function account(stage: AccountStage, fundedOn: null | string = null) {
    return { fundedOn, purchasedOn: PURCHASED_ON, stage };
}

describe('accountStageOn', () => {
    it('keeps an evaluation account in the evaluation on every date', () => {
        for (const asOf of ['2026-08-01', PURCHASED_ON, '2026-12-31']) {
            expect(
                accountStageOn(
                    account(AccountStage.Eval, '2026-09-10'),
                    EVAL_PLAN,
                    { evalPassedOn: '2026-09-10', movedLiveOn: null },
                    asOf,
                ),
            ).toBe(AccountStage.Eval);
        }
    });

    it('leaves the evaluation on the funded date when no pass is recorded, the date impliedEvalPassOn gives the ledger', () => {
        const funded = account(AccountStage.Funded, '2026-09-10');
        expect(impliedEvalPassOn(funded, EVAL_PLAN, false)?.on).toBe(
            '2026-09-10',
        );
        expect(
            accountStageOn(funded, EVAL_PLAN, NOTHING_RECORDED, '2026-09-09'),
        ).toBe(AccountStage.Eval);
        expect(
            accountStageOn(funded, EVAL_PLAN, NOTHING_RECORDED, '2026-09-10'),
        ).toBe(AccountStage.Funded);
    });

    it('lets a recorded pass decide the eval-leaving date over the funded date, as the ledger does', () => {
        const funded = account(AccountStage.Funded, '2026-09-10');
        const recorded = { evalPassedOn: '2026-09-08', movedLiveOn: null };
        expect(impliedEvalPassOn(funded, EVAL_PLAN, true)).toBeNull();
        expect(accountStageOn(funded, EVAL_PLAN, recorded, '2026-09-07')).toBe(
            AccountStage.Eval,
        );
        expect(accountStageOn(funded, EVAL_PLAN, recorded, '2026-09-09')).toBe(
            AccountStage.Funded,
        );
    });

    it('counts a funded account without a funded date or a recorded pass as funded from its purchase', () => {
        const funded = account(AccountStage.Funded);
        expect(impliedEvalPassOn(funded, EVAL_PLAN, false)).toEqual({
            dateKnown: false,
            on: PURCHASED_ON,
        });
        expect(
            accountStageOn(funded, EVAL_PLAN, NOTHING_RECORDED, PURCHASED_ON),
        ).toBe(AccountStage.Funded);
        expect(
            accountStageOn(funded, EVAL_PLAN, NOTHING_RECORDED, '2026-12-31'),
        ).toBe(AccountStage.Funded);
    });

    it('never puts an instant-funded account in an evaluation', () => {
        for (const stage of [AccountStage.Funded, AccountStage.Live]) {
            expect(
                accountStageOn(
                    account(stage, '2026-09-10'),
                    INSTANT_PLAN,
                    { evalPassedOn: '2026-09-10', movedLiveOn: null },
                    '2026-09-02',
                ),
            ).not.toBe(AccountStage.Eval);
        }
    });

    it('enters live on the recorded move live and is funded between the pass and the move', () => {
        const live = account(AccountStage.Live, '2026-09-10');
        const recorded = { evalPassedOn: null, movedLiveOn: '2026-09-15' };
        expect(accountStageOn(live, EVAL_PLAN, recorded, '2026-09-05')).toBe(
            AccountStage.Eval,
        );
        expect(accountStageOn(live, EVAL_PLAN, recorded, '2026-09-12')).toBe(
            AccountStage.Funded,
        );
        expect(accountStageOn(live, EVAL_PLAN, recorded, '2026-09-15')).toBe(
            AccountStage.Live,
        );
    });

    it('treats a live account with no recorded move live as live from the day it left the evaluation', () => {
        const live = account(AccountStage.Live, '2026-09-10');
        expect(
            accountStageOn(live, EVAL_PLAN, NOTHING_RECORDED, '2026-09-05'),
        ).toBe(AccountStage.Eval);
        expect(
            accountStageOn(live, EVAL_PLAN, NOTHING_RECORDED, '2026-09-10'),
        ).toBe(AccountStage.Live);
        expect(
            accountStageOn(
                account(AccountStage.Live),
                EVAL_PLAN,
                NOTHING_RECORDED,
                PURCHASED_ON,
            ),
        ).toBe(AccountStage.Live);
        expect(
            accountStageOn(
                account(AccountStage.Live),
                INSTANT_PLAN,
                NOTHING_RECORDED,
                PURCHASED_ON,
            ),
        ).toBe(AccountStage.Live);
    });

    it('is exported through the root barrel', () => {
        expect(root.accountStageOn).toBe(accountStageOn);
    });
});
