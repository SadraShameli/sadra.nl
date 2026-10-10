import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountReadIssue,
    AccountReadIssueKind,
    compareText,
    describeAccountReadIssue,
    describeUnresolvedPlan,
    findStoredFirm,
    type LedgerOnlyPlanKey,
    offeredPlanOptIns,
    type PlanKey,
    type PlanKeyInput,
    type PlanKeyResolution,
    PlanKeyResolutionKind,
    planKeySchema,
    PlanOptIn,
    planOptInField,
    planOptInsSchema,
    readPlanOptIns,
    resolvePlanKey,
    type StoredFirmId,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

interface RegistryEntry {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

type StoredPlanKey = Omit<PlanKey, 'firmId'> & {
    readonly firmId: StoredFirmId;
};

const REGISTRY: readonly RegistryEntry[] = ALL_FIRMS.flatMap((firm) =>
    firm.plans.map((plan) => ({ firm, plan })),
);

const FUNDED_RESET_ONLY = {
    takesFundedReset: true,
    takesOneTimeEarlyWithdrawal: false,
};

const EARLY_WITHDRAWAL_ONLY = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: true,
};

function firstEntry(isMatch: (entry: RegistryEntry) => boolean): RegistryEntry {
    const entry = REGISTRY.find(isMatch);
    if (entry === undefined) throw new Error('no registry plan matches');
    return entry;
}

function issuePaths(key: unknown): string[] {
    const result = planKeySchema.safeParse(key);
    return result.success
        ? []
        : result.error.issues.map((issue) => issue.path.join('.'));
}

function keyFor(
    entry: RegistryEntry,
    overrides: Partial<StoredPlanKey> = {},
): StoredPlanKey {
    return {
        accountSize: entry.plan.id.accountSize,
        firmId: entry.firm.id,
        optIns: NO_PLAN_OPT_INS,
        planSerial: serializePlanId(entry.plan.id),
        ...overrides,
    };
}

function resolvedPlan(key: StoredPlanKey): Plan {
    const resolution = resolveUnflagged(key);
    if (resolution.kind !== PlanKeyResolutionKind.Resolved) {
        throw new Error(`expected ${key.planSerial} to resolve`);
    }
    return resolution.plan;
}

function resolveUnflagged(key: StoredPlanKey): PlanKeyResolution {
    return resolvePlanKey({ ...key, readIssues: [] });
}

const FIRST = firstEntry(() => true);
const FOREIGN = firstEntry((entry) => entry.firm.id !== FIRST.firm.id);
const WITH_FUNDED_RESET = firstEntry(
    (entry) => entry.plan.fundedReset !== null,
);
const WITHOUT_FUNDED_RESET = firstEntry(
    (entry) => entry.plan.fundedReset === null,
);
const WITH_EARLY_WITHDRAWAL = firstEntry(
    (entry) => entry.plan.oneTimeEarlyWithdrawal !== null,
);
const WITHOUT_EARLY_WITHDRAWAL = firstEntry(
    (entry) => entry.plan.oneTimeEarlyWithdrawal === null,
);

