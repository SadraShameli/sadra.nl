import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROP_CALCULATOR_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
);
const RUN_BOOKKEEPING = /startedKeyReference|runKeyReference/;
const SOURCE_FILE = /\.tsx?$/;
const ALLOWED_BOOKKEEPING_FILES = new Set([
    path.join('_components', 'useCachedWorkerTask.ts'),
]);
const ACCOUNT_ADVICE_HOOK = path.join(
    'accounts',
    '_components',
    'advice',
    'useAccountAdvice.ts',
);
const DETAIL_ROOT = path.join('accounts', '_components', 'detail');
const RENDER_TIME_TODAY = /todayIsoDate\(new Date\(\)\)/;
const TODAY_HOOK_USERS = [
    path.join('accounts', '_components', 'advice', 'AdvicePanel.tsx'),
    path.join(DETAIL_ROOT, 'AccountDetailView.tsx'),
    path.join(DETAIL_ROOT, 'EventsSection.tsx'),
    path.join(DETAIL_ROOT, 'FeesSection.tsx'),
    path.join(DETAIL_ROOT, 'LedgerOnlySnapshotForm.tsx'),
    path.join(DETAIL_ROOT, 'PayoutsSection.tsx'),
    path.join(DETAIL_ROOT, 'ViolationsSection.tsx'),
];
const PLANNER_VIEW = path.join(
    '(tools)',
    'payout-planner',
    'PayoutPlannerView.tsx',
);

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

function sourceOf(relative: string): string {
    return readFileSync(path.join(PROP_CALCULATOR_ROOT, relative), 'utf8');
}

describe('one cached worker task pattern for the tool pages', () => {
    it('keeps the started-key and run-key bookkeeping only in the shared hook', () => {
        const offenders = sourceFiles(PROP_CALCULATOR_ROOT)
            .map((file) => path.relative(PROP_CALCULATOR_ROOT, file))
            .filter(
                (relative) =>
                    !ALLOWED_BOOKKEEPING_FILES.has(relative) &&
                    RUN_BOOKKEEPING.test(sourceOf(relative)),
            );
        expect(offenders).toEqual([]);
    });

    it('has the shared hook file the bookkeeping lives in', () => {
        expect(sourceOf(path.join('_components', 'useCachedWorkerTask.ts'))).toMatch(
            RUN_BOOKKEEPING,
        );
    });

    it('lets the payout planner and the funded sweep use the shared hook', () => {
        expect(sourceOf(PLANNER_VIEW)).toContain('useCachedWorkerTask');
        expect(
            sourceOf(
                path.join('_components', 'fundedOptimizer', 'useFundedSweep.ts'),
            ),
        ).toContain('useCachedWorkerTask');
    });

    it('leaves no private cached task, cushion helper or key wrapper in the payout planner view', () => {
        const view = sourceOf(PLANNER_VIEW);
        expect(view).not.toContain('useCachedPayoutTask');
        expect(view).not.toContain('retainedCushionOf');
        expect(view).not.toContain('payoutPlannerSweepKey');
        expect(view).not.toContain('payoutPlannerOutlookKey');
    });

    it('runs the account advice hook on the shared hook with the Advice slot and the advisor worker key', () => {
        const hook = sourceOf(ACCOUNT_ADVICE_HOOK);
        expect(hook).toContain('useCachedWorkerTask');
        expect(hook).toContain('ComputationId.Advice');
        expect(hook).toContain('advisorWorkerCacheKey');
        expect(hook).not.toContain('useWorkerTask');
        expect(hook).not.toContain('ComputationCache');
    });

    it('keeps no per-input advice cache scope', () => {
        expect(
            sourceFiles(PROP_CALCULATOR_ROOT).filter((file) =>
                readFileSync(file, 'utf8').includes('AdviceCacheScope'),
            ),
        ).toEqual([]);
    });
});

describe('one midnight-aware today on the account pages', () => {
    it.each(TODAY_HOOK_USERS)('%s reads today through useTodayIsoDate, never from a per-render clock read', (relative) => {
        const source = sourceOf(relative);
        expect(source).toContain('useTodayIsoDate()');
        expect(source).not.toMatch(RENDER_TIME_TODAY);
    });

    it('keeps one midnight timer implementation', () => {
        const offenders = sourceFiles(PROP_CALCULATOR_ROOT)
            .map((file) => path.relative(PROP_CALCULATOR_ROOT, file))
            .filter(
                (relative) =>
                    relative !== path.join('_components', 'useTodayIsoDate.ts') &&
                    /MS_PER_DAY\s*-/.test(sourceOf(relative)),
            );
        expect(offenders).toEqual([]);
    });
});
