import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    dollars,
    findFirm,
    FirmId,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    type Assumption,
    AssumptionBias,
    AssumptionKind,
    assumptionSchema,
    assumptionText,
    cumulativePayoutTriggerAssumption,
    inputAssumption,
    type InputAssumptionKind,
    ladderStepWidenedAssumption,
    SIZING_ASSUMPTION_TEXT,
    SizingAssumption,
    sizingRuleAssumption,
} from '~/lib/prop-calculator/advisor';
import {
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LiveTransferContinuationKind,
    liveTransferContinuationNotes,
} from '~/lib/prop-calculator/simulator';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const TEXT_FILE = path.join(
    'lib',
    'prop-calculator',
    'advisor',
    'Assumption.ts',
);
const SOURCE_FILE = /\.tsx?$/;
const KIND_TEXT_ENTRY = /\[AssumptionKind\.[A-Za-z]+\]:/;

const INPUT_KINDS: readonly InputAssumptionKind[] = Object.values(
    AssumptionKind,
).filter(
    (kind): kind is InputAssumptionKind =>
        kind !== AssumptionKind.SizingRule &&
        kind !== AssumptionKind.LiveTransferHazard &&
        kind !== AssumptionKind.LadderStepWidened &&
        kind !== AssumptionKind.CumulativePayoutTriggerPriced,
);

async function filesUnder(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) return filesUnder(full);
            return SOURCE_FILE.test(entry.name) ? [full] : [];
        }),
    );
    return nested.flat();
}

const kindTextHoldersByRoot = new Map<string, Promise<string[]>>();

function kindTextHoldersOnce(root: string): Promise<string[]> {
    const known = kindTextHoldersByRoot.get(root);
    if (known !== undefined) return known;
    const scan = scanKindTextHolders(root);
    kindTextHoldersByRoot.set(root, scan);
    return scan;
}

async function scanKindTextHolders(root: string): Promise<string[]> {
    const files = await filesUnder(root);
    const matches = await Promise.all(
        files.map(async (file) =>
            KIND_TEXT_ENTRY.test(await readFile(file, 'utf8'))
                ? path.relative(root, file)
                : null,
        ),
    );
    return matches
        .filter((match) => match !== null)
        .toSorted((a, b) => a.localeCompare(b));
}

describe('the widened ladder step travels inside its typed assumption (PT-24e, F-133)', () => {
    it('builds the assumption with its bias and its step', () => {
        expect(
            ladderStepWidenedAssumption(140, AssumptionBias.Neutral),
        ).toStrictEqual({
            bias: AssumptionBias.Neutral,
            kind: AssumptionKind.LadderStepWidened,
            step: 140,
        });
    });

    it('validates it at a boundary and survives structuredClone', () => {
        const assumption = ladderStepWidenedAssumption(
            140,
            AssumptionBias.Neutral,
        );
        const cloned: unknown = structuredClone(assumption);

        expect(assumptionSchema.parse(cloned)).toStrictEqual(assumption);
    });

    it.each([
        [
            'a widened step without its step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
            },
        ],
        [
            'a zero step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: 0,
            },
        ],
        [
            'a negative step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: -100,
            },
        ],
        [
            'a non-finite step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: Infinity,
            },
        ],
        [
            'a step on an assumption that has none',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.GrossOnlyPayouts,
                step: 140,
            },
        ],
    ])('rejects %s', (_name, candidate) => {
        expect(assumptionSchema.safeParse(candidate).success).toBe(false);
    });

    it('refuses to build a plain input assumption of the widened-step kind', () => {
        expect(() =>
            inputAssumption(
                AssumptionKind.LadderStepWidened as never,
                AssumptionBias.Neutral,
            ),
        ).toThrow(/LadderStepWidened/);
    });

    it('refuses a non-positive step', () => {
        expect(() =>
            ladderStepWidenedAssumption(0, AssumptionBias.Neutral),
        ).toThrow(/step/);
    });
});

const VERIFIED_TRIGGER = {
    amount: dollars(100_000),
    source: {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic test quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.test/policy',
        verification: PolicyVerification.Confirmed,
    },
} as const;

const TRIGGER_PLAN = topStepPlan();

const TRIGGER_INPUTS = {
    instrument: undefined,
    plan: TRIGGER_PLAN,
    stopPoints: undefined,
} as const;

function pricedTrigger() {
    return cumulativePayoutTriggerAssumption(VERIFIED_TRIGGER, TRIGGER_INPUTS);
}

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (plan === undefined) throw new Error('TopStep 50K plan missing');
    return plan;
}

