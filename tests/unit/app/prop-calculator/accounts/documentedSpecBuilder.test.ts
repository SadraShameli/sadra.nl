import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    buildDocumentedSpec,
    overviewPlanOptInsOf,
    overviewRequestsFor,
    type PersonalPolicyOverrides,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    AssumptionKind,
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_RULEBOOK,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const APP_ROOT = path.join(SOURCE_ROOT, 'app', '(app)', 'prop-calculator');
const WORKERS = path.join(APP_ROOT, '_workers');
const SOURCE_FILE = /\.tsx?$/;
const RUN = { maxEvalDays: 30, seed: 3, trials: 20 } as const;

function filesMatching(root: string, pattern: RegExp): string[] {
    return sourceFiles(root)
        .map((file) => path.relative(root, file))
        .filter((relative) =>
            pattern.test(readFileSync(path.join(root, relative), 'utf8')),
        )
        .toSorted((left, right) => left.localeCompare(right));
}

function mffPro() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? full : [];
    });
}

function sourceOf(...segments: string[]): string {
    return readFileSync(path.join(APP_ROOT, ...segments), 'utf8');
}

describe('buildDocumentedSpec (PT-42c, F-136)', () => {
    const plan = mffPro();
    const input = {
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        fundedHorizonDays: 40,
        measuredRebuyLag: null,
        overrides: {
            payoutRequestOverride: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            retainedCushionRequest: null,
        },
        plan,
        rulebook: DEFAULT_RULEBOOK,
        run: RUN,
    };

    it('returns the spec and the assumptions of the engine policy it built', () => {
        const { assumptions, spec } = buildDocumentedSpec(input);

        expect(spec.planSerial).toBe(serializePlanId(plan.id));
        expect(spec.run).toEqual(RUN);
        expect(spec.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(spec.enginePolicy.fundedHorizonDays).toBe(40);
        expect(assumptions.map(({ kind }) => kind)).toContain(
            AssumptionKind.PositionSizingUnspecified,
        );
    });

    it('does not force the payout request: the policy carries none and toSimInputs raises it to the firm minimum', () => {
        const { spec } = buildDocumentedSpec(input);

        expect(spec.enginePolicy.payoutRequestOverride).toBeNull();
        expect(toSimInputs(plan, spec).payoutRequestSize).toBe(1000);
    });

    it('applies the personal overrides on top of the engine policy', () => {
        const { spec } = buildDocumentedSpec({
            ...input,
            overrides: {
                payoutRequestOverride: dollars(1500),
                personalCaps: { ...NO_PERSONAL_CAPS, maxTradesPerDay: 2 },
                personalDll: dollars(400),
                retainedCushionRequest: dollars(6000),
            },
        });

        expect(spec.enginePolicy.payoutRequestOverride).toBe(1500);
        expect(spec.enginePolicy.personalCaps?.maxTradesPerDay).toBe(2);
        expect(spec.enginePolicy.personalDll).toBe(400);
        expect(spec.enginePolicy.retainedCushionRequest).toBe(6000);
    });

    it('is withPersonalPolicy over the built policy, so the overview request carries the same personal merge', () => {
        const { spec } = buildDocumentedSpec({
            ...input,
            fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
        });
        const [overview] = overviewRequestsFor(
            [
                {
                    firmId: plan.id.firm,
                    measuredRebuyLag: null,
                    optIns: overviewPlanOptInsOf(plan),
                    planSerial: serializePlanId(plan.id),
                },
            ],
            DEFAULT_RULEBOOK,
        );
        const overrides = {
            payoutRequestOverride: dollars(1500),
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            retainedCushionRequest: null,
        };

        expect(overview?.spec.enginePolicy).toEqual(spec.enginePolicy);
        expect(
            overview === undefined
                ? null
                : withPersonalPolicy(overview.spec, overrides).enginePolicy
                      .payoutRequestOverride,
        ).toBe(1500);
    });
});

describe('one documented-spec builder and one dollarsOrNull (PT-42c, F-136)', () => {
    it('calls buildEnginePolicy for the overview, the advice panel value spec and the copy groups in one place only', () => {
        const callers = [
            path.join('_workers', 'overviewWorkerMessages.ts'),
            path.join(
                'accounts',
                '_components',
                'advice',
                'adviceValueModel.ts',
            ),
            path.join(
                'accounts',
                '_components',
                'advice',
                'personalRuleOptions.ts',
            ),
            path.join('accounts', 'copy-groups', 'copyGroupSimulationModel.ts'),
        ].filter((file) => /\bbuildEnginePolicy\(/.test(sourceOf(file)));

        expect(callers).toEqual([
            path.join('_workers', 'overviewWorkerMessages.ts'),
        ]);
    });

    it('never forces a payout request through effectivePayoutRequest in the overview worker messages: toSimInputs resolves it', () => {
        expect(filesMatching(WORKERS, /\beffectivePayoutRequest\b/)).toEqual(
            [],
        );
    });

    it('defines dollarsOrNull once in src', () => {
        expect(filesMatching(SOURCE_ROOT, /function dollarsOrNull\b/)).toEqual([
            path.join(
                'lib',
                'prop-calculator',
                'advisor',
                'LiveSizingAdvisor.ts',
            ),
        ]);
    });
});

describe('the personal policy overrides are all required (PT-68g addendum)', () => {
    it('has no optional key, so a caller cannot drop the caps or the daily loss limit', () => {
        expectTypeOf<PersonalPolicyOverrides>().toEqualTypeOf<{
            readonly payoutRequestOverride: Dollars | null;
            readonly personalCaps: PersonalCaps;
            readonly personalDll: Dollars | null;
            readonly retainedCushionRequest: Dollars | null;
        }>();
        expect(true).toBe(true);
    });
});
