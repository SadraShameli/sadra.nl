'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type BaseSyntheticEvent, useState } from 'react';
import { type Control, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import { errorMessage } from '~/lib/errorMessage';
import {
    AccountStage,
    accountStageLabel,
    AccountTracking,
    DashboardBalanceConvention,
    EntryTextKind,
    type ExternalFirmName,
    type FirmKey,
    FirmKeyKind,
    liveStartEntryIssues,
    type ModeledAccountRow,
    parseMoneyText,
    PlanKeyResolutionKind,
    planOptInsSchema,
    resolvePlanKey,
    RoundStatus,
    SnapshotField,
    type SnapshotFieldRule,
    todayIsoDate,
    trackedAccountOf,
    type TrackedAccountRow,
    UNLISTED_FIRM_LABEL,
    type UsdCents,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    parseFirmId,
    type Plan,
    type PlanOptIns,
    serializePlanId,
} from '~/lib/prop-calculator';
import { accountCreateSchema } from '~/lib/schemas/propAccounts';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    ACCOUNT_LIST_INPUT,
    accountFirmLabel,
    accountPlanLabel,
    accountStatusLabel,
    readIssuesOf,
    readOnlyAccountNotice,
} from './accountListFilters';
import {
    AccountPlanIntent,
    AccountPlanMode,
    accountPlanOptions,
    type AccountPlanSelection,
    type AccountStageOption,
    accountStageOptions,
    EMPTY_PERSONAL_RULES_TEXT,
    formatUsdCents,
    initialPlanSelection,
    isLiveStartBalanceShown,
    LEDGER_ONLY_STATUS_NOTE,
    parsePersonalRulesText,
    PERSONAL_RULE_FIELDS,
    personalPayoutOverrideNotice,
    type PersonalRuleKey,
    type PersonalRulesText,
    personalRulesToText,
    usdCentsToText,
} from './accountPlanOptions';
import { AccountPlanPicker } from './AccountPlanPicker';
import { ArchiveAccountButton } from './AccountsTable';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { nullIfBlank, parsedOrIssues } from './detail/formParsing';
import { ledgerOnlyPlanLabel } from './externalFirmOptions';
import {
    type CreateExternalFirm,
    ExternalFirmPicker,
} from './ExternalFirmPicker';
import { PersonalRulesFields } from './PersonalRulesFields';
import {
    emptySnapshotFormValues,
    initialSnapshotRules,
    initialSnapshotStage,
    ledgerOnlySnapshotRules,
    parseSnapshotForm,
    parseTagsText,
    type SnapshotDraft,
    snapshotDraftWarnings,
    type SnapshotDraftWarnings,
    type SnapshotFieldIssue,
    type SnapshotFormResult,
    SnapshotFormResultKind,
    type SnapshotFormValues,
    validateSnapshotDraft,
} from './snapshotFieldRules';
import { SnapshotFields } from './SnapshotFields';
import { type SnapshotPlausibilityContext } from './snapshotPlausibilityIssues';

type AccountDraft = z.output<typeof accountCreateSchema>;

type AccountFormApi = UseFormReturn<AccountFormValues>;

type StoredAccount = RouterOutputs['propAccounts']['account']['get'];

type TrackedStoredAccount = TrackedAccountRow<StoredAccount>;

const CENTS_PER_DOLLAR = 100;

const NONE = 'none';

const FIX_FIELDS_MESSAGE = 'Fix the highlighted fields before saving';

const LEDGER_SIZE_MESSAGE = 'Enter the account size in whole dollars';

const LEDGER_ONLY_NOTE =
    'The engine never values a ledger-only account. It counts in your spend, payouts, firm and funnel figures, but gets no sizing advice, no plan-rule alerts and no copy group. Upgrade it to a modeled plan once its plan is modeled.';

const LEDGER_ISSUE_PATHS: Readonly<Record<string, string>> = {
    accountSize: 'ledgerSize',
    externalFirmId: 'ledgerFirmId',
    firmId: 'ledgerFirmId',
};

const NO_SNAPSHOT_WARNINGS: SnapshotDraftWarnings = {
    fieldWarnings: [],
    formWarnings: [],
};

const PLAN_FIELDS = [
    'firmId',
    'planSerial',
    'accountSize',
    'optIns',
    'stage',
] as const;

const CONVENTION_LABEL: Readonly<Record<DashboardBalanceConvention, string>> = {
    [DashboardBalanceConvention.Nominal]:
        'Nominal: the dashboard starts at the account size',
    [DashboardBalanceConvention.ZeroBased]:
        'Zero-based: the dashboard starts at $0',
};

const personalRulesTextSchema = z.object({
    dailyLossLimitCents: z.string(),
    dailyProfitCapCents: z.string(),
    maxRiskPerTradeCents: z.string(),
    maxTradesPerDay: z.string(),
    payoutRequestOverrideCents: z.string(),
    retainedCushionCents: z.string(),
}) satisfies z.ZodType<PersonalRulesText>;

