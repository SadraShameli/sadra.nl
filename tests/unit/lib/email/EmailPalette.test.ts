import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { EMAIL_COLORS } from '~/lib/email/templates/EmailPalette';

const TOKENS_CSS = readFileSync(
    path.join(process.cwd(), 'src', 'styles', 'tokens.css'),
    'utf8',
);
const DAY_BLOCK = /:root\s*\{([\s\S]*?)\n {4}\}/u;
const CUSTOM_PROPERTY = /--([\w-]+):\s*([^;]+);/gu;
const TOKEN_REFERENCE = /^var\(--([\w-]+)\)$/u;

function resolvedToken(
    tokens: ReadonlyMap<string, string>,
    name: string,
): string | undefined {
    const value = tokens.get(name);
    const reference = value === undefined ? null : TOKEN_REFERENCE.exec(value);
    return reference?.[1] === undefined
        ? value
        : resolvedToken(tokens, reference[1]);
}

function dayTokens(): ReadonlyMap<string, string> {
    const block = DAY_BLOCK.exec(TOKENS_CSS)?.[1] ?? '';
    return new Map(
        block
            .matchAll(CUSTOM_PROPERTY)
            .map(([, name = '', value = '']) => [
                name,
                value.trim().toLowerCase(),
            ]),
    );
}

describe('EMAIL_COLORS', () => {
    it('matches the Day theme tokens, so emails follow the site palette', () => {
        const tokens = dayTokens();

        for (const [name, value] of Object.entries(EMAIL_COLORS)) {
            expect({ name, value: resolvedToken(tokens, name) }).toEqual({
                name,
                value,
            });
        }
    });
});
