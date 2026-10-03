import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    FundedSweepProgress,
    FundedSweepResult,
} from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { TopStepVariant } from '~/lib/prop-calculator/core';
import {
    FUNDED_ROW_HEADERS,
    FundedCandidateBuildKind,
    FundedCandidateRefusal,
    fundedRowStandardErrors,
    fundedSortDescription,
    FundedSortKey,
    type FundedSweepRow,
    sortFundedResults,
} from '~/lib/prop-calculator/optimize';
import { simulate } from '~/lib/prop-calculator/simulator';

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: null,
        error: null,
        isPending: false,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: renderNothing,
}));

const currentState = vi.hoisted(() => ({
    state: null as CalculatorState | null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    ObjectiveQueryFailure: {
        BankrollSummary: 'bankroll-summary',
        Rulebook: 'rulebook',
    },
    useCalculatorActions: () => ({ dispatch: vi.fn() }),
    useCalculatorInputs: () => ({ state: currentState.state }),
    useObjectiveChoice: () => ({ automaticBasis: null, queryFailure: null }),
}));

const sweepBox = vi.hoisted(() => ({
    phase: 'running',
    progress: null as FundedSweepProgress | null,
    reason: null as null | string,
    result: null as FundedSweepResult | null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/fundedOptimizer/useFundedSweep',
    () => ({
        useFundedSweep: () => ({
            phase: sweepBox.phase,
            progress: sweepBox.progress,
            reason: sweepBox.reason,
            result: sweepBox.result,
        }),
    }),
);

function renderNothing(): null {
    return null;
}

const { FundedOptimizerView } =
    await import('~/app/(app)/prop-calculator/(tools)/funded-optimizer/FundedOptimizerView');

const TRIALS = 20;

function topStepPlan() {
    const plan = findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    );
    if (plan === undefined || plan === null) {
        throw new Error('expected the TopStep 50K Standard/Standard plan');
    }
    return plan;
}

const PLAN = topStepPlan();

function simulated(riskPerTrade: number) {
    return simulate({
        fundedHorizonDays: 20,
        liveTransferHazard: undefined,
        maxEvalDays: 20,
        plan: PLAN,
        riskPerTrade,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: TRIALS,
        winrate: 0.5,
    });
}

const ROWS: FundedSweepRow[] = [
    { candidate: { label: 'flat $200', overrides: {} }, out: simulated(200) },
    { candidate: { label: 'flat $400', overrides: {} }, out: simulated(400) },
];

function built(notes: string[] = []): FundedSweepResult {
    return { kind: FundedCandidateBuildKind.Built, notes, rows: ROWS };
}

function stateWith(patch: Partial<CalculatorState> = {}): CalculatorState {
    return {
        ...defaultCalculatorState(),
        plan: PLAN,
        trials: TRIALS,
        ...patch,
    };
}

describe('FundedOptimizerView renders the sweep table (F-27 (3), (5), (7), (10))', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        patch: Partial<CalculatorState> = {},
        result: FundedSweepResult | null = built(),
    ): void {
        currentState.state = stateWith(patch);
        sweepBox.result = result;
        sweepBox.phase =
            result === null ? WorkerTaskPhase.Running : WorkerTaskPhase.Done;
        act(() => {
            root.render(<FundedOptimizerView />);
        });
    }

    function headerTexts(): string[] {
        return [...container.querySelectorAll(':scope thead th')].map(
            (header) => header.textContent,
        );
    }

    function rowTexts(): string[][] {
        return [...container.querySelectorAll(':scope tbody tr')].map((row) =>
            [...row.querySelectorAll(':scope td')].map(
                (cell) => cell.textContent,
            ),
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        sweepBox.phase = WorkerTaskPhase.Running;
        sweepBox.progress = null;
        sweepBox.reason = null;
        sweepBox.result = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        currentState.state = null;
        vi.unstubAllGlobals();
    });

    it('prints the headers of the shared list and one row per policy in the ranked order', () => {
        render();
        expect(headerTexts()).toStrictEqual([...FUNDED_ROW_HEADERS]);
        const ranked = sortFundedResults(ROWS, FundedSortKey.Monthly).map(
            (row) => row.candidate.label,
        );
        expect(rowTexts().map((cells) => cells[0])).toStrictEqual(ranked);
    });

    it('shows the standard error beside every estimated column, never only the monthly net', () => {
        render();
        const ranked = sortFundedResults(ROWS, FundedSortKey.Monthly);
        const shown = rowTexts();
        for (const [index, row] of ranked.entries()) {
            const errors = fundedRowStandardErrors(row.out, TRIALS);
            const cells = shown[index] ?? [];
            expect(cells).toHaveLength(FUNDED_ROW_HEADERS.length);
            expect(cells[0]).toBe(row.candidate.label);
            for (const [column, error] of errors.entries()) {
                if (error === null) continue;
                expect(cells[column]).toContain(`(SE ${error})`);
            }
            expect(
                cells.filter((cell) => cell.includes('(SE ')),
            ).toHaveLength(FUNDED_ROW_HEADERS.length - 1);
        }
    });

    it('ranks by cycle net under the cycle cash objective', () => {
        render({ objective: SizingObjective.CycleCash });
        const ranked = sortFundedResults(ROWS, FundedSortKey.Cycle).map(
            (row) => row.candidate.label,
        );
        expect(rowTexts().map((cells) => cells[0])).toStrictEqual(ranked);
    });

    it('prints the placement notes and the ranking description', () => {
        render({}, built(['flat $150 left out: below one contract']));
        expect(container.textContent).toContain(
            'flat $150 left out: below one contract',
        );
        expect(container.textContent).toContain(
            fundedSortDescription(FundedSortKey.Monthly, {
                fundedHorizonDays: 20,
                maxEvalDays: 20,
                plan: PLAN,
                riskPerTrade: 250,
                rrRatio: 2,
                seed: 1,
                tradesPerDay: 4,
                trials: TRIALS,
                winrate: 0.5,
            }).trim().slice(0, 40),
        );
    });

    it('explains survivors as the CLI does, out of the trials the sweep ran', () => {
        render();
        expect(container.textContent).toContain(
            `survivors = trials (out of ${TRIALS}) that passed eval and never busted funded`,
        );
    });

    it('says when the trial count was reduced to the sweep maximum', () => {
        render({ trials: 20_000 });
        expect(container.textContent).toContain(
            'trials reduced from 20,000 to 5,000',
        );
    });

    it('says nothing about trials when none were cut', () => {
        render();
        expect(container.textContent).not.toContain('trials reduced');
    });

    it('prints the live-transfer assumption and continuation notes once the hazard is an input', () => {
        render({ liveTransferHazard: 0.25 });
        expect(container.textContent).toContain(
            'your assumption, not a firm rule',
        );
    });

    it('prints no live-transfer line without a hazard', () => {
        render({ liveTransferHazard: 0 });
        expect(container.textContent).not.toContain(
            'your assumption, not a firm rule',
        );
    });

    it('shows how many of the policies are done while the sweep runs', () => {
        sweepBox.progress = { completed: 2, total: 6 };
        render({}, null);
        expect(container.textContent).toContain('2 of 6 policies');
        expect(container.querySelector('table')).toBeNull();
    });

    it('shows a loading state and no count before the first progress event', () => {
        render({}, null);
        expect(container.textContent).not.toContain('policies');
    });

    it.each([
        [
            {
                issues: 'flat: expected a number',
                kind: FundedCandidateRefusal.InvalidLists,
            },
            'Invalid funded candidates: flat: expected a number',
        ],
        [
            {
                flatsBelowOneContract: [],
                kind: FundedCandidateRefusal.NoCandidates,
            },
            'No funded policies to test at this risk and stop.',
        ],
        [
            { kind: FundedCandidateRefusal.PercentNeedsStop, percent: [10] },
            'Percent-of-cushion candidates need an instrument and a stop.',
        ],
    ] as const)('says why a refused sweep has no table (%#)', (refusal, text) => {
        render(
            {},
            {
                kind: FundedCandidateBuildKind.Refused,
                refusal: refusal as never,
            },
        );
        expect(container.textContent).toContain(text);
        expect(container.querySelector('table')).toBeNull();
    });

    it('shows a worker failure as the failure notice', () => {
        currentState.state = stateWith();
        sweepBox.reason = 'the worker crashed';
        sweepBox.phase = WorkerTaskPhase.Failed;
        act(() => {
            root.render(<FundedOptimizerView />);
        });
        expect(container.textContent).toContain('the worker crashed');
        expect(container.querySelector('table')).toBeNull();
    });
});
