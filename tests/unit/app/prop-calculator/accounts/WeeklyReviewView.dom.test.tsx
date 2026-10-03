import { skipToken } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeeklyReviewView } from '~/app/(app)/prop-calculator/accounts/review/WeeklyReviewView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    RuleViolationKind,
    usdCents,
    ViolationSource,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const FOLLOWED_ID = 'a1111111-1111-4111-8111-111111111111';
const MISSED_ID = 'a2222222-2222-4222-8222-222222222222';
const LEDGER_ID = 'a3333333-3333-4333-8333-333333333333';
const BUSTED_ID = 'a4444444-4444-4444-8444-444444444444';
const FOLLOWED_DECISION_ID = 'd1111111-1111-4111-8111-111111111111';
const MISSED_DECISION_ID = 'd2222222-2222-4222-8222-222222222222';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const inputs = new Map<string, unknown[]>();
    const mutateAsync = new Map<
        string,
        ReturnType<typeof vi.fn<(input: unknown) => Promise<unknown>>>
    >();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn<(input: unknown) => Promise<unknown>>(() =>
            Promise.resolve({}),
        );
        mutateAsync.set(name, created);
        return created;
    }
    return {
        inputs,
        invalidate,
        mutateAsyncOf,
        mutation: (name: string) => ({
            useMutation: () => ({
                isPending: false,
                mutate: vi.fn(),
                mutateAsync: mutateAsyncOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: (input?: unknown) => {
                inputs.set(name, [...(inputs.get(name) ?? []), input]);
                return queries.get(name) ?? pending;
            },
        }),
        reset() {
            queries.clear();
            inputs.clear();
            mutateAsync.clear();
            invalidate.mockClear();
        },
    };
});

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/review',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            decision: { latestForAll: harness.query('decision.latestForAll') },
            review: {
                stagesOn: harness.query('review.stagesOn'),
                submit: harness.mutation('review.submit'),
            },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: { latestForAll: harness.query('snapshot.latestForAll') },
            violation: {
                create: harness.mutation('violation.create'),
                list: harness.query('violation.list'),
                update: harness.mutation('violation.update'),
            },
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function failure(): FakeQuery {
    return {
        data: undefined,
        error: new Error('boom'),
        isError: true,
        isPending: false,
    };
}

function findPlan(isMatch: (plan: Plan) => boolean) {
    const firm = ALL_FIRMS.find((candidate) => candidate.plans.some(isMatch));
    const plan = firm?.plans.find(isMatch);
    if (firm === undefined || plan === undefined) {
        throw new Error('no plan matches the predicate');
    }
    return { firm, plan };
}

const { firm: FIRM, plan: PLAN } = findPlan(
    (candidate) =>
        candidate.accountSize === 50_000 &&
        !candidate.isInstantFunded &&
        candidate.drawdownFor(TradingPhase.Eval).kind ===
            DrawdownKind.EodTrailing,
);

