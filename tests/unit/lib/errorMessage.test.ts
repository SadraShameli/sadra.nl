import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { errorMessage } from '~/lib/errorMessage';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

const FORMER_COPIES = [
    'src/app/(app)/prop-calculator/_components/savedScenarioSync.ts',
    'src/app/(app)/prop-calculator/accounts/_components/AccountForm.tsx',
    'src/app/(app)/prop-calculator/accounts/rulebook/RulebookView.tsx',
];

class NamedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NamedError';
    }
}

describe('errorMessage', () => {
    it('reads the message of an Error and of its subclasses', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
        expect(errorMessage(new NamedError('named'))).toBe('named');
        expect(errorMessage(new TypeError('typed'))).toBe('typed');
    });

    it('stringifies anything that is not an Error', () => {
        expect(errorMessage('plain')).toBe('plain');
        expect(errorMessage(42)).toBe('42');
        expect(errorMessage(null)).toBe('null');
        expect(errorMessage(undefined)).toBe('undefined');
        expect(errorMessage({ message: 'not an error' })).toBe(
            '[object Object]',
        );
    });

    it('keeps special characters untouched', () => {
        expect(errorMessage(new Error('Naïve ✓ "quoted" <tag>'))).toBe(
            'Naïve ✓ "quoted" <tag>',
        );
    });

    it.each(FORMER_COPIES)(
        'is the only copy: %s defines none of its own',
        (file) => {
            const source = readFileSync(path.join(REPO_ROOT, file), 'utf8');
            expect(source).not.toMatch(/function errorMessage\s*\(/);
        },
    );
});