describe('planKeySchema', () => {
    it('accepts every registry plan with no opt-ins', () => {
        expect(REGISTRY.length).toBeGreaterThan(ALL_FIRMS.length);
        for (const entry of REGISTRY) {
            expect(planKeySchema.safeParse(keyFor(entry)).success).toBe(true);
        }
    });

    it('rejects an unknown serial', () => {
        expect(issuePaths(keyFor(FIRST, { planSerial: 'nope' }))).toEqual([
            'planSerial',
        ]);
    });

    it("rejects another firm's serial", () => {
        const foreignSerial = serializePlanId(FOREIGN.plan.id);
        expect(
            issuePaths(keyFor(FIRST, { planSerial: foreignSerial })),
        ).toEqual(['planSerial']);
    });

    it('rejects a firmId that disagrees with the serial', () => {
        expect(issuePaths(keyFor(FIRST, { firmId: FOREIGN.firm.id }))).toEqual([
            'planSerial',
        ]);
    });

    it('rejects an unknown firm id', () => {
        const key = { ...keyFor(FIRST), firmId: 'not-a-firm' };
        expect(planKeySchema.safeParse(key).success).toBe(false);
    });

    it('rejects an accountSize that disagrees with the serial', () => {
        const doubled = FIRST.plan.id.accountSize * 2;
        expect(issuePaths(keyFor(FIRST, { accountSize: doubled }))).toEqual([
            'accountSize',
        ]);
    });

    it('rejects a non-integer or non-positive accountSize', () => {
        for (const accountSize of [0, -50_000, 50_000.5]) {
            const key = keyFor(FIRST, { accountSize });
            expect(planKeySchema.safeParse(key).success).toBe(false);
        }
    });

    it('rejects takesFundedReset on a plan that offers no funded reset', () => {
        expect(WITHOUT_FUNDED_RESET.plan.fundedReset).toBeNull();
        const key = keyFor(WITHOUT_FUNDED_RESET, { optIns: FUNDED_RESET_ONLY });
        expect(issuePaths(key)).toEqual(['optIns.takesFundedReset']);
    });

    it('rejects takesOneTimeEarlyWithdrawal on a plan that offers none', () => {
        expect(WITHOUT_EARLY_WITHDRAWAL.plan.oneTimeEarlyWithdrawal).toBeNull();
        const key = keyFor(WITHOUT_EARLY_WITHDRAWAL, {
            optIns: EARLY_WITHDRAWAL_ONLY,
        });
        expect(issuePaths(key)).toEqual(['optIns.takesOneTimeEarlyWithdrawal']);
    });

    it('accepts each opt-in on a plan that offers it', () => {
        const withReset = keyFor(WITH_FUNDED_RESET, {
            optIns: FUNDED_RESET_ONLY,
        });
        const withEarly = keyFor(WITH_EARLY_WITHDRAWAL, {
            optIns: EARLY_WITHDRAWAL_ONLY,
        });
        expect(planKeySchema.safeParse(withReset).success).toBe(true);
        expect(planKeySchema.safeParse(withEarly).success).toBe(true);
    });

    it('rejects a serial longer than the column', () => {
        const key = keyFor(FIRST, { planSerial: 'x'.repeat(65) });
        expect(planKeySchema.safeParse(key).success).toBe(false);
    });
});

describe('planOptInsSchema', () => {
    it('requires both booleans', () => {
        expect(planOptInsSchema.safeParse(NO_PLAN_OPT_INS).success).toBe(true);
        expect(
            planOptInsSchema.safeParse({ takesFundedReset: true }).success,
        ).toBe(false);
        expect(
            planOptInsSchema.safeParse({
                takesFundedReset: 'yes',
                takesOneTimeEarlyWithdrawal: false,
            }).success,
        ).toBe(false);
    });
});

describe('offeredPlanOptIns', () => {
    it('lists exactly the opt-ins each registry plan offers', () => {
        for (const { plan } of REGISTRY) {
            const expected: PlanOptIn[] = [];
            if (plan.fundedReset !== null) expected.push(PlanOptIn.FundedReset);
            if (plan.oneTimeEarlyWithdrawal !== null) {
                expected.push(PlanOptIn.OneTimeEarlyWithdrawal);
            }
            expect(offeredPlanOptIns(plan)).toEqual(expected);
        }
    });

    it('is non-vacuous: the registry offers both opt-ins somewhere', () => {
        expect(offeredPlanOptIns(WITH_FUNDED_RESET.plan)).toContain(
            PlanOptIn.FundedReset,
        );
        expect(offeredPlanOptIns(WITH_EARLY_WITHDRAWAL.plan)).toContain(
            PlanOptIn.OneTimeEarlyWithdrawal,
        );
        expect(offeredPlanOptIns(WITHOUT_FUNDED_RESET.plan)).not.toContain(
            PlanOptIn.FundedReset,
        );
    });
});

