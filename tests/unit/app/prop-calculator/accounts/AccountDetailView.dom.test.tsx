import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDetailView } from '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView';
import {
    type EventPreviewer,
    NO_EVENT_PREVIEW,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/eventOptions';
import { EventsSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/EventsSection';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    BustCause,
    DashboardBalanceConvention,
    FeeKind,
    feePrefillCents,
    FirmEngagementReason,
    FirmEngagementStatus,
    formatUsdCents,
    PayoutStatus,
    SnapshotSource,
    usdCents,
    usdCentsToText,
} from '~/lib/prop-accounts';
import {
    AlphaFuturesVariant,
    ApexVariant,
    findFirm,
    FirmId,
    FtmoFuturesVariant,
    MffuVariant,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    PropRecord,
    type PropRejection,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const TODAY = '2026-09-26';
const USER_ID = 'user-a';
const ALPHA_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const BRAVO_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const PAYOUT_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const CHARLIE_ID = '7d2e4f6a-9b1c-4d3e-8f5a-6b7c8d9e0f1a';
const DELTA_ID = '2a4c6e8f-1b3d-4f5a-9c7e-0d2f4a6c8e1b';
const ECHO_ID = '3e5a7c9b-2d4f-4a6c-8e0b-1f3a5c7e9d2b';
const FEE_ID = '6f8a0c2e-4b6d-4e8f-9a1c-3d5f7b9e1a3c';
const GROUP_ID = '8b0d2f4a-6c8e-4a1b-9d3f-5e7a9c1b3d5f';

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutate = new Map<string, ReturnType<typeof vi.fn>>();
    const mutateAsync = new Map<string, ReturnType<typeof vi.fn>>();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateOf(name: string) {
        const existing = mutate.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn();
        mutate.set(name, created);
        return created;
    }
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn(() => Promise.resolve({}));
        mutateAsync.set(name, created);
        return created;
    }
    return {
        invalidate,
        mutateAsyncOf,
        mutateOf,
        mutation: (name: string) => ({
            useMutation: () => ({
                isPending: false,
                mutate: mutateOf(name),
                mutateAsync: mutateAsyncOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            mutate.clear();
            mutateAsync.clear();
            invalidate.mockClear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: harness.mutation('account.archive'),
                get: harness.query('account.get'),
                list: harness.query('account.list'),
                remove: harness.mutation('account.remove'),
                unarchive: harness.mutation('account.unarchive'),
                upgradeToModeled: harness.mutation(
                    'account.upgradeToModeled',
                ),
            },
            copyGroup: { list: harness.query('copyGroup.list') },
            decision: {
                listForAccount: harness.query('decision.listForAccount'),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
                record: harness.mutation('event.record'),
            },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: {
                create: harness.mutation('fee.create'),
                list: harness.query('fee.list'),
                remove: harness.mutation('fee.remove'),
                update: harness.mutation('fee.update'),
            },
            firmEngagement: {
                set: harness.mutation('firmEngagement.set'),
            },
            payout: {
                create: harness.mutation('payout.create'),
                list: harness.query('payout.list'),
                remove: harness.mutation('payout.remove'),
                update: harness.mutation('payout.update'),
            },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                create: harness.mutation('snapshot.create'),
                latestForAll: harness.query('snapshot.latestForAll'),
                listForAccount: harness.query('snapshot.listForAccount'),
                remove: harness.mutation('snapshot.remove'),
            },
            violation: {
                create: harness.mutation('violation.create'),
                list: harness.query('violation.list'),
                remove: harness.mutation('violation.remove'),
                update: harness.mutation('violation.update'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                account: {
                    get: { cancel: harness.invalidate },
                    invalidate: harness.invalidate,
                },
                invalidate: harness.invalidate,
            },
        }),
    },
}));

const PLAN = apexEod50k();

const CONFIRMING_PREVIEW: EventPreviewer = (draft) => ({
    lines: [`Recording ${draft.kind} changes the sibling accounts.`],
    requiresConfirmation: true,
    title: 'Before you record this event',
});

const PLAIN_PREVIEW: EventPreviewer = () => ({
    lines: ['Nothing else changes.'],
    requiresConfirmation: false,
    title: 'What this records',
});

const SECTION_HEADINGS = [
    'Plan rules',
    'Account state',
    'Alerts',
    'Snapshot history',
    'Payouts',
    'Fees',
    'Events',
    'Violations',
    'Replacement chain',
];

const ALPHA = account(ALPHA_ID, 'Alpha', { status: AccountStatus.Busted });
const BRAVO = account(BRAVO_ID, 'Bravo', {
    purchasedOn: '2026-08-13',
    replacesAccountId: ALPHA_ID,
});

const ALL_EVENTS = [
    event('e-a1', ALPHA_ID, AccountEventKind.Purchased, '2026-08-03'),
    event('e-a2', ALPHA_ID, AccountEventKind.Busted, '2026-08-10'),
    event('e-b1', BRAVO_ID, AccountEventKind.Purchased, '2026-08-13'),
];

