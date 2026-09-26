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
    DashboardBalanceConvention,
    PlanKeyResolutionKind,
    planOptInsSchema,
    resolvePlanKey,
    type SnapshotField,
    type SnapshotFieldRule,
    snapshotFieldRules,
    todayIsoDate,
    type UsdCents,
} from '~/lib/prop-accounts';
import { FirmId, type Plan } from '~/lib/prop-calculator';
import { accountCreateSchema } from '~/lib/schemas/propAccounts';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    ACCOUNT_LIST_INPUT,
    accountStatusLabel,
    readIssuesOf,
    readOnlyAccountNotice,
} from './accountListFilters';
import {
    type AccountPlanSelection,
    accountStageLabel,
    type AccountStageOption,
    accountStageOptions,
    EMPTY_PERSONAL_RULES_TEXT,
    formatUsdCents,
    initialPlanSelection,
    isLiveStartBalanceShown,
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
import { PersonalRulesFields } from './PersonalRulesFields';
import {
    emptySnapshotFormValues,
    EntryTextKind,
    parseMoneyText,
    parseSnapshotForm,
    parseTagsText,
    type SnapshotDraft,
    type SnapshotFieldIssue,
    SnapshotFormResultKind,
    type SnapshotFormValues,
} from './snapshotFieldRules';
import { SnapshotFields } from './SnapshotFields';

type AccountDraft = z.output<typeof accountCreateSchema>;

type AccountFormApi = UseFormReturn<AccountFormValues>;

type StoredAccount = RouterOutputs['propAccounts']['account']['get'];

const NONE = 'none';

const FIX_FIELDS_MESSAGE = 'Fix the highlighted fields before saving';

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
        liveStartBalanceCents: z.string(),
        notes: z.string(),
        optIns: planOptInsSchema,
        personalRules: personalRulesTextSchema,
        planSerial: z.string(),
        purchasedOn: z.string(),
        replacesAccountId: z.string(),
        stage: z.enum(AccountStage),
        tags: z.string(),
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
        if (
            liveStart.kind === EntryTextKind.Invalid ||
            tags.kind === EntryTextKind.Invalid ||
            personalRules.issues.size > 0
        ) {
            return z.NEVER;
        }
        const parsed = accountCreateSchema.safeParse({
            accountSize: values.accountSize,
            copyGroupId: nullIfNone(values.copyGroupId),
            dashboardConvention: values.dashboardConvention,
            externalAlias: nullIfBlank(values.externalAlias),
            firmId: values.firmId,
            firstFundedTradeOn: nullIfBlank(values.firstFundedTradeOn),
            fundedOn: nullIfBlank(values.fundedOn),
            label: values.label,
            liveStartBalanceCents:
                liveStart.kind === EntryTextKind.Valid ? liveStart.cents : null,
            notes: nullIfBlank(values.notes),
            optIns: values.optIns,
            personalRules: personalRules.rules,
            planSerial: values.planSerial,
            purchasedOn: values.purchasedOn,
            replacesAccountId: nullIfNone(values.replacesAccountId),
            stage: values.stage,
            tags: tags.tags,
        });
        if (parsed.success) return parsed.data;
        for (const issue of parsed.error.issues) {
            context.addIssue({
                code: 'custom',
                message: issue.message,
                path: [...issue.path],
            });
        }
        return z.NEVER;
    });

interface AccountFormSubmit {
    readonly includeSnapshot: boolean;
    readonly isSaving: boolean;
    readonly onSubmit: (event: BaseSyntheticEvent) => void;
    readonly setIncludeSnapshot: (isIncluded: boolean) => void;
    readonly setSnapshotValue: (field: SnapshotField, value: string) => void;
    readonly snapshotIssues: readonly SnapshotFieldIssue[];
    readonly snapshotValues: SnapshotFormValues;
}

type AccountFormValues = z.input<typeof accountFormSchema>;

export function AccountCreator({
    initialFirm,
    initialPlan,
}: {
    initialFirm: null | string;
    initialPlan: null | string;
}) {
    const selection = initialPlanSelection(initialFirm, initialPlan);
    const plan = planOf(selection);
    const [stage] = plan === null ? [] : accountStageOptions(plan);
    return (
        <AccountForm
            defaults={{
                ...selection,
                copyGroupId: NONE,
                dashboardConvention: DashboardBalanceConvention.Nominal,
                externalAlias: '',
                firstFundedTradeOn: '',
                fundedOn: '',
                label: '',
                liveStartBalanceCents: '',
                notes: '',
                personalRules: EMPTY_PERSONAL_RULES_TEXT,
                purchasedOn: todayIsoDate(new Date()),
                replacesAccountId: NONE,
                stage: stage?.stage ?? AccountStage.Funded,
                tags: '',
            }}
            stored={null}
        />
    );
}

export function AccountEditor({ id }: { id: string }) {
    const accountQuery = api.propAccounts.account.get.useQuery({ id });
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
    const account = accountQuery.data;
    const resolution = resolvePlanKey(account);
    const issues = readIssuesOf(account, resolution);
    if (
        resolution.kind === PlanKeyResolutionKind.Unresolved ||
        issues.length > 0
    ) {
        return (
            <ReadOnlyAccount
                account={account}
                notice={readOnlyAccountNotice(account, issues)}
            />
        );
    }
    return (
        <AccountForm
            defaults={storedDefaults(account, resolution.plan)}
            stored={account}
        />
    );
}

