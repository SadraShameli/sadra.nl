'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    violationFormSchema,
    type ViolationFormValues,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/violationForm';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import {
    emptySnapshotFormValues,
    parseSnapshotForm,
    SnapshotFormResultKind,
    type SnapshotFormValues,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { SnapshotFields } from '~/app/(app)/prop-calculator/accounts/_components/SnapshotFields';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
import {
    Form,
    FormControl,
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
import { Textarea } from '~/components/ui/Textarea';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    AccountTracking,
    formatUsdCents,
    RuleViolationKind,
    ruleViolationKindLabel,
    SnapshotField,
    snapshotFieldRules,
    todayIsoDate,
    usdCents,
} from '~/lib/prop-accounts';
import { type Plan } from '~/lib/prop-calculator';
import { api } from '~/trpc/react';

import {
    buildWeeklyReview,
    DecisionAdherenceKind,
    planOf,
    reviewSubmitPayload,
    type WeeklyReviewAccountInput,
    type WeeklyReviewAdherence,
    type WeeklyReviewDecisionRow,
    type WeeklyReviewDraft,
    type WeeklyReviewLastDecision,
    WeeklyReviewSizingKind,
    type WeeklyReviewSnapshotRow,
    type WeeklyReviewSnapshotValues,
    type WeeklyReviewViolationRow,
} from './weeklyReviewModel';

const EMPTY_ACCOUNTS: WeeklyReviewAccountInput[] = [];
const EMPTY_MAP = new Map();
const EMPTY_VIOLATIONS: WeeklyReviewViolationRow[] = [];

const ADHERENCE_LABEL: Readonly<Record<DecisionAdherenceKind, string>> = {
    [DecisionAdherenceKind.Followed]: 'followed',
    [DecisionAdherenceKind.NotFollowed]: 'not followed',
    [DecisionAdherenceKind.NotRecorded]: 'actual risk not recorded',
};

type NotReadySizingKind = Exclude<
    WeeklyReviewSizingKind,
    WeeklyReviewSizingKind.Ready
>;

const SIZING_LABEL: Readonly<Record<NotReadySizingKind, string>> = {
    [WeeklyReviewSizingKind.NoEvalAdvice]:
        'No eval advice on an instant-funded plan',
    [WeeklyReviewSizingKind.NotModeled]: 'Fix the entry above to size it',
    [WeeklyReviewSizingKind.ReconstructionFailed]:
        'Could not size this account from the entry',
    [WeeklyReviewSizingKind.Stale]: 'Stale; no amount suggested',
};

type WeeklyReviewAccountRow = ReturnType<typeof buildWeeklyReview>['rows'][number];

