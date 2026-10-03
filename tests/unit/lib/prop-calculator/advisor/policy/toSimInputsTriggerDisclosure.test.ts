import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const SOURCE_FILE = /\.tsx?$/;
const TO_SIM_INPUTS_IMPORT = /import[^;]*\btoSimInputs\b[^;]*from/s;
const TO_SIM_INPUTS_CALL = /(?<![.\w])toSimInputs\(/;
const DISCLOSURE_CALL =
    /\b(?:cumulativePayoutTriggerAssumption|pricedCumulativeTriggerAssumptionOf)\(/;
const DISCLOSURE_BINDING =
    /\bconst\s+(\w+)\s*=\s*(?:cumulativePayoutTriggerAssumption|pricedCumulativeTriggerAssumptionOf)\(/g;
const TRIGGER_LINES_CALL = /\bpricedTriggerLines\(/;
const SECOND_TRIGGER_LINE_BUILDER = /\bverifiedTriggerLines\b/;

const CLI_CONSUMERS_WITHOUT_TRIGGER_LINES: readonly string[] = [];

const BUILDS_INPUTS_WITHOUT_PRICING_TRIGGER: readonly string[] = [
    'app/(app)/prop-calculator/_workers/copyGroupWorkerMessages.ts',
];

function cliMethodConsumers(): readonly {
    readonly file: string;
    readonly printsTriggerLines: boolean;
}[] {
    return filesUnder(SOURCE_ROOT).flatMap((full) => {
        const text = readFileSync(full, 'utf8');
        if (!text.includes('.toSimInputs(')) return [];
        return [
            {
                file: path
                    .relative(SOURCE_ROOT, full)
                    .split(path.sep)
                    .join('/'),
                printsTriggerLines: TRIGGER_LINES_CALL.test(text),
            },
        ];
    });
}

function consumers(): readonly {
    readonly discloses: boolean;
    readonly file: string;
}[] {
    return filesUnder(SOURCE_ROOT).flatMap((full) => {
        const text = readFileSync(full, 'utf8');
        if (!TO_SIM_INPUTS_IMPORT.test(text)) return [];
        if (!TO_SIM_INPUTS_CALL.test(text)) return [];
        return [
            {
                discloses: isDisclosureReturned(text),
                file: path
                    .relative(SOURCE_ROOT, full)
                    .split(path.sep)
                    .join('/'),
            },
        ];
    });
}

function filesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

function isDisclosureReturned(text: string): boolean {
    if (!DISCLOSURE_CALL.test(text)) return false;
    return text.matchAll(DISCLOSURE_BINDING).some((match) => {
        const [declaration, name] = match;
        const afterwards = text.slice(match.index + declaration.length);
        return new RegExp(String.raw`(?:[{,]\s*|:\s*)${name}\s*[,}]`).test(
            afterwards,
        );
    });
}

describe('every toSimInputs consumer discloses the cumulative trigger it prices (PT-36p, F-145)', () => {
    const found = consumers();

    it('finds the consumers it guards', () => {
        expect(found.length).toBeGreaterThanOrEqual(
            BUILDS_INPUTS_WITHOUT_PRICING_TRIGGER.length,
        );
    });

    it('lets no new consumer price a confirmed trigger without a typed assumption', () => {
        const undisclosed = found
            .filter((entry) => !entry.discloses)
            .map((entry) => entry.file)
            .filter(
                (file) => !BUILDS_INPUTS_WITHOUT_PRICING_TRIGGER.includes(file),
            )
            .toSorted((left, right) => left.localeCompare(right));
        expect(undisclosed).toStrictEqual([]);
    });

    it('lists a consumer that prices no trigger only while it does not claim to', () => {
        const claiming = found
            .filter((entry) => entry.discloses)
            .map((entry) => entry.file)
            .filter((file) =>
                BUILDS_INPUTS_WITHOUT_PRICING_TRIGGER.includes(file),
            )
            .toSorted((left, right) => left.localeCompare(right));
        expect(claiming).toStrictEqual([]);
    });

    it('keeps only consumers that still call toSimInputs on the known list', () => {
        const files = new Set(found.map((entry) => entry.file));
        expect(
            BUILDS_INPUTS_WITHOUT_PRICING_TRIGGER.filter(
                (file) => !files.has(file),
            ),
        ).toStrictEqual([]);
    });

    it('counts a dropped or merely imported disclosure as undisclosed', () => {
        expect(
            isDisclosureReturned(
                "import { pricedCumulativeTriggerAssumptionOf } from 'x';",
            ),
        ).toBe(false);
        expect(
            isDisclosureReturned(
                'pricedCumulativeTriggerAssumptionOf(inputs); return { a };',
            ),
        ).toBe(false);
        expect(
            isDisclosureReturned(
                'const t = pricedCumulativeTriggerAssumptionOf(inputs); return { a };',
            ),
        ).toBe(false);
        expect(
            isDisclosureReturned(
                'const t = pricedCumulativeTriggerAssumptionOf(inputs); return { a, t };',
            ),
        ).toBe(true);
        expect(
            isDisclosureReturned(
                'const t = cumulativePayoutTriggerAssumption(x, y); return { key: t };',
            ),
        ).toBe(true);
    });

    it('has the overview worker disclose its documented run', () => {
        expect(
            found.find(
                (entry) =>
                    entry.file ===
                    'app/(app)/prop-calculator/_workers/overviewWorkerMessages.ts',
            )?.discloses,
        ).toBe(true);
    });

    it('has no second trigger-line builder named verifiedTriggerLines under src, a name check only; the wording itself is pinned by pricedTriggerLines.test.ts (PT-36s)', () => {
        const duplicates = filesUnder(SOURCE_ROOT)
            .filter((full) =>
                SECOND_TRIGGER_LINE_BUILDER.test(readFileSync(full, 'utf8')),
            )
            .map((full) =>
                path.relative(SOURCE_ROOT, full).split(path.sep).join('/'),
            );
        expect(duplicates).toStrictEqual([]);
    });

    describe('the CLI consumers that call inputs.toSimInputs', () => {
        const cli = cliMethodConsumers();

        it('finds them', () => {
            expect(cli.length).toBeGreaterThan(0);
        });

        it('lets no new CLI consumer price a confirmed trigger without printing it', () => {
            const silent = cli
                .filter((entry) => !entry.printsTriggerLines)
                .map((entry) => entry.file)
                .filter(
                    (file) => !CLI_CONSUMERS_WITHOUT_TRIGGER_LINES.includes(file),
                )
                .toSorted((left, right) => left.localeCompare(right));
            expect(silent).toStrictEqual([]);
        });

        it('keeps the known silent list to consumers that are still silent', () => {
            const stale = cli
                .filter((entry) => entry.printsTriggerLines)
                .map((entry) => entry.file)
                .filter((file) =>
                    CLI_CONSUMERS_WITHOUT_TRIGGER_LINES.includes(file),
                );
            expect(stale).toStrictEqual([]);
            const files = new Set(cli.map((entry) => entry.file));
            expect(
                CLI_CONSUMERS_WITHOUT_TRIGGER_LINES.filter(
                    (file) => !files.has(file),
                ),
            ).toStrictEqual([]);
        });
    });
});
