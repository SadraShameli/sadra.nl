import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type EvSwingRowView,
    type EvSwingView,
    type OneStepTreeView,
    type RiskCandidatesView,
    ValueSectionKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import { EvSwingRow } from '~/app/(app)/prop-calculator/accounts/_components/advice/EvSwingRow';
import { OneStepTree } from '~/app/(app)/prop-calculator/accounts/_components/advice/OneStepTree';
import {
    DOCUMENTED_RUNG_MARK,
    ENGINE_OPTIMUM_MARK,
    RiskCandidatesTable,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/RiskCandidatesTable';

const VIDEO_FIGURES = ['600', '350', '466'];

const TREE: OneStepTreeView = {
    continuation: { standardError: 12, value: 980 },
    replacementFee: null,
    valueAfterLoss: { standardError: 8, value: 700 },
    valueAfterWin: { standardError: 10, value: 1400 },
    valueNow: { standardError: 10, value: 1000 },
    winProbability: 0.4,
};

const ROW: EvSwingRowView = {
    bust: null,
    index: 1,
    lossDelta: { standardError: 5, value: -300 },
    risk: { isFallback: false, label: 'Account dollars', text: '$250' },
    riskDollars: 250,
    rr: 2,
    winDelta: { standardError: 6, value: 400 },
    winProbability: 0.4,
};

const CANDIDATES: RiskCandidatesView = {
    isRanked: true,
    label: 'one-step comparison, documented sizing afterwards',
    rows: [
        {
            continuation: { standardError: 6, value: 1500 },
            contractsText: '2 contracts',
            isDocumented: false,
            isEngineOptimum: true,
            monthlyNetCharge: 20,
            netOfDurationCharge: 1480,
            rank: 1,
            risk: { isFallback: false, label: 'Account dollars', text: '$125' },
            riskDollars: 125,
        },
        {
            continuation: { standardError: 6, value: 1100 },
            contractsText: null,
            isDocumented: true,
            isEngineOptimum: false,
            monthlyNetCharge: 20,
            netOfDurationCharge: 1080,
            rank: 2,
            risk: { isFallback: false, label: 'Account dollars', text: '$250' },
            riskDollars: 250,
        },
    ],
    sizingNote: null,
};

const EVAL_CANDIDATES: RiskCandidatesView = {
    ...CANDIDATES,
    isRanked: false,
    rows: CANDIDATES.rows.toReversed(),
    sizingNote: 'Eval sizing is the maximum allowed risk under a daily cap.',
};

describe('value views (PT-67)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function render(node: React.ReactNode) {
        act(() => {
            root.render(node);
        });
    }

    function renderRow(view: EvSwingView) {
        render(
            <ul>
                <EvSwingRow view={view} />
            </ul>,
        );
    }

    describe('OneStepTree', () => {
        it('shows V now, V after a win, V after a loss and p, each with its standard error', () => {
            render(<OneStepTree tree={TREE} />);

            const text = container.textContent;
            expect(text).toContain('Now');
            expect(text).toContain('$1,000 ± $10');
            expect(text).toContain('After a win (40%)');
            expect(text).toContain('$1,400 ± $10');
            expect(text).toContain('After a loss (60%)');
            expect(text).toContain('$700 ± $8');
        });

        it('shows the continuation value p x V(win) + (1 - p) x V(loss)', () => {
            render(<OneStepTree tree={TREE} />);

            expect(container.textContent).toContain('Continuation value');
            expect(container.textContent).toContain('$980 ± $12');
        });

        it('names the continuation value as credit-free, apart from the credit-inclusive column of the candidates table', () => {
            render(<OneStepTree tree={TREE} />);

            expect(container.textContent).toContain(
                'Continuation value (credit-free)',
            );
        });

        it('says the loss branch of a busting loss is a fresh eval net of its replacement fee, and says nothing of a fee otherwise', () => {
            render(<OneStepTree tree={{ ...TREE, replacementFee: 109 }} />);

            expect(container.textContent).toContain(
                'a loss that busts the account is valued as a fresh eval net of its $109 replacement fee',
            );

            render(<OneStepTree tree={TREE} />);

            expect(container.textContent).not.toContain('replacement fee');
        });

        it('states the credit-free basis', () => {
            render(<OneStepTree tree={TREE} />);

            expect(container.textContent).toContain('credit-free');
        });

        it('exposes the three outcomes as a labelled group', () => {
            render(<OneStepTree tree={TREE} />);

            expect(
                container
                    .querySelector('[role="group"]')
                    ?.getAttribute('aria-label'),
            ).toBe('One-step value tree');
        });
    });

    describe('EvSwingRow', () => {
        it('reads win: +$X EV, loss: -$Y EV with the risk in the chosen unit', () => {
            renderRow({ kind: ValueSectionKind.Ready, row: ROW });

            const text = container.textContent;
            expect(text).toContain('Trade 1');
            expect(text).toContain('$250 (Account dollars)');
            expect(text).toContain('win: +$400 EV (± $6)');
            expect(text).toContain('loss: -$300 EV (± $5)');
            expect(text).toContain('40%');
        });

        it('says a loss that busts the account has a rebuy lag', () => {
            renderRow({
                kind: ValueSectionKind.Ready,
                row: { ...ROW, bust: { rebuyLagDays: 4, replacementFee: 109 } },
            });

            expect(container.textContent).toContain('busts the account');
            expect(container.textContent).toContain('4-day rebuy lag');
            expect(container.textContent).toContain(
                'net of its replacement fee of $109',
            );
        });

        it('says so when the rebuy lag is assumed to be zero', () => {
            renderRow({
                kind: ValueSectionKind.Ready,
                row: { ...ROW, bust: { rebuyLagDays: 0, replacementFee: 109 } },
            });

            expect(container.textContent).toContain('no rebuy lag assumed');
        });

        it('states a left-out swing instead of dropping it', () => {
            renderRow({
                index: 2,
                kind: ValueSectionKind.Failed,
                reason: 'the engine refused this start',
            });

            expect(container.textContent).toContain('Trade 2');
            expect(container.textContent).toContain(
                'Left out: the engine refused this start',
            );
        });

        it('states a not-modeled swing', () => {
            renderRow({ index: 3, kind: ValueSectionKind.NotModeled });

            expect(container.textContent).toContain('Trade 3');
            expect(container.textContent).toContain('not modeled');
        });
    });

    describe('RiskCandidatesTable', () => {
        it('labels the comparison as one step with documented sizing afterwards', () => {
            render(<RiskCandidatesTable view={CANDIDATES} />);

            expect(container.textContent).toContain(
                'one-step comparison, documented sizing afterwards',
            );
        });

        it('states that the documented rung stays the plan and the table is not a recommendation to change it', () => {
            render(<RiskCandidatesTable view={CANDIDATES} />);

            expect(container.textContent).toContain(
                'The documented rung stays your plan: this table compares one trade and does not change it.',
            );
        });

        it('names the two value columns apart from the credit-free tree value', () => {
            render(<RiskCandidatesTable view={CANDIDATES} />);

            const headers = [...container.querySelectorAll('th')].map(
                (header) => header.textContent,
            );
            expect(headers).toContain('Continuation value (with credit)');
            expect(headers).toContain('Net of duration charge');
        });

        it('ranks the candidates in order and marks the documented rung', () => {
            render(<RiskCandidatesTable view={CANDIDATES} />);

            const rows = [...container.querySelectorAll(':scope tbody tr')];
            expect(rows).toHaveLength(2);
            expect(rows[0]?.textContent).toContain('$125');
            expect(rows[0]?.textContent).toContain('2 contracts');
            expect(rows[0]?.textContent).not.toContain('Documented rung');
            expect(rows[1]?.textContent).toContain('$250');
            expect(rows[1]?.textContent).toContain('Documented rung');
        });

        it('shows the rank column and no engine optimum mark for a funded table', () => {
            render(<RiskCandidatesTable view={CANDIDATES} />);

            const headers = [...container.querySelectorAll('th')].map(
                (header) => header.textContent,
            );
            expect(headers).toContain('Rank');
            expect(container.textContent).not.toContain(ENGINE_OPTIMUM_MARK);
        });

        it('shows no rank column for an eval table, marks the engine optimum for one step and states the sizing rule', () => {
            render(<RiskCandidatesTable view={EVAL_CANDIDATES} />);

            const headers = [...container.querySelectorAll('th')].map(
                (header) => header.textContent,
            );
            expect(headers).not.toContain('Rank');
            const rows = [...container.querySelectorAll(':scope tbody tr')];
            expect(rows[0]?.textContent).toContain('$250');
            expect(rows[0]?.textContent).toContain(DOCUMENTED_RUNG_MARK);
            expect(rows[1]?.textContent).toContain('$125');
            expect(rows[1]?.textContent).toContain(ENGINE_OPTIMUM_MARK);
            expect(container.textContent).toContain(
                'Eval sizing is the maximum allowed risk under a daily cap.',
            );
        });

        it('shows each continuation value with its standard error', () => {
            render(<RiskCandidatesTable view={CANDIDATES} />);

            expect(container.textContent).toContain('$1,500 ± $6');
        });
    });

    describe('what the views never show', () => {
        it('contains none of the video figures in any rendered text', () => {
            render(
                <>
                    <OneStepTree tree={TREE} />
                    <ul>
                        <EvSwingRow
                            view={{ kind: ValueSectionKind.Ready, row: ROW }}
                        />
                        <EvSwingRow
                            view={{
                                index: 2,
                                kind: ValueSectionKind.Failed,
                                reason: 'refused',
                            }}
                        />
                    </ul>
                    <RiskCandidatesTable view={CANDIDATES} />
                </>,
            );

            for (const figure of VIDEO_FIGURES) {
                expect(container.textContent).not.toContain(figure);
            }
        });
    });
});
