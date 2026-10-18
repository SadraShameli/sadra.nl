import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    RulebookSource,
    rulebookSourceNotice,
} from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

interface Harness {
    data: typeof DEFAULT_RULEBOOK | undefined;
    isError: boolean;
    sessionError: Error | null;
    sessionPending: boolean;
    userId: null | string;
}

const harness = vi.hoisted((): Harness => ({
    data: undefined,
    isError: false,
    sessionError: null,
    sessionPending: false,
    userId: null,
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.userId === null ? null : { user: { id: harness.userId } },
        error: harness.sessionError,
        isPending: harness.sessionPending,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: {
                    useQuery: () => ({
                        data: harness.data,
                        isError: harness.isError,
                    }),
                },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({
        simInputs: {},
        state: defaultCalculatorState(),
    }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/bankroll/SetupCard', () => ({
    SetupCard: () => null,
}));
vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/ProjectionCard',
    () => ({ ProjectionCard: () => null }),
);
vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/TwoStrategiesCard',
    () => ({ TwoStrategiesCard: () => null }),
);
vi.mock('~/app/(app)/prop-calculator/_components/bankroll/BatchCard', () => ({
    BatchCard: () => null,
}));
vi.mock('~/app/(app)/prop-calculator/_components/bankroll/SameEvCard', () => ({
    SameEvCard: () => null,
}));
vi.mock('~/app/(app)/prop-calculator/_components/bankroll/LeversCard', () => ({
    LeversCard: () => null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest',
    () => ({
        useToolsRequest: () => ({
            cancel: vi.fn(),
            run: vi.fn(),
            state: { phase: 'idle' },
        }),
    }),
);

const { BankrollView } =
    await import('~/app/(app)/prop-calculator/(tools)/bankroll/BankrollView');
const { default: TakeProfitWhatIf } =
    await import('~/app/(app)/prop-calculator/_components/TakeProfitWhatIf');

const FAILED_TEXT = rulebookSourceNotice(RulebookSource.DefaultFailed)?.text;
const LOADING_TEXT = rulebookSourceNotice(RulebookSource.DefaultLoading)?.text;
const SESSION_FAILED_TEXT = rulebookSourceNotice(
    RulebookSource.DefaultSessionFailed,
)?.text;
const SESSION_PENDING_TEXT = rulebookSourceNotice(
    RulebookSource.DefaultSessionPending,
)?.text;

function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

describe('the bankroll page says which rulebook it used (PT-63e, F-V24)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.data = undefined;
        harness.isError = false;
        harness.sessionError = null;
        harness.sessionPending = false;
        harness.userId = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('has the notice texts to look for', () => {
        expect(FAILED_TEXT).toContain('could not be loaded');
        expect(LOADING_TEXT).toContain('Loading your rulebook');
        expect(SESSION_FAILED_TEXT).toContain('sign-in could not be checked');
        expect(SESSION_PENDING_TEXT).toContain('Checking your sign-in');
    });

    describe.each([{ name: 'BankrollView', View: BankrollView }])(
        '$name',
        ({ View }) => {
            function render(): string {
                act(() => {
                    root.render(<View />);
                });
                return container.textContent;
            }

            it('says the default rulebook is used because the session is still pending, as a status, once', () => {
                harness.sessionPending = true;
                const text = render();
                expect(occurrences(text, SESSION_PENDING_TEXT ?? '')).toBe(1);
                expect(
                    container.querySelector('[role="status"]')?.textContent,
                ).toBe(SESSION_PENDING_TEXT);
            });

            it('says the default rulebook is used because the session request failed, as an alert, once', () => {
                harness.sessionError = new Error('session down');
                const text = render();
                expect(occurrences(text, SESSION_FAILED_TEXT ?? '')).toBe(1);
                expect(
                    container.querySelector('[role="alert"]')?.textContent,
                ).toBe(SESSION_FAILED_TEXT);
            });

            it('says the default rulebook is used because the signed-in query failed, as an alert, once', () => {
                harness.userId = 'user-1';
                harness.isError = true;
                const text = render();
                expect(occurrences(text, FAILED_TEXT ?? '')).toBe(1);
                expect(
                    container.querySelector('[role="alert"]')?.textContent,
                ).toBe(FAILED_TEXT);
            });

            it('says the default rulebook is used until the signed-in query loads, as a status, once', () => {
                harness.userId = 'user-1';
                const text = render();
                expect(occurrences(text, LOADING_TEXT ?? '')).toBe(1);
                expect(
                    container.querySelector('[role="status"]')?.textContent,
                ).toBe(LOADING_TEXT);
            });

            it('says nothing for a signed-out visitor', () => {
                const text = render();
                expect(text).not.toContain('Loading your rulebook');
                expect(text).not.toContain('could not be loaded');
                expect(container.querySelector('[role="alert"]')).toBeNull();
                expect(container.querySelector('[role="status"]')).toBeNull();
            });

            it('says nothing once the user rulebook loaded', () => {
                harness.userId = 'user-1';
                harness.data = DEFAULT_RULEBOOK;
                const text = render();
                expect(text).not.toContain('Loading your rulebook');
                expect(text).not.toContain('could not be loaded');
            });
        },
    );
});

describe('TakeProfitWhatIf leaves the page notice to its host (PT-63e)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.data = undefined;
        harness.isError = true;
        harness.sessionError = null;
        harness.sessionPending = false;
        harness.userId = 'user-1';
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('prints no rulebook notice of its own, so the sizing page shows one', () => {
        act(() => {
            root.render(<TakeProfitWhatIf />);
        });
        expect(container.textContent).not.toContain('could not be loaded');
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });
});
