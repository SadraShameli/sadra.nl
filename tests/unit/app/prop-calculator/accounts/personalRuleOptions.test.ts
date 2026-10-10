import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    overviewPlanOptInsOf,
    type OverviewRequest,
    OverviewRequestKind,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    accountFromStateRequestOf,
    buildSizingAdvisor,
    memberPolicyOverridesOf,
    personalAccountRequestOf,
    personalAdvisorOptionsOf,
    personalLimitsOf,
    planRulesFingerprintCheckOf,
    readinessBoardInputsOf,
    readinessOverridesOf,
    reconstructedMaxRiskOf,
    SizingAdvisorBuildKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import {
    AccountStage,
    AccountStatus,
    NO_FIRM_PAYOUT_COUNTS,
    personalMaxRiskOf,
    usdCents,
} from '~/lib/prop-accounts';
import {
    type Dollars,
    dollars,
    FirmId,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    AccountSubstate,
    buildEnginePolicy,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { findFirm } from '~/lib/prop-calculator/firms';

const COMPONENTS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
    '_components',
);
const OVERVIEW_WORKER_MESSAGES = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '_workers',
    'overviewWorkerMessages.ts',
);
const PERSONAL_RULE_OPTIONS = path.join('advice', 'personalRuleOptions.ts');
const RETAINED_CUSHION_MERGE =
    /Math\.max\(\s*(?:enginePolicy|policy)\.retainedCushionRequest/;
const SOURCE_FILE = /\.tsx?$/;

function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(COMPONENTS_ROOT)
        .map((file) => path.relative(COMPONENTS_ROOT, file))
        .filter((relative) =>
            pattern.test(
                readFileSync(path.join(COMPONENTS_ROOT, relative), 'utf8'),
            ),
        );
}

function occurrencesOf(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

function plan() {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K plan missing');
    return found;
}

function requestOf(): OverviewRequest {
    return {
        firmId: FirmId.TopStep,
        kind: OverviewRequestKind.AccountFromState,
        optIns: overviewPlanOptInsOf(plan()),
        planSerial: serializePlanId(plan().id),
        spec: specOf(),
    };
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? full : [];
    });
}

function sourceOf(relative: string): string {
    return readFileSync(path.join(COMPONENTS_ROOT, relative), 'utf8');
}

function specOf(): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 40,
        plan: plan(),
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        enginePolicy: policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 30, seed: 1, trials: 10 },
    };
}

describe('one personal-rule assembly across accounts/_components (PT-68b, F-V16)', () => {
    it('builds the sizing advisor in personalRuleOptions only, within accounts/_components', () => {
        expect(filesMatching(/\bcreateSizingAdvisor\(/)).toEqual([
            PERSONAL_RULE_OPTIONS,
        ]);
    });

    it('defines no optionalDollars of its own within accounts/_components: it reads the one in ~/lib/prop-accounts (PT-68d)', () => {
        expect(filesMatching(/function optionalDollars\b/)).toEqual([]);
    });

    it('maps the personal rules to the payout readiness overrides in personalRuleOptions only, within accounts/_components', () => {
        expect(filesMatching(/function readinessOverridesOf\b/)).toEqual([
            PERSONAL_RULE_OPTIONS,
        ]);
    });

    it('gives readinessOverridesOf no default firm payout count, so a caller that omits it fails to compile (PT-36h)', () => {
        const source = readFileSync(
            path.join(COMPONENTS_ROOT, PERSONAL_RULE_OPTIONS),
            'utf8',
        );

        expect(source).not.toContain('NO_FIRM_PAYOUT_COUNTS');
        expect(source).not.toMatch(
            /function readinessOverridesOf\([^)]*firmCounts:[^)]*=/,
        );
    });

    it('merges the personal retained cushion into an engine policy in withPersonalPolicy only (overviewWorkerMessages), next to the one documented-spec builder, never within accounts/_components (PT-42c)', () => {
        expect(filesMatching(RETAINED_CUSHION_MERGE)).toEqual([]);
        expect(readFileSync(OVERVIEW_WORKER_MESSAGES, 'utf8')).toMatch(
            RETAINED_CUSHION_MERGE,
        );
    });
});