const accountFormSchema = z
    .object({
        accountSize: z.number(),
        copyGroupId: z.string(),
        dashboardConvention: z.enum(DashboardBalanceConvention),
        externalAlias: z.string(),
        firmId: z.enum(FirmId),
        firstFundedTradeOn: z.string(),
        fundedOn: z.string(),
        label: z.string(),
        ledgerExternalFirmId: z.string(),
        ledgerFirmId: z.string(),
        ledgerSize: z.string(),
        liveStartBalanceCents: z.string(),
        notes: z.string(),
        optIns: planOptInsSchema,
        overrideRoundBudget: z.boolean(),
        personalRules: personalRulesTextSchema,
        planLabel: z.string(),
        planSerial: z.string(),
        purchasedOn: z.string(),
        replacesAccountId: z.string(),
        roundId: z.string(),
        stage: z.enum(AccountStage),
        tags: z.string(),
        tracking: z.enum(AccountTracking),
    })
    .transform((values, context) => {
        const liveStart = parseMoneyText(values.liveStartBalanceCents);
        if (liveStart.kind === EntryTextKind.Invalid) {
            context.addIssue({
                code: 'custom',
                message: liveStart.message,
                path: ['liveStartBalanceCents'],
            });
        }
        const tags = parseTagsText(values.tags);
        if (tags.kind === EntryTextKind.Invalid) {
            context.addIssue({
                code: 'custom',
                message: tags.message,
                path: ['tags'],
            });
        }
        const personalRules = parsePersonalRulesText(values.personalRules);
        for (const [key, message] of personalRules.issues) {
            context.addIssue({
                code: 'custom',
                message,
                path: ['personalRules', key],
            });
        }
        const isLedgerOnly = values.tracking === AccountTracking.LedgerOnly;
        const ledgerSize = isLedgerOnly
            ? wholeDollarsOf(values.ledgerSize)
            : null;
        if (isLedgerOnly && ledgerSize === null) {
            context.addIssue({
                code: 'custom',
                message: LEDGER_SIZE_MESSAGE,
                path: ['ledgerSize'],
            });
        }
        if (
            liveStart.kind === EntryTextKind.Invalid ||
            tags.kind === EntryTextKind.Invalid ||
            personalRules.issues.size > 0 ||
            (isLedgerOnly && ledgerSize === null)
        ) {
            return z.NEVER;
        }
        const plan = isLedgerOnly
            ? {
                  accountSize: ledgerSize,
                  externalFirmId: nullIfBlank(values.ledgerExternalFirmId),
                  firmId: nullIfBlank(values.ledgerFirmId),
                  planLabel: values.planLabel,
                  tracking: AccountTracking.LedgerOnly,
              }
            : {
                  accountSize: values.accountSize,
                  firmId: values.firmId,
                  optIns: values.optIns,
                  planSerial: values.planSerial,
                  tracking: AccountTracking.Modeled,
              };
        const parsed = accountCreateSchema.safeParse({
            ...plan,
            copyGroupId: nullIfNone(values.copyGroupId),
            dashboardConvention: values.dashboardConvention,
            externalAlias: nullIfBlank(values.externalAlias),
            firstFundedTradeOn: nullIfBlank(values.firstFundedTradeOn),
            fundedOn: nullIfBlank(values.fundedOn),
            label: values.label,
            liveStartBalanceCents:
                liveStart.kind === EntryTextKind.Valid ? liveStart.cents : null,
            notes: nullIfBlank(values.notes),
            overrideRoundBudget: values.overrideRoundBudget,
            personalRules: personalRules.rules,
            purchasedOn: values.purchasedOn,
            replacesAccountId: nullIfNone(values.replacesAccountId),
            roundId: nullIfNone(values.roundId),
            stage: values.stage,
            tags: tags.tags,
        });
        if (isLedgerOnly && !parsed.success) {
            return ledgerOnlyIssues(parsed.error.issues, context);
        }
        const liveStartMessage = parsed.success
            ? liveStartPlausibilityMessage(parsed.data)
            : null;
        if (liveStartMessage === null) return parsedOrIssues(parsed, context);
        context.addIssue({
            code: 'custom',
            message: liveStartMessage,
            path: ['liveStartBalanceCents'],
        });
        return z.NEVER;
    });

interface AccountFormSubmit {
    readonly includeSnapshot: boolean;
    readonly isLedgerOnlySnapshot: boolean;
    readonly isSaving: boolean;
    readonly onSubmit: (event: BaseSyntheticEvent) => void;
    readonly setIncludeSnapshot: (isIncluded: boolean) => void;
    readonly setSnapshotValue: (field: SnapshotField, value: string) => void;
    readonly snapshotFormIssues: readonly string[];
    readonly snapshotIssues: readonly SnapshotFieldIssue[];
    readonly snapshotRules: null | readonly SnapshotFieldRule[];
    readonly snapshotValues: SnapshotFormValues;
    readonly snapshotWarnings: SnapshotDraftWarnings;
}

type AccountFormValues = z.input<typeof accountFormSchema>;

interface ExternalFirmSource {
    readonly create: CreateExternalFirm;
    readonly error: null | { readonly message: string };
    readonly firms: readonly ExternalFirmName[] | undefined;
    readonly isError: boolean;
    readonly isPending: boolean;
}

export function AccountCreator({
    initialFirm,
    initialOptIns,
    initialPlan,
}: {
    initialFirm: null | string;
    initialOptIns: PlanOptIns;
    initialPlan: null | string;
}) {
    const externalFirms = useExternalFirms();
    const selection = initialPlanSelection(
        initialFirm,
        initialPlan,
        initialOptIns,
    );
    const plan = planOf(selection);
    const [stage] = plan === null ? [] : accountStageOptions(plan);
    return (
        <>
            {externalFirms.isError && (
                <Alert className="mb-6" variant="warning">
                    <TriangleAlert />
                    <AlertTitle>Your firms could not be loaded</AlertTitle>
                    <AlertDescription>
                        {externalFirms.error?.message} You can still add an
                        account at a listed firm; a firm you added will not show
                        in the picker until this loads.
                    </AlertDescription>
                </Alert>
            )}
            <AccountForm
                defaults={{
                    ...selection,
                    copyGroupId: NONE,
                    dashboardConvention: DashboardBalanceConvention.Nominal,
                    externalAlias: '',
                    firstFundedTradeOn: '',
                    fundedOn: '',
                    label: '',
                    ledgerExternalFirmId: '',
                    ledgerFirmId: '',
                    ledgerSize: '',
                    liveStartBalanceCents: '',
                    notes: '',
                    overrideRoundBudget: false,
                    personalRules: EMPTY_PERSONAL_RULES_TEXT,
                    planLabel: '',
                    purchasedOn: todayIsoDate(new Date()),
                    replacesAccountId: NONE,
                    roundId: NONE,
                    stage: stage?.stage ?? AccountStage.Funded,
                    tags: '',
                    tracking: AccountTracking.Modeled,
                }}
                externalFirms={externalFirms.firms ?? []}
                onCreateExternalFirm={externalFirms.create}
                stored={null}
            />
        </>
    );
}

