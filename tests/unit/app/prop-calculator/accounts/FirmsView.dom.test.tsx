import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FirmsView } from '~/app/(app)/prop-calculator/accounts/firms/FirmsView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

interface FakeQuery {
    data: unknown;
    error: null | { message: string };
    isError: boolean;
    isPending: boolean;
}

function firstModeledPlan(): {
    readonly firm: TradingFirm;
    readonly plan: Plan;
} {
    const [firm] = ALL_FIRMS;
    const [plan] = firm?.plans ?? [];
    if (firm === undefined || plan === undefined) {
        throw new Error('no modeled plan for the firms view test');
    }
    return { firm, plan };
}

const { firm: FIRST_FIRM, plan: FIRST_PLAN } = firstModeledPlan();

const USER_ID = 'user-a';
const TODAY = '2026-09-26';
const ALPHA_ID = '2a4c6e8f-1b3d-4f5a-9c7e-0d2f4a6c8e1b';
const FIRM_VALUE = firmKeyId({
    firmId: FIRST_FIRM.id,
    kind: FirmKeyKind.Modeled,
});

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const set = vi.fn(() => Promise.resolve({}));
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            set.mockClear();
        },
        set,
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/firms',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: { user: { id: USER_ID } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            edge: { summary: harness.query('edge.summary') },
            event: { list: harness.query('event.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            firmEngagement: {
                list: harness.query('firmEngagement.list'),
                set: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.set,
                    }),
                },
            },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
        },
        useUtils: () => ({
            propAccounts: { invalidate: () => Promise.resolve() },
        }),
    },
}));

