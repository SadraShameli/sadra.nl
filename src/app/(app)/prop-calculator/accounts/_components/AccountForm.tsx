'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type BaseSyntheticEvent, useId, useState } from 'react';
import {
    type Control,
    Controller,
    useForm,
    type UseFormReturn,
    useWatch,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { StatusRow, StatusTone } from '~/components/StatusRow';
import { CheckboxCard, SwitchCard } from '~/components/ToggleCard';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { Textarea } from '~/components/ui/textarea';
import { errorMessage } from '~/lib/errorMessage';
import { formatDisplayDate } from '~/lib/format';
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
import {
    accountCreateSchema,
    MAX_ACCOUNT_LABEL_LENGTH,
} from '~/lib/schemas/propAccounts';
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
import { FieldRequirementMark } from './FieldRequirementMark';
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
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

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

const LABEL_REQUIRED_MESSAGE =
    'Enter a label to tell this account apart, such as “Apex 50K 1”.';

const TOO_LONG_MESSAGE = `Keep it to ${String(MAX_ACCOUNT_LABEL_LENGTH)} characters or fewer.`;

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
        for (const issue of singleLineTextIssues(values)) {
            context.addIssue({
                code: 'custom',
                message: issue.message,
                path: [issue.field],
            });
        }
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

type SingleLineField = Extract<
    keyof AccountFormValues,
    'externalAlias' | 'label'
>;

interface SingleLineIssue {
    readonly field: SingleLineField;
    readonly message: string;
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
                <Alert className="mb-6" variant="destructive">
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
    if (accountQuery.isPending)
        return (
            <Skeleton
                aria-label="Loading the account"
                className="h-96 w-full"
                role="status"
            />
        );
    if (accountQuery.isError) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle as="h2">The account could not be loaded</AlertTitle>
                <AlertDescription>
                    {accountQuery.error.message}
                </AlertDescription>
            </Alert>
        );
    }
    const account = trackedAccountOf(accountQuery.data);
    if (externalFirms.isPending && account.externalFirmId !== null) {
        return (
            <Skeleton
                aria-label="Loading the account"
                className="h-96 w-full"
                role="status"
            />
        );
    }
    if (externalFirms.isError && account.externalFirmId !== null) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle as="h2">Your firms could not be loaded</AlertTitle>
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
        accountSize: useWatch({ control: form.control, name: 'accountSize' }),
        firmId: useWatch({ control: form.control, name: 'firmId' }),
        optIns: useWatch({ control: form.control, name: 'optIns' }),
        planSerial: useWatch({ control: form.control, name: 'planSerial' }),
    };
    const personalRulesText = useWatch({
        control: form.control,
        name: 'personalRules',
    });
    const isLedgerOnly =
        useWatch({ control: form.control, name: 'tracking' }) ===
        AccountTracking.LedgerOnly;
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
    const confirmLeave = useUnsavedChangesGuard(form.formState.isDirty);

    return (
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

            <ToolPanel title="Personal stricter rules">
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
            </ToolPanel>

            {isCreate && <InitialSnapshotCard submit={submit} />}

            <div className="flex flex-wrap items-center gap-2">
                <Button disabled={submit.isSaving} type="submit">
                    {isCreate ? 'Add account' : 'Save changes'}
                </Button>
                <Button asChild type="button" variant="ghost">
                    <Link
                        href={
                            stored === null
                                ? routes.propCalculator.accounts.index
                                : routes.propCalculator.accounts.detail(
                                      stored.id,
                                  )
                        }
                        onNavigate={confirmLeave}
                    >
                        Cancel
                    </Link>
                </Button>
            </div>
        </form>
    );
}

function DashboardConventionField({
    control,
}: {
    control: Control<AccountFormValues>;
}) {
    const formId = useId();
    return (
        <Controller
            control={control}
            name="dashboardConvention"
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-dashboardConvention`}>
                        Dashboard balance
                    </FieldLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-dashboardConvention`}
                        >
                            <SelectValue />
                        </SelectTrigger>
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
                    <FieldDescription>
                        How the firm dashboard shows this account&rsquo;s
                        balance. Enter every balance below the same way.
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}