function account(
    id: string,
    label: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.Apex,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function alphaStandard50k(): Plan {
    const plan = findFirm(FirmId.AlphaFutures)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    });
    if (plan === undefined) throw new Error('no Alpha Futures 50K plan');
    return plan;
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(overrides: Record<string, FakeQuery> = {}) {
    harness.queries.set('account.get', answer(BRAVO));
    harness.queries.set('account.list', answer([ALPHA, BRAVO]));
    harness.queries.set(
        'snapshot.listForAccount',
        answer([
            snapshot('s2', '2026-09-20', 5_100_000),
            snapshot('s1', '2026-09-01', 5_000_000),
        ]),
    );
    harness.queries.set('payout.list', answer([payout()]));
    harness.queries.set('fee.list', answer([]));
    harness.queries.set('violation.list', answer([]));
    harness.queries.set('decision.listForAccount', answer([]));
    harness.queries.set(
        'event.listForAccount',
        answer(ALL_EVENTS.filter((row) => row.accountId === BRAVO_ID)),
    );
    harness.queries.set('event.list', answer(ALL_EVENTS));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set(
        'snapshot.latestForAll',
        answer([snapshot('s2', '2026-09-20', 5_100_000)]),
    );
    for (const [name, query] of Object.entries(overrides)) {
        harness.queries.set(name, query);
    }
}