function AccountForm({
    defaults,
    stored,
}: {
    defaults: AccountFormValues;
    stored: null | StoredAccount;
}) {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const groupsQuery = api.propAccounts.copyGroup.list.useQuery();
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
    const stage = form.watch('stage');
    const personalRulesText = form.watch('personalRules');
    const plan = planOf(selection);
    const snapshotRules =
        plan === null ? null : snapshotFieldRules(plan, stage);
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
    const submit = useAccountFormSubmit({ form, snapshotRules, stored });

    return (
        <Form {...form}>
            <form
                className="app-prop-accounts__form flex flex-col gap-6"
                noValidate
                onSubmit={submit.onSubmit}
            >
                <PlanCard
                    form={form}
                    plan={plan}
                    selection={selection}
                    stored={stored}
                />

                <DetailsCard
                    control={form.control}
                    groups={groupsQuery.data ?? []}
                    otherAccounts={otherAccounts}
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

                {isCreate && (
                    <InitialSnapshotCard
                        rules={snapshotRules}
                        submit={submit}
                    />
                )}

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
    otherAccounts,
}: {
    control: Control<AccountFormValues>;
    groups: readonly { readonly id: string; readonly name: string }[];
    otherAccounts: readonly { readonly id: string; readonly label: string }[];
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

function InitialSnapshotCard({
    rules,
    submit,
}: {
    rules: null | readonly SnapshotFieldRule[];
    submit: AccountFormSubmit;
}) {
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
                {submit.includeSnapshot && rules !== null && (
                    <SnapshotFields
                        issues={submit.snapshotIssues}
                        onChange={submit.setSnapshotValue}
                        rules={rules}
                        values={submit.snapshotValues}
                    />
                )}
            </CardContent>
        </Card>
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

function nullIfBlank(text: string): null | string {
    return text.trim() === '' ? null : text;
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
    form,
    plan,
    selection,
    stored,
}: {
    form: AccountFormApi;
    plan: null | Plan;
    selection: AccountPlanSelection;
    stored: null | StoredAccount;
}) {
    const errors = form.formState.errors;
    const stage = form.watch('stage');
    const planErrors = [
        errors.firmId?.message,
        errors.planSerial?.message,
        errors.accountSize?.message,
        errors.optIns?.message,
        errors.optIns?.takesFundedReset?.message,
        errors.optIns?.takesOneTimeEarlyWithdrawal?.message,
    ].filter((message): message is string => message !== undefined);
    const stageOptions = plan === null ? [] : accountStageOptions(plan);

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
                <AccountPlanPicker
                    errors={planErrors}
                    onChange={setSelection}
                    value={selection}
                />
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
    notice,
}: {
    account: StoredAccount;
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
                <dd>{account.firmId}</dd>
                <dt className="text-muted-foreground">Plan</dt>
                <dd>{account.planSerial}</dd>
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

function storedDefaults(account: StoredAccount, plan: Plan): AccountFormValues {
    return {
        accountSize: account.accountSize,
        copyGroupId: account.copyGroupId ?? NONE,
        dashboardConvention: account.dashboardConvention,
        externalAlias: account.externalAlias ?? '',
        firmId: plan.id.firm,
        firstFundedTradeOn: account.firstFundedTradeOn ?? '',
        fundedOn: account.fundedOn ?? '',
        label: account.label,
        liveStartBalanceCents:
            account.liveStartBalanceCents === null
                ? ''
                : usdCentsToText(account.liveStartBalanceCents),
        notes: account.notes ?? '',
        optIns: account.optIns,
        personalRules: personalRulesToText(account.personalRules),
        planSerial: account.planSerial,
        purchasedOn: account.purchasedOn,
        replacesAccountId: account.replacesAccountId ?? NONE,
        stage: account.stage,
        tags: account.tags.join(', '),
    };
}

function toUpdateInput(draft: AccountDraft, id: string) {
    return {
        accountSize: draft.accountSize,
        copyGroupId: draft.copyGroupId,
        dashboardConvention: draft.dashboardConvention,
        externalAlias: draft.externalAlias,
        firmId: draft.firmId,
        firstFundedTradeOn: draft.firstFundedTradeOn,
        fundedOn: draft.fundedOn,
        id,
        label: draft.label,
        liveStartBalanceCents: draft.liveStartBalanceCents,
        notes: draft.notes,
        optIns: draft.optIns,
        personalRules: draft.personalRules,
        planSerial: draft.planSerial,
        purchasedOn: draft.purchasedOn,
        replacesAccountId: draft.replacesAccountId,
        tags: draft.tags,
    };
}

function useAccountFormSubmit({
    form,
    snapshotRules,
    stored,
}: {
    form: AccountFormApi;
    snapshotRules: null | readonly SnapshotFieldRule[];
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
    const [snapshotIssues, setSnapshotIssues] = useState<
        readonly SnapshotFieldIssue[]
    >([]);

    const validateSnapshot = (): null | SnapshotDraft | undefined => {
        if (stored !== null || !includeSnapshot) return null;
        if (snapshotRules === null) return undefined;
        const result = parseSnapshotForm(snapshotValues, snapshotRules);
        if (result.kind === SnapshotFormResultKind.Invalid) {
            setSnapshotIssues(result.issues);
            return undefined;
        }
        setSnapshotIssues([]);
        return result.snapshot;
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
        snapshotIssues,
        snapshotValues,
    };
}
