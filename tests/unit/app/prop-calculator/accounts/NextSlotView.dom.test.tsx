import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { type OverviewEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { NextSlotView } from '~/app/(app)/prop-calculator/accounts/next-slot/NextSlotView';
import {
    ALL_FIRMS,
    CumulativeAmountTrigger,
    dollars,
    FirmAccountPolicy,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const TODAY = '2026-09-30';
const USER_ID = 'user-a';

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        answer: {
            current: undefined as
                | ((request: OverviewRequest) => OverviewOutcome | undefined)
                | undefined,
        },
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
    };
});

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            bankroll: { list: harness.query('bankroll.list') },
            edge: { summary: harness.query('edge.summary') },
            event: { list: harness.query('event.list') },
            fee: { list: harness.query('fee.list') },
            firmEngagement: { list: harness.query('firmEngagement.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
        },
    },
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker',
    () => ({
        useOverviewWorker: (
            requests: readonly OverviewRequest[],
        ): OverviewEngine => {
            const outcomes = new Map<string, OverviewOutcome>();
            for (const request of requests) {
                const outcome = harness.answer.current?.(request);
                if (outcome !== undefined) {
                    outcomes.set(overviewRequestKey(request), outcome);
                }
            }
            return { failure: null, outcomes };
        },
    }),
);

class VerifiedPolicy extends FirmAccountPolicy {
    override liveTriggersFor() {
        return [
            new CumulativeAmountTrigger(dollars(100_000), {
                fetchedOn: '2026-09-20',
                quote: 'a synthetic confirmed quote',
                sourceKind: PolicySourceKind.UserPaste,
                url: 'https://example.test/policy',
                verification: PolicyVerification.Confirmed,
            }),
        ];
    }
}

function answerAll(request: OverviewRequest): OverviewOutcome {
    return {
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Succeeded,
        result:
            request.kind === OverviewRequestKind.DocumentedRun
                ? {
                      figures: documentedFigures(),
                      kind: OverviewRequestKind.DocumentedRun,
                  }
                : {
                      figures: {
                          creditSensitive: false,
                          evaluatedSizes: 5,
                          expectedMonthlyNet: { standardError: 1, value: 320 },
                          expectedMonthlyRealizedNet: {
                              standardError: 1,
                              value: 300,
                          },
                          fundedBustProbability: {
                              standardError: 1,
                              value: 0.4,
                          },
                          requestSize: 750,
                      },
                      kind: OverviewRequestKind.PayoutSizeOptimum,
                  },
    };
}

function answered(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything() {
    harness.queries.set('account.list', answered([]));
    harness.queries.set('bankroll.list', answered([]));
    harness.queries.set(
        'edge.summary',
        answered({ summary: { sampleSize: 0 } }),
    );
    harness.queries.set('event.list', answered([]));
    harness.queries.set('fee.list', answered([]));
    harness.queries.set('firmEngagement.list', answered([]));
    harness.queries.set('payout.list', answered([]));
    harness.queries.set('rulebook.get', answered(DEFAULT_RULEBOOK));
}

function documentedFigures(): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.5 },
        attemptPassProbability: { standardError: 1, value: 0.3 },
        costPerAttempt: { standardError: 1, value: 100 },
        costPerFundedAccount: 300,
        expectedMonthlyNet: { standardError: 1, value: 300 },
        expectedMonthlyRealizedNet: { standardError: 1, value: 280 },
        expectedNetPerAttempt: { standardError: 1, value: 50 },
        expectedPayoutPerFundedAccount: { standardError: 0, value: 800 },
        fundedBustProbability: { standardError: 1, value: 0.2 },
        fundedHorizonDays: 120,
        fundedPayoutCountDistribution: [0.5, 0.5],
        fundedSurvivalProbability: { standardError: 1, value: 0.55 },
        minRetainedCushion: 2000,
        payoutRequestSize: 500,
        payoutsPerFundedAccount: { standardError: 0, value: 0.5 },
        trials: 2000,
    };
}

