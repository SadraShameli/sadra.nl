import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as root from '~/lib/prop-accounts';
import * as core from '~/lib/prop-accounts/core';
import {
    AccountStage,
    accountStageBreakdown,
    accountStageLabel,
} from '~/lib/prop-accounts/core';
import * as stageModule from '~/lib/prop-accounts/core/AccountStage';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const USER_TEXT_ROOTS = [
    'src/lib/prop-accounts',
    'src/server/api/routers/propAccounts',
];

const RAW_STAGE_INTERPOLATION = /\$\{\s*[\w.?!]*stage\s*\}/gi;

function rawStageInterpolations(text: string): readonly string[] {
    return text
        .matchAll(RAW_STAGE_INTERPOLATION)
        .map((match) => match[0])
        .toArray();
}

function sourceFilesUnder(root: string): readonly string[] {
    return readdirSync(path.join(REPO_ROOT, root), {
        encoding: 'utf8',
        recursive: true,
    })
        .filter((file) => /\.tsx?$/.test(file))
        .map((file) => path.join(root, file));
}

describe('accountStageLabel', () => {
    it('labels every stage', () => {
        expect(
            Object.values(AccountStage).map((stage) =>
                accountStageLabel(stage),
            ),
        ).toEqual(['Evaluation', 'Funded', 'Live']);
    });

    it('is exported through the library root barrel', () => {
        expect(root.accountStageLabel).toBe(accountStageLabel);
    });

    it('keeps the stage label map private to its module', () => {
        expect(Object.keys(stageModule)).not.toContain('STAGE_LABEL');
        expect(Object.keys(core)).not.toContain('STAGE_LABEL');
        expect(Object.keys(root)).not.toContain('STAGE_LABEL');
    });
});

describe('user-facing stage names', () => {
    it('finds a raw stage interpolation and ignores a labelled one', () => {
        expect(
            rawStageInterpolations(
                [
                    '`this ${stage} account`',
                    '`in the ${account.stage} stage`',
                    '`moved to ${to?.stage}`',
                    '`from ${fromStage}`',
                    '`this ${accountStageLabel(stage)} account`',
                    '`${stageNamesOf(stages)}`',
                ].join('\n'),
            ),
        ).toEqual([
            '${stage}',
            '${account.stage}',
            '${to?.stage}',
            '${fromStage}',
        ]);
    });

    it('never interpolates a raw stage value into text in the library or the accounts routers', () => {
        const files = USER_TEXT_ROOTS.flatMap(sourceFilesUnder);
        expect(files.length).toBeGreaterThan(0);
        const raw = files.flatMap((file) =>
            rawStageInterpolations(
                readFileSync(path.join(REPO_ROOT, file), 'utf8'),
            ).map((match) => `${file}: ${match}`),
        );
        expect(raw).toEqual([]);
    });
});

describe('accountStageBreakdown', () => {
    it('counts each stage by its label, in the order given', () => {
        expect(
            accountStageBreakdown([
                { count: 1, stage: AccountStage.Eval },
                { count: 2, stage: AccountStage.Funded },
                { count: 3, stage: AccountStage.Live },
            ]),
        ).toBe('1 Evaluation, 2 Funded, 3 Live');
    });

    it('prints a single stage without a separator and nothing for no stages', () => {
        expect(
            accountStageBreakdown([{ count: 4, stage: AccountStage.Funded }]),
        ).toBe('4 Funded');
        expect(accountStageBreakdown([])).toBe('');
    });

    it('is exported through the library root barrel', () => {
        expect(root.accountStageBreakdown).toBe(accountStageBreakdown);
    });
});