export function AccountEditor({ id }: { id: string }) {
    const accountQuery = api.propAccounts.account.get.useQuery({ id });
    const externalFirms = useExternalFirms();
    if (accountQuery.isPending) return <Skeleton className="h-96 w-full" />;
    if (accountQuery.isError) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>The account could not be loaded</AlertTitle>
                <AlertDescription>
                    {accountQuery.error.message}
                </AlertDescription>
            </Alert>
        );
    }
    const account = trackedAccountOf(accountQuery.data);
    if (externalFirms.isPending && account.externalFirmId !== null) {
        return <Skeleton className="h-96 w-full" />;
    }
    if (externalFirms.isError && account.externalFirmId !== null) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Your firms could not be loaded</AlertTitle>
                <AlertDescription>
                    {externalFirms.error?.message}
                </AlertDescription>
            </Alert>
        );
    }
    const knownFirms = externalFirms.firms ?? [];
    const resolution = resolvePlanKey(account);
    const issues = readIssuesOf(account, resolution);
    if (
        resolution.kind === PlanKeyResolutionKind.Unresolved ||
        issues.length > 0
    ) {
        return (
            <ReadOnlyAccount
                account={account}
                externalFirms={knownFirms}
                notice={readOnlyAccountNotice(account, issues)}
            />
        );
    }
    const storedFirms =
        account.externalFirmId === null ||
        knownFirms.some((firm) => firm.id === account.externalFirmId)
            ? knownFirms
            : [
                  ...knownFirms,
                  { id: account.externalFirmId, name: UNLISTED_FIRM_LABEL },
              ];
    return (
        <AccountForm
            defaults={
                account.tracking === AccountTracking.Modeled &&
                resolution.kind === PlanKeyResolutionKind.Resolved
                    ? storedDefaults(account, resolution.plan)
                    : storedLedgerOnlyDefaults(account)
            }
            externalFirms={storedFirms}
            onCreateExternalFirm={externalFirms.create}
            stored={account}
        />
    );
}

function AccountForm({
    defaults,
    externalFirms,
    onCreateExternalFirm,
    stored,
}: {
    defaults: AccountFormValues;
    externalFirms: readonly ExternalFirmName[];
    onCreateExternalFirm: CreateExternalFirm | null;
    stored: null | StoredAccount;
}) {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const groupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const roundsQuery = api.propAccounts.round.list.useQuery();
    const form = useForm<AccountFormValues>({
        defaultValues: defaults,
        resolver: zodResolver(accountFormSchema, undefined, { raw: true }),
    });

    const isCreate = stored === null;
    const selection: AccountPlanSelection = {
        accountSize: form.watch('accountSize'),
        firmId: form.watch('firmId'),
        optIns: form.watch('optIns'),
        planSerial: form.watch('planSerial'),
    };
    const personalRulesText = form.watch('personalRules');
    const isLedgerOnly = form.watch('tracking') === AccountTracking.LedgerOnly;
    const plan = isLedgerOnly ? null : planOf(selection);
    const payoutNotice =
        plan === null
            ? null
            : personalPayoutOverrideNotice(
                  plan,
                  overrideCentsOf(personalRulesText.payoutRequestOverrideCents),
              );
    const errors = form.formState.errors;
    const personalRuleErrors = Object.fromEntries(
        PERSONAL_RULE_FIELDS.flatMap((field) => {
            const message = errors.personalRules?.[field.key]?.message;
            return message === undefined ? [] : [[field.key, message]];
        }),
    ) as Partial<Record<PersonalRuleKey, string>>;
    const otherAccounts = (accountsQuery.data ?? []).filter(
        (account) => account.id !== stored?.id,
    );
    const submit = useAccountFormSubmit({ form, plan, stored });

    return (
        <Form {...form}>
            <form
                className="app-prop-accounts__form flex flex-col gap-6"
                noValidate
                onSubmit={submit.onSubmit}
            >
                <PlanCard
                    externalFirms={externalFirms}
                    form={form}
                    onCreateExternalFirm={onCreateExternalFirm}
                    plan={plan}
                    selection={selection}
                    stored={stored}
                />

                <DetailsCard
                    control={form.control}
                    groups={groupsQuery.data ?? []}
                    isLedgerOnly={isLedgerOnly}
                    otherAccounts={otherAccounts}
                    rounds={roundsQuery.data ?? []}
                />

                <Card>
                    <CardHeader>
                        <CardTitle>Personal stricter rules</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PersonalRulesFields
                            errors={personalRuleErrors}
                            onChange={(key, value) => {
                                form.setValue(`personalRules.${key}`, value, {
                                    shouldDirty: true,
                                    shouldValidate: form.formState.isSubmitted,
                                });
                            }}
                            payoutNotice={payoutNotice}
                            values={personalRulesText}
                        />
                    </CardContent>
                </Card>

                {isCreate && <InitialSnapshotCard submit={submit} />}

                <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={submit.isSaving} type="submit">
                        {isCreate ? 'Add account' : 'Save changes'}
                    </Button>
                    <Button asChild type="button" variant="ghost">
                        <Link href={routes.propCalculator.accounts.index}>
                            Cancel
                        </Link>
                    </Button>
                </div>
            </form>
        </Form>
    );
}