describe('resolvePlanKey', () => {
    it('resolves every registry plan to the registry instance when no opt-in is taken', () => {
        for (const entry of REGISTRY) {
            expect(resolveUnflagged(keyFor(entry))).toEqual({
                kind: PlanKeyResolutionKind.Resolved,
                plan: entry.plan,
            });
            expect(resolvedPlan(keyFor(entry))).toBe(entry.plan);
        }
    });

    it('applies offered opt-ins to the resolved plan', () => {
        const plan = resolvedPlan(
            keyFor(WITH_FUNDED_RESET, { optIns: FUNDED_RESET_ONLY }),
        );
        expect(plan.takesFundedReset).toBe(true);
        expect(plan.id).toEqual(WITH_FUNDED_RESET.plan.id);
        const early = resolvedPlan(
            keyFor(WITH_EARLY_WITHDRAWAL, { optIns: EARLY_WITHDRAWAL_ONLY }),
        );
        expect(early.takesOneTimeEarlyWithdrawal).toBe(true);
    });

    it('reports a typed reason for each failure', () => {
        const cases: [StoredPlanKey, UnresolvedPlanReason][] = [
            [
                keyFor(FIRST, { firmId: 'not-a-firm' }),
                UnresolvedPlanReason.UnknownFirm,
            ],
            [
                keyFor(FIRST, { planSerial: 'nope' }),
                UnresolvedPlanReason.UnknownPlanSerial,
            ],
            [
                keyFor(FIRST, { accountSize: 1 }),
                UnresolvedPlanReason.AccountSizeMismatch,
            ],
            [
                keyFor(WITHOUT_FUNDED_RESET, { optIns: FUNDED_RESET_ONLY }),
                UnresolvedPlanReason.OptInNotOffered,
            ],
        ];
        for (const [key, reason] of cases) {
            expect(resolveUnflagged(key)).toEqual({
                kind: PlanKeyResolutionKind.Unresolved,
                reason,
            });
        }
    });

    it('never throws on malformed keys', () => {
        const malformed = [
            {
                accountSize: NaN,
                firmId: 'x',
                optIns: NO_PLAN_OPT_INS,
                planSerial: '',
            },
            {
                accountSize: 50_000,
                firmId: FIRST.firm.id,
                optIns: {},
                planSerial: serializePlanId(FIRST.plan.id),
            },
            {
                accountSize: Infinity,
                firmId: FIRST.firm.id,
                optIns: NO_PLAN_OPT_INS,
                planSerial: 'x'.repeat(10_000),
            },
        ] as unknown as PlanKey[];
        for (const key of malformed) {
            expect(() => resolveUnflagged(key)).not.toThrow();
        }
    });
});

function withOptIns(optIns: unknown): PlanKey {
    return { ...keyFor(FIRST), optIns } as unknown as PlanKey;
}

describe('resolvePlanKey with absent opt-ins', () => {
    it('never throws when optIns is null or missing', () => {
        const missing = Object.fromEntries(
            Object.entries(keyFor(FIRST)).filter(([key]) => key !== 'optIns'),
        ) as unknown as PlanKey;
        for (const key of [withOptIns(null), withOptIns(undefined), missing]) {
            expect(() => resolveUnflagged(key)).not.toThrow();
        }
    });

    it('reads absent opt-ins as none taken', () => {
        for (const optIns of [undefined, {}]) {
            expect(resolveUnflagged(withOptIns(optIns))).toEqual({
                kind: PlanKeyResolutionKind.Resolved,
                plan: FIRST.plan,
            });
        }
    });

    it('still rejects an unoffered opt-in when the other key is absent', () => {
        expect(
            resolvePlanKey({
                ...keyFor(WITHOUT_FUNDED_RESET),
                optIns: { takesFundedReset: true },
                readIssues: [],
            }),
        ).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.OptInNotOffered,
        });
    });
});