function apexEod50k(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (plan === undefined) throw new Error('no Apex EOD 50K plan');
    return plan;
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

function event(
    id: string,
    accountId: string,
    kind: AccountEventKind,
    occurredOn: string,
) {
    return {
        accountId,
        createdAt: new Date(`${occurredOn}T12:00:00Z`),
        detail: { changes: [], note: null },
        id,
        kind,
        occurredOn,
        updatedAt: new Date(`${occurredOn}T12:00:00Z`),
        userId: USER_ID,
    };
}

function fee(overrides: Record<string, unknown> = {}) {
    return {
        accountId: BRAVO_ID,
        amountCents: 59_000,
        createdAt: new Date('2026-08-13T12:00:00Z'),
        id: FEE_ID,
        kind: FeeKind.EvalPurchase,
        note: null,
        paidOn: '2026-08-13',
        updatedAt: new Date('2026-08-13T12:00:00Z'),
        userId: USER_ID,
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

function inputLabelled(scope: ParentNode, label: string): HTMLElement {
    const labelElement = [...scope.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === label,
    );
    const control =
        labelElement === undefined
            ? null
            : document.querySelector<HTMLElement>(
                  `#${CSS.escape(labelElement.htmlFor)}`,
              );
    if (control === null) throw new Error(`no control labelled ${label}`);
    return control;
}

function mffuPro50k(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

function payout(overrides: Record<string, unknown> = {}) {
    return {
        accountId: BRAVO_ID,
        createdAt: new Date('2026-09-10T12:00:00Z'),
        grossCents: 50_000,
        id: PAYOUT_ID,
        netCents: null,
        note: null,
        paidOn: '2026-09-12',
        requestedOn: '2026-09-10',
        status: PayoutStatus.Paid,
        updatedAt: new Date('2026-09-10T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

async function pickOption(trigger: HTMLElement, optionText: string) {
    await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
    const option = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((candidate) => candidate.textContent.trim() === optionText);
    if (option === undefined) throw new Error(`no option ${optionText}`);
    await act(async () => {
        option.focus();
        option.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}

function rejectionError(message: string, rejection: PropRejection): Error {
    return Object.assign(new Error(message), {
        data: { propRejection: rejection },
    });
}

function snapshot(
    id: string,
    asOf: string,
    balanceCents: number,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountId: BRAVO_ID,
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents,
        createdAt: new Date(`${asOf}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: null,
        highestIntradayBalanceCents: null,
        id,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        source: SnapshotSource.Manual,
        tradingDays: null,
        updatedAt: new Date(`${asOf}T12:00:00Z`),
        userId: USER_ID,
        ...overrides,
    };
}

function storedRecordRejection(
    record: PropRecord,
    recordId: string,
): PropRejection {
    return {
        lifecycleRejection: null,
        limit: null,
        quota: null,
        reason: PropStoredRecordRejection.InvalidStoredRecord,
        record,
        recordId,
    };
}

async function submit(scope: ParentNode, label: string) {
    await act(async () => {
        const button = buttonLabelled(scope, label);
        button.focus();
        button.click();
    });
    await flush();
}

function typeInto(input: HTMLElement, text: string) {
    act(() => {
        Reflect.set(
            input instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
            'value',
            text,
            input,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('AccountDetailView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(id = BRAVO_ID) {
        act(() => {
            root.render(<AccountDetailView id={id} userId={USER_ID} />);
        });
    }

    function sectionTitled(title: string): HTMLElement {
        const section = [
            ...container.querySelectorAll<HTMLElement>(
                'section[aria-labelledby]',
            ),
        ].find(
            (candidate) =>
                container.querySelector(
                    `#${CSS.escape(candidate.getAttribute('aria-labelledby') ?? '')}`,
                )?.textContent === title,
        );
        if (section === undefined) throw new Error(`no section ${title}`);
        return section;
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
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

    it('renders one h1 with the account label and an h2 per section, each section labelled by its heading', () => {
        answerEverything();
        render();
        const headings = container.querySelectorAll('h1');
        expect(headings).toHaveLength(1);
        expect(headings[0]?.textContent).toBe('Bravo');
        const sections = [
            ...container.querySelectorAll<HTMLElement>(
                'section[aria-labelledby]',
            ),
        ];
        const titles = sections.map((section) => {
            const heading = container.querySelector(
                `#${CSS.escape(section.getAttribute('aria-labelledby') ?? '')}`,
            );
            expect(heading?.tagName).toBe('H2');
            return heading?.textContent;
        });
        expect(titles).toEqual(SECTION_HEADINGS);
        expect(container.querySelectorAll('h2')).toHaveLength(
            SECTION_HEADINGS.length,
        );
    });

    it('shows a loading placeholder and no sections while the account is pending', () => {
        render();
        expect(
            container
                .querySelector('[aria-busy="true"]')
                ?.getAttribute('aria-label'),
        ).toBe('Loading the account');
        expect(container.querySelectorAll('section')).toHaveLength(0);
    });

    it('warns instead of silently naming the firm of your own unlisted when the firm list fails to load', () => {
        answerEverything({
            'account.get': answer(
                account(BRAVO_ID, 'Bravo', {
                    externalFirmId: 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
                    firmId: null,
                    planLabel: 'Hola 100K',
                    planSerial: null,
                    tracking: AccountTracking.LedgerOnly,
                }),
            ),
            'externalFirm.list': {
                data: undefined,
                error: new Error('Failed to fetch'),
                isError: true,
                isPending: false,
            },
        });
        render();
        expect(container.textContent).toContain(
            'Your firms could not be loaded',
        );
        expect(container.textContent).toContain('Failed to fetch');
    });

    it('asks through an AlertDialog before deleting a payout, returns focus to the trigger on cancel and deletes on confirm', async () => {
        answerEverything();
        render();
        const payouts = sectionTitled('Payouts');
        const trigger = buttonLabelled(
            payouts,
            'Delete the payout requested on 2026-09-10',
        );
        act(() => {
            trigger.focus();
            trigger.click();
        });
        const dialog = document.querySelector('[role="alertdialog"]');
        expect(dialog?.textContent).toContain('Delete this payout?');
        act(() => {
            buttonLabelled(document, 'Cancel').click();
        });
        await flush();
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(harness.mutateOf('payout.remove')).not.toHaveBeenCalled();

        act(() => {
            trigger.click();
        });
        act(() => {
            buttonLabelled(document, 'Delete').click();
        });
        expect(harness.mutateOf('payout.remove')).toHaveBeenCalledWith({
            id: PAYOUT_ID,
        });
    });

    it('asks through an AlertDialog before deleting a snapshot', () => {
        answerEverything();
        render();
        const history = sectionTitled('Snapshot history');
        act(() => {
            buttonLabelled(
                history,
                'Delete the snapshot of 2026-09-20',
            ).click();
        });
        expect(
            document.querySelector('[role="alertdialog"]')?.textContent,
        ).toContain('Delete this snapshot?');
        act(() => {
            buttonLabelled(document, 'Delete').click();
        });
        expect(harness.mutateOf('snapshot.remove')).toHaveBeenCalledWith({
            id: 's2',
        });
    });

    it('prefills the fee amount from the plan list price and again when the fee kind changes', async () => {
        answerEverything();
        render();
        const fees = sectionTitled('Fees');
        const amount = inputLabelled(fees, 'Amount');
        const evalPrice = feePrefillCents(PLAN, FeeKind.EvalPurchase);
        const activation = feePrefillCents(PLAN, FeeKind.Activation);
        if (evalPrice === null || activation === null) {
            throw new Error('the plan has no eval or activation price');
        }
        expect(evalPrice).not.toBe(activation);
        expect(amount).toBeInstanceOf(HTMLInputElement);
        expect((amount as HTMLInputElement).value).toBe(
            usdCentsToText(evalPrice),
        );

        await pickOption(inputLabelled(fees, 'Fee kind'), 'Activation fee');
        expect((inputLabelled(fees, 'Amount') as HTMLInputElement).value).toBe(
            usdCentsToText(activation),
        );

        await pickOption(inputLabelled(fees, 'Fee kind'), 'Other fee');
        expect((inputLabelled(fees, 'Amount') as HTMLInputElement).value).toBe(
            '',
        );
    });

    it('keeps an amount the user typed when the fee kind changes', async () => {
        answerEverything();
        render();
        const fees = sectionTitled('Fees');
        typeInto(inputLabelled(fees, 'Amount'), '123.45');
        await pickOption(inputLabelled(fees, 'Fee kind'), 'Activation fee');
        expect((inputLabelled(fees, 'Amount') as HTMLInputElement).value).toBe(
            '123.45',
        );
    });

    it('shows the list price and the difference on each fee row', () => {
        answerEverything({ 'fee.list': answer([fee({ amountCents: 47_000 })]) });
        render();
        const fees = sectionTitled('Fees');
        const listPrice = feePrefillCents(PLAN, FeeKind.EvalPurchase);
        if (listPrice === null) throw new Error('the plan has no eval price');
        expect(fees.textContent).toContain(formatUsdCents(usdCents(listPrice)));
        expect(fees.textContent).toContain(
            formatUsdCents(usdCents(47_000 - listPrice)),
        );
    });

    it('links the account it replaces with the measured rebuy lag of the plan', () => {
        answerEverything();
        render();
        const chain = sectionTitled('Replacement chain');
        const link = chain.querySelector<HTMLAnchorElement>(
            `a[href="${CSS.escape(routes.propCalculator.accounts.detail(ALPHA_ID))}"]`,
        );
        expect(link?.textContent).toContain('Alpha');
        expect(chain.textContent).toContain('Replaces');
        expect(chain.textContent).toContain(
            'Measured rebuy lag on this plan: 2.0 sessions (n = 1)',
        );
    });

    it('links the replacing account from the replaced one', () => {
        answerEverything({
            'account.get': answer(ALPHA),
            'event.listForAccount': answer(
                ALL_EVENTS.filter((row) => row.accountId === ALPHA_ID),
            ),
        });
        render(ALPHA_ID);
        const chain = sectionTitled('Replacement chain');
        const link = chain.querySelector<HTMLAnchorElement>(
            `a[href="${CSS.escape(routes.propCalculator.accounts.detail(BRAVO_ID))}"]`,
        );
        expect(link?.textContent).toContain('Bravo');
        expect(chain.textContent).toContain('Replaced by');
    });

    it('shows no measured lag when no replacement on the plan could be measured', () => {
        answerEverything({
            'account.get': answer({ ...BRAVO, replacesAccountId: null }),
            'account.list': answer([
                ALPHA,
                { ...BRAVO, replacesAccountId: null },
            ]),
        });
        render();
        const chain = sectionTitled('Replacement chain');
        expect(chain.textContent).not.toContain('Measured rebuy lag');
        expect(chain.textContent).toContain(
            'This account does not replace another account.',
        );
    });

    it('notes paid payouts that have no net amount', () => {
        answerEverything();
        render();
        expect(sectionTitled('Payouts').textContent).toContain(
            '1 paid payout has no net amount, so the gross amount is counted as received.',
        );
    });

    it('shows no gross-only note when every paid payout has its net', () => {
        answerEverything({
            'payout.list': answer([payout({ netCents: 45_000 })]),
        });
        render();
        expect(sectionTitled('Payouts').textContent).not.toContain(
            'no net amount',
        );
    });

    it('shows a readable message and delete or archive actions when a save finds the stored account invalid', async () => {
        answerEverything();
        const message =
            'Your stored account "Bravo" is not valid: bad rules. Ask the site owner to repair the stored data, which loses nothing';
        harness
            .mutateAsyncOf('payout.create')
            .mockRejectedValue(
                rejectionError(
                    message,
                    storedRecordRejection(PropRecord.Account, BRAVO_ID),
                ),
            );
        render();
        const payouts = sectionTitled('Payouts');
        typeInto(inputLabelled(payouts, 'Gross amount'), '500');
        await act(async () => {
            buttonLabelled(payouts, 'Add payout').click();
        });
        await flush();
        expect(harness.mutateAsyncOf('payout.create')).toHaveBeenCalled();
        const notice = [...container.querySelectorAll('[role="alert"]')].find(
            (element) => element.textContent.includes(message),
        );
        expect(notice).toBeDefined();
        if (notice === undefined) return;
        expect(buttonLabelled(notice, 'Delete Bravo')).toBeDefined();
        expect(buttonLabelled(notice, 'Archive Bravo')).toBeDefined();
    });

    it('offers to remove the stored payout a save found invalid', async () => {
        answerEverything();
        const message =
            'Your stored payout is not valid: x. Remove the payout and enter it again, or contact the site owner';
        harness
            .mutateAsyncOf('payout.create')
            .mockRejectedValue(
                rejectionError(
                    message,
                    storedRecordRejection(PropRecord.Payout, PAYOUT_ID),
                ),
            );
        render();
        const payouts = sectionTitled('Payouts');
        typeInto(inputLabelled(payouts, 'Gross amount'), '500');
        await act(async () => {
            buttonLabelled(payouts, 'Add payout').click();
        });
        await flush();
        const notice = [...container.querySelectorAll('[role="alert"]')].find(
            (element) => element.textContent.includes(message),
        );
        if (notice === undefined) throw new Error('no stored record notice');
        act(() => {
            buttonLabelled(notice, 'Remove the payout').click();
        });
        act(() => {
            buttonLabelled(document, 'Remove').click();
        });
        expect(harness.mutateOf('payout.remove')).toHaveBeenCalledWith({
            id: PAYOUT_ID,
        });
    });

    it('records a payout through the create mutation with exact cents', async () => {
        answerEverything();
        render();
        const payouts = sectionTitled('Payouts');
        typeInto(inputLabelled(payouts, 'Gross amount'), '1,234.56');
        await act(async () => {
            buttonLabelled(payouts, 'Add payout').click();
        });
        await flush();
        expect(harness.mutateAsyncOf('payout.create')).toHaveBeenCalledWith({
            accountId: BRAVO_ID,
            approvedOn: null,
            grossCents: 123_456,
            netCents: null,
            note: null,
            paidOn: null,
            requestedOn: TODAY,
            status: PayoutStatus.Requested,
        });
        expect(harness.invalidate).toHaveBeenCalled();
    });

    it('shows the approval date column and records a payout approval date', async () => {
        answerEverything({
            'payout.list': answer([payout({ approvedOn: '2026-09-11' })]),
        });
        render();
        const payouts = sectionTitled('Payouts');
        expect(payouts.textContent).toContain('2026-09-11');
        typeInto(inputLabelled(payouts, 'Gross amount'), '500');
        typeInto(inputLabelled(payouts, 'Approved on'), '2026-09-30');
        await act(async () => {
            buttonLabelled(payouts, 'Add payout').click();
        });
        await flush();
        expect(harness.mutateAsyncOf('payout.create')).toHaveBeenCalledWith(
            expect.objectContaining({ approvedOn: '2026-09-30' }),
        );
    });

    it('offers only the lifecycle events the stored account accepts', async () => {
        answerEverything();
        render();
        const events = sectionTitled('Events');
        await act(async () => {
            const trigger = inputLabelled(events, 'Event');
            trigger.focus();
            trigger.dispatchEvent(
                new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
            );
        });
        const offered = [
            ...document.querySelectorAll<HTMLElement>('[role="option"]'),
        ].map((option) => option.textContent.trim());
        expect(offered).toContain('Eval passed');
        expect(offered).toContain('Busted');
        expect(offered).not.toContain('Purchased');
        expect(offered).not.toContain('Edited');
        expect(offered).not.toContain('Bust reversed');
    });

    it('shows a bust cause select only once Busted is the chosen event, and sends it on submit', async () => {
        answerEverything();
        render();
        const events = sectionTitled('Events');
        expect(events.textContent).toContain('Bust cause');

        await pickOption(inputLabelled(events, 'Event'), 'Eval passed');
        expect(events.textContent).not.toContain('Bust cause');

        await pickOption(inputLabelled(events, 'Event'), 'Busted');
        expect(events.textContent).toContain('Bust cause');

        await pickOption(
            inputLabelled(events, 'Bust cause'),
            'Daily loss limit',
        );
        await submit(events, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).toHaveBeenCalledWith({
            accountId: BRAVO_ID,
            bustCause: BustCause.DailyLossLimit,
            kind: AccountEventKind.Busted,
            note: null,
            occurredOn: TODAY,
        });

        await pickOption(inputLabelled(events, 'Event'), 'Eval passed');
        expect(events.textContent).not.toContain('Bust cause');
    });

    it('shows a Violations section where a violation can be added', async () => {
        answerEverything();
        render();
        const violations = sectionTitled('Violations');
        expect(violations.textContent).toContain(
            'No rule violations recorded yet.',
        );
        typeInto(inputLabelled(violations, 'Date'), '2026-09-15');
        await submit(violations, 'Add violation');
        expect(harness.mutateAsyncOf('violation.create')).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: BRAVO_ID }),
        );
    });

    it('shows a bust diagnosis card for a busted account, from its recorded bust cause', () => {
        harness.queries.set('account.get', answer(ALPHA));
        harness.queries.set(
            'event.listForAccount',
            answer([
                event('e-a1', ALPHA_ID, AccountEventKind.Purchased, '2026-08-03'),
                {
                    ...event(
                        'e-a2',
                        ALPHA_ID,
                        AccountEventKind.Busted,
                        '2026-08-10',
                    ),
                    detail: {
                        bustCause: BustCause.DailyLossLimit,
                        changes: [],
                        note: null,
                    },
                },
            ]),
        );
        render(ALPHA_ID);
        const violations = sectionTitled('Violations');
        expect(violations.textContent).toContain('Structural');
        expect(violations.textContent).toContain('Daily loss limit');
    });

    it('lists the plan rules of a resolved plan', () => {
        answerEverything();
        render();
        const rules = sectionTitled('Plan rules');
        expect(rules.textContent).toContain(PLAN.label);
        expect(rules.textContent).toContain('Drawdown');
    });

    it('shows the peak-required message in the account state when no EOD peak was entered on an EOD-trailing plan', () => {
        answerEverything();
        render();
        const state = sectionTitled('Account state');
        expect(state.textContent).toContain(
            'An EOD-trailing drawdown needs the highest EOD balance to reconstruct the threshold',
        );
    });

    it('reconstructs the floor, lock and cushion once the highest EOD balance is entered', () => {
        answerEverything({
            'snapshot.listForAccount': answer([
                snapshot('s2', '2026-09-20', 5_100_000, {
                    highestEodBalanceCents: 5_200_000,
                }),
                snapshot('s1', '2026-09-01', 5_000_000, {
                    highestEodBalanceCents: 5_050_000,
                }),
            ]),
        });
        render();
        const state = sectionTitled('Account state');
        expect(state.textContent).toContain('Floor');
        expect(state.textContent).toContain('Cushion');
        expect(state.textContent).not.toContain('unavailable');
    });

    it('shows no live stage modeled for a live-stage account on a plan with no live program', () => {
        const noLiveFirmPlan = findFirm(FirmId.FtmoFutures)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        });
        if (noLiveFirmPlan === undefined) throw new Error('no FTMO plan');
        const live = account(CHARLIE_ID, 'Charlie', {
            firmId: FirmId.FtmoFutures,
            planSerial: serializePlanId(noLiveFirmPlan.id),
            stage: AccountStage.Live,
        });
        answerEverything({
            'account.get': answer(live),
            'account.list': answer([ALPHA, BRAVO, live]),
            'event.listForAccount': answer([]),
            'fee.list': answer([]),
            'payout.list': answer([]),
            'snapshot.listForAccount': answer([]),
        });
        render(CHARLIE_ID);
        const state = sectionTitled('Account state');
        expect(state.textContent).toContain('No live stage is modeled');
    });

    it('shows the live contract limit on a modeled live-stage account', () => {
        const live = account(CHARLIE_ID, 'Charlie', {
            stage: AccountStage.Live,
        });
        answerEverything({
            'account.get': answer(live),
            'account.list': answer([ALPHA, BRAVO, live]),
            'event.listForAccount': answer([]),
            'fee.list': answer([]),
            'payout.list': answer([]),
            'snapshot.listForAccount': answer([
                snapshot('s1', '2026-09-20', 200_000, {
                    highestEodBalanceCents: 200_000,
                }),
            ]),
        });
        render(CHARLIE_ID);
        const state = sectionTitled('Account state');
        expect(state.textContent).toContain('Contract limit');
        expect(state.textContent).toContain('10 minis / 100 micros');
    });

    it('shows a destructive alert in the account state when the balances query fails, instead of an indefinite loading skeleton', () => {
        answerEverything({
            'snapshot.listForAccount': {
                data: undefined,
                error: new Error('Failed to fetch'),
                isError: true,
                isPending: false,
            },
        });
        render();
        const state = sectionTitled('Account state');
        expect(state.textContent).toContain(
            'The balances could not be loaded',
        );
        expect(state.textContent).toContain('Failed to fetch');
        expect(
            state.querySelector('[aria-label="Loading the account state"]'),
        ).toBeNull();
    });

    it('shows the read-only notice and no event form for an account whose plan cannot be resolved', () => {
        const broken = { ...BRAVO, planSerial: 'no-such-plan' };
        answerEverything({
            'account.get': answer(broken),
            'account.list': answer([ALPHA, broken]),
        });
        render();
        expect(container.textContent).toContain('This account is read-only');
        expect(sectionTitled('Events').querySelector('form')).toBeNull();
    });

    it('shows the mixed-stage warning of a copy group this account belongs to', () => {
        const grouped = { ...BRAVO, copyGroupId: GROUP_ID };
        const charlie = account(CHARLIE_ID, 'Charlie', {
            copyGroupId: GROUP_ID,
            stage: AccountStage.Funded,
        });
        answerEverything({
            'account.get': answer(grouped),
            'account.list': answer([ALPHA, grouped, charlie]),
            'copyGroup.list': answer([
                {
                    createdAt: new Date('2026-08-01T12:00:00Z'),
                    id: GROUP_ID,
                    name: 'Mirror',
                    updatedAt: new Date('2026-08-01T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
        });
        render();
        const alerts = sectionTitled('Alerts');
        expect(alerts.textContent).toContain(
            'Copy group "Mirror" mixes stages (1 Evaluation, 1 Funded)',
        );
        expect(alerts.textContent).not.toContain('No alerts right now.');
    });

    it('checks alerts against the whole portfolio and keeps only those that name this account', () => {
        const charlie = account(CHARLIE_ID, 'Charlie');
        answerEverything({
            'account.list': answer([ALPHA, BRAVO, charlie]),
        });
        render();
        const alerts = sectionTitled('Alerts');
        expect(alerts.textContent).toContain(
            'Snapshot from 2026-09-20 predates the last trading session',
        );
        expect(alerts.textContent).toContain('2 of 2 active accounts');
        expect(alerts.textContent).not.toContain('Charlie');
    });

    it('checks the snapshot against the new day after the page stays open past midnight, without a remount', () => {
        const fridaySnapshot = snapshot('s3', '2026-09-25', 5_100_000);
        answerEverything({
            'snapshot.latestForAll': answer([fridaySnapshot]),
            'snapshot.listForAccount': answer([fridaySnapshot]),
        });
        render();
        expect(sectionTitled('Alerts').textContent).not.toContain(
            'predates the last trading session',
        );

        vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });

        expect(sectionTitled('Alerts').textContent).toContain(
            'Snapshot from 2026-09-25 predates the last trading session',
        );
    });

    it("uses a moved-live sibling account's recorded move-live date when checking the lifetime dollar cap", () => {
        const proPlanSerial = serializePlanId(mffuPro50k().id);
        const bravoOnPro = account(BRAVO_ID, 'Bravo', {
            accountSize: 50_000,
            firmId: FirmId.Mffu,
            planSerial: proPlanSerial,
            stage: AccountStage.Funded,
        });
        const movedLive = account(CHARLIE_ID, 'Charlie', {
            accountSize: 50_000,
            firmId: FirmId.Mffu,
            planSerial: proPlanSerial,
            stage: AccountStage.Live,
        });
        answerEverything({
            'account.get': answer(bravoOnPro),
            'account.list': answer([bravoOnPro, movedLive]),
            'event.list': answer([
                {
                    accountId: CHARLIE_ID,
                    createdAt: new Date('2026-09-15T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-charlie-moved-live',
                    kind: AccountEventKind.MovedLive,
                    occurredOn: '2026-09-15',
                    updatedAt: new Date('2026-09-15T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
            'event.listForAccount': answer([]),
            'payout.list': answer([
                payout({
                    accountId: BRAVO_ID,
                    grossCents: 4_000_000,
                    id: 'payout-bravo',
                    netCents: 4_000_000,
                    paidOn: '2026-09-05',
                    requestedOn: '2026-09-03',
                }),
                payout({
                    accountId: CHARLIE_ID,
                    grossCents: 6_000_000,
                    id: 'payout-charlie-pre-live',
                    netCents: 6_000_000,
                    paidOn: '2026-09-10',
                    requestedOn: '2026-09-08',
                }),
                payout({
                    accountId: CHARLIE_ID,
                    grossCents: 3_000_000,
                    id: 'payout-charlie-post-live',
                    netCents: 3_000_000,
                    paidOn: '2026-09-20',
                    requestedOn: '2026-09-18',
                }),
            ]),
        });
        render(BRAVO_ID);
        const alerts = sectionTitled('Alerts');
        expect(alerts.textContent).toContain(
            'no further payout fits under the cap',
        );
        expect(alerts.textContent).toContain(
            'not counting $30,000 paid on 1 account after moving live',
        );
    });

    it('says the rebuy lag could not be measured when a stored date of another replacement on the plan is not a calendar date', () => {
        const delta = account(DELTA_ID, 'Delta', {
            purchasedOn: '2026-02-30',
            replacesAccountId: ALPHA_ID,
        });
        answerEverything({
            'account.list': answer([ALPHA, BRAVO, delta]),
        });
        render();
        const chain = sectionTitled('Replacement chain');
        expect(chain.textContent).toContain(
            'The rebuy lag could not be measured: Not a calendar date: "2026-02-30".',
        );
        expect(chain.textContent).not.toContain('Measured rebuy lag');
        expect(chain.textContent).toContain('Replaces');
    });

    it('opens the fee form of a subscription plan on its monthly fee', () => {
        const echo = account(ECHO_ID, 'Echo', {
            firmId: FirmId.AlphaFutures,
            planSerial: serializePlanId(alphaStandard50k().id),
        });
        answerEverything({
            'account.get': answer(echo),
            'account.list': answer([ALPHA, BRAVO, echo]),
            'event.listForAccount': answer([]),
            'payout.list': answer([]),
            'snapshot.listForAccount': answer([]),
        });
        render(ECHO_ID);
        const fees = sectionTitled('Fees');
        expect(inputLabelled(fees, 'Fee kind').textContent).toBe(
            'Subscription',
        );
        expect((inputLabelled(fees, 'Amount') as HTMLInputElement).value).toBe(
            usdCentsToText(usdCents(12_900)),
        );
        expect(fees.textContent).toContain(
            'Record each subscription month, the first one too, as its own subscription fee.',
        );
    });

    it('leaves the amount blank for a fee kind the plan has no price for', async () => {
        answerEverything();
        render();
        const fees = sectionTitled('Fees');
        await pickOption(inputLabelled(fees, 'Fee kind'), 'Subscription');
        expect((inputLabelled(fees, 'Amount') as HTMLInputElement).value).toBe(
            '',
        );
        await pickOption(inputLabelled(fees, 'Fee kind'), 'Reset');
        expect((inputLabelled(fees, 'Amount') as HTMLInputElement).value).toBe(
            '',
        );
        await submit(fees, 'Add fee');
        expect(harness.mutateAsyncOf('fee.create')).not.toHaveBeenCalled();
        expect(fees.textContent).toContain('Enter the amount you paid');
    });

    it('records a fee through the create mutation with exact cents', async () => {
        answerEverything();
        render();
        const fees = sectionTitled('Fees');
        typeInto(inputLabelled(fees, 'Amount'), '1,234.56');
        typeInto(inputLabelled(fees, 'Note'), 'coupon SAVE80');
        await submit(fees, 'Add fee');
        expect(harness.mutateAsyncOf('fee.create')).toHaveBeenCalledWith({
            accountId: BRAVO_ID,
            amountCents: 123_456,
            kind: FeeKind.EvalPurchase,
            note: 'coupon SAVE80',
            paidOn: TODAY,
        });
        expect(harness.invalidate).toHaveBeenCalled();
    });

    it('edits a fee through the update mutation with its id and every field, moving focus into the form and back', async () => {
        answerEverything({ 'fee.list': answer([fee()]) });
        render();
        const fees = sectionTitled('Fees');
        const trigger = buttonLabelled(
            fees,
            'Edit the Evaluation purchase paid on 2026-08-13',
        );
        act(() => {
            trigger.focus();
            trigger.click();
        });
        await flush();
        const focused = document.activeElement;
        expect(focused?.closest('form')?.getAttribute('aria-label')).toBe(
            'Edit fee',
        );
        expect(document.activeElement).toBe(inputLabelled(fees, 'Fee kind'));
        typeInto(inputLabelled(fees, 'Amount'), '470.40');
        await submit(fees, 'Save fee');
        expect(harness.mutateAsyncOf('fee.update')).toHaveBeenCalledWith({
            amountCents: 47_040,
            id: FEE_ID,
            kind: FeeKind.EvalPurchase,
            note: null,
            paidOn: '2026-08-13',
        });
        expect(document.activeElement).toBe(trigger);
    });

    it('returns focus to the edit button when a fee edit is cancelled', async () => {
        answerEverything({ 'fee.list': answer([fee()]) });
        render();
        const fees = sectionTitled('Fees');
        const trigger = buttonLabelled(
            fees,
            'Edit the Evaluation purchase paid on 2026-08-13',
        );
        act(() => {
            trigger.focus();
            trigger.click();
        });
        await flush();
        act(() => {
            const cancel = buttonLabelled(fees, 'Cancel edit');
            cancel.focus();
            cancel.click();
        });
        await flush();
        expect(fees.querySelector('form')?.getAttribute('aria-label')).toBe(
            'Add a fee',
        );
        expect(document.activeElement).toBe(trigger);
        expect(harness.mutateAsyncOf('fee.update')).not.toHaveBeenCalled();
    });

    it('edits a payout through the update mutation with its id and every field, moving focus into the form and back', async () => {
        answerEverything();
        render();
        const payouts = sectionTitled('Payouts');
        const trigger = buttonLabelled(
            payouts,
            'Edit the payout requested on 2026-09-10',
        );
        act(() => {
            trigger.focus();
            trigger.click();
        });
        await flush();
        const focused = document.activeElement;
        expect(focused?.closest('form')?.getAttribute('aria-label')).toBe(
            'Edit payout',
        );
        expect(document.activeElement).toBe(
            inputLabelled(payouts, 'Requested on'),
        );
        typeInto(inputLabelled(payouts, 'Net received'), '450');
        await submit(payouts, 'Save payout');
        expect(harness.mutateAsyncOf('payout.update')).toHaveBeenCalledWith({
            approvedOn: null,
            grossCents: 50_000,
            id: PAYOUT_ID,
            netCents: 45_000,
            note: null,
            paidOn: '2026-09-12',
            requestedOn: '2026-09-10',
            status: PayoutStatus.Paid,
        });
        expect(document.activeElement).toBe(trigger);
    });

    it('returns focus to the edit button when a payout edit is cancelled', async () => {
        answerEverything();
        render();
        const payouts = sectionTitled('Payouts');
        const trigger = buttonLabelled(
            payouts,
            'Edit the payout requested on 2026-09-10',
        );
        act(() => {
            trigger.focus();
            trigger.click();
        });
        await flush();
        act(() => {
            const cancel = buttonLabelled(payouts, 'Cancel edit');
            cancel.focus();
            cancel.click();
        });
        await flush();
        expect(payouts.querySelector('form')?.getAttribute('aria-label')).toBe(
            'Add a payout',
        );
        expect(document.activeElement).toBe(trigger);
    });

    it('records a lifecycle event through the record mutation', async () => {
        answerEverything();
        render();
        const events = sectionTitled('Events');
        await pickOption(inputLabelled(events, 'Event'), 'Eval passed');
        await submit(events, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).toHaveBeenCalledWith({
            accountId: BRAVO_ID,
            kind: AccountEventKind.EvalPassed,
            note: null,
            occurredOn: TODAY,
        });
        expect(harness.invalidate).toHaveBeenCalled();
    });

    it('blocks a bust reversal without a note and records it once a note is given', async () => {
        answerEverything({
            'account.get': answer(ALPHA),
            'event.listForAccount': answer(
                ALL_EVENTS.filter((row) => row.accountId === ALPHA_ID),
            ),
        });
        render(ALPHA_ID);
        const events = sectionTitled('Events');
        await pickOption(inputLabelled(events, 'Event'), 'Bust reversed');
        await submit(events, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).not.toHaveBeenCalled();
        expect(events.querySelector('[aria-invalid="true"]')?.tagName).toBe(
            'TEXTAREA',
        );

        typeInto(inputLabelled(events, 'Note'), 'Firm reversed after review');
        await submit(events, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).toHaveBeenCalledWith({
            accountId: ALPHA_ID,
            kind: AccountEventKind.BustReversed,
            note: 'Firm reversed after review',
            occurredOn: TODAY,
        });
    });

    it('holds an event whose preview asks for confirmation until the user confirms it', async () => {
        act(() => {
            root.render(
                <EventsSection
                    accountId={BRAVO_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    preview={CONFIRMING_PREVIEW}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Eval,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
        await pickOption(inputLabelled(container, 'Event'), 'Eval passed');
        expect(container.textContent).toContain(
            'Recording eval-passed changes the sibling accounts.',
        );
        await submit(container, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).not.toHaveBeenCalled();

        const confirm =
            container.querySelector<HTMLElement>('[role="checkbox"]');
        if (confirm === null) throw new Error('no confirmation checkbox');
        act(() => {
            confirm.click();
        });
        await submit(container, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).toHaveBeenCalledWith({
            accountId: BRAVO_ID,
            kind: AccountEventKind.EvalPassed,
            note: null,
            occurredOn: TODAY,
        });
    });

    it('records an event at once when its preview needs no confirmation', async () => {
        act(() => {
            root.render(
                <EventsSection
                    accountId={BRAVO_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    preview={PLAIN_PREVIEW}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Eval,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
        await pickOption(inputLabelled(container, 'Event'), 'Eval passed');
        expect(container.querySelector('[role="checkbox"]')).toBeNull();
        await submit(container, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).toHaveBeenCalledTimes(1);
    });

    it('suggests marking the firm sent live after a MovedLive event, and applies it through firmEngagement.set', async () => {
        harness.queries.set('account.get', answer(BRAVO));
        act(() => {
            root.render(
                <EventsSection
                    accountId={BRAVO_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    preview={NO_EVENT_PREVIEW}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Funded,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
        await pickOption(inputLabelled(container, 'Event'), 'Moved live');
        await submit(container, 'Record event');
        expect(harness.mutateAsyncOf('event.record')).toHaveBeenCalledWith({
            accountId: BRAVO_ID,
            kind: AccountEventKind.MovedLive,
            note: null,
            occurredOn: TODAY,
        });
        expect(container.textContent).toContain(
            'Mark Apex Trader Funding as sent live?',
        );

        await submit(container, 'Mark Apex Trader Funding sent live');
        expect(harness.mutateOf('firmEngagement.set')).toHaveBeenCalledWith({
            externalFirmId: null,
            firmId: FirmId.Apex,
            note: null,
            reason: FirmEngagementReason.SentLive,
            sentLiveOn: TODAY,
            sinceOn: TODAY,
            status: FirmEngagementStatus.Retired,
        });
    });

    it('dismisses the MovedLive suggestion without calling firmEngagement.set', async () => {
        harness.queries.set('account.get', answer(BRAVO));
        act(() => {
            root.render(
                <EventsSection
                    accountId={BRAVO_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    preview={NO_EVENT_PREVIEW}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Funded,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
        await pickOption(inputLabelled(container, 'Event'), 'Moved live');
        await submit(container, 'Record event');
        await submit(container, 'Not now');
        expect(harness.mutateOf('firmEngagement.set')).not.toHaveBeenCalled();
        expect(container.textContent).not.toContain(
            'Mark Apex Trader Funding as sent live?',
        );
    });

    it('keeps the MovedLive suggestion visible after the account state changes and remounts the event form', async () => {
        harness.queries.set('account.get', answer(BRAVO));
        act(() => {
            root.render(
                <EventsSection
                    accountId={BRAVO_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    preview={NO_EVENT_PREVIEW}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Funded,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
        await pickOption(inputLabelled(container, 'Event'), 'Moved live');
        await submit(container, 'Record event');
        expect(container.textContent).toContain(
            'Mark Apex Trader Funding as sent live?',
        );

        act(() => {
            root.render(
                <EventsSection
                    accountId={BRAVO_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    preview={NO_EVENT_PREVIEW}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Live,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
        expect(container.textContent).toContain(
            'Mark Apex Trader Funding as sent live?',
        );
    });
});
