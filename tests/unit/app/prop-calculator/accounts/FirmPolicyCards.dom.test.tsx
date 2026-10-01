import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveProximityCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/LiveProximityCard';
import {
    type LiveProximityCardModel,
    type PooledCapCardModel,
    PooledCapScope,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { PooledCapCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/PooledCapCard';

const POOLED: PooledCapCardModel = {
    disclosure:
        'Pools are modeled only for firms whose policy a source confirms.',
    householdNote: null,
    rows: [
        {
            cap: '5',
            freeSlots: '0',
            key: 'plan-a',
            note: null,
            plan: 'Firm A 50K',
            poolFreeSlots: '0',
            scope: PooledCapScope.SharedPool,
            used: '4',
        },
        {
            cap: '5',
            freeSlots: '4',
            key: 'plan-b',
            note: null,
            plan: 'Firm B 100K',
            poolFreeSlots: 'Unverified',
            scope: PooledCapScope.CapScopeUnverified,
            used: '1',
        },
    ],
    unverifiedFirms: ['Firm B'],
};

const PROXIMITY: LiveProximityCardModel = {
    accounts: [
        {
            account: 'Alpha',
            key: 'alpha',
            paidPayouts: '2',
            plan: 'Firm A 50K',
            remaining: '1',
            trigger: '3',
        },
    ],
    disclosure: 'Distances come only from a confirmed trigger.',
    firms: [
        {
            firm: 'Firm A',
            isVerified: true,
            key: 'firm-a',
            paidSinceLastLive: '8',
            remaining: '2',
            since: '2026-09-08',
            trigger: '10',
        },
        {
            firm: 'Firm B',
            isVerified: false,
            key: 'firm-b',
            paidSinceLastLive: '1',
            remaining: 'Unverified',
            since: 'all time',
            trigger: 'Unverified',
        },
    ],
    singleDayFacts: [
        {
            firm: 'Firm A',
            key: 'plan-a-single-day',
            plan: 'Firm A 50K',
            quote: 'a synthetic firm quote',
            source: 'https://example.test/policy',
            text: '$10,000.00 of profit in one day moves the account live automatically',
        },
    ],
    unlistedNote:
        '1 funded account is at a firm whose live triggers are unverified, so its distance to going live is not shown.',
};

describe('PooledCapCard and LiveProximityCard', () => {
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

    function rowTexts(): string[] {
        return [...container.querySelectorAll(':scope tbody tr')].map((row) =>
            [...row.querySelectorAll('td')]
                .map((cell) => cell.textContent)
                .join('|'),
        );
    }

    it('shows each plan with its cap scope and says which firms are cap scope unverified', () => {
        act(() => {
            root.render(<PooledCapCard model={POOLED} />);
        });
        expect(rowTexts()).toEqual([
            'Firm A 50K|Shared pool|4|5|0|0|',
            'Firm B 100K|Cap scope unverified|1|5|Unverified|4|',
        ]);
        const list = container.querySelector(
            '[aria-label="Firms with an unverified cap scope"]',
        );
        expect(list?.textContent).toBe('Firm B: cap scope unverified');
        expect(container.textContent).toContain(POOLED.disclosure);
    });

    it('says no plan is in use and lists no unverified firm when there are no rows', () => {
        act(() => {
            root.render(
                <PooledCapCard
                    model={{
                        ...POOLED,
                        rows: [],
                        unverifiedFirms: [],
                    }}
                />,
            );
        });
        expect(container.textContent).toContain('No plan in use yet.');
        expect(container.querySelector('table')).toBeNull();
        expect(
            container.querySelector(
                '[aria-label="Firms with an unverified cap scope"]',
            ),
        ).toBeNull();
    });

    it('shows the household disclosure when the model carries one', () => {
        act(() => {
            root.render(
                <PooledCapCard
                    model={{
                        ...POOLED,
                        householdNote: 'Firm A counts a household.',
                    }}
                />,
            );
        });
        expect(container.textContent).toContain('Firm A counts a household.');
    });

    it('shows a firm total, a per-account distance, the single-day quote and the unlisted note, never a number for an unverified firm', () => {
        act(() => {
            root.render(<LiveProximityCard model={PROXIMITY} />);
        });
        expect(rowTexts()).toEqual([
            'Firm A|8|2026-09-08|10|2',
            'Firm B|1|all time|Unverified|Unverified',
            'Alpha|Firm A 50K|2|3|1',
        ]);
        const facts = container.querySelector(
            '[aria-label="Single-day live triggers"]',
        );
        expect(facts?.textContent).toContain(
            '$10,000.00 of profit in one day moves the account live automatically',
        );
        expect(facts?.textContent).toContain('a synthetic firm quote');
        expect(facts?.textContent).toContain('https://example.test/policy');
        expect(container.textContent).toContain(PROXIMITY.disclosure);
        expect(container.textContent).toContain(
            PROXIMITY.unlistedNote ?? 'missing',
        );
    });

    it('says there is nothing to measure when no open funded account exists', () => {
        act(() => {
            root.render(
                <LiveProximityCard
                    model={{
                        accounts: [],
                        disclosure: PROXIMITY.disclosure,
                        firms: [],
                        singleDayFacts: [],
                        unlistedNote: null,
                    }}
                />,
            );
        });
        expect(container.textContent).toContain(
            'No open funded account to measure against a live trigger.',
        );
        expect(container.querySelector('table')).toBeNull();
    });
});
