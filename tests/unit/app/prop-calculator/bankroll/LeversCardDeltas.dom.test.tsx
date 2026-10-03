import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BankrollLeverRowSummary } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';

const harness = vi.hoisted(() => ({
    rows: [] as unknown[],
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant',
    () => ({ useBankrollVariant: () => ({ variant: {} }) }),
);

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest',
    async () => {
        const { ToolsWorkerPhase } =
            await import('~/app/(app)/prop-calculator/_components/useToolsWorker');
        const { ToolsResponseKind } =
            await import('~/app/(app)/prop-calculator/_workers/toolsWorkerMessages');
        return {
            useToolsRequest: () => ({
                cancel: vi.fn(),
                run: vi.fn(),
                state: {
                    phase: ToolsWorkerPhase.Succeeded,
                    result: {
                        kind: ToolsResponseKind.Levers,
                        rows: harness.rows,
                        runId: 1,
                    },
                },
            }),
        };
    },
);

const { LeversCard } =
    await import('~/app/(app)/prop-calculator/_components/bankroll/LeversCard');

function leverRow(
    overrides: Partial<BankrollLeverRowSummary>,
): BankrollLeverRowSummary {
    return {
        deltaAttemptPaysProbability: 0,
        deltaEvPerAttempt: 0,
        deltaMonthlyNet: 0,
        deltaPassProbability: 0,
        evPerAttempt: 45,
        kind: BankrollLeverKind.Base,
        label: null,
        lossRisk: 0.18,
        monthlyNet: 500,
        passProbability: 0.6,
        value: null,
        ...overrides,
    };
}

describe('LeversCard changes (PT-81 step 3)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    function rowCells(startsWith: string): string[] {
        const row = [...container.querySelectorAll(':scope tbody tr')].find(
            (tr) => tr.textContent.startsWith(startsWith),
        );
        if (row === undefined) throw new Error(`no row ${startsWith}`);
        return [...row.querySelectorAll('td')].map((td) => td.textContent);
    }

    function headers(): string[] {
        return [...container.querySelectorAll(':scope th')].map(
            (th) => th.textContent,
        );
    }

    function render(): void {
        act(() => {
            root.render(<LeversCard />);
        });
    }

    it('shows a risk lever row with its three changes against the base row', () => {
        harness.rows = [
            leverRow({}),
            leverRow({
                deltaAttemptPaysProbability: -0.01,
                deltaPassProbability: 0.02,
                kind: BankrollLeverKind.Risk,
                lossRisk: 0.23,
                value: 300,
            }),
        ];
        render();
        expect(headers()).toEqual(
            expect.arrayContaining([
                'Δ P(pass)',
                'Δ P(pays)',
                'Δ Loss risk',
                'Loss risk',
            ]),
        );
        const cells = rowCells('Risk');
        expect(cells).toContain('+2.0pp');
        expect(cells).toContain('-1.0pp');
        expect(cells).toContain('+5.0pp');
        expect(cells).toContain('23.0%');
    });

    it('shows a loss-risk fall as a negative change', () => {
        harness.rows = [
            leverRow({}),
            leverRow({
                kind: BankrollLeverKind.TradesPerDay,
                lossRisk: 0.1,
                value: 1,
            }),
        ];
        render();
        expect(rowCells('Trades per day')).toContain('-8.0pp');
    });

    it('shows the base row with zero changes', () => {
        harness.rows = [
            leverRow({}),
            leverRow({ kind: BankrollLeverKind.Risk, value: 300 }),
        ];
        render();
        const cells = rowCells('Base');
        expect(cells.filter((cell) => cell === '·')).toHaveLength(3);
    });

    it('shows n/a for the loss-risk change when either loss risk is missing', () => {
        harness.rows = [
            leverRow({}),
            leverRow({
                kind: BankrollLeverKind.RequestSize,
                lossRisk: null,
                value: 500,
            }),
        ];
        render();
        expect(
            rowCells('Payout request').filter((cell) => cell === 'n/a'),
        ).toHaveLength(2);
    });
});