export function WeeklyReviewView() {
    const accountsQuery = api.propAccounts.account.list.useQuery({});
    const snapshotsQuery = api.propAccounts.snapshot.latestForAll.useQuery();
    const decisionsQuery = api.propAccounts.decision.latestForAll.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const violationsQuery = api.propAccounts.violation.list.useQuery({});
    const utilities = api.useUtils();
    const submission = api.propAccounts.review.submit.useMutation();

    const [valuesByAccount, setValuesByAccount] = useState<
        ReadonlyMap<string, SnapshotFormValues>
    >(EMPTY_MAP);
    const [acceptedAccountIds, setAcceptedAccountIds] = useState<
        ReadonlySet<string>
    >(new Set());
    const [loggingAccountId, setLoggingAccountId] = useState<null | string>(
        null,
    );

    const accounts = useMemo(
        () =>
            (accountsQuery.data ?? EMPTY_ACCOUNTS).flatMap(
                weeklyReviewAccountOf,
            ),
        [accountsQuery.data],
    );

    const plansById = useMemo(() => {
        const map = new Map<string, Plan>();
        for (const account of accounts) {
            const plan = planOf(account);
            if (plan !== null) map.set(account.id, plan);
        }
        return map;
    }, [accounts]);

    const latestSnapshots = useMemo(
        () =>
            new Map(
                (snapshotsQuery.data ?? []).map(
                    (row): [string, WeeklyReviewSnapshotRow] => [
                        row.accountId,
                        row,
                    ],
                ),
            ),
        [snapshotsQuery.data],
    );

    const latestDecisions = useMemo(
        () =>
            new Map(
                (decisionsQuery.data ?? []).map(
                    (row): [string, WeeklyReviewDecisionRow] => [
                        row.accountId,
                        {
                            acceptedRiskCents: row.acceptedRiskCents,
                            actualRiskCents: row.actualRiskCents,
                            decidedOn: row.decidedOn,
                            id: row.id,
                        },
                    ],
                ),
            ),
        [decisionsQuery.data],
    );

    const violations = violationsQuery.data ?? EMPTY_VIOLATIONS;

    const drafts = useMemo(() => {
        const map = new Map<string, WeeklyReviewDraft>();
        for (const [accountId, values] of valuesByAccount) {
            const account = accounts.find(
                (candidate) => candidate.id === accountId,
            );
            const plan = plansById.get(accountId);
            if (account === undefined || plan === undefined) continue;
            const rules = snapshotFieldRules(plan, account.stage);
            const parsed = parseSnapshotForm(values, rules);
            if (parsed.kind === SnapshotFormResultKind.Valid) {
                map.set(accountId, parsed.snapshot);
            }
        }
        return map;
    }, [accounts, plansById, valuesByAccount]);

    const rulebook = rulebookQuery.data;
    const result = useMemo(() => {
        if (rulebook === undefined) return null;
        return buildWeeklyReview({
            accounts,
            drafts,
            latestDecisions,
            latestSnapshots,
            rulebook,
            today: todayIsoDate(new Date()),
            violations,
        });
    }, [
        accounts,
        drafts,
        latestDecisions,
        latestSnapshots,
        rulebook,
        violations,
    ]);

    const queries = [
        accountsQuery,
        snapshotsQuery,
        decisionsQuery,
        rulebookQuery,
        violationsQuery,
    ];
    const hasUnloadedError = queries.some(
        (query) => query.isError && query.data === undefined,
    );

    if (hasUnloadedError) {
        return (
            <QueryErrorNotice
                message="The review needs your accounts, latest snapshots, latest decisions, violations and rulebook together. It is not shown from partial data, so no adherence rate or size change is built from missing records. Reload the page to try again."
                title="Could not load the weekly review"
            />
        );
    }

    if (
        result === null ||
        accountsQuery.isPending ||
        snapshotsQuery.isPending ||
        decisionsQuery.isPending ||
        rulebookQuery.isPending ||
        violationsQuery.isPending
    ) {
        return <Skeleton className="h-64 w-full" />;
    }

    const hasRefreshError = queries.some(
        (query) => query.isError && query.data !== undefined,
    );

    const valuesFor = (accountId: string): SnapshotFormValues => {
        const existing = valuesByAccount.get(accountId);
        if (existing !== undefined) return existing;
        const row = result.rows.find((entry) => entry.accountId === accountId);
        const values = emptySnapshotFormValues(result.asOf);
        return row === undefined ? values : formValuesFromDraft(values, row.draft);
    };

    const onFieldChange = (
        accountId: string,
        field: SnapshotField,
        value: string,
    ) => {
        const next = new Map(valuesByAccount);
        next.set(accountId, { ...valuesFor(accountId), [field]: value });
        setValuesByAccount(next);
    };

    const submit = async () => {
        const payload = reviewSubmitPayload(result, acceptedAccountIds);
        if (payload.snapshots.length === 0) {
            toast.error('No account is ready to record this week');
            return;
        }
        try {
            await submission.mutateAsync({
                asOf: payload.asOf,
                decisions: payload.decisions.map((decision) => ({
                    ...decision,
                    acceptedRungsCents: [...decision.acceptedRungsCents],
                })),
                snapshots: payload.snapshots.flatMap((snapshot) =>
                    snapshot.balanceCents === null
                        ? []
                        : [{ ...snapshot, balanceCents: snapshot.balanceCents }],
                ),
            });
            toast.success(`Recorded ${payload.snapshots.length} snapshots`);
            setValuesByAccount(EMPTY_MAP);
            setAcceptedAccountIds(new Set());
        } catch (error) {
            toast.error(errorTextOf(error));
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {hasRefreshError && (
                <Alert>
                    <AlertTitle>Could not refresh</AlertTitle>
                    <AlertDescription>
                        Some data could not be reloaded, so what you see may be
                        out of date. Your entries are kept. Reload the page to
                        try again.
                    </AlertDescription>
                </Alert>
            )}
            <p className="text-sm text-muted-foreground">
                Reviewing as of {result.asOf}.
            </p>
            <AdherenceSummary adherence={result.adherence} />
            <p className="text-sm text-muted-foreground">
                {ledgerOnlyText(result.ledgerOnlyExcludedCount)}
            </p>
            {result.corruptRows.length > 0 && (
                <Alert variant="destructive">
                    <AlertTitle>
                        {result.corruptRows.length} account
                        {result.corruptRows.length === 1 ? '' : 's'} skipped
                    </AlertTitle>
                    <AlertDescription>
                        <ul className="flex flex-col gap-1">
                            {result.corruptRows.map((row) => (
                                <li key={row.accountId}>
                                    {row.label}: {row.reasons.join('; ')}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            {result.rows.map((row) => {
                const plan = plansById.get(row.accountId) ?? null;
                const rules =
                    plan === null
                        ? []
                        : snapshotFieldRules(plan, row.stage).filter(
                              (rule) => rule.field !== SnapshotField.AsOf,
                          );
                const isAccepted = acceptedAccountIds.has(row.accountId);
                return (
                    <Card key={row.accountId}>
                        <CardHeader>
                            <CardTitle>{row.label}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <SnapshotFields
                                fieldWarnings={row.fieldWarnings}
                                formIssues={row.blockedMessages}
                                formWarnings={row.formWarnings}
                                issues={[]}
                                onChange={(field, value) => {
                                    onFieldChange(row.accountId, field, value);
                                }}
                                rules={rules}
                                tracking={AccountTracking.Modeled}
                                values={valuesFor(row.accountId)}
                            />
                            {row.missingFieldLabels.length > 0 && (
                                <p className="text-sm text-destructive">
                                    Needs: {row.missingFieldLabels.join('; ')}
                                </p>
                            )}
                            <SizingSummary
                                diffCents={row.diffCents}
                                sizing={row.sizing}
                            />
                            <LastDecisionLine decision={row.lastDecision} />
                            <WeekViolations
                                violations={row.violations}
                                weekStart={result.weekStart}
                                windowEnd={result.windowEnd}
                            />
                            {row.lastDecision?.adherence ===
                                DecisionAdherenceKind.NotFollowed && (
                                    <LogViolationSection
                                        accountId={row.accountId}
                                        decision={row.lastDecision}
                                        initial={row.logViolation}
                                        isOpen={
                                            loggingAccountId === row.accountId
                                        }
                                        label={row.label}
                                        onClose={() => {
                                            setLoggingAccountId(null);
                                        }}
                                        onOpen={() => {
                                            setLoggingAccountId(row.accountId);
                                        }}
                                    />
                                )}
                            {row.sizing.kind === WeeklyReviewSizingKind.Ready && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={isAccepted}
                                        id={`accept-${row.accountId}`}
                                        onCheckedChange={(checked) => {
                                            const next = new Set(
                                                acceptedAccountIds,
                                            );
                                            if (checked === true) {
                                                next.add(row.accountId);
                                            } else {
                                                next.delete(row.accountId);
                                            }
                                            setAcceptedAccountIds(next);
                                        }}
                                    />
                                    <Label htmlFor={`accept-${row.accountId}`}>
                                        Accept this size into the decision log
                                    </Label>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
            <Button
                disabled={submission.isPending}
                onClick={() => {
                    void submit();
                }}
            >
                Submit this week&rsquo;s review
            </Button>
        </div>
    );
}

function AdherenceSummary({
    adherence,
}: {
    readonly adherence: WeeklyReviewAdherence;
}) {
    return (
        <div className="flex flex-col gap-1 text-sm">
            <p>
                {adherence.rate === null
                    ? 'Adherence: no decision has a recorded actual risk yet'
                    : `Adherence: ${(adherence.rate * 100).toFixed(0)}% (${String(adherence.followed)} of ${String(adherence.measured)} latest decisions with a recorded actual risk followed)`}
            </p>
            <p className="text-muted-foreground">
                Based on each account latest decision, whatever its date.
            </p>
            {adherence.notRecorded > 0 && (
                <p className="text-muted-foreground">
                    {adherence.notRecorded === 1
                        ? '1 decision has no recorded actual risk'
                        : `${String(adherence.notRecorded)} decisions have no recorded actual risk`}
                    ; record it in the decision log on the account page.
                </p>
            )}
        </div>
    );
}

function errorTextOf(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not save this review';
}

function formValuesFromDraft(
    base: SnapshotFormValues,
    draft: WeeklyReviewSnapshotValues,
): SnapshotFormValues {
    const values = { ...base };
    for (const field of Object.values(SnapshotField)) {
        if (field === SnapshotField.AsOf) continue;
        const value = draft[field];
        values[field] = value === null ? '' : String(value);
    }
    return values;
}

function LastDecisionLine({
    decision,
}: {
    readonly decision: null | WeeklyReviewLastDecision;
}) {
    if (decision === null) return null;
    const accepted = formatUsdCents(usdCents(decision.acceptedRiskCents));
    const actual =
        decision.actualRiskCents === null
            ? ''
            : `, actual ${formatUsdCents(usdCents(decision.actualRiskCents))}`;
    return (
        <p className="text-sm">
            Last decision on {decision.decidedOn}:{' '}
            {ADHERENCE_LABEL[decision.adherence]}
            <span className="ml-2 text-muted-foreground">
                (accepted {accepted}
                {actual})
            </span>
        </p>
    );
}

function ledgerOnlyText(count: number): string {
    const reason =
        'They carry a balance only, so there is no plan to size a row against.';
    if (count === 0) {
        return `Ledger-only accounts are not part of this review. ${reason}`;
    }
    const subject =
        count === 1
            ? '1 ledger-only account is'
            : `${String(count)} ledger-only accounts are`;
    return `${subject} left out of this review. ${reason}`;
}

function LogViolationForm({
    accountId,
    decision,
    initial,
    onDone,
}: {
    readonly accountId: string;
    readonly decision: WeeklyReviewLastDecision;
    readonly initial: ViolationFormValues;
    readonly onDone: () => void;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.violation.create.useMutation();
    const schema = violationFormSchema(accountId);
    const form = useForm<ViolationFormValues>({
        defaultValues: initial,
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const { setFocus } = form;

    useEffect(() => {
        setFocus('kind');
    }, [setFocus]);

    const save = async (values: ViolationFormValues) => {
        const parsed = schema.safeParse({
            ...values,
            decisionId: initial.decisionId,
        });
        if (!parsed.success) return;
        try {
            await create.mutateAsync(parsed.data);
            toast.success('Violation recorded');
            onDone();
        } catch (error) {
            toast.error(errorTextOf(error));
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <Form {...form}>
            <form
                aria-label="Log a violation"
                className="grid gap-4 sm:grid-cols-2"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                <p className="text-sm text-muted-foreground sm:col-span-2">
                    Linked decision: Decision on {decision.decidedOn}
                </p>
                <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Kind</FormLabel>
                            <Select
                                onValueChange={(next) => {
                                    const kind = z
                                        .enum(RuleViolationKind)
                                        .safeParse(next).data;
                                    if (kind !== undefined) field.onChange(kind);
                                }}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger ref={field.ref}>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.values(RuleViolationKind).map(
                                        (candidate) => (
                                            <SelectItem
                                                key={candidate}
                                                value={candidate}
                                            >
                                                {ruleViolationKindLabel(
                                                    candidate,
                                                )}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="occurredOn"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="costCents"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cost</FormLabel>
                            <FormControl>
                                <Input
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Note</FormLabel>
                            <FormControl>
                                <Textarea rows={2} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <Button disabled={create.isPending} type="submit">
                        Add violation
                    </Button>
                    <Button onClick={onDone} type="button" variant="ghost">
                        Cancel
                    </Button>
                </div>
            </form>
        </Form>
    );
}

function LogViolationSection({
    accountId,
    decision,
    initial,
    isOpen,
    label,
    onClose,
    onOpen,
}: {
    readonly accountId: string;
    readonly decision: WeeklyReviewLastDecision;
    readonly initial: null | ViolationFormValues;
    readonly isOpen: boolean;
    readonly label: string;
    readonly onClose: () => void;
    readonly onOpen: () => void;
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const noticeRef = useRef<HTMLParagraphElement>(null);
    const wasOpenRef = useRef(false);
    const wasLoggedRef = useRef(decision.isViolationLogged);

    useEffect(() => {
        if (!isOpen && wasOpenRef.current) buttonRef.current?.focus();
        wasOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (!wasLoggedRef.current && decision.isViolationLogged) {
            noticeRef.current?.focus();
        }
        wasLoggedRef.current = decision.isViolationLogged;
    }, [decision.isViolationLogged]);

    if (initial !== null && isOpen) {
        return (
            <LogViolationForm
                accountId={accountId}
                decision={decision}
                initial={initial}
                onDone={onClose}
            />
        );
    }
    if (initial === null) {
        return (
            <p
                className="text-sm text-muted-foreground"
                ref={noticeRef}
                role="status"
                tabIndex={-1}
            >
                Violation already logged for this decision.
            </p>
        );
    }
    return (
        <div>
            <Button
                aria-label={`Log violation for ${label}`}
                onClick={onOpen}
                ref={buttonRef}
                type="button"
                variant="outline"
            >
                Log violation
            </Button>
        </div>
    );
}

function SizingSummary({
    diffCents,
    sizing,
}: {
    readonly diffCents: null | number;
    readonly sizing: WeeklyReviewAccountRow['sizing'];
}) {
    if (sizing.kind !== WeeklyReviewSizingKind.Ready) {
        return (
            <p className="text-sm text-muted-foreground">
                {SIZING_LABEL[sizing.kind]}
            </p>
        );
    }
    return (
        <p className="text-sm">
            Documented headline: {formatUsdCents(usdCents(sizing.headlineRiskCents))}
            {diffCents !== null && (
                <span className="ml-2 text-muted-foreground">
                    ({diffCents >= 0 ? '+' : ''}
                    {formatUsdCents(usdCents(diffCents))} vs last week)
                </span>
            )}
        </p>
    );
}

function weeklyReviewAccountOf(account: {
    readonly accountSize: number;
    readonly dashboardConvention: WeeklyReviewAccountInput['dashboardConvention'];
    readonly firmId: null | string;
    readonly id: string;
    readonly label: string;
    readonly liveStartBalanceCents: null | number;
    readonly optIns: WeeklyReviewAccountInput['optIns'];
    readonly personalRules: WeeklyReviewAccountInput['personalRules'];
    readonly planSerial: null | string;
    readonly readIssues: WeeklyReviewAccountInput['readIssues'];
    readonly stage: WeeklyReviewAccountInput['stage'];
    readonly status: WeeklyReviewAccountInput['status'];
    readonly tracking: WeeklyReviewAccountInput['tracking'];
}): WeeklyReviewAccountInput[] {
    return [
        {
            accountSize: account.accountSize,
            dashboardConvention: account.dashboardConvention,
            firmId: account.firmId,
            id: account.id,
            label: account.label,
            liveStartBalanceCents: account.liveStartBalanceCents,
            optIns: account.optIns,
            personalRules: account.personalRules,
            planSerial: account.planSerial,
            readIssues: account.readIssues,
            stage: account.stage,
            status: account.status,
            tracking: account.tracking,
        },
    ];
}

function WeekViolations({
    violations,
    weekStart,
    windowEnd,
}: {
    readonly violations: readonly WeeklyReviewViolationRow[];
    readonly weekStart: string;
    readonly windowEnd: string;
}) {
    if (violations.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No violations recorded from {weekStart} to {windowEnd}.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-1 text-sm">
            <p>
                Violations from {weekStart} to {windowEnd}:
            </p>
            <ul className="flex flex-col gap-1">
                {violations.map((violation) => (
                    <li key={violation.id}>
                        <span className="tabular-nums">
                            {violation.occurredOn}
                        </span>
                        : {ruleViolationKindLabel(violation.kind)}
                        {violation.costCents === null
                            ? ` (cost ${NOT_APPLICABLE})`
                            : ` (cost ${formatUsdCents(usdCents(violation.costCents))})`}
                        {violation.note === null ? '' : `: ${violation.note}`}
                    </li>
                ))}
            </ul>
        </div>
    );
}
