import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveView } from '~/app/(app)/prop-calculator/(tools)/live/LiveView';
import { EvalLadderScope } from '~/app/(app)/prop-calculator/_components/AppliedEvalLadderNotice';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    LIVE_APPROXIMATION_NOTE,
    LIVE_TOOL_PAYOUT_REQUEST_REFUSAL,
    LIVE_TOOL_SIZING_REFUSAL,
} from '~/app/(app)/prop-calculator/_components/live/liveToolModel';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import {
    ALL_FIRMS,
    FirmId,
    InstrumentSymbol,
    type Plan,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/firms';

interface RulebookQueryResult {
    data: RulebookParameters | undefined;
}

const rulebookQueryMock = vi.fn(
    (_input?: unknown, _options?: unknown): RulebookQueryResult => ({
        data: undefined,
    }),
);
const sessionMock = vi.fn(() => ({
    data: null as null | { user: { id: string } },
    error: null,
    isPending: false,
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => sessionMock(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: {
                    useQuery: (input: unknown, options: unknown) =>
                        rulebookQueryMock(input, options),
                },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

const inputsSummaryProps = vi.hoisted(() => ({
    calls: [] as { evalLadderScope?: unknown }[],
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: (props: { evalLadderScope?: unknown }) => {
        inputsSummaryProps.calls.push(props);
        return null;
    },
}));

const currentState = vi.hoisted(() => ({
    state: null as CalculatorState | null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({ state: currentState.state }),
}));

const NOTICE = '.app-prop-calculator__simulation-failure';
const SKELETON = '.animate-pulse';

function apexPlan(): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === FirmId.Apex);
    const plan = firm?.plans[0];
    if (plan === undefined) throw new Error('no Apex plan in registry');
    return plan;
}

function e8Plan(): Plan {
    const firm = ALL_FIRMS.find(
        (candidate) => candidate.id === FirmId.E8Futures,
    );
    const plan = firm?.plans[0];
    if (plan === undefined) throw new Error('no E8 Futures plan in registry');
    return plan;
}

function renderNothing(): null {
    return null;
}

function stateWith(patch: Partial<CalculatorState>): CalculatorState {
    return { ...defaultCalculatorState(), ...patch };
}

function topStepLfaPlan(): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === FirmId.TopStep);
    const plan = firm?.plans.find(
        (candidate) =>
            livePlanApplicability(candidate.id).kind ===
            LiveApplicabilityKind.Builder,
    );
    if (plan === undefined) {
        throw new Error('no TopStep LFA-eligible plan in registry');
    }
    return plan;
}

describe('LiveView (PT-31b)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: ReactNode) {
        act(() => {
            root.render(node);
        });
        for (let round = 0; round < 4; round++) {
            act(() => {
                vi.runOnlyPendingTimers();
            });
        }
    }

    function noticeTexts(): string[] {
        return [...container.querySelectorAll(NOTICE)].map(
            (node) => node.textContent,
        );
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        inputsSummaryProps.calls.length = 0;
        rulebookQueryMock.mockClear();
        rulebookQueryMock.mockReturnValue({ data: undefined });
        sessionMock.mockReturnValue({
            data: null,
            error: null,
            isPending: false,
        });
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
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('starts with ToolPageHeading for Live, so the <h1> and toolbar come first', () => {
        const source = readLiveViewSource();
        expect(firstJsxTagAfterReturn(source)).toBe('ToolPageHeading');
        expect(source).toContain('<ToolPageHeading toolId={ToolId.Live} />');
    });

    it('tells the inputs summary the eval ladder is not used here, because the live result ignores it (PT-97 review)', () => {
        currentState.state = stateWith({
            instrument: InstrumentSymbol.NQ,
            plan: apexPlan(),
            stopPoints: 10,
        });
        render(<LiveView />);
        expect(inputsSummaryProps.calls.length).toBeGreaterThan(0);
        for (const props of inputsSummaryProps.calls) {
            expect(props.evalLadderScope).toBe(EvalLadderScope.NotUsedHere);
        }
    });

    it('shows a "no live stage modeled" notice for a firm with no live program, not a SimulationFailureNotice', () => {
        currentState.state = stateWith({ plan: e8Plan() });
        render(<LiveView />);
        expect(noticeTexts()).toEqual([]);
        expect(container.textContent).toContain('No live stage modeled');
        expect(container.querySelector(SKELETON)).toBeNull();
    });

    it('shows a SimulationFailureNotice when the calculator has no instrument or stop for a modeled plan', () => {
        currentState.state = stateWith({ plan: apexPlan() });
        render(<LiveView />);
        expect(noticeTexts()).toEqual([LIVE_TOOL_SIZING_REFUSAL]);
        expect(container.querySelector(SKELETON)).toBeNull();
    });

    it('shows a SimulationFailureNotice, not a crash, when the payout request size is $0', () => {
        currentState.state = stateWith({
            instrument: InstrumentSymbol.NQ,
            payoutRequestSize: 0,
            plan: apexPlan(),
            stopPoints: 10,
        });
        render(<LiveView />);
        expect(noticeTexts()).toEqual([LIVE_TOOL_PAYOUT_REQUEST_REFUSAL]);
        expect(container.querySelector(SKELETON)).toBeNull();
    });

    it('shows the firm-level approximation note for TopStep LFA, but not for a verified Apex plan', () => {
        currentState.state = stateWith({
            instrument: InstrumentSymbol.NQ,
            plan: topStepLfaPlan(),
            stopPoints: 10,
        });
        render(<LiveView />);
        expect(container.textContent).toContain(LIVE_APPROXIMATION_NOTE);

        currentState.state = stateWith({
            instrument: InstrumentSymbol.NQ,
            plan: apexPlan(),
            stopPoints: 10,
        });
        render(<LiveView />);
        expect(container.textContent).not.toContain(LIVE_APPROXIMATION_NOTE);
    });

    it('shows a Skeleton while pending, then the result for a modeled plan with an instrument and stop', () => {
        const state = stateWith({
            instrument: InstrumentSymbol.NQ,
            plan: apexPlan(),
            stopPoints: 10,
        });
        currentState.state = state;
        act(() => {
            root.render(<LiveView />);
        });
        expect(container.querySelector(SKELETON)).not.toBeNull();
        for (let round = 0; round < 4; round++) {
            act(() => {
                vi.runOnlyPendingTimers();
            });
        }
        expect(container.querySelector(SKELETON)).toBeNull();
        expect(noticeTexts()).toEqual([]);
        expect(container.textContent).toMatch(/bust probability/i);
    });

    it('queries the rulebook only with a session, and uses it once signed in', () => {
        const state = stateWith({
            instrument: InstrumentSymbol.NQ,
            plan: apexPlan(),
            stopPoints: 10,
        });
        currentState.state = state;
        render(<LiveView />);
        expect(rulebookQueryMock).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({ enabled: false }),
        );

        sessionMock.mockReturnValue({
            data: { user: { id: 'user-a' } },
            error: null,
            isPending: false,
        });
        rulebookQueryMock.mockReturnValue({
            data: {
                ...DEFAULT_RULEBOOK,
                payout: {
                    ...DEFAULT_RULEBOOK.payout,
                    retainedCushionCents: 90_000_000,
                },
            },
        });
        render(<LiveView />);
        expect(rulebookQueryMock).toHaveBeenLastCalledWith(
            undefined,
            expect.objectContaining({ enabled: true }),
        );
    });
});

function firstJsxTagAfterReturn(source: string): string {
    const match = /return \(\s*<>\s*<(\w+)/.exec(source);
    return match?.[1] ?? '';
}

function readLiveViewSource(): string {
    return readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'prop-calculator',
            '(tools)',
            'live',
            'LiveView.tsx',
        ),
        'utf8',
    );
}