describe('resolvePlanKey on corrupt stored opt-ins', () => {
    const CORRUPT: readonly unknown[] = [
        null,
        { takesFundedReset: 'yes' },
        { takesFundedReset: 1 },
        { takesFundedReset: null },
        { takesOneTimeEarlyWithdrawal: 'true' },
        { takesFundedReset: false, takesOneTimeEarlyWithdrawal: {} },
        '[]',
        [],
    ];

    it('never reads a non-boolean opt-in as false: the reader throws and resolvePlanKey reports it', () => {
        for (const optIns of CORRUPT) {
            expect(
                () => readPlanOptIns(optIns),
                JSON.stringify(optIns),
            ).toThrow();
            expect(
                () => resolveUnflagged(withOptIns(optIns)),
                JSON.stringify(optIns),
            ).not.toThrow();
            expect(
                resolveUnflagged(withOptIns(optIns)),
                JSON.stringify(optIns),
            ).toEqual({
                kind: PlanKeyResolutionKind.Unresolved,
                reason: UnresolvedPlanReason.CorruptOptIns,
            });
        }
    });

    it('reports corrupt opt-ins whatever else is wrong with the key', () => {
        const corrupt = { takesFundedReset: 'yes' };
        const keys = [
            keyFor(FIRST, { firmId: 'not-a-firm' }),
            keyFor(FIRST, { planSerial: 'nope' }),
            keyFor(FIRST, { accountSize: 1 }),
            keyFor(WITHOUT_FUNDED_RESET),
        ];
        for (const key of keys) {
            expect(
                resolveUnflagged({
                    ...key,
                    optIns: corrupt,
                } as unknown as PlanKey),
                key.planSerial,
            ).toEqual({
                kind: PlanKeyResolutionKind.Unresolved,
                reason: UnresolvedPlanReason.CorruptOptIns,
            });
        }
    });

    it('reports corrupt opt-ins at the boundary schema as an issue, never a throw', () => {
        for (const optIns of CORRUPT) {
            const key = { ...keyFor(FIRST), optIns };
            expect(() => planKeySchema.safeParse(key)).not.toThrow();
            expect(planKeySchema.safeParse(key).success).toBe(false);
        }
    });

    it('reads every well-formed stored value the same way readPlanOptIns does', () => {
        for (const optIns of [
            {},
            { takesFundedReset: false },
            { takesOneTimeEarlyWithdrawal: false, unknownFlag: 'x' },
        ]) {
            expect(readPlanOptIns(optIns)).toEqual(NO_PLAN_OPT_INS);
            expect(resolveUnflagged(withOptIns(optIns))).toEqual({
                kind: PlanKeyResolutionKind.Resolved,
                plan: FIRST.plan,
            });
        }
    });

    it('exports the input type it accepts, which always carries the read issues of the row', () => {
        expectTypeOf(resolvePlanKey)
            .parameter(0)
            .toEqualTypeOf<LedgerOnlyPlanKey | PlanKeyInput>();
        expectTypeOf<PlanKeyInput['readIssues']>().toEqualTypeOf<
            readonly AccountReadIssue[]
        >();
        expectTypeOf<PlanKey>().not.toExtend<PlanKeyInput>();
        expectTypeOf<
            PlanKey & { readonly readIssues: readonly AccountReadIssue[] }
        >().toExtend<PlanKeyInput>();
    });
});

describe('describeUnresolvedPlan', () => {
    it('describes a plan key without needing its read issues', () => {
        expectTypeOf(describeUnresolvedPlan)
            .parameter(0)
            .toEqualTypeOf<Omit<PlanKeyInput, 'readIssues'>>();
        expectTypeOf(describeAccountReadIssue)
            .parameter(0)
            .toEqualTypeOf<
                LedgerOnlyPlanKey | Omit<PlanKeyInput, 'readIssues'>
            >();
    });

    it('names the serial and the reason in plain words', () => {
        const key = keyFor(FIRST, { planSerial: 'nope' });
        for (const reason of Object.values(UnresolvedPlanReason)) {
            const text = describeUnresolvedPlan(key, reason);
            expect(text.length).toBeGreaterThan(0);
            expect(text).not.toContain('—');
        }
        expect(
            describeUnresolvedPlan(key, UnresolvedPlanReason.UnknownPlanSerial),
        ).toContain('"nope"');
    });
});

