import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ADVISOR_DIR = 'src/lib/prop-calculator/advisor';

function advisorSources(): { file: string; text: string }[] {
    const walk = (directory: string): string[] =>
        readdirSync(path.join(REPO_ROOT, directory), {
            withFileTypes: true,
        }).flatMap((entry) =>
            entry.isDirectory()
                ? walk(`${directory}/${entry.name}`)
                : entry.name.endsWith('.ts')
                  ? [`${directory}/${entry.name}`]
                  : [],
        );
    return walk(ADVISOR_DIR).map((file) => ({
        file,
        text: readFileSync(path.join(REPO_ROOT, file), 'utf8'),
    }));
}

describe('one placeable-minimum helper (PT-36f, PT-68h addendum)', () => {
    it('defines placeableMinimumFor once, in PlaceableMinimum.ts', () => {
        const definers = advisorSources()
            .filter(({ text }) =>
                /export function placeableMinimumFor\b/.test(text),
            )
            .map(({ file }) => file);

        expect(definers).toStrictEqual([`${ADVISOR_DIR}/PlaceableMinimum.ts`]);
    });

    it('keeps no placeableMinimumAt copy anywhere in the advisor', () => {
        const holders = advisorSources()
            .filter(({ text }) => /\bplaceableMinimumAt\b/.test(text))
            .map(({ file }) => file);

        expect(holders).toStrictEqual([]);
    });

    it('keeps the one-contract risk lookup out of EvalSizingAdvisor.ts', () => {
        const eval_ = advisorSources().find(
            ({ file }) => file === `${ADVISOR_DIR}/EvalSizingAdvisor.ts`,
        );

        expect(eval_?.text).not.toContain('oneContractRisk');
        expect(eval_?.text).not.toMatch(/private placeableMinimum\(/);
    });

    it('keeps no re-export of the placeable minimum outside PlaceableMinimum.ts and the advisor barrel (PT-36h)', () => {
        const reExporters = advisorSources()
            .filter(({ text }) =>
                /export\s*\{[^}]*\bplaceableMinimumFor\b[^}]*\}\s*from/.test(
                    text,
                ),
            )
            .map(({ file }) => file);

        expect(reExporters).toStrictEqual([`${ADVISOR_DIR}/index.ts`]);
    });

    it('imports the placeable minimum into PersonalDayLimits.ts from PlaceableMinimum.ts, not from DocumentedDayRisk.ts (PT-36h)', () => {
        const personal = advisorSources().find(
            ({ file }) => file === `${ADVISOR_DIR}/policy/PersonalDayLimits.ts`,
        );

        expect(personal?.text).toMatch(
            /placeableMinimumFor[^;]*from\s*'~\/lib\/prop-calculator\/advisor\/PlaceableMinimum'/,
        );
        expect(personal?.text).not.toMatch(
            /placeableMinimumFor[^;]*from\s*'\.\/DocumentedDayRisk'/,
        );
    });
});
