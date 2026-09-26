import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StrategyLabView } from '~/app/(app)/prop-calculator/(tools)/strategy-lab/StrategyLabView';
import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { type LabScenario } from '~/app/(app)/prop-calculator/_components/types';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    CorrelationMode,
    DayStopRuleKind,
    InstrumentSymbol,
} from '~/lib/prop-calculator';

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('next/dynamic', async () => {
    const panel =
        await import('~/app/(app)/prop-calculator/_components/StrategyLabPanel');
    return { default: () => panel.default };
});

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: renderNothing,
}));

const REJECTED = 'lab scenarios in this link or saved scenario were rejected';

const sharedScenario: LabScenario = {
    accounts: 3,
    correlation: CorrelationMode.Grouped,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 2,
    id: 'shared',
    instrument: null,
    label: 'Shared from link',
    riskPerTrade: 300,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 2,
    winrate: 0.45,
};

function click(button: HTMLButtonElement) {
    act(() => {
        button.click();
    });
}

function fullLink(lab: string): string {
    const parameters = encodeState(defaultCalculatorState());
    parameters.set('lab', lab);
    return parameters.toString();
}

function labOnlyLink(lab: string): string {
    return new URLSearchParams({ lab }).toString();
}

function labParameter(payload: unknown): string {
    return btoa(JSON.stringify(payload))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}

function renderNothing(): null {
    return null;
}

describe('a shared strategy lab link reaches the rendered lab page (PT-53f)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function buttonNamed(name: string): HTMLButtonElement {
        const button = [...container.querySelectorAll('button')].find((node) =>
            node.textContent.includes(name),
        );
        if (!button) throw new Error(`no ${name} button`);
        return button;
    }

    function isSharedShown(): boolean {
        return container.textContent.includes(
            `${sharedScenario.label}: simulating`,
        );
    }

    function notice(): string | undefined {
        return [...container.querySelectorAll('[role="alert"]')]
            .map((node) => node.textContent)
            .find((text) => text.includes(REJECTED));
    }

    function visit(query: string) {
        window.history.replaceState(null, '', `/?${query}`);
        act(() => {
            root.render(
                <CalculatorProvider>
                    <StrategyLabView />
                </CalculatorProvider>,
            );
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        window.history.replaceState(null, '', '/');
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('names the first failing field in plain words with the win rate in percent', () => {
        visit(fullLink(labParameter([{ ...sharedScenario, winrate: 1.5 }])));
        expect(notice()).toContain(
            'scenario 1: win rate must be between 5% and 95%',
        );
        expect(isSharedShown()).toBe(false);
    });

    it('shows the shared scenarios and no notice for a valid link', () => {
        visit(fullLink(labParameter([sharedScenario])));
        expect(notice()).toBeUndefined();
        expect(isSharedShown()).toBe(true);
    });

    it('shows no notice for a link without a lab parameter', () => {
        const parameters = encodeState(defaultCalculatorState());
        parameters.delete('lab');
        visit(parameters.toString());
        expect(notice()).toBeUndefined();
    });

    it('shows the notice for a lab-only link without a firm', () => {
        visit(
            labOnlyLink(
                labParameter([
                    sharedScenario,
                    { ...sharedScenario, rrRatio: 20 },
                ]),
            ),
        );
        expect(notice()).toContain(
            'scenario 2: reward to risk must be between 0.5 and 10',
        );
    });

    it('shows the scenarios of a valid lab-only link instead of the defaults', () => {
        visit(labOnlyLink(labParameter([sharedScenario])));
        expect(notice()).toBeUndefined();
        expect(isSharedShown()).toBe(true);
    });

    it('shows the notice for a partly corrupt link', () => {
        const parameters = new URLSearchParams(
            fullLink(labParameter([sharedScenario]).slice(0, 25)),
        );
        parameters.set('wr', 'abc');
        parameters.set('ds', 'not-json!');
        parameters.set('firm', 'not-a-firm');
        visit(parameters.toString());
        expect(notice()).toContain(
            'the lab parameter is not readable base64 JSON',
        );
    });

    it.each([
        [
            'an unknown instrument',
            { instrument: 'XYZ', stopPoints: 8 },
            /scenario 1: instrument must be empty or one of ES, MNQ, NQ/,
        ],
        [
            'a stop of zero points',
            { instrument: InstrumentSymbol.MNQ, stopPoints: 0 },
            /scenario 1: stop points must be empty or between 0\.25 and 10,000 points/,
        ],
        [
            'a stop above the bound',
            { instrument: InstrumentSymbol.MNQ, stopPoints: 10_001 },
            /scenario 1: stop points must be empty or between 0\.25 and 10,000 points/,
        ],
    ])(
        'rejects a shared scenario with %s instead of silently dropping it',
        (_name, patch, issue) => {
            visit(fullLink(labParameter([{ ...sharedScenario, ...patch }])));
            expect(notice()).toMatch(issue);
            expect(isSharedShown()).toBe(false);
        },
    );

    it.each(['Add scenario', 'Reset'])(
        'clears the notice once the user presses %s',
        (name) => {
            visit(fullLink(labParameter([{ ...sharedScenario, winrate: 2 }])));
            expect(notice()).toBeDefined();
            click(buttonNamed(name));
            expect(notice()).toBeUndefined();
        },
    );
});
