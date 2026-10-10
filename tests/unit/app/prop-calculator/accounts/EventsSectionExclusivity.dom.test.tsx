import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { EventsSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/EventsSection';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    LEDGER_ONLY_LIFECYCLE_FACTS,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    type LiveExclusivityPolicy,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SimAccountEffect,
    UnknownCooldown,
} from '~/lib/prop-calculator';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const TODAY = '2026-09-26';
const MOVED_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const EVAL_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const FUNDED_ID = '7d2e4f6a-9b1c-4d3e-8f5a-6b7c8d9e0f1a';
const LIVE_ID = '2a4c6e8f-1b3d-4f5a-9c7e-0d2f4a6c8e1b';

const harness = vi.hoisted(() => {
    const queries = new Map<string, unknown>();
    const mutateAsync = vi.fn((input: unknown) => Promise.resolve(input));
    const invalidate = vi.fn(() => Promise.resolve());
    const pending = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        invalidate,
        mutateAsync,
        mutation: () => ({
            useMutation: () => ({
                isPending: false,
                mutate: vi.fn(),
                mutateAsync,
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                get: harness.query('account.get'),
                list: harness.query('account.list'),
            },
            event: { record: harness.mutation() },
            externalFirm: { list: harness.query('externalFirm.list') },
            firmEngagement: { set: harness.mutation() },
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

const FIRM = required(ALL_FIRMS[0], 'a registered firm');
const PLAN = required(
    FIRM.plans.find((plan) => !plan.isInstantFunded),
    'an eval plan',
);

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class ExclusivityStub extends FirmAccountPolicy {
    constructor(private readonly effect: SimAccountEffect) {
        super();
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return {
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: this.effect,
            source: CONFIRMED_SOURCE,
        };
    }
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

async function flush() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
}

function inputLabelled(scope: ParentNode): HTMLElement {
    const labelElement = [...scope.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === 'Event',
    );
    const control =
        labelElement === undefined
            ? null
            : document.querySelector<HTMLElement>(
                  `#${CSS.escape(labelElement.htmlFor)}`,
              );
    if (control === null) throw new Error('no control labelled Event');
    return control;
}

function listed(
    id: string,
    label: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FIRM.id,
        firstFundedTradeOn: null,
        id,
        label,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-08-03',
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
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

function required<T>(value: T | undefined, label: string): T {
    if (value === undefined) throw new Error(`expected ${label}`);
    return value;
}

async function withPolicy<T>(
    policy: FirmAccountPolicy,
    run: () => Promise<T>,
): Promise<T> {
    const firm = FIRM as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return await run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('EventsSection live exclusivity preview and confirm', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(
                <EventsSection
                    accountId={MOVED_ID}
                    onFailure={vi.fn()}
                    plan={PLAN}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Funded,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.Modeled}
                />,
            );
        });
    }

    function exclusivityCheckbox(): HTMLElement | null {
        const label = [...container.querySelectorAll('label')].find(
            (candidate) =>
                candidate.textContent.trim() ===
                'Suspend these accounts when recording',
        );
        return label === undefined
            ? null
            : container.querySelector<HTMLElement>(
                  `#${CSS.escape(label.htmlFor)}`,
              );
    }

    function recordButton(): HTMLButtonElement {
        const button = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent.trim() === 'Record event',
        );
        if (button === undefined) throw new Error('no record button');
        return button;
    }

    async function recordMovedLive() {
        await pickOption(inputLabelled(container), 'Moved live');
        return;
    }

    async function submitRecord() {
        await act(async () => {
            const button = [...container.querySelectorAll('button')].find(
                (candidate) => candidate.textContent.trim() === 'Record event',
            );
            if (button === undefined) throw new Error('no record button');
            button.focus();
            button.click();
        });
        await flush();
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.mutateAsync.mockClear();
        harness.invalidate.mockClear();
        harness.queries.set(
            'account.get',
            answer(
                listed(MOVED_ID, 'Alpha', {
                    stage: AccountStage.Funded,
                }),
            ),
        );
        harness.queries.set('externalFirm.list', answer([]));
        harness.queries.set(
            'account.list',
            answer([
                listed(MOVED_ID, 'Alpha', { stage: AccountStage.Funded }),
                listed(EVAL_ID, 'Bravo eval'),
                listed(FUNDED_ID, 'Charlie funded', {
                    stage: AccountStage.Funded,
                }),
                listed(LIVE_ID, 'Delta live', { stage: AccountStage.Live }),
            ]),
        );
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

    it('lists the siblings a verified policy suspends and holds the record button until the user confirms them', async () => {
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                render();
                await recordMovedLive();
                expect(container.textContent).toContain(
                    'Alpha going live changes 2 other accounts',
                );
                expect(container.textContent).toContain(
                    'Bravo eval: suspended',
                );
                expect(container.textContent).toContain(
                    'Charlie funded: suspended',
                );
                expect(container.textContent).not.toContain('Delta live');
                expect(
                    exclusivityCheckbox()?.getAttribute('aria-checked'),
                ).toBe('false');
                expect(recordButton().disabled).toBe(true);
                expect(container.textContent).toContain(
                    'Confirm the accounts the firm suspends before recording this move live',
                );
                await submitRecord();
            },
        );
        expect(harness.mutateAsync).not.toHaveBeenCalled();
    });

    it('releases the record button once the suspended accounts are confirmed and holds it again when the confirmation is withdrawn', async () => {
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                render();
                await recordMovedLive();
                const checkbox = exclusivityCheckbox();
                if (checkbox === null) {
                    throw new Error('no exclusivity checkbox');
                }
                act(() => {
                    checkbox.click();
                });
                expect(recordButton().disabled).toBe(false);
                expect(container.textContent).not.toContain(
                    'Confirm the accounts the firm suspends before recording this move live',
                );
                act(() => {
                    checkbox.click();
                });
                expect(recordButton().disabled).toBe(true);
            },
        );
    });

    it('sends exactly the suspended siblings once the user ticks the confirmation', async () => {
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                render();
                await recordMovedLive();
                const checkbox = exclusivityCheckbox();
                if (checkbox === null)
                    throw new Error('no exclusivity checkbox');
                act(() => {
                    checkbox.click();
                });
                expect(
                    exclusivityCheckbox()?.getAttribute('aria-checked'),
                ).toBe('true');
                await submitRecord();
            },
        );
        expect(harness.mutateAsync).toHaveBeenCalledTimes(1);
        const [payload] = harness.mutateAsync.mock.calls[0] ?? [];
        expect(payload).toMatchObject({
            accountId: MOVED_ID,
            kind: AccountEventKind.MovedLive,
        });
        const sent = z
            .array(z.string())
            .parse(
                Reflect.get(
                    payload as object,
                    'confirmedExclusivityAccountIds',
                ),
            );
        expect(sent).toHaveLength(2);
        expect(new Set(sent)).toEqual(new Set([EVAL_ID, FUNDED_ID]));
    });

    it('lists a flag-only effect as information with no confirmation to tick and sends no ids', async () => {
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.UpgradedAccountOnHold),
            async () => {
                render();
                await recordMovedLive();
                expect(container.textContent).toContain('Bravo eval: flagged');
                expect(exclusivityCheckbox()).toBeNull();
                await submitRecord();
            },
        );
        const [payload] = harness.mutateAsync.mock.calls[0] ?? [];
        expect(payload).not.toHaveProperty('confirmedExclusivityAccountIds');
    });

    it('shows nothing and sends no ids for an unverified firm policy', async () => {
        render();
        await recordMovedLive();
        expect(container.textContent).not.toContain('going live changes');
        expect(exclusivityCheckbox()).toBeNull();
        await submitRecord();
        const [payload] = harness.mutateAsync.mock.calls[0] ?? [];
        expect(payload).not.toHaveProperty('confirmedExclusivityAccountIds');
    });

    it('does not show the preview for another event kind', async () => {
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                harness.queries.set(
                    'account.get',
                    answer(listed(MOVED_ID, 'Alpha')),
                );
                act(() => {
                    root.render(
                        <EventsSection
                            accountId={MOVED_ID}
                            onFailure={vi.fn()}
                            plan={PLAN}
                            query={{ data: [], error: null }}
                            state={{
                                stage: AccountStage.Eval,
                                status: AccountStatus.Active,
                            }}
                            tracking={AccountTracking.Modeled}
                        />,
                    );
                });
                await pickOption(inputLabelled(container), 'Eval passed');
                expect(container.textContent).not.toContain(
                    'going live changes',
                );
                expect(exclusivityCheckbox()).toBeNull();
            },
        );
    });

    it('says the other accounts could not be loaded instead of staying silent when the list failed', async () => {
        harness.queries.set('account.list', {
            data: undefined,
            error: new Error('list down'),
            isError: true,
            isPending: false,
        });
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                render();
                await recordMovedLive();
            },
        );
        expect(container.textContent).toContain(
            "Your other accounts could not be loaded, so what the firm's rules do to them is not shown. Recording this event is refused if the firm's policy suspends another of your accounts; reload to see which.",
        );
        expect(container.textContent).not.toContain('suspends nothing');
        expect(exclusivityCheckbox()).toBeNull();
    });

    it('says the other accounts are still loading and holds the record button until the list settles, so a missing preview never means not loaded yet', async () => {
        harness.queries.delete('account.list');
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                render();
                await recordMovedLive();
                expect(container.textContent).toContain(
                    'Loading your other accounts',
                );
                expect(recordButton().disabled).toBe(true);
                await submitRecord();
                expect(harness.mutateAsync).not.toHaveBeenCalled();
                harness.queries.set(
                    'account.list',
                    answer([
                        listed(MOVED_ID, 'Alpha', {
                            stage: AccountStage.Funded,
                        }),
                        listed(EVAL_ID, 'Bravo eval'),
                    ]),
                );
                render();
                await flush();
                expect(container.textContent).not.toContain(
                    'Loading your other accounts',
                );
                expect(container.textContent).toContain(
                    'Alpha going live changes 1 other account',
                );
                const checkbox = exclusivityCheckbox();
                if (checkbox === null) {
                    throw new Error('no exclusivity checkbox');
                }
                act(() => {
                    checkbox.click();
                });
                expect(recordButton().disabled).toBe(false);
            },
        );
    });

    it('does not hold another event kind while the account list loads', async () => {
        harness.queries.delete('account.list');
        render();
        await pickOption(inputLabelled(container), 'Busted');
        expect(container.textContent).not.toContain(
            'Loading your other accounts',
        );
        expect(recordButton().disabled).toBe(false);
    });

    it('keeps a ledger-only account out of the confirm flow when the moved account itself has no plan to read', async () => {
        await withPolicy(
            new ExclusivityStub(SimAccountEffect.Dormant),
            async () => {
                harness.queries.set(
                    'account.list',
                    answer([
                        listed(MOVED_ID, 'Alpha', {
                            planLabel: 'Hand typed plan',
                            planSerial: null,
                            stage: AccountStage.Funded,
                            tracking: AccountTracking.LedgerOnly,
                        }),
                        listed(EVAL_ID, 'Bravo eval'),
                    ]),
                );
                act(() => {
                    root.render(
                        <EventsSection
                            accountId={MOVED_ID}
                            onFailure={vi.fn()}
                            plan={LEDGER_ONLY_LIFECYCLE_FACTS}
                            query={{ data: [], error: null }}
                            state={{
                                stage: AccountStage.Funded,
                                status: AccountStatus.Active,
                            }}
                            tracking={AccountTracking.LedgerOnly}
                        />,
                    );
                });
                await pickOption(inputLabelled(container), 'Moved live');
                expect(exclusivityCheckbox()).toBeNull();
            },
        );
    });
});
