import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

import {
    EngagementsErrorNotice,
    ErrorNoticeTitle,
    JournalErrorNotice,
    QueryErrorNotice,
    RulebookErrorNotice,
    UnlistedFirmsErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';

import { propCalculatorAppDir } from '../appPageFiles';

const NOTICE_FILE = 'QueryErrorNotice.tsx';
const UNTITLED_DESTRUCTIVE_ALERT = /<TriangleAlert \/>\s*<AlertDescription/u;
const DESTRUCTIVE_ALERT = /<Alert\b[^>]*?\bvariant=["']destructive["']/su;
const ALERT_IMPORT = /from\s*'~\/components\/ui\/alert'/u;

function accountsSourceFiles(): string[] {
    const directory = propCalculatorAppDir('accounts');
    return readdirSync(directory, { encoding: 'utf8', recursive: true })
        .filter(
            (entry) =>
                entry.endsWith('.tsx') && path.basename(entry) !== NOTICE_FILE,
        )
        .map((entry) => path.join(directory, entry));
}

function descriptionOf(markup: string): string {
    const container = document.createElement('div');
    container.innerHTML = markup;
    return (
        container.querySelector('[data-slot="alert-description"]')
            ?.textContent ?? ''
    );
}

describe('QueryErrorNotice', () => {
    it('renders the title and the message', () => {
        const markup = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                message: 'network is down',
                title: 'The ledger could not be loaded',
            }),
        );
        expect(markup).toContain('The ledger could not be loaded');
        expect(markup).toContain('network is down');
    });

    it('ends a bare error message with a full stop before the consequence', () => {
        const markup = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                consequence: 'The export is paused until they load.',
                message: 'UNAUTHORIZED',
                title: 'Your firms could not be loaded',
            }),
        );
        expect(descriptionOf(markup)).toBe(
            'UNAUTHORIZED. The export is paused until they load.',
        );
    });

    it('keeps an error message that already ends a sentence', () => {
        const markup = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                consequence: 'The export is paused until they load.',
                message: 'A text value is longer than the database accepts.',
                title: 'Your firms could not be loaded',
            }),
        );
        expect(descriptionOf(markup)).toBe(
            'A text value is longer than the database accepts. The export is paused until they load.',
        );
    });

    it('renders an untitled destructive alert when no title is given', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                className: 'md:col-span-2',
                message: 'The engine refused this run.',
            }),
        );
        const alert = container.querySelector('[role="alert"]');
        expect(alert?.classList.contains('md:col-span-2')).toBe(true);
        expect(alert?.querySelector('svg')).not.toBeNull();
        expect(alert?.querySelector('[data-slot="alert-title"]')).toBeNull();
        expect(descriptionOf(container.getHTML())).toBe(
            'The engine refused this run.',
        );
    });

    it('renders the title at the heading level a page asks for', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                message: 'UNAUTHORIZED',
                title: ErrorNoticeTitle.Account,
                titleAs: 'h2',
            }),
        );
        expect(container.querySelector('h2')?.textContent).toBe(
            'The account could not be loaded',
        );
    });

    it('lists each refusal under the title, labelled by it, instead of one message', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                items: [
                    { key: 'a', text: 'Alpha: the stored date is invalid.' },
                    { key: 'b', text: 'Bravo: the plan is unknown.' },
                ],
                title: 'Runs the engine refused',
            }),
        );
        const list = container.querySelector(
            ':scope [role="alert"] ul[aria-label="Runs the engine refused"]',
        );
        expect(
            [...(list?.querySelectorAll('li') ?? [])].map(
                (item) => item.textContent,
            ),
        ).toEqual([
            'Alpha: the stored date is invalid.',
            'Bravo: the plan is unknown.',
        ]);
    });

    it('keeps the actions a notice offers inside it, after the message', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                actions: createElement('button', { type: 'button' }, 'Retry'),
                message: 'Failed to fetch',
                title: 'The advice could not be computed',
            }),
        );
        const description = container.querySelector(
            ':scope [role="alert"] [data-slot="alert-description"]',
        );
        expect(description?.querySelector('button')?.textContent).toBe('Retry');
        expect(description?.textContent).toContain('Failed to fetch');
    });

    it.each([
        [
            'journal',
            JournalErrorNotice,
            'Failed to fetch. The scale gate treats your trade count as zero until it loads.',
        ],
        [
            'rulebook',
            RulebookErrorNotice,
            'Failed to fetch. This page uses the default thresholds instead of yours until it loads.',
        ],
        [
            'unlisted firms',
            UnlistedFirmsErrorNotice,
            'Failed to fetch. External firms show as an unlisted firm until they load.',
        ],
        [
            'firm statuses',
            EngagementsErrorNotice,
            'Failed to fetch. Every firm counts as active until they load.',
        ],
    ])(
        'ends the %s error with a full stop before what it means for the page',
        (_name, Notice, expected) => {
            const markup = renderToStaticMarkup(
                createElement(Notice, { message: 'Failed to fetch' }),
            );
            expect(descriptionOf(markup)).toBe(expected);
        },
    );
});

describe('query-error notice duplication guard (PT-62e / PT-58f)', () => {
    it('is the only place the rounds and ledger pages render a query-error banner', () => {
        const ledgerText = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/ledger/LedgerView.tsx',
            ),
            'utf8',
        );
        const roundsText = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/rounds/RoundsView.tsx',
            ),
            'utf8',
        );
        for (const text of [ledgerText, roundsText]) {
            expect(text).not.toContain('TriangleAlert');
            expect(text).toMatch(
                /import\s*{[^}]*\bQueryErrorNotice\b[^}]*}\s*from\s*'~\/app\/\(app\)\/prop-calculator\/accounts\/_components\/QueryErrorNotice'/,
            );
        }
    });

    it('keeps every destructive alert in the accounts area, titled or untitled, on the shared notice', () => {
        const handWritten = accountsSourceFiles()
            .filter((file) => {
                const text = readFileSync(file, 'utf8');
                return (
                    UNTITLED_DESTRUCTIVE_ALERT.test(text) ||
                    DESTRUCTIVE_ALERT.test(text) ||
                    ALERT_IMPORT.test(text)
                );
            })
            .map((file) => path.relative(propCalculatorAppDir(), file));
        expect(handWritten).toEqual([]);
    });

    it('recognises a titled destructive alert written by hand, over several lines', () => {
        const titled = [
            '<Alert',
            '    className="md:col-span-2"',
            '    variant="destructive"',
            '>',
            '    <TriangleAlert />',
            '    <AlertTitle>The rulebook could not be loaded</AlertTitle>',
            '</Alert>',
        ].join('\n');
        expect(DESTRUCTIVE_ALERT.test(titled)).toBe(true);
        expect(
            ALERT_IMPORT.test("import { Alert } from '~/components/ui/alert';"),
        ).toBe(true);
    });

    it('builds the firm-status failure from the shared notice on the overview tile and the firms page', () => {
        for (const file of [
            'accounts/_components/overview/FirmsTile.tsx',
            'accounts/firms/FirmsView.tsx',
        ]) {
            const text = readFileSync(
                propCalculatorAppDir(...file.split('/')),
                'utf8',
            );
            expect(text).toMatch(/<EngagementsErrorNotice\b/u);
            expect(text).not.toContain('engagementsQuery.error.message} ');
        }
    });
});