function DateField({
    control,
    isOptional = false,
    label,
    name,
}: {
    control: Control<AccountFormValues>;
    isOptional?: boolean;
    label: string;
    name: 'firstFundedTradeOn' | 'fundedOn' | 'purchasedOn';
}) {
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                        {isOptional && <FieldRequirementMark text="optional" />}
                    </FieldLabel>
                    <IsoDatePicker
                        aria-invalid={fieldState.invalid}
                        id={`${formId}-${field.name}`}
                        {...field}
                    />
                    <FieldError errors={[fieldState.error]} />
                </Field>
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
    const formId = useId();
    return (
        <ToolPanel contentClassName="grid gap-4 md:grid-cols-2" title="Details">
            <Controller
                control={control}
                name="label"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-label`}>
                            Label
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-label`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={control}
                name="externalAlias"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-externalAlias`}>
                            Alias
                            <FieldRequirementMark text="optional" />
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            autoComplete="off"
                            id={`${formId}-externalAlias`}
                            {...field}
                        />
                        <FieldDescription>
                            A non-secret hint to recognize the account, such as
                            the last 4 characters of its number. Never paste
                            credentials, passwords or API keys here.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <DateField
                control={control}
                label="Purchased on"
                name="purchasedOn"
            />
            <DateField
                control={control}
                isOptional
                label="Funded on"
                name="fundedOn"
            />
            <DateField
                control={control}
                isOptional
                label="First funded trade on"
                name="firstFundedTradeOn"
            />
            {!isLedgerOnly && (
                <Controller
                    control={control}
                    name="copyGroupId"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-copyGroupId`}>
                                Copy group
                            </FieldLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <SelectTrigger
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-copyGroupId`}
                                >
                                    <SelectValue />
                                </SelectTrigger>
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
                            <FieldDescription>
                                Every account in a group must be in the same
                                stage.
                            </FieldDescription>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            )}
            <Controller
                control={control}
                name="roundId"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-roundId`}>
                            Round
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-roundId`}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>
                                    None (not in a round)
                                </SelectItem>
                                {rounds.map((round) => (
                                    <SelectItem
                                        disabled={
                                            round.status === RoundStatus.Closed
                                        }
                                        key={round.id}
                                        value={round.id}
                                    >
                                        {round.label}
                                        {round.status === RoundStatus.Closed &&
                                            ' (closed)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Groups this account&apos;s spend and payouts against
                            a round budget. Only your own open rounds accept new
                            members.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={control}
                name="overrideRoundBudget"
                render={({ field }) => (
                    <CheckboxCard
                        aria-describedby="account-override-round-budget-hint"
                        checked={field.value}
                        description="Adds this account to its round even if the round has already spent its budget."
                        descriptionId="account-override-round-budget-hint"
                        id="account-override-round-budget"
                        label="Override the round budget"
                        onCheckedChange={field.onChange}
                    />
                )}
            />
            <Controller
                control={control}
                name="replacesAccountId"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-replacesAccountId`}>
                            Replaces account
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-replacesAccountId`}
                            >
                                <SelectValue />
                            </SelectTrigger>
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
                        <FieldDescription>
                            The busted or closed account this one replaces, if
                            any.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={control}
                name="tags"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-tags`}>
                            Tags
                            <FieldRequirementMark text="optional" />
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-tags`}
                            {...field}
                        />
                        <FieldDescription>
                            Separate tags with commas.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={control}
                name="notes"
                render={({ field, fieldState }) => (
                    <Field
                        className="md:col-span-2"
                        data-invalid={fieldState.invalid}
                    >
                        <FieldLabel htmlFor={`${formId}-notes`}>
                            Notes
                            <FieldRequirementMark text="optional" />
                        </FieldLabel>
                        <Textarea
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-notes`}
                            rows={3}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </ToolPanel>
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
        <ToolPanel contentClassName="gap-4" title="Initial snapshot">
            <SwitchCard
                checked={submit.includeSnapshot}
                id="account-include-snapshot"
                label="Enter today’s balance now"
                onCheckedChange={submit.setIncludeSnapshot}
            />
            {submit.includeSnapshot && (
                <InitialSnapshotFields submit={submit} />
            )}
        </ToolPanel>
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
    const formId = useId();
    const firmKey = ledgerFirmKeyOf(
        useWatch({ control: form.control, name: 'ledgerFirmId' }),
        useWatch({ control: form.control, name: 'ledgerExternalFirmId' }),
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
                <Controller
                    control={form.control}
                    name="ledgerSize"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-ledgerSize`}>
                                Account size ($)
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="off"
                                id={`${formId}-ledgerSize`}
                                inputMode="numeric"
                                {...field}
                            />
                            <FieldDescription>
                                Any size, in whole dollars, as the firm sold it.
                            </FieldDescription>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="planLabel"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-planLabel`}>
                                Plan
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="off"
                                id={`${formId}-planLabel`}
                                {...field}
                            />
                            <FieldDescription>
                                The plan name as the firm shows it.
                            </FieldDescription>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
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
    const isLedgerOnly =
        useWatch({ control: form.control, name: 'tracking' }) ===
        AccountTracking.LedgerOnly;
    return (
        <div className="flex flex-col gap-1">
            <SwitchCard
                checked={isLedgerOnly}
                disabled={isLocked}
                id="account-ledger-only"
                label="Firm not listed or size not modeled"
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
                    form.setValue('ledgerSize', String(selection.accountSize));
                    form.setValue(
                        'planLabel',
                        plan === null
                            ? ''
                            : ledgerOnlyPlanLabel(plan, selection.accountSize),
                    );
                }}
            />
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
    const formId = useId();
    return (
        <Controller
            control={control}
            name="liveStartBalanceCents"
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-liveStartBalanceCents`}>
                        Live start balance ($)
                    </FieldLabel>
                    <Input
                        aria-invalid={fieldState.invalid}
                        id={`${formId}-liveStartBalanceCents`}
                        inputMode="decimal"
                        {...field}
                    />
                    <FieldDescription>
                        The balance the live account started with or was moved
                        over with.
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                </Field>
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
    const stage = useWatch({ control: form.control, name: 'stage' });
    const isLedgerOnly =
        useWatch({ control: form.control, name: 'tracking' }) ===
        AccountTracking.LedgerOnly;
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
        <ToolPanel contentClassName="gap-4" title="Firm and plan">
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
                        Stage and status change through lifecycle events on the
                        account page, not here.
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
                (stored !== null && stored.liveStartBalanceCents !== null)) && (
                <LiveStartBalanceField control={form.control} />
            )}
        </ToolPanel>
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
            <StatusRow
                detail={notice}
                title="This account is read-only"
                tone={StatusTone.Warn}
            />
            <dl
                className={cn(
                    'grid gap-2 text-sm md:grid-cols-[max-content_1fr]',
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
                <dd>{formatDisplayDate(account.purchasedOn)}</dd>
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

function singleLineTextIssues({
    externalAlias,
    label,
}: Pick<AccountFormValues, SingleLineField>): readonly SingleLineIssue[] {
    const issues: SingleLineIssue[] = [];
    const trimmedLabel = label.trim();
    if (trimmedLabel === '') {
        issues.push({ field: 'label', message: LABEL_REQUIRED_MESSAGE });
    }
    if (trimmedLabel.length > MAX_ACCOUNT_LABEL_LENGTH) {
        issues.push({ field: 'label', message: TOO_LONG_MESSAGE });
    }
    if (externalAlias.trim().length > MAX_ACCOUNT_LABEL_LENGTH) {
        issues.push({ field: 'externalAlias', message: TOO_LONG_MESSAGE });
    }
    return issues;
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
    const formId = useId();
    return (
        <Controller
            control={form.control}
            name="stage"
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-stage`}>Stage</FieldLabel>
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
                        <SelectTrigger
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-stage`}
                        >
                            <SelectValue />
                        </SelectTrigger>
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
                        <FieldDescription>
                            This plan is instant funded, so it has no evaluation
                            stage.
                        </FieldDescription>
                    )}
                    <FieldError errors={[fieldState.error]} />
                </Field>
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
        useWatch({ control: form.control, name: 'tracking' }) ===
        AccountTracking.LedgerOnly;
    const accountStage = useWatch({ control: form.control, name: 'stage' });
    const plausibilityAccountSize = useWatch({
        control: form.control,
        name: 'accountSize',
    });
    const plausibilityConvention = useWatch({
        control: form.control,
        name: 'dashboardConvention',
    });
    const plausibilityLiveStartCents = useWatch({
        control: form.control,
        name: 'liveStartBalanceCents',
    });
    const snapshotAccount = {
        fundedOn: useWatch({ control: form.control, name: 'fundedOn' }),
        purchasedOn: useWatch({ control: form.control, name: 'purchasedOn' }),
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
                      accountSize: plausibilityAccountSize,
                      dashboardConvention: plausibilityConvention,
                      liveStartBalanceCents: liveStartCentsOf(
                          accountStage,
                          plausibilityLiveStartCents,
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
        form.reset(values);
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
