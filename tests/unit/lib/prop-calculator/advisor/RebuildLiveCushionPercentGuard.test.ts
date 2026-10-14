import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CALL = 'AccountReconstruction.rebuild(';

function callArguments(text: string, start: number): string {
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (character === '(') depth += 1;
        if (character !== ')') {
            continue;
        }

        depth -= 1;
        if (depth === 0) return text.slice(start + 1, index);
    }
    throw new Error('unbalanced call');
}

const CALLS = readdirSync(path.resolve('src'), {
    recursive: true,
    withFileTypes: true,
})
    .filter((dirent) => dirent.isFile() && /\.tsx?$/.test(dirent.name))
    .flatMap((dirent) => {
        const file = path.join(dirent.parentPath, dirent.name);
        const text = readFileSync(file, 'utf8');
        const found: { file: string; text: string }[] = [];
        for (
            let at = text.indexOf(CALL);
            at !== -1;
            at = text.indexOf(CALL, at + CALL.length)
        ) {
            found.push({
                file: path.relative(path.resolve(), file),
                text: callArguments(text, at + CALL.length - 1),
            });
        }
        return found;
    });

describe('every rebuild passes the rulebook live cushion percent (PT-114)', () => {
    it('finds the rebuild calls in src', () => {
        expect(CALLS.length).toBeGreaterThanOrEqual(9);
    });

    it.each(CALLS.map((call) => [call.file, call.text]))(
        '%s passes a live cushion percent',
        (_file, text) => {
            expect(text).toMatch(/[cC]ushionPercent\s*,?\s*$/);
        },
    );
});
