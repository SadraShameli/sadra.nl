import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventsSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/EventsSection';
import { FeesSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/FeesSection';
import { LedgerOnlySnapshotForm } from '~/app/(app)/prop-calculator/accounts/_components/detail/LedgerOnlySnapshotForm';
import { PayoutsSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/PayoutsSection';
import { ViolationsSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/ViolationsSection';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    LEDGER_ONLY_LIFECYCLE_FACTS,
    SnapshotField,
} from '~/lib/prop-accounts';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const FIRST_DAY = '2026-09-26';
const NEXT_DAY = '2026-09-27';
const EARLIER_DAY = '2026-09-20';

const harness = vi.hoisted(() => {
    const mutateAsync = new Map<
        string,
        ReturnType<typeof vi.fn<(input: unknown) => Promise<unknown>>>
    >();
    const pending = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn<(input: unknown) => Promise<unknown>>((input) =>
            Promise.resolve(input),
        );
        mutateAsync.set(name, created);
        return created;
    }
    function procedure(path: readonly string[]): unknown {
        const name = path.join('.');
        return new Proxy(
            {},
            {
                get: (_target, key) => {
                    if (key === 'useQuery') return () => pending;
                    if (key === 'useMutation') {
                        return () => ({
                            isPending: false,
                            mutate: vi.fn(),
                            mutateAsync: mutateAsyncOf(name),
                        });
                    }
                    return procedure([...path, String(key)]);
                },
            },
        );
    }
    return {
        invalidate: vi.fn(() => Promise.resolve()),
        mutateAsync,
        mutateAsyncOf,
        procedure,
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
        propAccounts: harness.procedure(['propAccounts']),
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

interface FormCase {
    readonly create: string;
    readonly date: (container: ParentNode) => HTMLInputElement;
    readonly dateKey: string;
    readonly fill?: (container: ParentNode) => Promise<void> | void;
    readonly name: string;
    readonly render: (root: Root) => void;
    readonly submit: string;
}

async function clickButton(scope: ParentNode, label: string) {
    await act(async () => {
        const button = [...scope.querySelectorAll('button')].find(
            (candidate) => candidate.textContent.trim() === label,
        );
        if (button === undefined) throw new Error(`no button ${label}`);
        button.focus();
        button.click();
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
}

function crossMidnight() {
    vi.setSystemTime(new Date(`${NEXT_DAY}T00:10:00Z`));
    act(() => {
        window.dispatchEvent(new Event('focus'));
    });
}

function inputLabelled(scope: ParentNode, label: string): HTMLInputElement {
    const labelElement = [...scope.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === label,
    );
    const control =
        labelElement === undefined
            ? null
            : document.querySelector<HTMLInputElement>(
                  `#${CSS.escape(labelElement.htmlFor)}`,
              );
    if (control === null) throw new Error(`no control labelled ${label}`);
    return control;
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

const CASES: readonly FormCase[] = [
    {
        create: 'propAccounts.fee.create',
        date: (container) => inputLabelled(container, 'Paid on'),
        dateKey: 'paidOn',
        fill: (container) => {
            typeInto(inputLabelled(container, 'Amount'), '99');
        },
        name: 'the fee form',
        render: (root) => {
            root.render(
                <FeesSection
                    accountId={ACCOUNT_ID}
                    canRecord
                    onFailure={vi.fn()}
                    plan={null}
                    query={{ data: [], error: null }}
                />,
            );
        },
        submit: 'Add fee',
    },
    {
        create: 'propAccounts.payout.create',
        date: (container) => inputLabelled(container, 'Requested on'),
        dateKey: 'requestedOn',
        fill: (container) => {
            typeInto(inputLabelled(container, 'Gross amount'), '1000');
        },
        name: 'the payout form',
        render: (root) => {
            root.render(
                <PayoutsSection
                    accountId={ACCOUNT_ID}
                    canRecord
                    onFailure={vi.fn()}
                    query={{ data: [], error: null }}
                />,
            );
        },
        submit: 'Add payout',
    },
    {
        create: 'propAccounts.violation.create',
        date: (container) => inputLabelled(container, 'Date'),
        dateKey: 'occurredOn',
        name: 'the violation form',
        render: (root) => {
            root.render(
                <ViolationsSection
                    accountId={ACCOUNT_ID}
                    canRecord
                    onFailure={vi.fn()}
                    query={{ data: [], error: null }}
                />,
            );
        },
        submit: 'Add violation',
    },
    {
        create: 'propAccounts.event.record',
        date: (container) => inputLabelled(container, 'Date'),
        dateKey: 'occurredOn',
        name: 'the event form',
        render: (root) => {
            root.render(
                <EventsSection
                    accountId={ACCOUNT_ID}
                    onFailure={vi.fn()}
                    plan={LEDGER_ONLY_LIFECYCLE_FACTS}
                    query={{ data: [], error: null }}
                    state={{
                        stage: AccountStage.Eval,
                        status: AccountStatus.Active,
                    }}
                    tracking={AccountTracking.LedgerOnly}
                />,
            );
        },
        submit: 'Record event',
    },
    {
        create: 'propAccounts.snapshot.create',
        date: () => {
            const input = document.querySelector<HTMLInputElement>(
                `#snapshot-${SnapshotField.AsOf}`,
            );
            if (input === null) throw new Error('no as of input');
            return input;
        },
        dateKey: 'asOf',
        fill: () => {
            const balance = document.querySelector<HTMLInputElement>(
                `#snapshot-${SnapshotField.Balance}`,
            );
            if (balance === null) throw new Error('no balance input');
            typeInto(balance, '98,500');
            const floor = document.querySelector<HTMLInputElement>(
                `#snapshot-${SnapshotField.DashboardFloor}`,
            );
            if (floor === null) throw new Error('no floor input');
            typeInto(floor, '96,000');
        },
        name: 'the ledger-only snapshot form',
        render: (root) => {
            root.render(
                <LedgerOnlySnapshotForm
                    accountId={ACCOUNT_ID}
                    onFailure={vi.fn()}
                />,
            );
        },
        submit: 'Add snapshot',
    },
];

describe('an open form follows the day across midnight while its date is untouched', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${FIRST_DAY}T23:50:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.mutateAsync.clear();
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

    describe.each(CASES)('$name', (formCase) => {
        function mount() {
            act(() => {
                formCase.render(root);
            });
        }

        it('shows the new day in an untouched date field', () => {
            mount();
            expect(formCase.date(container).value).toBe(FIRST_DAY);
            crossMidnight();
            expect(formCase.date(container).value).toBe(NEXT_DAY);
        });

        it('records the new day when submitted without touching the date', async () => {
            mount();
            crossMidnight();
            await formCase.fill?.(container);
            await clickButton(container, formCase.submit);
            expect(harness.mutateAsyncOf(formCase.create)).toHaveBeenCalledWith(
                expect.objectContaining({ [formCase.dateKey]: NEXT_DAY }),
            );
        });

        it('keeps a date the user already changed', async () => {
            mount();
            typeInto(formCase.date(container), EARLIER_DAY);
            crossMidnight();
            expect(formCase.date(container).value).toBe(EARLIER_DAY);
            await formCase.fill?.(container);
            await clickButton(container, formCase.submit);
            expect(harness.mutateAsyncOf(formCase.create)).toHaveBeenCalledWith(
                expect.objectContaining({ [formCase.dateKey]: EARLIER_DAY }),
            );
        });
    });
});