function accountRow(id: string, label: string, overrides = {}) {
    return {
        accountSize: PLAN.accountSize,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firmId: FIRM.id,
        id,
        label,
        liveStartBalanceCents: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: null,
        planSerial: serializePlanId(PLAN.id),
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function buttonLabelled(scope: ParentNode, label: string): HTMLButtonElement {
    const button = [...scope.querySelectorAll('button')].find(
        (candidate) =>
            candidate.getAttribute('aria-label') === label ||
            candidate.textContent.trim() === label,
    );
    if (button === undefined) throw new Error(`no button ${label}`);
    return button;
}

function decisionRow(overrides: Record<string, unknown>) {
    return {
        acceptedRiskCents: 40_000,
        accountId: FOLLOWED_ID,
        actualRiskCents: null,
        decidedOn: '2026-09-14',
        headlineRiskCents: 40_000,
        id: FOLLOWED_DECISION_ID,
        ...overrides,
    };
}

async function flush() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
}

function seed(
    options: {
        decisions?: readonly Record<string, unknown>[];
        violations?: readonly Record<string, unknown>[];
    } = {},
) {
    harness.queries.set(
        'account.list',
        answer([
            accountRow(FOLLOWED_ID, 'Eval followed'),
            accountRow(MISSED_ID, 'Eval missed'),
        ]),
    );
    harness.queries.set('snapshot.latestForAll', answer([]));
    harness.queries.set(
        'decision.latestForAll',
        answer(
            options.decisions ?? [
                decisionRow({ actualRiskCents: 40_000 }),
                decisionRow({
                    accountId: MISSED_ID,
                    actualRiskCents: 90_000,
                    id: MISSED_DECISION_ID,
                }),
            ],
        ),
    );
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('violation.list', answer(options.violations ?? []));
    harness.queries.set(
        'review.stagesOn',
        answer([
            { accountId: FOLLOWED_ID, stage: AccountStage.Eval },
            { accountId: MISSED_ID, stage: AccountStage.Eval },
        ]),
    );
}

function violationRow(overrides: Record<string, unknown> = {}) {
    return {
        accountId: MISSED_ID,
        costCents: usdCents(12_300),
        createdAt: new Date('2026-09-18T12:00:00Z'),
        decisionId: null,
        id: 'e1111111-1111-4111-8111-111111111111',
        kind: RuleViolationKind.ChasedLoss,
        note: null,
        occurredOn: '2026-09-18',
        source: ViolationSource.Manual,
        updatedAt: new Date('2026-09-18T12:00:00Z'),
        userId: 'user-a',
        ...overrides,
    };
}

describe('WeeklyReviewView adherence and violations', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
        harness.reset();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    function render() {
        act(() => {
            root.render(<WeeklyReviewView />);
        });
    }

    it('shows the adherence rate with its counts over the decisions that have an actual risk', () => {
        seed();
        render();
        expect(container.textContent).toContain('Adherence: 50%');
        expect(container.textContent).toContain(
            '1 of 2 latest decisions with a recorded actual risk followed',
        );
    });

    it('says the rate is over each account latest decision, whatever its date', () => {
        seed({
            decisions: [
                decisionRow({
                    actualRiskCents: 40_000,
                    decidedOn: '2026-08-03',
                }),
            ],
        });
        render();
        expect(container.textContent).toContain(
            'Based on each account latest decision, whatever its date.',
        );
        expect(container.textContent).toContain('Adherence: 100%');
    });

    it('says no adherence rate exists when no decision has an actual risk recorded', () => {
        seed({ decisions: [decisionRow({})] });
        render();
        expect(container.textContent).toContain(
            'Adherence: no decision has a recorded actual risk yet',
        );
        expect(container.textContent).toContain(
            '1 decision has no recorded actual risk',
        );
    });

    it('shows on each row whether its last decision was followed', () => {
        seed();
        render();
        expect(container.textContent).toContain(
            'Last decision on 2026-09-14: followed',
        );
        expect(container.textContent).toContain(
            'Last decision on 2026-09-14: not followed',
        );
    });

    it('lists this week violations on the account row and leaves out older ones', () => {
        seed({
            violations: [
                violationRow(),
                violationRow({
                    id: 'e2222222-2222-4222-8222-222222222222',
                    kind: RuleViolationKind.IgnoredStop,
                    occurredOn: '2026-09-01',
                }),
            ],
        });
        render();
        expect(container.textContent).toContain(
            'Took an unplanned trade to win back a loss',
        );
        expect(container.textContent).toContain('2026-09-18');
        expect(container.textContent).not.toContain(
            'Moved or ignored the stop loss',
        );
    });

    it('offers Log violation only on a row whose last decision was not followed', () => {
        seed();
        render();
        const labels = [...container.querySelectorAll('button')].map(
            (button) => button.getAttribute('aria-label') ?? '',
        );
        expect(labels).toContain('Log violation for Eval missed');
        expect(labels).not.toContain('Log violation for Eval followed');
    });

    it('opens the violation form prefilled with the decision and records it linked to that decision', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        expect(container.textContent).toContain('Decision on 2026-09-14');
        await act(async () => {
            const button = buttonLabelled(container, 'Add violation');
            button.focus();
            button.click();
        });
        await flush();
        expect(harness.mutateAsyncOf('violation.create')).toHaveBeenCalledWith({
            accountId: MISSED_ID,
            costCents: null,
            decisionId: MISSED_DECISION_ID,
            kind: RuleViolationKind.Oversize,
            note: null,
            occurredOn: '2026-09-14',
        });
    });

    it('asks the server only for violations from the first day of the week when every latest decision is that recent', () => {
        seed({
            decisions: [
                decisionRow({
                    actualRiskCents: 40_000,
                    decidedOn: '2026-09-16',
                }),
            ],
        });
        render();
        expect(harness.inputs.get('violation.list')?.at(-1)).toEqual({
            occurredFrom: '2026-09-15',
        });
    });

    it('reaches back to the oldest latest decision so a violation already linked to it is still seen', () => {
        seed({
            decisions: [
                decisionRow({
                    actualRiskCents: 90_000,
                    decidedOn: '2026-08-03',
                }),
            ],
        });
        render();
        expect(harness.inputs.get('violation.list')?.at(-1)).toEqual({
            occurredFrom: '2026-08-03',
        });
    });

    it('is not moved back by an old decision of an account the review does not show', () => {
        seed({
            decisions: [
                decisionRow({
                    accountId: BUSTED_ID,
                    actualRiskCents: 90_000,
                    decidedOn: '2026-06-01',
                    id: 'd4444444-4444-4444-8444-444444444444',
                }),
                decisionRow({
                    accountId: LEDGER_ID,
                    actualRiskCents: 90_000,
                    decidedOn: '2026-05-01',
                    id: 'd3333333-3333-4333-8333-333333333333',
                }),
                decisionRow({ actualRiskCents: 40_000 }),
            ],
        });
        harness.queries.set(
            'account.list',
            answer([
                accountRow(FOLLOWED_ID, 'Eval followed'),
                accountRow(BUSTED_ID, 'Eval busted', {
                    status: AccountStatus.Busted,
                }),
                accountRow(LEDGER_ID, 'Balance only', {
                    firmId: null,
                    planSerial: null,
                    tracking: AccountTracking.LedgerOnly,
                }),
            ]),
        );
        render();
        expect(harness.inputs.get('violation.list')?.at(-1)).toEqual({
            occurredFrom: '2026-09-15',
        });
    });

    it('does not ask for violations before the accounts have loaded either', () => {
        seed();
        harness.queries.delete('account.list');
        render();
        expect(harness.inputs.get('violation.list')).toEqual([skipToken]);
    });

    it('does not ask for violations before the decisions and the rulebook that bound the request have loaded', () => {
        seed();
        harness.queries.delete('decision.latestForAll');
        render();
        expect(harness.inputs.get('violation.list')).toEqual([skipToken]);
    });

    it('states the followed rule: within one rounding step of the accepted risk', () => {
        seed();
        render();
        expect(container.textContent).toMatch(
            /Followed means the actual risk is within \$50(?:\.00)? of the accepted risk/,
        );
    });

    it('calls a decision traded more than a step below the accepted risk not followed and offers no violation to log for trading smaller', () => {
        seed({
            decisions: [
                decisionRow({
                    accountId: MISSED_ID,
                    actualRiskCents: 10_000,
                    id: MISSED_DECISION_ID,
                }),
            ],
        });
        render();
        expect(container.textContent).toContain(
            'Last decision on 2026-09-14: not followed',
        );
        expect(container.textContent).toContain(
            'traded below the accepted risk',
        );
        const labels = [...container.querySelectorAll('button')].map(
            (button) => button.getAttribute('aria-label') ?? '',
        );
        expect(labels).not.toContain('Log violation for Eval missed');
    });

    it('renders the account page violation form, with its cost guidance and the decision as a linkable option', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        const form = container.querySelector(
            'form[aria-label="Log a violation"]',
        );
        expect(form?.textContent).toContain(
            'Leave blank when the dollar cost is not known',
        );
        expect(form?.textContent).toContain('Decision on 2026-09-14');
        expect(form?.textContent).toContain('Linked decision');
    });

    it('names the window from the first day of the week to today on an account with no violations', () => {
        seed();
        render();
        expect(container.textContent).toContain(
            'No violations recorded from 2026-09-15 to 2026-09-21.',
        );
    });

    it('hides Log violation and says it is logged once a violation is linked to the last decision', () => {
        seed({
            violations: [
                violationRow({
                    decisionId: MISSED_DECISION_ID,
                    occurredOn: '2026-09-01',
                }),
            ],
        });
        render();
        const labels = [...container.querySelectorAll('button')].map(
            (button) => button.getAttribute('aria-label') ?? '',
        );
        expect(labels).not.toContain('Log violation for Eval missed');
        expect(container.textContent).toContain(
            'Violation already logged for this decision',
        );
    });

    it('keeps the violation linked to the decision when logged from the review: the link cannot be removed', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        const form = container.querySelector(
            'form[aria-label="Log a violation"]',
        );
        const trigger = [...(form?.querySelectorAll('button') ?? [])].find(
            (button) => button.textContent.includes('Decision on 2026-09-14'),
        );
        expect(trigger).toBeDefined();
        expect(trigger?.hasAttribute('disabled')).toBe(true);
    });

    it('moves focus to the Kind field when the violation form opens', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        const active = document.activeElement;
        expect(active?.closest('form')?.getAttribute('aria-label')).toBe(
            'Log a violation',
        );
        expect(active?.getAttribute('role')).toBe('combobox');
    });

    it('returns focus to the Log violation button when the form is cancelled', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        await act(async () => {
            buttonLabelled(container, 'Cancel').click();
        });
        expect(document.activeElement).toBe(
            buttonLabelled(container, 'Log violation for Eval missed'),
        );
    });

    it('moves focus to the logged notice after a violation is saved and the list reloads', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        await act(async () => {
            buttonLabelled(container, 'Add violation').click();
        });
        await flush();
        harness.queries.set(
            'violation.list',
            answer([
                violationRow({
                    decisionId: MISSED_DECISION_ID,
                    occurredOn: '2026-09-14',
                }),
            ]),
        );
        render();
        await flush();
        const active = document.activeElement;
        expect(active?.textContent).toContain(
            'Violation already logged for this decision',
        );
    });

    it('keeps the review and its open form when a background refresh fails with data in hand', async () => {
        seed();
        render();
        await act(async () => {
            buttonLabelled(container, 'Log violation for Eval missed').click();
        });
        harness.queries.set('violation.list', {
            data: [],
            error: new Error('boom'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.textContent).toContain('Adherence: 50%');
        expect(container.textContent).toContain('Could not refresh');
        expect(
            container.querySelector('form[aria-label="Log a violation"]'),
        ).not.toBeNull();
    });

    it('states that active ledger-only accounts are left out of the review', () => {
        seed();
        harness.queries.set(
            'account.list',
            answer([
                accountRow(FOLLOWED_ID, 'Eval followed'),
                accountRow(LEDGER_ID, 'Balance only', {
                    firmId: null,
                    planSerial: null,
                    tracking: AccountTracking.LedgerOnly,
                }),
            ]),
        );
        render();
        expect(container.textContent).toContain(
            '1 ledger-only account is left out of this review',
        );
    });

    it('shows a load failure instead of an adherence rate when the decisions query fails', () => {
        seed();
        harness.queries.set('decision.latestForAll', failure());
        render();
        expect(container.textContent).toContain('Could not load');
        expect(container.textContent).not.toContain('Adherence');
    });

    it('shows a load failure instead of rows sized from the stage today when the stages query fails', () => {
        seed();
        harness.queries.set('review.stagesOn', failure());
        render();
        expect(container.textContent).toContain('Could not load');
        expect(container.textContent).not.toContain('Adherence');
    });

    it('shows a load failure instead of an empty violations list when the violations query fails', () => {
        seed();
        harness.queries.set('violation.list', failure());
        render();
        expect(container.textContent).toContain('Could not load');
        expect(container.textContent).not.toContain('Adherence');
    });
});