describe('NextSlotView', () => {
    let container: HTMLDivElement;
    let root: Root;
    const originals = ALL_FIRMS.map(
        (firm) => [firm, firm.accountPolicy] as const,
    );

    function render() {
        act(() => {
            root.render(<NextSlotView userId={USER_ID} />);
        });
    }

    function verifyEveryFirm() {
        for (const firm of ALL_FIRMS) {
            (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy =
                new VerifiedPolicy();
        }
    }

    function headings(): string[] {
        return [...container.querySelectorAll('h2')].map(
            (heading) => heading.textContent,
        );
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.answer.current = answerAll;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        for (const [firm, original] of originals) {
            (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy =
                original;
        }
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('renders an h2 for each section, listing every plan as unverified with no ranked table while every real firm uses the default policy', () => {
        answerEverything();
        render();
        expect(headings()).toEqual([
            'Ranked',
            'Listed, not ranked: unverified',
            'Assumptions',
        ]);
        expect(container.textContent).toContain('No plan is ranked yet');
        const sections = [
            ...container.querySelectorAll<HTMLElement>(
                'section[aria-labelledby]',
            ),
        ];
        expect(sections).toHaveLength(3);
        for (const section of sections) {
            const id = section.getAttribute('aria-labelledby') ?? '';
            expect(container.querySelector(`#${CSS.escape(id)}`)?.tagName).toBe(
                'H2',
            );
        }
        expect(container.textContent).toContain('win rate');
    });

    it('renders the ranked table in a focusable named scroll region with column headers and the funded bust of the optimum', () => {
        answerEverything();
        verifyEveryFirm();
        render();
        const region = container.querySelector<HTMLElement>(
            '[role="region"][aria-labelledby="next-slot-ranked"]',
        );
        expect(region).not.toBeNull();
        expect(region?.tabIndex).toBe(0);
        const table = region?.querySelector('table');
        expect(table?.getAttribute('aria-labelledby')).toBe('next-slot-ranked');
        const headers = [...(table?.querySelectorAll('th') ?? [])];
        expect(headers.length).toBeGreaterThan(10);
        expect(headers.every((header) => header.scope === 'col')).toBe(true);
        expect(
            headers.some(
                (header) =>
                    header.textContent ===
                    'Funded bust at the optimum, share of all simulated attempts',
            ),
        ).toBe(true);
        expect(table?.textContent).toContain('40.0%');
        expect(container.querySelector('[role="status"]')).toBeNull();
    });

    it('labels every other table with its section heading', () => {
        answerEverything();
        render();
        const region = container.querySelector<HTMLElement>(
            '[role="region"][aria-labelledby="next-slot-unverified"]',
        );
        expect(region?.tabIndex).toBe(0);
    });

    it('uses the shared Table with its container props and keeps no local scroll-table copy', () => {
        const source = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../../../../../src/app/(app)/prop-calculator/accounts/next-slot/NextSlotView.tsx',
            ),
            'utf8',
        );
        expect(source).toContain("from '~/components/ui/Table'");
        expect(source).toMatch(/<Table\b/u);
        expect(source).not.toContain('ScrollTable');
        expect(source).not.toContain('SCROLL_REGION_TAB_INDEX');
        expect(source).not.toMatch(/<table\b/u);
    });

    it('banners the ranking as provisional while engine runs are still pending', () => {
        answerEverything();
        verifyEveryFirm();
        harness.answer.current = (request) =>
            request.kind === OverviewRequestKind.DocumentedRun
                ? answerAll(request)
                : undefined;
        render();
        const status = container.querySelector('[role="status"]');
        expect(status?.textContent).toContain('Provisional ranking');
        expect(status?.textContent).toMatch(/\d+ of \d+ engine runs done/);
    });

    it('holds the page on a skeleton while the journal is loading so the scale gate never uses a zero trade count', () => {
        answerEverything();
        verifyEveryFirm();
        harness.queries.set('edge.summary', {
            data: undefined,
            error: null,
            isError: false,
            isPending: true,
        });
        render();
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(container.querySelectorAll('h2')).toHaveLength(0);
    });

    it('shows the page with a note when the journal fails to load', () => {
        answerEverything();
        harness.queries.set('edge.summary', {
            data: undefined,
            error: new Error('journal down'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.textContent).toContain('journal down');
        expect(container.querySelectorAll('h2').length).toBeGreaterThan(0);
    });
});
