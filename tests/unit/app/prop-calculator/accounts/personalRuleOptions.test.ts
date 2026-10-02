import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    overviewPlanOptInsOf,
    type OverviewRequest,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    accountFromStateRequestOf,
    buildSizingAdvisor,
    personalAccountRequestOf,
    personalAdvisorOptionsOf,
    personalLimitsOf,
    readinessOverridesOf,
    SizingAdvisorBuildKind,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import {
    AccountStatus,
    NO_FIRM_PAYOUT_COUNTS,
    personalMaxRiskOf,
    usdCents,
} from '~/lib/prop-accounts';
import {
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
const PERSONAL_RULE_OPTIONS = path.join('advice', 'personalRuleOptions.ts');
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
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
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

    it('merges the personal retained cushion into an engine policy in personalRuleOptions only, within accounts/_components', () => {
        expect(
            filesMatching(
                /Math\.max\(\s*(?:enginePolicy|policy)\.retainedCushionRequest/,
            ),
        ).toEqual([PERSONAL_RULE_OPTIONS]);
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
                retainedCushionRequest: null,
            }),
        ).toBe(spec);
    });

    it('raises the retained cushion and sets the payout request', () => {
        const spec = withPersonalPolicy(specOf(), {
            payoutRequestOverride: dollars(600),
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
                },
                { id: 'without-rules', personalRules: null },
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
                },
                { id: 'plain', personalRules: null },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );

        expect(overrides.get('limited')?.personalCaps).toEqual({
            dailyProfitCap: 900,
            maxRiskPerTrade: 125,
            maxTradesPerDay: 2,
        });
        expect(overrides.get('limited')?.personalDll).toBe(600);
        expect(overrides.get('plain')?.personalCaps).toEqual(NO_PERSONAL_CAPS);
        expect(overrides.get('plain')?.personalDll).toBeNull();
    });
});

describe('the copy-group member caps (PT-68g, F-V16)', () => {
    it('feeds the personal caps of a copy-group member', () => {
        const overrides = readinessOverridesOf(
            [
                {
                    id: 'member',
                    personalRules: { maxRiskPerTradeCents: usdCents(7500) },
                },
            ],
            NO_FIRM_PAYOUT_COUNTS,
        );

        expect(overrides.get('member')?.personalCaps.maxRiskPerTrade).toBe(
            personalMaxRiskOf({ maxRiskPerTradeCents: usdCents(7500) }),
        );
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
            personalMaxRiskPerTrade: null,
            personalRules: null,
            plan: plan(),
            rulebook: DEFAULT_RULEBOOK,
        });
        const withEmptyRules = accountFromStateRequestOf({
            account: FUNDED,
            measuredRebuyLag: null,
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
        const account = AccountReconstruction.rebuild(FUNDED_SNAPSHOT, plan());
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
