import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PropCalculatorToolsLayout from '~/app/(app)/prop-calculator/(tools)/layout';
import { useCalculatorActions } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { LinkParameter } from '~/app/(app)/prop-calculator/_components/types';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { DayStopRuleKind, InstrumentSymbol } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

vi.mock('next/navigation', () => ({
    usePathname: () => routes.propCalculator.simulator,
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('~/app/(app)/prop-calculator/_components/PropCalculatorSubnav', () => ({
    PropCalculatorSubnav: () => null,
}));

const REFUSED = 'in this link or saved scenario was refused';

const validPortfolio = [
    {
        activationDiscountPercent: 0,
        count: 1,
        evalDiscountPercent: 0,
        firmId: 'apex',
        id: 'wire-1',
        instrument: InstrumentSymbol.NQ,
        linkActivationDiscount: false,
        monthlySubscriptionDiscountPercent: 0,
        planId: 'apex-50000-eod',
        resetDiscountPercent: 0,
        stopPoints: 10,
    },
];

function blob(payload: unknown): string {
    return btoa(JSON.stringify(payload))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}

function link(entries: Record<string, string>): string {
    const parameters = encodeState(defaultCalculatorState());
    for (const [key, value] of Object.entries(entries))
        parameters.set(key, value);
    return parameters.toString();
}

function UserActions() {
    const { setDayStop, setEvalDayPolicy, setPortfolio } =
        useCalculatorActions();
    return (
        <div>
            <button
                onClick={() => setDayStop({ kind: DayStopRuleKind.None })}
                type="button"
            >
                user sets day stop
            </button>
            <button onClick={() => setEvalDayPolicy(null)} type="button">
                user sets eval ladder
            </button>
            <button onClick={() => setPortfolio([])} type="button">
                user sets portfolio
            </button>
        </div>
    );
}

describe('a refused ds, dp or pf link parameter reaches every tool page (PT-53g)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function click(name: string) {
        const button = [...container.querySelectorAll('button')].find((node) =>
            node.textContent.includes(name),
        );
        if (!button) throw new Error(`no ${name} button`);
        act(() => {
            button.click();
        });
    }

    function notices(): string[] {
        return [...container.querySelectorAll('[role="alert"]')]
            .map((node) => node.textContent)
            .filter((text) => text.includes(REFUSED));
    }

    function visit(query: string) {
        window.history.replaceState(null, '', `/?${query}`);
        act(() => {
            root.render(
                <PropCalculatorToolsLayout>
                    <UserActions />
                </PropCalculatorToolsLayout>,
            );
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        window.localStorage.clear();
        window.sessionStorage.clear();
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

    it.each<[string, LinkParameter, string, string]>([
        [
            'day stop rule',
            LinkParameter.DayStop,
            'not-json!',
            'The day stop rule in this link or saved scenario was refused (the day stop rule parameter is not readable base64 JSON), so the day stop rule shown did not come from it.',
        ],
        [
            'eval ladder',
            LinkParameter.EvalDayPolicy,
            blob({ ladder: [] }),
            'The eval ladder in this link or saved scenario was refused (the eval ladder is not one the calculator can use), so the eval ladder shown did not come from it.',
        ],
        [
            'portfolio',
            LinkParameter.Portfolio,
            blob([{ ...validPortfolio[0], instrument: 'XYZ' }]),
            'The portfolio in this link or saved scenario was refused (portfolio entry 1: instrument must be empty or one of ES, MNQ, NQ), so the portfolio shown did not come from it.',
        ],
    ])(
        'names the refused %s in plain words inside the page',
        (_name, parameter, raw, text) => {
            visit(link({ [parameter]: raw }));
            expect(notices()).toEqual([text]);
            expect(
                container.querySelector(':scope main [role="alert"]')
                    ?.textContent,
            ).toBe(text);
        },
    );

    it('shows one notice for each refused parameter', () => {
        visit(link({ dp: 'x', ds: 'x', pf: 'x' }));
        expect(notices()).toHaveLength(3);
    });

    it('shows no notice for a link whose parameters are valid', () => {
        visit(
            link({
                ds: blob({ kind: DayStopRuleKind.FirstWin }),
                pf: blob(validPortfolio),
            }),
        );
        expect(notices()).toEqual([]);
    });

    it.each<[LinkParameter, string]>([
        [LinkParameter.DayStop, 'user sets day stop'],
        [LinkParameter.EvalDayPolicy, 'user sets eval ladder'],
        [LinkParameter.Portfolio, 'user sets portfolio'],
    ])('clears the %s notice once the user sets it', (parameter, button) => {
        visit(link({ [parameter]: 'not-json!' }));
        expect(notices()).toHaveLength(1);
        click(button);
        expect(notices()).toEqual([]);
    });
});