describe('the priced cumulative live trigger travels inside its typed assumption (PT-36p, F-145)', () => {
    it('carries its amount, its firm source citation and what happens after the transfer, and no more of the source', () => {
        expect(pricedTrigger()).toStrictEqual({
            amount: 100_000,
            bias: AssumptionBias.Neutral,
            continuation: LiveTransferContinuationKind.NotModeled,
            kind: AssumptionKind.CumulativePayoutTriggerPriced,
            notes: liveTransferContinuationNotes(
                TRIGGER_PLAN,
                LiveTransferContinuationKind.NotModeled,
            ),
            source: {
                fetchedOn: '2026-09-01',
                quote: 'a synthetic test quote',
                url: 'https://example.test/policy',
            },
        });
    });

    it('validates at a boundary and survives structuredClone', () => {
        const assumption = pricedTrigger();
        const cloned: unknown = structuredClone(assumption);

        expect(assumptionSchema.parse(cloned)).toStrictEqual(assumption);
    });

    it.each([
        ['no amount', { amount: undefined }],
        ['a zero amount', { amount: 0 }],
        ['a negative amount', { amount: -5 }],
        ['no source', { source: undefined }],
        ['no continuation', { continuation: undefined }],
        ['no notes', { notes: undefined }],
        [
            'a continuation of off',
            { continuation: LiveTransferContinuationKind.Off },
        ],
        [
            'a source without its url',
            { source: { fetchedOn: '2026-09-01', quote: 'q' } },
        ],
    ])('rejects %s', (_name, change) => {
        const candidate = {
            ...pricedTrigger(),
            ...change,
        };
        expect(assumptionSchema.safeParse(candidate).success).toBe(false);
    });

    it('says the amount, where the firm states it and the firm quote', () => {
        const text = assumptionText(pricedTrigger());

        expect(text).toContain('$100,000');
        expect(text).toContain('https://example.test/policy');
        expect(text).toContain('2026-09-01');
        expect(text).toContain('a synthetic test quote');
        expect(text).not.toContain('—');
    });

    it('says how the simulator counts the amount and that the payout which reaches it is still paid', () => {
        const text = assumptionText(pricedTrigger());

        expect(text).toContain('after the profit split');
        expect(text).toContain(
            'The payout that reaches the amount is still paid.',
        );
    });

    it('says what happens to the account after the transfer, with the continuation notes', () => {
        const text = assumptionText(pricedTrigger());

        expect(text).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        );
        for (const note of liveTransferContinuationNotes(
            TRIGGER_PLAN,
            LiveTransferContinuationKind.NotModeled,
        )) {
            expect(text).toContain(note);
        }
    });

    it('says the documented payout request is not checked against the trigger', () => {
        expect(assumptionText(pricedTrigger())).toContain(
            'The documented payout request is not checked against this trigger.',
        );
    });

    it('refuses to build a plain input assumption of the priced-trigger kind', () => {
        expect(() =>
            inputAssumption(
                AssumptionKind.CumulativePayoutTriggerPriced as never,
                AssumptionBias.Neutral,
            ),
        ).toThrow(/CumulativePayoutTriggerPriced/);
    });
});

describe('one assumption text table for the CLI and the web (PT-24e, F-133)', () => {
    let holders: readonly string[] = [];

    beforeAll(async () => {
        holders = await kindTextHoldersOnce(SOURCE_ROOT);
    });

    it.each(INPUT_KINDS)('has a text for the %s kind', (kind) => {
        const text = assumptionText(
            inputAssumption(kind, AssumptionBias.Neutral),
        );

        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toContain('—');
    });

    it('says the widened step from the assumption itself', () => {
        const text = assumptionText(
            ladderStepWidenedAssumption(140, AssumptionBias.Neutral),
        );

        expect(text).toContain('coarser');
        expect(text).toContain('The grid step is $140.');
        expect(text).not.toContain('searched');
    });

    it('says what unspecified position sizing means for the suggested risk', () => {
        const text = assumptionText(
            inputAssumption(
                AssumptionKind.PositionSizingUnspecified,
                AssumptionBias.Neutral,
            ),
        );

        expect(text).toContain('fractional');
        expect(text).toContain('whole contracts');
        expect(text).toContain('contract cap');
    });

    it('gives a SizingRule assumption its sizing text', () => {
        expect(
            assumptionText(
                sizingRuleAssumption(
                    SizingAssumption.NoCommission,
                    AssumptionBias.Optimistic,
                ),
            ),
        ).toBe(SIZING_ASSUMPTION_TEXT[SizingAssumption.NoCommission]);
    });

    it('gives every input kind a distinct text', () => {
        const assumptions: readonly Assumption[] = INPUT_KINDS.map((kind) =>
            inputAssumption(kind, AssumptionBias.Neutral),
        );
        const texts = assumptions.map((assumption) =>
            assumptionText(assumption),
        );

        expect(new Set(texts).size).toBe(texts.length);
    });

    it('finds the kind-to-text table in one source file only', () => {
        expect(holders).toStrictEqual([TEXT_FILE]);
    });
});