describe('planOptInField', () => {
    it('names the stored opt-in field of each opt-in, one field per opt-in', () => {
        expect(planOptInField(PlanOptIn.FundedReset)).toBe('takesFundedReset');
        expect(planOptInField(PlanOptIn.OneTimeEarlyWithdrawal)).toBe(
            'takesOneTimeEarlyWithdrawal',
        );
        expect(
            Object.values(PlanOptIn)
                .map((optIn) => planOptInField(optIn))
                .toSorted(compareText),
        ).toEqual(Object.keys(NO_PLAN_OPT_INS).toSorted(compareText));
    });
});

describe('resolvePlanKey on an account read with issues', () => {
    const corruptOptIns: AccountReadIssue = {
        kind: AccountReadIssueKind.UnresolvablePlan,
        reason: UnresolvedPlanReason.CorruptOptIns,
    };

    it('stays unresolved for the flagged reason even though the placeholder key would resolve', () => {
        expect(
            resolvePlanKey({ ...keyFor(FIRST), readIssues: [corruptOptIns] }),
        ).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.CorruptOptIns,
        });
    });

    it('resolves a key whose only issue is unreadable personal rules, or that has none', () => {
        for (const readIssues of [
            [],
            [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        ] satisfies AccountReadIssue[][]) {
            expect(resolvePlanKey({ ...keyFor(FIRST), readIssues })).toEqual({
                kind: PlanKeyResolutionKind.Resolved,
                plan: FIRST.plan,
            });
        }
    });

    it('reports the flagged reason before one it would find itself', () => {
        expect(
            resolvePlanKey({
                ...keyFor(FIRST, { planSerial: 'retired-plan' }),
                readIssues: [corruptOptIns],
            }),
        ).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.CorruptOptIns,
        });
    });
});

describe('describeAccountReadIssue', () => {
    it('describes an unresolvable plan like describeUnresolvedPlan and unreadable personal rules in plain words', () => {
        const key = keyFor(FIRST, { planSerial: 'retired-plan' });
        expect(
            describeAccountReadIssue(key, {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.UnknownPlanSerial,
            }),
        ).toBe(
            describeUnresolvedPlan(key, UnresolvedPlanReason.UnknownPlanSerial),
        );
        const text = describeAccountReadIssue(key, {
            kind: AccountReadIssueKind.CorruptPersonalRules,
        });
        expect(text).toMatch(/personal rules/i);
        expect(text).not.toContain('—');
    });
});

describe('resolvePlanKey on a stored jsonb null in opt_ins', () => {
    it('reports corrupt opt-ins, like readPlanOptIns, instead of reading none taken', () => {
        expect(() => readPlanOptIns(null)).toThrow();
        expect(resolveUnflagged(withOptIns(null))).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.CorruptOptIns,
        });
    });
});

describe('StoredFirmId', () => {
    it('keeps a stored firm id apart from the FirmId enum until it is narrowed', () => {
        expectTypeOf<FirmId>().toExtend<StoredFirmId>();
        expectTypeOf<StoredFirmId>().not.toExtend<FirmId>();
        expectTypeOf<PlanKeyInput['firmId']>().toEqualTypeOf<StoredFirmId>();
        expectTypeOf<PlanKey['firmId']>().toEqualTypeOf<FirmId>();
    });

    it('finds the firm of every modeled firm id and nothing for a removed one', () => {
        for (const firmId of Object.values(FirmId)) {
            expect(findStoredFirm(firmId)?.id).toBe(firmId);
        }
        for (const removed of ['gone-firm', '', 'constructor', 'APEX']) {
            expect(findStoredFirm(removed), removed).toBeUndefined();
        }
    });

    it('resolves a removed firm id to an unknown firm without a cast', () => {
        const removed: StoredFirmId = 'gone-firm';
        expect(
            resolvePlanKey({
                ...keyFor(FIRST),
                firmId: removed,
                readIssues: [],
            }),
        ).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.UnknownFirm,
        });
    });
});
