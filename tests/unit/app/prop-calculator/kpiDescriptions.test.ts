import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    kpiDescriptions,
    panelDescriptions,
} from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator';

const EM_DASH = '\u{2014}';
const PROP_CALCULATOR_WEB_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
);

function sourceFilesUnder(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('kpiDescriptions and panelDescriptions (WP21b: no em dashes in writing)', () => {
    it('no KPI or panel description contains an em dash', () => {
        const withEmDash = [
            ...Object.entries(kpiDescriptions),
            ...Object.entries(panelDescriptions),
        ]
            .filter(([, text]) => text.includes(EM_DASH))
            .map(([key]) => key);
        expect(withEmDash).toEqual([]);
    });
});

describe('prop calculator web text (WP23: no em dashes in writing)', () => {
    it('no page, panel or helper under the prop calculator web tree contains an em dash', () => {
        const withEmDash = sourceFilesUnder(PROP_CALCULATOR_WEB_ROOT).flatMap(
            (file) =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .map((line, index) => ({ index, line }))
                    .filter(({ line }) => line.includes(EM_DASH))
                    .map(
                        ({ index }) =>
                            `${file.slice(PROP_CALCULATOR_WEB_ROOT.length + 1)}:${index + 1}`,
                    ),
        );
        expect(withEmDash).toEqual([]);
    });
});

describe('monthlyNet tooltip names the capped one-request horizon credit (T32, N-71, N-72, WP43)', () => {
    it('describes the credit as one more payout request, capped like a real request', () => {
        expect(kpiDescriptions.monthlyNet).toContain(
            'one more payout request for each account still open at the funded horizon end',
        );
        expect(kpiDescriptions.monthlyNet).toContain(
            'net of the split and the payout method fee, and capped like a real request by the payout ladder step, request size, profit share and request caps, and by the cycle profit pool only on plans with no payout ladder and no profit share',
        );
    });

    it('says the credit is $0 only when its amount caps leave nothing to request', () => {
        expect(kpiDescriptions.monthlyNet).toContain(
            '$0 when those caps leave nothing to request (for example an emptied cycle profit pool, or, on a plan whose ladder denies an unaffordable step, a step above what the account could withdraw: its withdrawable balance, or its profit share if lower), once a lifetime payout cap is reached or once the payout ladder is exhausted',
        );
        expect(kpiDescriptions.monthlyNet).not.toContain(
            'a ladder step the account cannot afford on a plan that denies it',
        );
        expect(kpiDescriptions.monthlyNet).not.toContain(
            'no request would be allowed',
        );
    });

    it('says the payout timing and minimum gates are not applied to the credit', () => {
        expect(kpiDescriptions.monthlyNet).toContain(
            'the payout day, qualifying-day, consistency, minimum profit and minimum request gates are not applied to the credit, since continued trading would clear them',
        );
    });

    it('no longer credits the whole withdrawable balance', () => {
        expect(kpiDescriptions.monthlyNet).not.toContain(
            'withdrawable balance credited',
        );
    });

    it('keeps the monthly net formula line', () => {
        expect(kpiDescriptions.monthlyNet).toContain(
            `= (avg net + avg horizon credit) × ${TRADING_DAYS_PER_MONTH} ÷ avg trial duration.`,
        );
    });
});

describe('monthlyNet tooltip credit details match the engine (N-71, N-72, WP43b)', () => {
    afterEach(() => {
        vi.doUnmock('~/lib/prop-calculator');
        vi.resetModules();
    });

    it('says the credit is net of the payout method fee as well as the split, as Plan.payoutFromProfit subtracts it', () => {
        expect(kpiDescriptions.monthlyNet).toContain(
            'net of the split and the payout method fee',
        );
    });

    it('takes the trading days per month from TRADING_DAYS_PER_MONTH instead of a duplicated literal', async () => {
        const mockedTradingDaysPerMonth = TRADING_DAYS_PER_MONTH + 1;
        vi.resetModules();
        vi.doMock('~/lib/prop-calculator', async (importOriginal) => ({
            ...(await importOriginal<object>()),
            TRADING_DAYS_PER_MONTH: mockedTradingDaysPerMonth,
        }));
        const reloaded =
            await import('~/app/(app)/prop-calculator/_components/kpiDescriptions');
        expect(reloaded.kpiDescriptions.monthlyNet).toContain(
            `× ${mockedTradingDaysPerMonth} ÷ avg trial duration.`,
        );
    });
});
