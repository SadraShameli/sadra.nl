import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompareView } from '~/app/(app)/prop-calculator/(tools)/compare/CompareView';
import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import {
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_RISK_TABLE_NOTE,
} from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';

interface Harness {
    availableCents: null | number;
    isSummaryPending: boolean;
    rulebook: null | RulebookParameters;
    userId: null | string;
}

const harness = vi.hoisted(
    (): Harness => ({
        availableCents: null,
        isSummaryPending: false,
        rulebook: null,
        userId: null,
    }),
);

vi.mock('next/dynamic', async () => {
    const { lazy: lazyComponent } = await import('react');
    return {
        default: (loader: () => Promise<{ default: ComponentType }>) =>
            lazyComponent(loader),
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.userId === null ? null : { user: { id: harness.userId } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: {
                    useQuery: () => ({
                        data:
                            harness.availableCents === null
                                ? undefined
                                : { availableCents: harness.availableCents },
                        isError: false,
                        isPending: harness.isSummaryPending,
                    }),
                },
            },
            rulebook: {
                get: {
                    useQuery: () => ({
                        data: harness.rulebook ?? undefined,
                        isError: false,
                    }),
                },
            },
        },
    },
}));

interface StubProperties {
    bankrollCents?: null | number;
    isBankrollPending?: boolean;
    objective?: string;
}

function stubTable(testId: string) {
    return {
        default: ({
            bankrollCents,
            isBankrollPending,
            objective,
        }: StubProperties) => (
            <div
                data-bankroll={String(bankrollCents)}
                data-objective={objective}
                data-pending={String(isBankrollPending)}
                data-testid={testId}
            />
        ),
    };
}

vi.mock(
    '~/app/(app)/prop-calculator/_components/PlanComparisonTable',
    () => stubTable('plan-table'),
);

vi.mock(
    '~/app/(app)/prop-calculator/_components/FirmComparisonTable',
    () => stubTable('firm-table'),
);

vi.mock('~/app/(app)/prop-calculator/_components/CopySplitSection', () => ({
    default: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: () => null,
}));

function withSwitch(objectiveSwitchCents: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        bankroll: { ...DEFAULT_RULEBOOK.bankroll, objectiveSwitchCents },
    };
}

describe('CompareView mounts the objective chip and hands the objective and bankroll to both tables (PT-83 review)', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function open() {
        window.history.replaceState(null, '', '/');
        await act(async () => {
            root.render(
                <CalculatorProvider>
                    <CompareView />
                </CalculatorProvider>,
            );
            await Promise.resolve();
        });
        await act(async () => {
            await Promise.resolve();
        });
    }

    function table(testId: string): HTMLElement {
        const element = container.querySelector<HTMLElement>(
            `[data-testid="${CSS.escape(testId)}"]`,
        );
        if (element === null) throw new Error(`${testId} missing`);
        return element;
    }

    function pick(objective: SizingObjective) {
        const select = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Ranking objective"]',
        );
        if (select === null) throw new Error('chip select missing');
        act(() => {
            select.value = objective;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        sessionStorage.clear();
        harness.availableCents = null;
        harness.isSummaryPending = false;
        harness.rulebook = null;
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

    it('mounts the chip and passes the chosen objective to both tables', async () => {
        await open();
        expect(
            container.querySelector('select[aria-label="Ranking objective"]'),
        ).not.toBeNull();
        pick(SizingObjective.CycleCash);
        expect(table('plan-table').dataset.objective).toBe(
            SizingObjective.CycleCash,
        );
        expect(table('firm-table').dataset.objective).toBe(
            SizingObjective.CycleCash,
        );
    });

    it('passes the signed-in available bankroll to both tables', async () => {
        harness.userId = 'user-1';
        harness.availableCents = 250_000;
        await open();
        expect(table('plan-table').dataset.bankroll).toBe('250000');
        expect(table('firm-table').dataset.bankroll).toBe('250000');
        expect(table('plan-table').dataset.pending).toBe('false');
    });

    it('passes no bankroll to a signed-out visitor', async () => {
        harness.availableCents = 250_000;
        await open();
        expect(table('plan-table').dataset.bankroll).toBe('null');
        expect(table('firm-table').dataset.bankroll).toBe('null');
    });

    it('marks the bankroll as pending while a signed-in summary is loading', async () => {
        harness.userId = 'user-1';
        harness.isSummaryPending = true;
        await open();
        expect(table('plan-table').dataset.pending).toBe('true');
        expect(table('firm-table').dataset.pending).toBe('true');
    });

    it('does not mark a signed-out visitor as pending', async () => {
        harness.isSummaryPending = true;
        await open();
        expect(table('plan-table').dataset.pending).toBe('false');
    });

    it('prints no not-applicable note for RuinFirst, with or without a bankroll, because the tables rank by it', async () => {
        harness.userId = 'user-1';
        harness.availableCents = 250_000;
        await open();
        pick(SizingObjective.RuinFirst);
        expect(container.textContent).toContain('Objective: ruin first');
        expect(container.textContent).not.toContain(RUIN_FIRST_RISK_TABLE_NOTE);
        expect(container.textContent).not.toContain('sizing stays on');
        expect(container.textContent).not.toContain(
            RUIN_FIRST_NEEDS_BANKROLL_NOTE,
        );
        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        harness.userId = null;
        harness.availableCents = null;
        await open();
        pick(SizingObjective.RuinFirst);
        expect(container.textContent).toContain('Objective: ruin first');
        expect(container.textContent).not.toContain(RUIN_FIRST_RISK_TABLE_NOTE);
        expect(container.textContent).not.toContain('sizing stays on');
    });

    it('says the page ranks by ruin first when the bankroll chose it automatically', async () => {
        harness.userId = 'user-1';
        harness.rulebook = withSwitch(500_000);
        harness.availableCents = 100_000;
        await open();
        const text = container.textContent;
        expect(text).toContain('Chosen automatically');
        expect(text).toContain('$1,000');
        expect(text).toContain('$5,000');
        expect(text).toContain('this page ranks by ruin first');
        expect(text).not.toContain('sizing stays on');
        expect(text).not.toContain(RUIN_FIRST_RISK_TABLE_NOTE);
    });
});
