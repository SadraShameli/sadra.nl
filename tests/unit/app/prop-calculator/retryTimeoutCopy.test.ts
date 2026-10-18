import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    inputHints,
    kpiDescriptions,
    panelDescriptions,
} from '~/app/(app)/prop-calculator/_components/kpiDescriptions';

const COMPONENTS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '_components',
);

function componentSource(fileName: string): string {
    return readFileSync(path.join(COMPONENTS_ROOT, fileName), 'utf8');
}

describe('Cash Flow Over Time popover describes the timeline retry model (N-12)', () => {
    const text = panelDescriptions.cashFlow;

    it('no longer claims a failed eval is retried at full price with no discounted resets', () => {
        expect(text).not.toContain('full price');
        expect(text).not.toContain('no discounted resets');
    });

    it('says a failed attempt is retried at the cheaper of a reset and a re-buy, with the reset coupon applied', () => {
        expect(text).toContain(
            'retry each failed attempt, bust or timeout, at the cheaper of a reset (after your reset discount) and a fresh re-buy',
        );
    });

    it('says the bundle discount applies only to the first card in each account slot', () => {
        expect(text).toContain(
            "the bundle discount applies only to each account slot's first card, on its first eval purchase and its activation",
        );
    });

    it('is what the panel renders, with no stale copy left inline', () => {
        const source = componentSource('CashFlowPanel.tsx');
        expect(source).toContain('{panelDescriptions.cashFlow}');
        expect(source).not.toContain('retry at full price');
    });
});

describe('Max eval days hint and the fees KPI follow T29: a timed-out attempt is retried like a bust (N-61)', () => {
    it('the hint says an attempt at the limit fails and is retried, and only a last-attempt timeout makes a timed-out trial', () => {
        expect(inputHints.maxEvalDays).not.toContain('count as timeouts');
        expect(inputHints.maxEvalDays).toBe(
            'An attempt that hits this limit is a failed attempt: it is retried while attempts remain, and a trial counts as a timeout only if its last attempt times out',
        );
    });

    it('the hint is what the Max eval days field renders, with no stale copy left inline', () => {
        const source = componentSource('TradingInputs.tsx');
        expect(source).toContain('{inputHints.maxEvalDays}');
        expect(source).not.toContain('count as timeouts');
    });

    it('the fees KPI averages over timed-out trials too and bills a retry for a timed-out attempt', () => {
        expect(kpiDescriptions.totalCost).toContain(
            'averaged across every trial, whether it passed, busted or timed out',
        );
        expect(kpiDescriptions.totalCost).toContain(
            'each failed attempt, bust or timeout',
        );
    });

    it('the monthly net KPI averages over timed-out trials too, matching the fees KPI', () => {
        expect(kpiDescriptions.monthlyNet).not.toContain(
            'averaged across passes and busts',
        );
        expect(kpiDescriptions.monthlyNet).toContain(
            'averaged across every trial, whether it passed, busted or timed out',
        );
    });
});