function DashboardConventionField({
    control,
}: {
    control: Control<AccountFormValues>;
}) {
    return (
        <FormField
            control={control}
            name="dashboardConvention"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Dashboard balance</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {Object.values(DashboardBalanceConvention).map(
                                (convention) => (
                                    <SelectItem
                                        key={convention}
                                        value={convention}
                                    >
                                        {CONVENTION_LABEL[convention]}
                                    </SelectItem>
                                ),
                            )}
                        </SelectContent>
                    </Select>
                    <FormDescription>
                        How the firm dashboard shows this account&rsquo;s
                        balance. Enter every balance below the same way.
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function DateField({
    control,
    label,
    name,
}: {
    control: Control<AccountFormValues>;
    label: string;
    name: 'firstFundedTradeOn' | 'fundedOn' | 'purchasedOn';
}) {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function DetailsCard({
    control,
    groups,
    isLedgerOnly,
    otherAccounts,
    rounds,
}: {
    control: Control<AccountFormValues>;
    groups: readonly { readonly id: string; readonly name: string }[];
    isLedgerOnly: boolean;
    otherAccounts: readonly { readonly id: string; readonly label: string }[];
    rounds: readonly {
        readonly id: string;
        readonly label: string;
        readonly status: RoundStatus;
    }[];
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                    control={control}
                    name="label"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Label</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="externalAlias"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Alias (optional)</FormLabel>
                            <FormControl>
                                <Input autoComplete="off" {...field} />
                            </FormControl>
                            <FormDescription>
                                A non-secret hint to recognize the account, such
                                as the last 4 characters of its number. Never
                                paste credentials, passwords or API keys here.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DateField
                    control={control}
                    label="Purchased on"
                    name="purchasedOn"
                />
                <DateField
                    control={control}
                    label="Funded on (optional)"
                    name="fundedOn"
                />
                <DateField
                    control={control}
                    label="First funded trade on (optional)"
                    name="firstFundedTradeOn"
                />
                {!isLedgerOnly && (
                    <FormField
                        control={control}
                        name="copyGroupId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Copy group</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value={NONE}>
                                            None (traded on its own)
                                        </SelectItem>
                                        {groups.map((group) => (
                                            <SelectItem
                                                key={group.id}
                                                value={group.id}
                                            >
                                                {group.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>
                                    Every account in a group must be in the same
                                    stage.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                <FormField
                    control={control}
                    name="roundId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Round</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value={NONE}>
                                        None (not in a round)
                                    </SelectItem>
                                    {rounds.map((round) => (
                                        <SelectItem
                                            disabled={
                                                round.status ===
                                                RoundStatus.Closed
                                            }
                                            key={round.id}
                                            value={round.id}
                                        >
                                            {round.label}
                                            {round.status ===
                                                RoundStatus.Closed &&
                                                ' (closed)'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Groups this account&apos;s spend and payouts
                                against a round budget. Only your own open
                                rounds accept new members.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="overrideRoundBudget"
                    render={({ field }) => (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={field.value}
                                    id="account-override-round-budget"
                                    onCheckedChange={(checked) => {
                                        field.onChange(checked === true);
                                    }}
                                />
                                <Label htmlFor="account-override-round-budget">
                                    Override the round budget
                                </Label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Adds this account to its round even if the round
                                has already spent its budget.
                            </p>
                        </div>
                    )}
                />
                <FormField
                    control={control}
                    name="replacesAccountId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Replaces account</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value={NONE}>None</SelectItem>
                                    {otherAccounts.map((account) => (
                                        <SelectItem
                                            key={account.id}
                                            value={account.id}
                                        >
                                            {account.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                The busted or closed account this one replaces,
                                if any.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="tags"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tags (optional)</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormDescription>
                                Separate tags with commas.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem className="md:col-span-2">
                            <FormLabel>Notes (optional)</FormLabel>
                            <FormControl>
                                <Textarea rows={3} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
}

function everyStageOption(): readonly AccountStageOption[] {
    return Object.values(AccountStage).map((stage) => ({
        label: accountStageLabel(stage),
        stage,
    }));
}

function InitialSnapshotCard({ submit }: { submit: AccountFormSubmit }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Initial snapshot</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <Switch
                        checked={submit.includeSnapshot}
                        id="account-include-snapshot"
                        onCheckedChange={submit.setIncludeSnapshot}
                    />
                    <Label htmlFor="account-include-snapshot">
                        Enter today&rsquo;s balance now
                    </Label>
                </div>
                {submit.includeSnapshot && (
                    <InitialSnapshotFields submit={submit} />
                )}
            </CardContent>
        </Card>
    );
}

function InitialSnapshotFields({ submit }: { submit: AccountFormSubmit }) {
    const entry = {
        fieldWarnings: submit.snapshotWarnings.fieldWarnings,
        formIssues: submit.snapshotFormIssues,
        formWarnings: submit.snapshotWarnings.formWarnings,
        issues: submit.snapshotIssues,
        onChange: submit.setSnapshotValue,
        values: submit.snapshotValues,
    };
    if (submit.isLedgerOnlySnapshot) {
        return (
            <SnapshotFields {...entry} tracking={AccountTracking.LedgerOnly} />
        );
    }
    return submit.snapshotRules === null ? null : (
        <SnapshotFields {...entry} rules={submit.snapshotRules} />
    );
}

function ledgerFirmKeyOf(
    firmId: string,
    externalFirmId: string,
): FirmKey | null {
    if (firmId !== '') return { firmId, kind: FirmKeyKind.Modeled };
    return externalFirmId === ''
        ? null
        : { externalFirmId, kind: FirmKeyKind.External };
}

function ledgerOnlyIssues(
    issues: readonly z.core.$ZodIssue[],
    context: z.RefinementCtx,
): never {
    for (const issue of issues) {
        const [head, ...rest] = issue.path;
        const mapped =
            typeof head === 'string'
                ? (LEDGER_ISSUE_PATHS[head] ?? head)
                : head;
        context.addIssue({
            code: 'custom',
            message: issue.message,
            path: mapped === undefined ? [] : [mapped, ...rest],
        });
    }
    return z.NEVER;
}

function LedgerOnlyPlanFields({
    externalFirms,
    form,
    intent,
    onCreateExternalFirm,
    selection,
}: {
    externalFirms: readonly ExternalFirmName[];
    form: AccountFormApi;
    intent: AccountPlanIntent;
    onCreateExternalFirm: CreateExternalFirm | null;
    selection: AccountPlanSelection;
}) {
    const firmKey = ledgerFirmKeyOf(
        form.watch('ledgerFirmId'),
        form.watch('ledgerExternalFirmId'),
    );
    const listedFirmId =
        firmKey?.kind === FirmKeyKind.Modeled
            ? parseFirmId(firmKey.firmId)
            : undefined;
    const errors = form.formState.errors;
    const fill = (next: AccountPlanSelection) => {
        form.setValue('firmId', next.firmId);
        form.setValue('planSerial', next.planSerial);
        form.setValue('accountSize', next.accountSize);
        form.setValue('optIns', next.optIns);
        const nextPlan =
            findFirm(next.firmId)?.findPlanBySerial(next.planSerial) ?? null;
        form.setValue('ledgerSize', String(next.accountSize), {
            shouldDirty: true,
        });
        if (nextPlan !== null) {
            form.setValue(
                'planLabel',
                ledgerOnlyPlanLabel(nextPlan, next.accountSize),
                { shouldDirty: true },
            );
        }
    };
    return (
        <div className="flex flex-col gap-4">
            <ExternalFirmPicker
                disabled={false}
                error={errors.ledgerFirmId?.message ?? null}
                externalFirms={externalFirms}
                onChange={(next) => {
                    if (next.kind === FirmKeyKind.External) {
                        form.setValue(
                            'ledgerExternalFirmId',
                            next.externalFirmId,
                        );
                        form.setValue('ledgerFirmId', '');
                        return;
                    }
                    form.setValue('ledgerFirmId', next.firmId);
                    form.setValue('ledgerExternalFirmId', '');
                    const listed = parseFirmId(next.firmId);
                    const listedFirm =
                        listed === undefined ? undefined : findFirm(listed);
                    const [firstOption] =
                        listedFirm === undefined
                            ? []
                            : accountPlanOptions(listedFirm, intent);
                    const first =
                        firstOption === undefined
                            ? undefined
                            : (listedFirm?.findPlanBySerial(
                                  firstOption.planSerial,
                              ) ?? undefined);
                    if (listed !== undefined && first !== undefined) {
                        fill({
                            accountSize: first.id.accountSize,
                            firmId: listed,
                            optIns: selection.optIns,
                            planSerial: serializePlanId(first.id),
                        });
                    }
                }}
                onCreate={onCreateExternalFirm}
                value={firmKey}
            />
            {listedFirmId !== undefined &&
                listedFirmId === selection.firmId && (
                    <AccountPlanPicker
                        errors={[]}
                        intent={intent}
                        mode={AccountPlanMode.LedgerOnly}
                        onChange={fill}
                        value={selection}
                    />
                )}
            <div className="grid gap-4 md:grid-cols-2">
                <FormField
                    control={form.control}
                    name="ledgerSize"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Account size ($)</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="off"
                                    inputMode="numeric"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Any size, in whole dollars, as the firm sold it.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="planLabel"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Plan</FormLabel>
                            <FormControl>
                                <Input autoComplete="off" {...field} />
                            </FormControl>
                            <FormDescription>
                                The plan name as the firm shows it.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <p className="text-sm text-muted-foreground">{LEDGER_ONLY_NOTE}</p>
            <p className="text-sm text-muted-foreground">
                {LEDGER_ONLY_STATUS_NOTE}
            </p>
        </div>
    );
}

function LedgerOnlySwitch({
    form,
    isLocked,
    onModeled,
    plan,
    selection,
}: {
    form: AccountFormApi;
    isLocked: boolean;
    onModeled: () => void;
    plan: null | Plan;
    selection: AccountPlanSelection;
}) {
    const isLedgerOnly = form.watch('tracking') === AccountTracking.LedgerOnly;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <Switch
                    checked={isLedgerOnly}
                    disabled={isLocked}
                    id="account-ledger-only"
                    onCheckedChange={(checked) => {
                        if (!checked) {
                            form.setValue('tracking', AccountTracking.Modeled, {
                                shouldDirty: true,
                            });
                            onModeled();
                            return;
                        }
                        form.setValue('tracking', AccountTracking.LedgerOnly, {
                            shouldDirty: true,
                        });
                        form.setValue('copyGroupId', NONE, {
                            shouldDirty: true,
                        });
                        form.setValue('ledgerFirmId', selection.firmId);
                        form.setValue('ledgerExternalFirmId', '');
                        form.setValue(
                            'ledgerSize',
                            String(selection.accountSize),
                        );
                        form.setValue(
                            'planLabel',
                            plan === null
                                ? ''
                                : ledgerOnlyPlanLabel(
                                      plan,
                                      selection.accountSize,
                                  ),
                        );
                    }}
                />
                <Label htmlFor="account-ledger-only">
                    Firm not listed or size not modeled
                </Label>
            </div>
            {isLocked && isLedgerOnly && (
                <span className="text-sm text-muted-foreground">
                    This account is ledger only. Upgrade it from its account
                    page once its plan is modeled.
                </span>
            )}
        </div>
    );
}

function LiveStartBalanceField({
    control,
}: {
    control: Control<AccountFormValues>;
}) {
    return (
        <FormField
            control={control}
            name="liveStartBalanceCents"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Live start balance ($)</FormLabel>
                    <FormControl>
                        <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormDescription>
                        The balance the live account started with or was moved
                        over with.
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function liveStartCentsOf(stage: AccountStage, text: string): null | UsdCents {
    if (!isLiveStartBalanceShown(stage)) return null;
    const parsed = parseMoneyText(text);
    return parsed.kind === EntryTextKind.Valid ? parsed.cents : null;
}

function liveStartPlausibilityMessage(draft: AccountDraft): null | string {
    if (
        draft.liveStartBalanceCents === null ||
        draft.tracking === AccountTracking.LedgerOnly
    ) {
        return null;
    }
    const plan = planOf(draft);
    if (plan === null) return null;
    const issues = liveStartEntryIssues(plan, AccountStage.Live, draft);
    return issues.length === 0
        ? null
        : issues.map((issue) => issue.message).join(' ');
}

function nullIfNone(value: string): null | string {
    return value === NONE ? null : value;
}

function overrideCentsOf(text: string): undefined | UsdCents {
    const parsed = parseMoneyText(text);
    return parsed.kind === EntryTextKind.Valid && parsed.cents > 0
        ? parsed.cents
        : undefined;
}

function PlanCard({
    externalFirms,
    form,
    onCreateExternalFirm,
    plan,
    selection,
    stored,
}: {
    externalFirms: readonly ExternalFirmName[];
    form: AccountFormApi;
    onCreateExternalFirm: CreateExternalFirm | null;
    plan: null | Plan;
    selection: AccountPlanSelection;
    stored: null | StoredAccount;
}) {
    const errors = form.formState.errors;
    const stage = form.watch('stage');
    const isLedgerOnly = form.watch('tracking') === AccountTracking.LedgerOnly;
    const intent =
        stored === null
            ? AccountPlanIntent.NewPurchase
            : AccountPlanIntent.ExistingAccount;
    const planErrors = [
        errors.firmId?.message,
        errors.planSerial?.message,
        errors.accountSize?.message,
        errors.optIns?.message,
        errors.optIns?.takesFundedReset?.message,
        errors.optIns?.takesOneTimeEarlyWithdrawal?.message,
    ].filter((message): message is string => message !== undefined);
    const stageOptions = isLedgerOnly
        ? everyStageOption()
        : plan === null
          ? []
          : accountStageOptions(plan);

    const setSelection = (next: AccountPlanSelection) => {
        form.setValue('firmId', next.firmId, { shouldDirty: true });
        form.setValue('planSerial', next.planSerial, { shouldDirty: true });
        form.setValue('accountSize', next.accountSize, { shouldDirty: true });
        form.setValue('optIns', next.optIns, { shouldDirty: true });
        const nextPlan = planOf(next);
        const offered = nextPlan === null ? [] : accountStageOptions(nextPlan);
        const [firstStage] = offered;
        if (
            stored === null &&
            firstStage !== undefined &&
            offered.every((option) => option.stage !== stage)
        ) {
            form.setValue('stage', firstStage.stage, { shouldDirty: true });
        }
        if (form.formState.isSubmitted) void form.trigger(PLAN_FIELDS);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Firm and plan</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <LedgerOnlySwitch
                    form={form}
                    isLocked={stored !== null}
                    onModeled={() => {
                        setSelection(
                            initialPlanSelection(
                                selection.firmId,
                                selection.planSerial,
                                selection.optIns,
                            ),
                        );
                    }}
                    plan={plan}
                    selection={selection}
                />
                {isLedgerOnly ? (
                    <LedgerOnlyPlanFields
                        externalFirms={externalFirms}
                        form={form}
                        intent={intent}
                        onCreateExternalFirm={onCreateExternalFirm}
                        selection={selection}
                    />
                ) : (
                    <AccountPlanPicker
                        errors={planErrors}
                        intent={intent}
                        onChange={setSelection}
                        value={selection}
                    />
                )}
                {stored === null ? (
                    <StageField
                        form={form}
                        isInstantFunded={plan?.isInstantFunded === true}
                        options={stageOptions}
                    />
                ) : (
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">
                            Stage: {accountStageLabel(stored.stage)}
                            {', status: '}
                            {accountStatusLabel(stored.status)}
                        </span>
                        <span className="text-muted-foreground">
                            Stage and status change through lifecycle events on
                            the account page, not here.
                        </span>
                        {errors.stage?.message !== undefined && (
                            <span className="text-destructive">
                                {errors.stage.message}
                            </span>
                        )}
                    </div>
                )}
                <DashboardConventionField control={form.control} />
                {(isLiveStartBalanceShown(stage) ||
                    (stored !== null &&
                        stored.liveStartBalanceCents !== null)) && (
                    <LiveStartBalanceField control={form.control} />
                )}
            </CardContent>
        </Card>
    );
}

function planOf(selection: AccountPlanSelection): null | Plan {
    const resolution = resolvePlanKey({ ...selection, readIssues: [] });
    return resolution.kind === PlanKeyResolutionKind.Resolved
        ? resolution.plan
        : null;
}

function ReadOnlyAccount({
    account,
    externalFirms,
    notice,
}: {
    account: TrackedStoredAccount;
    externalFirms: readonly ExternalFirmName[];
    notice: string;
}) {
    const router = useRouter();
    return (
        <div className="flex flex-col gap-4">
            <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>This account is read-only</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
            </Alert>
            <dl
                className={cn(
                    'grid gap-2 text-sm sm:grid-cols-[max-content_1fr]',
                )}
            >
                <dt className="text-muted-foreground">Label</dt>
                <dd>{account.label}</dd>
                <dt className="text-muted-foreground">Firm</dt>
                <dd>{accountFirmLabel(account, externalFirms)}</dd>
                <dt className="text-muted-foreground">Plan</dt>
                <dd>{accountPlanLabel(account)}</dd>
                <dt className="text-muted-foreground">Stage</dt>
                <dd>{accountStageLabel(account.stage)}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{accountStatusLabel(account.status)}</dd>
                <dt className="text-muted-foreground">Purchased on</dt>
                <dd>{account.purchasedOn}</dd>
                {account.archivedAt !== null && (
                    <>
                        <dt className="text-muted-foreground">Archived</dt>
                        <dd>Yes</dd>
                    </>
                )}
                {account.liveStartBalanceCents !== null && (
                    <>
                        <dt className="text-muted-foreground">
                            Live start balance
                        </dt>
                        <dd>{formatUsdCents(account.liveStartBalanceCents)}</dd>
                    </>
                )}
            </dl>
            <div className="flex items-center gap-2">
                <ArchiveAccountButton account={account} />
                <DeleteAccountDialog
                    accountId={account.id}
                    label={account.label}
                    onDeleted={() => {
                        router.push(routes.propCalculator.accounts.index);
                    }}
                />
                <Button asChild variant="ghost">
                    <Link href={routes.propCalculator.accounts.index}>
                        Back to accounts
                    </Link>
                </Button>
            </div>
        </div>
    );
}

function StageField({
    form,
    isInstantFunded,
    options,
}: {
    form: AccountFormApi;
    isInstantFunded: boolean;
    options: readonly AccountStageOption[];
}) {
    return (
        <FormField
            control={form.control}
            name="stage"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select
                        onValueChange={(next) => {
                            field.onChange(next);
                            const isLive =
                                z.enum(AccountStage).safeParse(next).data ===
                                AccountStage.Live;
                            if (!isLive) {
                                form.setValue('liveStartBalanceCents', '');
                            }
                        }}
                        value={field.value}
                    >
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {options.map((option) => (
                                <SelectItem
                                    key={option.stage}
                                    value={option.stage}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {isInstantFunded && (
                        <FormDescription>
                            This plan is instant funded, so it has no evaluation
                            stage.
                        </FormDescription>
                    )}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function storedDefaults(
    account: ModeledAccountRow<StoredAccount>,
    plan: Plan,
): AccountFormValues {
    return {
        ...storedDetailDefaults(account),
        accountSize: account.accountSize,
        firmId: plan.id.firm,
        ledgerExternalFirmId: '',
        ledgerFirmId: '',
        ledgerSize: '',
        optIns: account.optIns,
        planLabel: '',
        planSerial: account.planSerial,
        tracking: AccountTracking.Modeled,
    };
}

function storedDetailDefaults(
    account: TrackedStoredAccount,
): Omit<
    AccountFormValues,
    | 'accountSize'
    | 'firmId'
    | 'ledgerExternalFirmId'
    | 'ledgerFirmId'
    | 'ledgerSize'
    | 'optIns'
    | 'planLabel'
    | 'planSerial'
    | 'tracking'
> {
    return {
        copyGroupId: account.copyGroupId ?? NONE,
        dashboardConvention: account.dashboardConvention,
        externalAlias: account.externalAlias ?? '',
        firstFundedTradeOn: account.firstFundedTradeOn ?? '',
        fundedOn: account.fundedOn ?? '',
        label: account.label,
        liveStartBalanceCents:
            account.liveStartBalanceCents === null
                ? ''
                : usdCentsToText(account.liveStartBalanceCents),
        notes: account.notes ?? '',
        overrideRoundBudget: false,
        personalRules: personalRulesToText(account.personalRules),
        purchasedOn: account.purchasedOn,
        replacesAccountId: account.replacesAccountId ?? NONE,
        roundId: account.roundId ?? NONE,
        stage: account.stage,
        tags: account.tags.join(', '),
    };
}

function storedLedgerOnlyDefaults(
    account: TrackedStoredAccount,
): AccountFormValues {
    const selection = initialPlanSelection(
        account.firmId,
        null,
        account.optIns,
    );
    return {
        ...storedDetailDefaults(account),
        ...selection,
        accountSize: account.accountSize,
        ledgerExternalFirmId: account.externalFirmId ?? '',
        ledgerFirmId: account.firmId ?? '',
        ledgerSize: String(account.accountSize),
        planLabel: account.planLabel ?? '',
        tracking: AccountTracking.LedgerOnly,
    };
}

function toUpdateInput(draft: AccountDraft, id: string) {
    const details = {
        copyGroupId: draft.copyGroupId,
        dashboardConvention: draft.dashboardConvention,
        externalAlias: draft.externalAlias,
        firstFundedTradeOn: draft.firstFundedTradeOn,
        fundedOn: draft.fundedOn,
        id,
        label: draft.label,
        liveStartBalanceCents: draft.liveStartBalanceCents,
        notes: draft.notes,
        overrideRoundBudget: draft.overrideRoundBudget,
        personalRules: draft.personalRules,
        purchasedOn: draft.purchasedOn,
        replacesAccountId: draft.replacesAccountId,
        roundId: draft.roundId,
        tags: draft.tags,
    };
    switch (draft.tracking) {
        case AccountTracking.LedgerOnly: {
            return {
                ...details,
                accountSize: draft.accountSize,
                externalFirmId: draft.externalFirmId,
                firmId: draft.firmId,
                optIns: draft.optIns,
                planLabel: draft.planLabel,
                tracking: draft.tracking,
            };
        }
        case AccountTracking.Modeled: {
            return {
                ...details,
                accountSize: draft.accountSize,
                firmId: draft.firmId,
                optIns: draft.optIns,
                planSerial: draft.planSerial,
                tracking: draft.tracking,
            };
        }
    }
}

function useAccountFormSubmit({
    form,
    plan,
    stored,
}: {
    form: AccountFormApi;
    plan: null | Plan;
    stored: null | StoredAccount;
}): AccountFormSubmit {
    const router = useRouter();
    const utilities = api.useUtils();
    const create = api.propAccounts.account.create.useMutation();
    const update = api.propAccounts.account.update.useMutation();
    const snapshotCreation = api.propAccounts.snapshot.create.useMutation();
    const [includeSnapshot, setIncludeSnapshot] = useState(true);
    const [snapshotValues, setSnapshotValues] = useState<SnapshotFormValues>(
        () => emptySnapshotFormValues(todayIsoDate(new Date())),
    );
    const [isSnapshotChecked, setIsSnapshotChecked] = useState(false);
    const isLedgerOnlySnapshot =
        form.watch('tracking') === AccountTracking.LedgerOnly;
    const accountStage = form.watch('stage');
    const snapshotAccount = {
        fundedOn: form.watch('fundedOn'),
        purchasedOn: form.watch('purchasedOn'),
        stage: accountStage,
    };
    const asOf = snapshotValues[SnapshotField.AsOf];
    const snapshotRules = isLedgerOnlySnapshot
        ? ledgerOnlySnapshotRules()
        : plan === null
          ? null
          : initialSnapshotRules(plan, snapshotAccount, asOf);
    const plausibility: null | SnapshotPlausibilityContext =
        plan === null || isLedgerOnlySnapshot
            ? null
            : {
                  account: {
                      accountSize: form.watch('accountSize'),
                      dashboardConvention: form.watch('dashboardConvention'),
                      liveStartBalanceCents: liveStartCentsOf(
                          accountStage,
                          form.watch('liveStartBalanceCents'),
                      ),
                  },
                  plan,
                  stage: initialSnapshotStage(plan, snapshotAccount, asOf),
              };
    const isSnapshotEntered = stored === null && includeSnapshot;

    const checkSnapshot = (): null | SnapshotFormResult => {
        if (isLedgerOnlySnapshot) {
            return parseSnapshotForm(snapshotValues, ledgerOnlySnapshotRules());
        }
        return snapshotRules === null || plausibility === null
            ? null
            : validateSnapshotDraft(
                  snapshotValues,
                  snapshotRules,
                  plausibility,
              );
    };

    const shownResult =
        isSnapshotChecked && isSnapshotEntered ? checkSnapshot() : null;
    const snapshotWarnings =
        !isSnapshotEntered || snapshotRules === null || plausibility === null
            ? NO_SNAPSHOT_WARNINGS
            : snapshotDraftWarnings(
                  snapshotValues,
                  snapshotRules,
                  plausibility,
              );
    const shownInvalid =
        shownResult?.kind === SnapshotFormResultKind.Invalid
            ? shownResult
            : null;

    const validateSnapshot = (): null | SnapshotDraft | undefined => {
        if (!isSnapshotEntered) return null;
        setIsSnapshotChecked(true);
        const result = checkSnapshot();
        return result?.kind === SnapshotFormResultKind.Valid
            ? result.snapshot
            : undefined;
    };

    const saveInitialSnapshot = async (
        accountId: string,
        snapshot: SnapshotDraft,
    ) => {
        try {
            await snapshotCreation.mutateAsync({ ...snapshot, accountId });
        } catch (error) {
            toast.error(
                `The account was saved, but its snapshot was not: ${errorMessage(error)}`,
            );
        }
    };

    const save = async (values: AccountFormValues) => {
        const parsed = accountFormSchema.safeParse(values);
        if (!parsed.success) {
            toast.error(FIX_FIELDS_MESSAGE);
            return;
        }
        const draft = parsed.data;
        const snapshot = validateSnapshot();
        if (snapshot === undefined) {
            toast.error('Fix the initial snapshot before saving');
            return;
        }
        try {
            if (stored === null) {
                const created = await create.mutateAsync(
                    isLiveStartBalanceShown(draft.stage)
                        ? draft
                        : { ...draft, liveStartBalanceCents: null },
                );
                if (snapshot !== null) {
                    await saveInitialSnapshot(created.id, snapshot);
                }
                toast.success(`${draft.label} added`);
            } else {
                await update.mutateAsync(toUpdateInput(draft, stored.id));
                toast.success(`${draft.label} saved`);
            }
        } catch (error) {
            toast.error(errorMessage(error));
            return;
        } finally {
            await utilities.propAccounts.invalidate();
        }
        router.push(routes.propCalculator.accounts.index);
    };

    return {
        includeSnapshot,
        isLedgerOnlySnapshot,
        isSaving:
            create.isPending || update.isPending || snapshotCreation.isPending,
        onSubmit: (event) => {
            validateSnapshot();
            void form.handleSubmit(save, () => {
                toast.error(FIX_FIELDS_MESSAGE);
            })(event);
        },
        setIncludeSnapshot,
        setSnapshotValue: (field, value) => {
            setSnapshotValues((current) => ({ ...current, [field]: value }));
        },
        snapshotFormIssues: shownInvalid?.formIssues ?? [],
        snapshotIssues: shownInvalid?.issues ?? [],
        snapshotRules,
        snapshotValues,
        snapshotWarnings,
    };
}

function useExternalFirms(): ExternalFirmSource {
    const utilities = api.useUtils();
    const listQuery = api.propAccounts.externalFirm.list.useQuery();
    const creation = api.propAccounts.externalFirm.create.useMutation();
    return {
        create: async (name) => {
            const created = await creation.mutateAsync({ name });
            await utilities.propAccounts.externalFirm.list.invalidate();
            return created;
        },
        error: listQuery.error,
        firms: listQuery.data,
        isError: listQuery.isError,
        isPending: listQuery.isPending,
    };
}

function wholeDollarsOf(text: string): null | number {
    const parsed = parseMoneyText(text);
    return parsed.kind === EntryTextKind.Valid &&
        parsed.cents > 0 &&
        parsed.cents % CENTS_PER_DOLLAR === 0
        ? parsed.cents / CENTS_PER_DOLLAR
        : null;
}