describe('personalAccountRequestOf', () => {
    it('applies the personal payout override and a larger retained cushion to the request spec, as the account list does', () => {
        const request = personalAccountRequestOf(
            requestOf(),
            {
                payoutRequestOverrideCents: usdCents(75_000),
                retainedCushionCents: usdCents(900_000),
            },
            null,
        );
        expect(request.spec.enginePolicy.payoutRequestOverride).toBe(750);
        expect(request.spec.enginePolicy.retainedCushionRequest).toBe(9000);
    });

    it('returns the request unchanged without personal rules, or when they set neither', () => {
        const request = requestOf();
        expect(personalAccountRequestOf(request, null, null)).toBe(request);
        expect(personalAccountRequestOf(request, undefined, null)).toBe(
            request,
        );
        expect(personalAccountRequestOf(request, {}, null)).toBe(request);
    });

    it('keeps the rulebook cushion when the personal one is smaller', () => {
        const base = requestOf();
        const request = personalAccountRequestOf(
            base,
            { retainedCushionCents: usdCents(10_000) },
            null,
        );
        expect(request.spec.enginePolicy.retainedCushionRequest).toBe(
            base.spec.enginePolicy.retainedCushionRequest,
        );
    });
});

describe('withPersonalPolicy', () => {
    it('is the identity when neither override is set', () => {
        const spec = specOf();
        expect(
            withPersonalPolicy(spec, {
                payoutRequestOverride: null,
                personalCaps: NO_PERSONAL_CAPS,
                personalDll: null,
                retainedCushionRequest: null,
            }),
        ).toBe(spec);
    });

    it('raises the retained cushion and sets the payout request', () => {
        const spec = withPersonalPolicy(specOf(), {
            payoutRequestOverride: dollars(600),
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            retainedCushionRequest: dollars(5000),
        });
        expect(spec.enginePolicy.payoutRequestOverride).toBe(600);
        expect(spec.enginePolicy.retainedCushionRequest).toBe(5000);
    });
});

