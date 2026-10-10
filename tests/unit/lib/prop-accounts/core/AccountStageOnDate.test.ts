import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as root from '~/lib/prop-accounts';
import {
    AccountEventKind,
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    impliedEvalPassOn,
    latestEventOn,
} from '~/lib/prop-accounts/core';

const PROP_ACCOUNTS_DIRECTORY = path.join(
    process.cwd(),
    'src/lib/prop-accounts',
);

const CONSUMER_FILES = [
    'alerts/AlertContext.ts',
    'advice/SnapshotAdapter.ts',
    'advice/FirmPayoutCount.ts',
    'metrics/PayoutSizeStats.ts',
] as const;

function allTypeScriptFiles(directory: string): string[] {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) return allTypeScriptFiles(entryPath);
            return entry.isFile() && entry.name.endsWith('.ts')
                ? entryPath
                : [];
        });
}

function readSource(relativePath: string): string {
    return fs.readFileSync(
        path.join(PROP_ACCOUNTS_DIRECTORY, relativePath),
        'utf8',
    );
}

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

describe('latestEventOn', () => {
    const events = [
        { kind: AccountEventKind.MovedLive, occurredOn: '2026-09-10' },
        { kind: AccountEventKind.EvalPassed, occurredOn: '2026-09-05' },
        { kind: AccountEventKind.MovedLive, occurredOn: '2026-09-20' },
    ];

    it('finds the latest occurrence of a kind', () => {
        expect(latestEventOn(events, AccountEventKind.MovedLive)).toBe(
            '2026-09-20',
        );
        expect(latestEventOn(events, AccountEventKind.EvalPassed)).toBe(
            '2026-09-05',
        );
    });

    it('returns null when no event of the kind is present', () => {
        expect(latestEventOn(events, AccountEventKind.Busted)).toBeNull();
        expect(latestEventOn([], AccountEventKind.MovedLive)).toBeNull();
    });

    it('bounds the search to events on or before a given date', () => {
        expect(
            latestEventOn(events, AccountEventKind.MovedLive, '2026-09-15'),
        ).toBe('2026-09-10');
        expect(
            latestEventOn(events, AccountEventKind.MovedLive, '2026-09-01'),
        ).toBeNull();
    });

    it('is exported through the root barrel', () => {
        expect(root.latestEventOn).toBe(latestEventOn);
    });

    it('is defined exactly once in core/AccountStageOnDate.ts and used, not reimplemented, by its named consumers', () => {
        const definitionCount = (
            readSource('core/AccountStageOnDate.ts').match(
                /let latest: null \| string = null;/g,
            ) ?? []
        ).length;
        expect(definitionCount).toBe(1);
        for (const file of CONSUMER_FILES) {
            const source = readSource(file);
            expect(source).not.toMatch(/let latest: null \| string = null;/);
            expect(source).toContain('latestEventOn(');
        }
    });

    it('has no second copy of the "latest event of a kind" scan anywhere under src/lib/prop-accounts', () => {
        const accountStageOnDatePath = path.join(
            PROP_ACCOUNTS_DIRECTORY,
            'core/AccountStageOnDate.ts',
        );
        for (const file of allTypeScriptFiles(PROP_ACCOUNTS_DIRECTORY)) {
            if (file === accountStageOnDatePath) continue;
            expect(fs.readFileSync(file, 'utf8')).not.toMatch(
                /let latest: null \| string = null;/,
            );
        }
    });
});