function account(
    id: string,
    label: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountSize: FIRST_PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-06-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FIRST_FIRM.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label,
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(FIRST_PLAN.id),
        purchasedOn: '2026-06-01',
        readIssues: [],
        replacesAccountId: null,
        roundId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-06-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function accountEvent(
    accountId: string,
    kind: string,
    occurredOn: string,
    id: string,
) {
    return {
        accountId,
        createdAt: new Date(`${occurredOn}T12:00:00Z`),
        id,
        kind,
        occurredOn,
        userId: USER_ID,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function chooseSelectValue(scope: ParentNode, value: string) {
    const select = [...scope.querySelectorAll('select')].find((candidate) =>
        [...candidate.options].some((option) => option.value === value),
    );
    if (select === undefined) throw new Error(`no select offering ${value}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
        )?.set?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function engagement(overrides: Record<string, unknown> = {}) {
    return {
        createdAt: new Date('2026-06-01T12:00:00Z'),
        externalFirmId: null,
        firmId: FIRST_FIRM.id,
        id: 'engagement-a',
        note: null,
        reason: null,
        sentLiveOn: null,
        sinceOn: '2026-06-01',
        status: 'active',
        updatedAt: new Date('2026-06-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function failed(message: string): FakeQuery {
    return {
        data: undefined,
        error: { message },
        isError: true,
        isPending: false,
    };
}

function loading(): FakeQuery {
    return { data: undefined, error: null, isError: false, isPending: true };
}

function paidPayoutRow(accountId: string, paidOn: string, id: string) {
    return {
        accountId,
        approvedOn: null,
        grossCents: 5000,
        id,
        netCents: null,
        paidOn,
        requestedOn: paidOn,
        status: 'paid',
        userId: USER_ID,
    };
}

async function submitForm(scope: ParentNode, label: string) {
    const form = element(scope, `form[aria-label="${label}"]`);
    await act(async () => {
        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('FirmsView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<FirmsView />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('account.list', answer([]));
        harness.queries.set(
            'edge.summary',
            answer({ summary: { sampleSize: 0 }, truncated: false }),
        );
        harness.queries.set('event.list', answer([]));
        harness.queries.set('externalFirm.list', answer([]));
        harness.queries.set('fee.list', answer([]));
        harness.queries.set('firmEngagement.list', answer([]));
        harness.queries.set('payout.list', answer([]));
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('lists a firm with its lifetime and active account counts', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        render();
        expect(container.textContent).toContain(FIRST_FIRM.displayName);
        const row = element(container, 'tbody tr');
        expect(row.textContent).toContain('1');
    });

    it('names the unmet scale-gate condition, or that thresholds are not set', () => {
        render();
        expect(container.textContent).toContain('Scale gate');
        expect(container.textContent).toContain('Sample thresholds not set');
    });

    it('sets a firm to paused with a reason through firmEngagement.set', async () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        render();
        chooseSelectValue(container, 'paused');
        await submitForm(container, `Edit status for ${FIRM_VALUE}`);
        expect(harness.set).toHaveBeenCalledWith(
            expect.objectContaining({
                externalFirmId: null,
                firmId: FIRST_FIRM.id,
                reason: 'other',
                sentLiveOn: null,
                status: 'paused',
            }),
        );
    });

    it('requires a sent-live date once the reason is sent live', async () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        render();
        chooseSelectValue(container, 'paused');
        chooseSelectValue(container, 'sent-live');
        await submitForm(container, `Edit status for ${FIRM_VALUE}`);
        expect(harness.set).not.toHaveBeenCalled();
        expect(container.textContent).toContain('needs the date');
    });

    it('shows an error instead of an indefinite loading skeleton when a required query fails', () => {
        harness.queries.set('account.list', failed('accounts down'));
        render();
        expect(container.textContent).toContain('accounts down');
        expect(container.querySelector('.animate-pulse')).toBeNull();
    });

    it('warns when the firm status could not be loaded, without blocking the roster', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        harness.queries.set('firmEngagement.list', failed('status down'));
        render();
        expect(container.textContent).toContain('status down');
        expect(container.textContent).toContain(FIRST_FIRM.displayName);
    });

    it('never saves a status change while the firm-status query has failed to load', async () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        harness.queries.set('firmEngagement.list', failed('status down'));
        render();
        const save = element(
            container,
            `form[aria-label="Edit status for ${FIRM_VALUE}"] button[type="submit"]`,
        );
        expect((save as HTMLButtonElement).disabled).toBe(true);
        await submitForm(container, `Edit status for ${FIRM_VALUE}`);
        expect(harness.set).not.toHaveBeenCalled();
    });

    it('never saves a status change while the firm-status query is still loading, even though the account, event, fee and payout queries resolved', async () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        harness.queries.set('firmEngagement.list', loading());
        render();
        expect(container.textContent).toContain(FIRST_FIRM.displayName);
        expect(container.textContent).toContain('still loading');
        const save = element(
            container,
            `form[aria-label="Edit status for ${FIRM_VALUE}"] button[type="submit"]`,
        );
        expect((save as HTMLButtonElement).disabled).toBe(true);
        await submitForm(container, `Edit status for ${FIRM_VALUE}`);
        expect(harness.set).not.toHaveBeenCalled();
    });

    it('shows the loaded status once the firm-status query resolves after the row has already rendered', async () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        harness.queries.set('firmEngagement.list', loading());
        render();
        const statusSelect = () =>
            element(
                container,
                `form[aria-label="Edit status for ${FIRM_VALUE}"] select`,
            ) as HTMLSelectElement;
        expect(statusSelect().value).toBe('active');

        harness.queries.set(
            'firmEngagement.list',
            answer([engagement({ status: 'paused' })]),
        );
        render();

        expect(statusSelect().value).toBe('paused');
        await submitForm(container, `Edit status for ${FIRM_VALUE}`);
        expect(harness.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'paused' }),
        );
    });

    it('disables every status-form field, not only Save, while the firm-status query is loading', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        harness.queries.set('firmEngagement.list', loading());
        render();
        const form = element(
            container,
            `form[aria-label="Edit status for ${FIRM_VALUE}"]`,
        );

        const statusSelect = element(form, 'select') as HTMLSelectElement;
        expect(statusSelect.disabled).toBe(true);
        const sinceInput = element(
            form,
            'input[type="date"]',
        ) as HTMLInputElement;
        expect(sinceInput.disabled).toBe(true);

        chooseSelectValue(form, 'paused');
        const reasonSelect = [...form.querySelectorAll('select')].find(
            (candidate) =>
                [...candidate.options].some(
                    (option) => option.value === 'sent-live',
                ),
        );
        if (reasonSelect === undefined) {
            throw new Error('the reason select never rendered');
        }
        expect(reasonSelect.disabled).toBe(true);

        chooseSelectValue(form, 'sent-live');
        const dateInputs = [
            ...form.querySelectorAll('input[type="date"]'),
        ] as HTMLInputElement[];
        expect(dateInputs.length).toBe(2);
        for (const input of dateInputs) {
            expect(input.disabled).toBe(true);
        }
    });

    it('warns when the journal could not be loaded, without blocking the scale gate', () => {
        harness.queries.set('edge.summary', failed('journal down'));
        render();
        expect(container.textContent).toContain('journal down');
        expect(container.textContent).toContain('Scale gate');
    });

    it('prints why the transfer rate is unavailable instead of crashing when more accounts moved live than paid payouts exist', () => {
        const firstId = '3b5d7f9a-2c4e-4a6b-8d0f-1e3a5c7e9b2d';
        const secondId = '4c6e8a0b-3d5f-4b7c-9e1a-2f4b6d8f0c3e';
        harness.queries.set(
            'account.list',
            answer([
                account(firstId, 'First', {
                    purchasedOn: '2026-01-01',
                    stage: AccountStage.Funded,
                }),
                account(secondId, 'Second', {
                    purchasedOn: '2026-01-02',
                    stage: AccountStage.Funded,
                }),
            ]),
        );
        harness.queries.set(
            'event.list',
            answer([
                accountEvent(firstId, 'purchased', '2026-01-01', 'e1'),
                accountEvent(firstId, 'eval-passed', '2026-01-05', 'e2'),
                accountEvent(firstId, 'moved-live', '2026-03-10', 'e3'),
                accountEvent(secondId, 'purchased', '2026-01-02', 'e4'),
                accountEvent(secondId, 'eval-passed', '2026-01-06', 'e5'),
                accountEvent(secondId, 'moved-live', '2026-03-12', 'e6'),
            ]),
        );
        harness.queries.set(
            'payout.list',
            answer([paidPayoutRow(firstId, '2026-02-01', 'p1')]),
        );
        render();
        expect(container.textContent).toContain(
            'n/a: 2 transfers against 1 paid payout',
        );
        expect(container.querySelector('.animate-pulse')).toBeNull();
    });

    it('gives a ledger-only firm a transfer-rate row stating why no rate exists', () => {
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Hola', {
                    externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
                    firmId: null,
                    planLabel: 'Hola Prime 100K',
                    planSerial: null,
                    stage: AccountStage.Live,
                    tracking: AccountTracking.LedgerOnly,
                }),
            ]),
        );
        render();
        const row = element(container, 'tbody tr');
        expect(row.textContent).toContain('n/a: no paid payouts yet');
        expect(row.textContent).toContain('n/a: no funded account-months yet');
    });

    it('shows a loading note instead of an unmet condition while the rulebook is still loading', () => {
        harness.queries.set('rulebook.get', loading());
        render();
        expect(container.textContent).toContain('Scale gate');
        expect(container.textContent).toContain(
            'Checking your thresholds and journal',
        );
        expect(container.textContent).not.toContain(
            'Sample thresholds not set',
        );
    });

    it('shows a loading note instead of an unmet journal-trades condition while the journal is still loading, then the gate once it settles', () => {
        harness.queries.set(
            'rulebook.get',
            answer({
                ...DEFAULT_RULEBOOK,
                samples: {
                    ...DEFAULT_RULEBOOK.samples,
                    minEvalAttempts: 1,
                    minFundedAccounts: 1,
                    minTrades: 5,
                },
            }),
        );
        harness.queries.set('edge.summary', loading());
        render();
        expect(container.textContent).toContain(
            'Checking your thresholds and journal',
        );
        expect(container.textContent).not.toContain(
            'Journal trades are below your threshold',
        );

        harness.queries.set(
            'edge.summary',
            answer({ summary: { sampleSize: 0 }, truncated: false }),
        );
        render();
        expect(container.textContent).not.toContain(
            'Checking your thresholds and journal',
        );
        expect(container.textContent).toContain(
            'Journal trades are below your threshold',
        );
    });

    it('shows no loading note once both the rulebook and the journal have answered', () => {
        render();
        expect(container.textContent).not.toContain(
            'Checking your thresholds and journal',
        );
        expect(container.textContent).toContain('Sample thresholds not set');
    });

    it('imports the not-applicable text from the shared formatter instead of redeclaring it', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/firms/FirmsView.tsx',
            ),
            'utf8',
        );
        expect(source).not.toMatch(/const NOT_APPLICABLE\b/);
        expect(source).toMatch(
            /import \{[^}]*\bNOT_APPLICABLE\b[^}]*\} from '~\/lib\/format'/,
        );
    });
});