describe('readinessOverridesOf', () => {
    it('maps valid personal rules to dollars and leaves an account without them unset', () => {
        const overrides = readinessOverridesOf(
            [
                {
                    id: 'with-rules',
                    personalRules: {
                        payoutRequestOverrideCents: usdCents(75_000),
                        retainedCushionCents: usdCents(900_000),
                    },
                    stage: AccountStage.Funded,
                },
                {
                    id: 'without-rules',
                    personalRules: null,
                    stage: AccountStage.Funded,
                },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );
        expect(overrides.get('with-rules')).toMatchObject({
            personalRequestOverride: 750,
            personalRetainedCushion: 9000,
        });
        expect(overrides.get('without-rules')).toMatchObject({
            personalRequestOverride: null,
            personalRetainedCushion: null,
        });
    });

    it('reads stored personal rules the way the advisor does, so an invalid stored value sets nothing', () => {
        const overrides = readinessOverridesOf(
            [
                {
                    id: 'invalid',
                    personalRules: {
                        payoutRequestOverrideCents: 75_000,
                        retainedCushionCents: 'nine thousand',
                    },
                    stage: AccountStage.Funded,
                },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );
        expect(overrides.get('invalid')).toMatchObject({
            personalRequestOverride: null,
            personalRetainedCushion: null,
        });
    });
});

describe('readinessOverridesOf carries the personal limits of each account (PT-68g, F-V16)', () => {
    it('maps the personal max risk, max trades, daily profit cap and daily loss limit to dollars, and none for an account without rules', () => {
        const overrides = readinessOverridesOf(
            [
                {
                    id: 'limited',
                    personalRules: {
                        dailyLossLimitCents: usdCents(60_000),
                        dailyProfitCapCents: usdCents(90_000),
                        maxRiskPerTradeCents: usdCents(12_500),
                        maxTradesPerDay: 2,
                    },
                    stage: AccountStage.Funded,
                },
                {
                    id: 'plain',
                    personalRules: null,
                    stage: AccountStage.Funded,
                },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );

        expect(overrides.get('limited')?.policy.personalCaps).toEqual({
            dailyProfitCap: 900,
            maxRiskPerTrade: 125,
            maxTradesPerDay: 2,
        });
        expect(overrides.get('limited')?.policy.personalDll).toBe(600);
        expect(overrides.get('plain')?.policy.personalCaps).toEqual(
            NO_PERSONAL_CAPS,
        );
        expect(overrides.get('plain')?.policy.personalDll).toBeNull();
    });
});

describe('the copy-group member caps (PT-68g, F-V16)', () => {
    it('feeds the personal caps of a copy-group member', () => {
        const overrides = readinessOverridesOf(
            [
                {
                    id: 'member',
                    personalRules: { maxRiskPerTradeCents: usdCents(7500) },
                    stage: AccountStage.Funded,
                },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );

        expect(
            overrides.get('member')?.policy.personalCaps.maxRiskPerTrade,
        ).toBe(personalMaxRiskOf({ maxRiskPerTradeCents: usdCents(7500) }));
    });
});

describe('readinessOverridesOf keeps the personal max risk of a Live account too (PT-108 step 13, F-62 (4), QF-2; was: nulled it as the advice did, PT-42c, PT-68g addendum)', () => {
    it('keeps the personal max risk of a funded account and of a Live one', () => {
        const personalRules = { maxRiskPerTradeCents: usdCents(7500) };
        const overrides = readinessOverridesOf(
            [
                { id: 'funded', personalRules, stage: AccountStage.Funded },
                { id: 'live', personalRules, stage: AccountStage.Live },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );

        expect(
            overrides.get('funded')?.policy.personalCaps.maxRiskPerTrade,
        ).toBe(75);
        expect(overrides.get('live')?.policy.personalCaps.maxRiskPerTrade).toBe(
            75,
        );
    });
});

describe('memberPolicyOverridesOf (PT-42c, PT-68g addendum)', () => {
    it('states no caps and no daily loss limit explicitly for a member without an override', () => {
        expect(memberPolicyOverridesOf(undefined)).toEqual({
            payoutRequestOverride: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            retainedCushionRequest: null,
        });
    });

    it('carries the member caps, daily loss limit, payout request and retained cushion', () => {
        const personalCaps = {
            ...NO_PERSONAL_CAPS,
            maxRiskPerTrade: dollars(125),
        };
        const policy = {
            payoutRequestOverride: dollars(750),
            personalCaps,
            personalDll: dollars(600),
            retainedCushionRequest: dollars(3000),
        };
        expect(
            memberPolicyOverridesOf({
                paidPayoutsSinceLastLiveAccount: null,
                personalRequestOverride: 750,
                personalRetainedCushion: 3000,
                policy,
            }),
        ).toEqual(policy);
    });

    it('hands back the policy the readiness override was built with, so the member and the account list share one policy', () => {
        const personalRules = {
            dailyLossLimitCents: usdCents(60_000),
            dailyProfitCapCents: usdCents(90_000),
            maxRiskPerTradeCents: usdCents(12_500),
            maxTradesPerDay: 2,
            payoutRequestOverrideCents: usdCents(75_000),
            retainedCushionCents: usdCents(900_000),
        };
        const overrides = readinessOverridesOf(
            [{ id: 'member', personalRules, stage: AccountStage.Funded }],
            NO_FIRM_PAYOUT_COUNTS,
        );
        const request = personalAccountRequestOf(
            requestOf(),
            personalRules,
            personalMaxRiskOf(personalRules),
        );
        if (request.kind !== OverviewRequestKind.AccountFromState) {
            throw new Error('expected an account from-state request');
        }
        const { enginePolicy } = withPersonalPolicy(
            specOf(),
            memberPolicyOverridesOf(overrides.get('member')),
        );

        expect(enginePolicy.personalCaps).toEqual(
            request.spec.enginePolicy.personalCaps,
        );
        expect(enginePolicy.personalDll).toBe(
            request.spec.enginePolicy.personalDll,
        );
        expect(enginePolicy.payoutRequestOverride).toBe(
            request.spec.enginePolicy.payoutRequestOverride,
        );
        expect(enginePolicy.retainedCushionRequest).toBe(
            request.spec.enginePolicy.retainedCushionRequest,
        );
    });
});

describe('readinessBoardInputsOf applies the personal max risk to every stage (PT-108 step 13, F-62 (4); was: dropped it for Live, PT-42c review)', () => {
    it('keeps the personal max risk of a Live account and of a funded one', () => {
        const personalRules = { maxRiskPerTradeCents: usdCents(7500) };
        const row = {
            firmId: null,
            personalRules,
            status: AccountStatus.Active,
        };
        const { overrides } = readinessBoardInputsOf(
            [
                { ...row, id: 'funded', stage: AccountStage.Funded },
                { ...row, id: 'live', stage: AccountStage.Live },
            ],
            [],
            [],
        );

        expect(
            overrides.get('funded')?.policy.personalCaps.maxRiskPerTrade,
        ).toBe(75);
        expect(overrides.get('live')?.policy.personalCaps.maxRiskPerTrade).toBe(
            75,
        );
    });
});

describe('a Live account personal max risk per trade sizes the advice (PT-108 step 13, F-62 (4), QF-2)', () => {
    const LIVE_SNAPSHOT: AccountSnapshotInput = {
        asOf: '2026-03-02',
        balance: dollars(51_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        payoutsTaken: 1,
        stage: SizingStage.Live,
        tradingDays: 12,
    };

    function liveAccountWithCap(cap: Dollars | null) {
        return AccountReconstruction.rebuild(
            LIVE_SNAPSHOT,
            plan(),
            cap,
            NO_PENDING_PAYOUT_COUNTS,
        );
    }

    it('reads the cap from the reconstructed Live account', () => {
        const capped = liveAccountWithCap(dollars(75));
        const uncapped = liveAccountWithCap(null);

        expect(reconstructedMaxRiskOf(capped)).toBe(75);
        expect(reconstructedMaxRiskOf(uncapped)).toBeNull();
    });

    it('puts the Live cap into the personal caps of the advisor options', () => {
        const account = liveAccountWithCap(dollars(75));
        const options = personalAdvisorOptionsOf({
            account,
            measuredRebuyLag: null,
            paidPayoutsSinceLastLiveAccount: null,
            personalRules: null,
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: LIVE_SNAPSHOT.asOf,
            status: AccountStatus.Active,
            today: LIVE_SNAPSHOT.asOf,
        });

        expect(options.personalCaps?.maxRiskPerTrade).toBe(75);
    });

    it('sizes no Live rung above the $75 cap', () => {
        const account = liveAccountWithCap(dollars(75));
        const build = buildSizingAdvisor(
            account,
            personalAdvisorOptionsOf({
                account,
                measuredRebuyLag: null,
                paidPayoutsSinceLastLiveAccount: null,
                personalRules: null,
                plan: plan(),
                rulebook: DEFAULT_RULEBOOK,
                snapshotAsOf: LIVE_SNAPSHOT.asOf,
                status: AccountStatus.Active,
                today: LIVE_SNAPSHOT.asOf,
            }),
        );
        if (build.kind !== SizingAdvisorBuildKind.Ready) {
            throw new Error('expected an advisor');
        }

        const rungs = build.advisor.dailyPlanCard()?.rungs ?? [];

        expect(rungs.length).toBeGreaterThan(0);
        for (const rung of rungs) {
            expect(rung.risk).toBeLessThanOrEqual(75);
        }
    });
});

describe('the plan rules fingerprint check reaches the advisor options (PT-108 step 6, F-98, F-126)', () => {
    it('builds the check from the stamp and the current fingerprint', () => {
        expect(
            planRulesFingerprintCheckOf({
                currentPlanRulesFingerprint: 'bbb',
                planRulesFingerprint: 'aaa',
            }),
        ).toEqual({ atAdvice: 'aaa', current: 'bbb' });
    });

    it('passes a null stamp as null, so the advice is never marked stale for it', () => {
        expect(
            planRulesFingerprintCheckOf({
                currentPlanRulesFingerprint: 'bbb',
                planRulesFingerprint: null,
            }),
        ).toEqual({ atAdvice: null, current: 'bbb' });
    });

    it('builds no check when the plan cannot be fingerprinted', () => {
        expect(
            planRulesFingerprintCheckOf({
                currentPlanRulesFingerprint: null,
                planRulesFingerprint: 'aaa',
            }),
        ).toBeNull();
    });

    it('forwards the check into the advisor options', () => {
        const account = AccountReconstruction.rebuild(
            {
                asOf: '2026-03-02',
                balance: dollars(51_000),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                highestEodBalance: dollars(51_000),
                highestIntradayBalance: dollars(51_000),
                payoutsTaken: 0,
                purchasedOn: '2026-02-01',
                stage: SizingStage.Eval,
                tradingDays: 10,
            },
            plan(),
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const check = { atAdvice: 'aaa', current: 'bbb' };

        const options = personalAdvisorOptionsOf({
            account,
            measuredRebuyLag: null,
            paidPayoutsSinceLastLiveAccount: null,
            personalRules: null,
            plan: plan(),
            planRulesFingerprint: check,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-03-02',
            status: AccountStatus.Active,
            today: '2026-03-02',
        });

        expect(options.planRulesFingerprint).toEqual(check);
    });
});

describe('one personal policy builder across accounts/_components (PT-42c review)', () => {
    it('reads each personal rule field in one place: the personalRuleOptions builder', () => {
        const source = sourceOf(PERSONAL_RULE_OPTIONS);
        for (const field of [
            'dailyLossLimitCents',
            'dailyProfitCapCents',
            'payoutRequestOverrideCents',
            'retainedCushionCents',
        ]) {
            expect(occurrencesOf(source, `.${field}`), field).toBe(1);
        }
    });

    it('never assembles a policy override literal in the advice value model', () => {
        expect(
            sourceOf(path.join('advice', 'adviceValueModel.ts')),
        ).not.toContain('retainedCushionRequest:');
    });
});

describe('accountFromStateRequestOf', () => {
    const FUNDED: AccountSnapshotInput = {
        asOf: '2026-03-02',
        balance: dollars(52_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firstFundedTradeOn: '2026-01-05',
        highestEodBalance: dollars(52_000),
        highestIntradayBalance: dollars(52_000),
        payoutsTaken: 0,
        stage: SizingStage.Funded,
        tradingDays: 12,
    };

    it('builds the account-from-state request of the plan, carrying the personal retained cushion and payout override', () => {
        const request = accountFromStateRequestOf({
            account: FUNDED,
            measuredRebuyLag: null,
            pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
            personalMaxRiskPerTrade: null,
            personalRules: {
                payoutRequestOverrideCents: usdCents(75_000),
                retainedCushionCents: usdCents(900_000),
            },
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
        });
        expect(request?.kind).toBe(OverviewRequestKind.AccountFromState);
        expect(request?.planSerial).toBe(serializePlanId(plan().id));
        expect(request?.spec.enginePolicy.payoutRequestOverride).toBe(750);
        expect(request?.spec.enginePolicy.retainedCushionRequest).toBe(9000);
    });

    it('is the rulebook request when the account has no personal rules', () => {
        const withoutRules = accountFromStateRequestOf({
            account: FUNDED,
            measuredRebuyLag: null,
            pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
            personalMaxRiskPerTrade: null,
            personalRules: null,
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
        });
        const withEmptyRules = accountFromStateRequestOf({
            account: FUNDED,
            measuredRebuyLag: null,
            pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
            personalMaxRiskPerTrade: null,
            personalRules: {},
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
        });
        expect(withoutRules).toEqual(withEmptyRules);
        expect(withoutRules?.spec.enginePolicy.retainedCushionRequest).toBe(
            specOf().enginePolicy.retainedCushionRequest,
        );
    });
});

describe('accountFromStateRequestOf carries the pending payout counts it is given (PT-36p, F-145)', () => {
    it('puts the own and the other accounts requested counts on the request', () => {
        const request = accountFromStateRequestOf({
            account: {
                asOf: '2026-03-02',
                balance: dollars(52_000),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                firstFundedTradeOn: '2026-01-05',
                highestEodBalance: dollars(52_000),
                highestIntradayBalance: dollars(52_000),
                payoutsTaken: 0,
                stage: SizingStage.Funded,
                tradingDays: 12,
            },
            measuredRebuyLag: null,
            pendingPayoutCounts: {
                otherAccountsPendingPayoutCount: 3,
                pendingPayoutCount: 2,
            },
            personalMaxRiskPerTrade: null,
            personalRules: null,
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
        });
        expect(request?.pendingPayoutCounts).toEqual({
            otherAccountsPendingPayoutCount: 3,
            pendingPayoutCount: 2,
        });
    });
});

describe('personalLimitsOf (PT-68e, F-V16)', () => {
    it('carries the caps and the personal DLL of the advisor options for the advice panel', () => {
        const personalCaps = {
            dailyProfitCap: dollars(700),
            maxRiskPerTrade: dollars(250),
            maxTradesPerDay: 3,
        };

        expect(
            personalLimitsOf({ personalCaps, personalDll: dollars(600) }),
        ).toEqual({ caps: personalCaps, dailyLossLimit: dollars(600) });
    });

    it('is no limits when the options set none', () => {
        expect(personalLimitsOf({})).toEqual({
            caps: NO_PERSONAL_CAPS,
            dailyLossLimit: null,
        });
        expect(
            personalLimitsOf({
                personalCaps: NO_PERSONAL_CAPS,
                personalDll: null,
            }),
        ).toEqual({ caps: NO_PERSONAL_CAPS, dailyLossLimit: null });
    });
});

describe('personalAdvisorOptionsOf takes the account status and returns the substate (PT-19i, F-118)', () => {
    const FUNDED_SNAPSHOT: AccountSnapshotInput = {
        asOf: '2026-03-02',
        balance: dollars(52_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firstFundedTradeOn: '2026-01-05',
        highestEodBalance: dollars(52_000),
        highestIntradayBalance: dollars(52_000),
        payoutsTaken: 0,
        stage: SizingStage.Funded,
        tradingDays: 12,
    };

    function optionsFor(status: AccountStatus) {
        const account = AccountReconstruction.rebuild(
            FUNDED_SNAPSHOT,
            plan(),
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const options = personalAdvisorOptionsOf({
            account,
            measuredRebuyLag: null,
            paidPayoutsSinceLastLiveAccount: null,
            personalRules: null,
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: FUNDED_SNAPSHOT.asOf,
            status,
            today: '2026-03-02',
        });
        return { account, options };
    }

    it('returns the Suspended substate for a suspended account, so the advisor built from the options is never sized', () => {
        const { account, options } = optionsFor(AccountStatus.Suspended);

        expect(options.substate).toBe(AccountSubstate.Suspended);
        const build = buildSizingAdvisor(account, options);
        expect(build.kind).toBe(SizingAdvisorBuildKind.Ready);
        if (build.kind !== SizingAdvisorBuildKind.Ready) return;
        expect(build.advisor.isSuspended()).toBe(true);
        expect(build.advisor.documented()).toBeNull();
        expect(build.advisor.caps().affordable).toBe(0);
        expect(build.advisor.optimumRequests()).toEqual([]);
    });

    it('returns no substate for every other status, so the account is sized', () => {
        const sizedStatuses = Object.values(AccountStatus).filter(
            (candidate) => candidate !== AccountStatus.Suspended,
        );
        for (const status of sizedStatuses) {
            const { account, options } = optionsFor(status);

            expect(options.substate).toBeNull();
            const build = buildSizingAdvisor(account, options);
            if (build.kind !== SizingAdvisorBuildKind.Ready) {
                throw new Error(`no advisor for ${status}`);
            }
            expect(build.advisor.documented()).not.toBeNull();
        }
    });
});