describe('WeeklyReviewView across midnight', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        vi.setSystemTime(new Date('2026-09-21T23:59:00Z'));
        harness.reset();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    it('moves the review window end and the violation bound together once the day changes', () => {
        seed({
            decisions: [
                decisionRow({
                    actualRiskCents: 40_000,
                    decidedOn: '2026-09-16',
                }),
            ],
        });
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(container.textContent).toContain(
            'No violations recorded from 2026-09-15 to 2026-09-21.',
        );
        act(() => {
            vi.advanceTimersByTime(120_000);
        });
        expect(container.textContent).toContain(
            'No violations recorded from 2026-09-15 to 2026-09-22.',
        );
    });

    it('moves the week start of the violation request when the new day opens a new review week', () => {
        seed({
            decisions: [
                decisionRow({
                    actualRiskCents: 40_000,
                    decidedOn: '2026-09-16',
                }),
            ],
        });
        vi.setSystemTime(new Date('2026-09-27T23:59:00Z'));
        act(() => {
            root.render(<WeeklyReviewView />);
        });
        expect(harness.inputs.get('violation.list')?.at(-1)).toEqual({
            occurredFrom: '2026-09-15',
        });
        act(() => {
            vi.advanceTimersByTime(120_000);
        });
        expect(harness.inputs.get('violation.list')?.at(-1)).toEqual({
            occurredFrom: '2026-09-22',
        });
    });
});
