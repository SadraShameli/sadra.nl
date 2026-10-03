import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AttemptThroughputCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/AttemptThroughputCard';
import { type AttemptThroughputCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

const MODEL: AttemptThroughputCardModel = {
    countingNote:
        'Attempt throughput counts started attempts; cost per attempt counts decided attempts only.',
    meanPerActiveFirmPerMonth: '1.00',
    meanPerMonth: '0.60',
    months: [
        { attempts: '2', key: '2026-05', month: '2026-05' },
        { attempts: '1', key: '2026-06', month: '2026-06' },
    ],
    perFirm: [
        {
            firm: 'Alpha Prop',
            key: 'alpha',
            meanPerMonth: '0.40',
            months: [
                { attempts: '2', key: '2026-05', month: '2026-05' },
                { attempts: '0', key: '2026-06', month: '2026-06' },
            ],
        },
        {
            firm: 'Beta Prop',
            key: 'beta',
            meanPerMonth: '0.20',
            months: [
                { attempts: '0', key: '2026-05', month: '2026-05' },
                { attempts: '1', key: '2026-06', month: '2026-06' },
            ],
        },
    ],
};

describe('AttemptThroughputCard', () => {
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

    function tableUnder(heading: string): string[][] {
        const title = [...container.querySelectorAll('h3')].find(
            (candidate) => candidate.textContent === heading,
        );
        return [...(title?.parentElement?.querySelectorAll('tr') ?? [])].map(
            (tableRow) =>
                [...tableRow.querySelectorAll('th, td')].map(
                    (cell) => cell.textContent,
                ),
        );
    }

    it('shows each firm mean from the library beside the firm monthly series', () => {
        act(() => {
            root.render(<AttemptThroughputCard model={MODEL} />);
        });
        expect(tableUnder('Mean attempts per month by firm')).toEqual([
            ['Firm', 'Mean per month'],
            ['Alpha Prop', '0.40'],
            ['Beta Prop', '0.20'],
        ]);
        expect(tableUnder('Attempts per month by firm')).toEqual([
            ['Month', 'Alpha Prop', 'Beta Prop'],
            ['2026-05', '2', '0'],
            ['2026-06', '0', '1'],
        ]);
    });

    it('says in one line that throughput counts started attempts while cost per attempt counts decided ones', () => {
        act(() => {
            root.render(<AttemptThroughputCard model={MODEL} />);
        });
        expect(container.textContent).toContain(MODEL.countingNote);
    });
});
