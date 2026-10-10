'use client';

import { keepPreviousData, skipToken } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ViolationForm } from '~/app/(app)/prop-calculator/accounts/_components/detail/ViolationsSection';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import {
    emptySnapshotFormValues,
    parseSnapshotForm,
    type SnapshotFieldIssue,
    SnapshotFormResultKind,
    type SnapshotFormValues,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { SnapshotFields } from '~/app/(app)/prop-calculator/accounts/_components/SnapshotFields';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
import { Label } from '~/components/ui/Label';
import { Skeleton } from '~/components/ui/Skeleton';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    type AccountStage,
    AccountTracking,
    compareText,
    formatUsdCents,
    ruleViolationKindLabel,
    SnapshotField,
    type SnapshotFieldRule,
    snapshotFieldRules,
    SnapshotInputKind,
    usdCents,
    usdCentsToText,
} from '~/lib/prop-accounts';
import {
    ADHERENCE_STEP_REASON,
    type DecisionAdherence,
} from '~/lib/prop-accounts/metrics';
import { type Plan } from '~/lib/prop-calculator';
import { api } from '~/trpc/react';

import {
    buildWeeklyReview,
    DecisionAdherenceKind,
    planOf,
    reviewSubmitPayload,
    ViolationOfferKind,
    violationsFromOf,
    type WeeklyReviewAccountInput,
    type WeeklyReviewDecisionRow,
    type WeeklyReviewDraft,
    WeeklyReviewEntryKind,
    type WeeklyReviewLastDecision,
    WeeklyReviewSizingKind,
    type WeeklyReviewSnapshotRow,
    type WeeklyReviewSnapshotValues,
    type WeeklyReviewViolationOffer,
    type WeeklyReviewViolationRow,
    weeklyReviewWindowOf,
} from './weeklyReviewModel';

const EMPTY_ACCOUNTS: WeeklyReviewAccountInput[] = [];
const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_MAP = new Map();
const EMPTY_STAGES: { accountId: string; stage: AccountStage }[] = [];
const EMPTY_VIOLATIONS: WeeklyReviewViolationRow[] = [];

const ADHERENCE_LABEL: Readonly<Record<DecisionAdherenceKind, string>> = {
    [DecisionAdherenceKind.Followed]: 'followed',
    [DecisionAdherenceKind.NotFollowed]: 'not followed',
    [DecisionAdherenceKind.NotRecorded]: 'actual risk not recorded',
};

const SIZING_ASSUMPTIONS =
    'Assumes no payout is pending and does not check the live triggers or plan rule changes.';

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

type WeeklyReviewAccountRow = ReturnType<
    typeof buildWeeklyReview
>['rows'][number];

export function WeeklyReviewView() {
    const accountsQuery = api.propAccounts.account.list.useQuery({});
    const snapshotsQuery = api.propAccounts.snapshot.latestForAll.useQuery();
    const decisionsQuery = api.propAccounts.decision.latestForAll.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const today = useTodayIsoDate();
    const utilities = api.useUtils();
    const submission = api.propAccounts.review.submit.useMutation();

    const [valuesByAccount, setValuesByAccount] =
        useState<ReadonlyMap<string, SnapshotFormValues>>(EMPTY_MAP);
    const [acceptedHeadlines, setAcceptedHeadlines] =
        useState<ReadonlyMap<string, number>>(EMPTY_MAP);
    const [confirmedUnchanged, setConfirmedUnchanged] = useState<
        ReadonlySet<string>
    >(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingReference = useRef(false);
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

    const rulebook = rulebookQuery.data;
    const reviewAsOf =
        rulebook === undefined
            ? null
            : weeklyReviewWindowOf(today, rulebook).asOf;
    const alreadyRecordedIds = useMemo(
        () =>
            reviewAsOf === null
                ? EMPTY_IDS
                : new Set(
                      latestSnapshots
                          .entries()
                          .filter(
                              ([, snapshot]) =>
                                  compareText(snapshot.asOf, reviewAsOf) >= 0,
                          )
                          .map(([accountId]) => accountId),
                  ),
        [latestSnapshots, reviewAsOf],
    );
    const stagesQuery = api.propAccounts.review.stagesOn.useQuery(
        reviewAsOf === null ? skipToken : { asOf: reviewAsOf },
    );
    const stagesOnAsOf = useMemo(
        () =>
            new Map(
                (stagesQuery.data ?? EMPTY_STAGES).map(
                    (entry): [string, AccountStage] => [
                        entry.accountId,
                        entry.stage,
                    ],
                ),
            ),
        [stagesQuery.data],
    );
    const violationsFrom = useMemo(
        () =>
            rulebook === undefined ||
            accountsQuery.data === undefined ||
            decisionsQuery.data === undefined
                ? null
                : violationsFromOf({
                      accounts,
                      latestDecisions,
                      rulebook,
                      today,
                  }),
        [
            accounts,
            accountsQuery.data,
            decisionsQuery.data,
            latestDecisions,
            rulebook,
            today,
        ],
    );
    const violationsQuery = api.propAccounts.violation.list.useQuery(
        violationsFrom === null ? skipToken : { occurredFrom: violationsFrom },
        { placeholderData: keepPreviousData },
    );
    const violations = violationsQuery.data ?? EMPTY_VIOLATIONS;

    const { drafts, invalidEntries } = useMemo(() => {
        const validDrafts = new Map<string, WeeklyReviewDraft>();
        const invalid = new Map<string, readonly SnapshotFieldIssue[]>();
        for (const [accountId, values] of valuesByAccount) {
            const account = accounts.find(
                (candidate) => candidate.id === accountId,
            );
            const plan = plansById.get(accountId);
            const stage = stagesOnAsOf.get(accountId);
            if (
                account === undefined ||
                plan === undefined ||
                stage === undefined ||
                alreadyRecordedIds.has(accountId)
            ) {
                continue;
            }
            const rules = snapshotFieldRules(plan, stage);
            const parsed = parseSnapshotForm(values, rules);
            if (parsed.kind === SnapshotFormResultKind.Valid) {
                validDrafts.set(accountId, parsed.snapshot);
            } else {
                invalid.set(accountId, parsed.issues);
            }
        }
        return { drafts: validDrafts, invalidEntries: invalid };
    }, [
        accounts,
        alreadyRecordedIds,
        plansById,
        stagesOnAsOf,
        valuesByAccount,
    ]);

    const hasEveryStage = plansById.keys().every((id) => stagesOnAsOf.has(id));

    const result = useMemo(() => {
        if (rulebook === undefined || !hasEveryStage) return null;
        return buildWeeklyReview({
            accounts,
            confirmedUnchanged,
            drafts,
            invalidEntries,
            latestDecisions,
            latestSnapshots,
            rulebook,
            stagesOnAsOf,
            today,
            violations,
        });
    }, [
        accounts,
        confirmedUnchanged,
        drafts,
        hasEveryStage,
        invalidEntries,
        latestDecisions,
        latestSnapshots,
        rulebook,
        stagesOnAsOf,
        today,
        violations,
    ]);

    const queries = [
        accountsQuery,
        snapshotsQuery,
        decisionsQuery,
        rulebookQuery,
        stagesQuery,
        violationsQuery,
    ];
    const hasUnloadedError = queries.some(
        (query) => query.isError && query.data === undefined,
    );

    if (hasUnloadedError) {
        return (
            <QueryErrorNotice
                message="The review needs your accounts, the stage each had on the review date, latest snapshots, latest decisions, violations and rulebook together. It is not shown from partial data, so no adherence rate or size change is built from missing records. Reload the page to try again."
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
        stagesQuery.isPending ||
        violationsQuery.isPending
    ) {
        return <Skeleton className="h-64 w-full" />;
    }

    const hasRefreshError = queries.some(
        (query) => query.isError && query.data !== undefined,
    );

    const acceptedAccountIds = acceptedAccountIdsOf(
        result.rows,
        acceptedHeadlines,
    );

    const valuesFor = (accountId: string): SnapshotFormValues => {
        const existing = valuesByAccount.get(accountId);
        if (existing !== undefined && !alreadyRecordedIds.has(accountId)) {
            return existing;
        }
        const row = result.rows.find((entry) => entry.accountId === accountId);
        const plan = plansById.get(accountId);
        const values = emptySnapshotFormValues(result.asOf);
        return row === undefined || plan === undefined
            ? values
            : formValuesFromDraft(
                  values,
                  row.draft,
                  snapshotFieldRules(plan, row.stageOnAsOf),
              );
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
        if (isSubmittingReference.current) return;
        const payload = reviewSubmitPayload(result, acceptedAccountIds);
        if (payload.snapshots.length === 0) {
            toast.error(
                'Nothing to record this week: edit an account or tick Record as unchanged',
            );
            return;
        }
        const recordedIds = new Set(
            payload.snapshots.map((snapshot) => snapshot.accountId),
        );
        isSubmittingReference.current = true;
        setIsSubmitting(true);
        try {
            let isSaved = false;
            try {
                await submission.mutateAsync({
                    asOf: payload.asOf,
                    decisions: payload.decisions.map((decision) => ({
                        ...decision,
                        acceptedRungsCents: [...decision.acceptedRungsCents],
                    })),
                    snapshots: [...payload.snapshots],
                });
                isSaved = true;
                toast.success(`Recorded ${payload.snapshots.length} snapshots`);
            } catch (error) {
                toast.error(errorTextOf(error));
            }
            try {
                await utilities.propAccounts.invalidate();
            } catch (error) {
                toast.error(errorTextOf(error));
            }
            if (!isSaved) return;
            setValuesByAccount(
                (current) =>
                    new Map(
                        [...current].filter(([id]) => !recordedIds.has(id)),
                    ),
            );
            setAcceptedHeadlines(
                (current) =>
                    new Map(
                        [...current].filter(([id]) => !recordedIds.has(id)),
                    ),
            );
            setConfirmedUnchanged((current) => current.difference(recordedIds));
        } finally {
            isSubmittingReference.current = false;
            setIsSubmitting(false);
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
            <AdherenceSummary
                adherence={result.adherence}
                stepCents={result.adherenceStepCents}
            />
            <p className="text-sm text-muted-foreground">
                {ledgerOnlyText(result.ledgerOnlyExcludedCount)}
            </p>
            {result.notUpdatedCount > 0 && (
                <p className="text-sm text-muted-foreground">
                    {notUpdatedText(result.notUpdatedCount)}
                </p>
            )}
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
                        : snapshotFieldRules(plan, row.stageOnAsOf).filter(
                              (rule) => rule.field !== SnapshotField.AsOf,
                          );
                const isAccepted = acceptedAccountIds.has(row.accountId);
                const isAlreadyRecorded = alreadyRecordedIds.has(row.accountId);
                const { sizing } = row;
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
                                idPrefix={row.accountId}
                                isReadOnly={isAlreadyRecorded}
                                issues={row.parseIssues}
                                onChange={(field, value) => {
                                    onFieldChange(row.accountId, field, value);
                                }}
                                rules={rules}
                                tracking={AccountTracking.Modeled}
                                values={valuesFor(row.accountId)}
                            />
                            {row.entryKind ===
                                WeeklyReviewEntryKind.Unchanged && (
                                <UnchangedControl
                                    isBlocked={row.isBlocked}
                                    isConfirmed={confirmedUnchanged.has(
                                        row.accountId,
                                    )}
                                    onToggle={(checked) => {
                                        const next = new Set(
                                            confirmedUnchanged,
                                        );
                                        if (checked) {
                                            next.add(row.accountId);
                                        } else {
                                            next.delete(row.accountId);
                                        }
                                        setConfirmedUnchanged(next);
                                    }}
                                    rowId={row.accountId}
                                    since={row.unchangedSince}
                                />
                            )}
                            {row.entryKind ===
                                WeeklyReviewEntryKind.AlreadyRecorded && (
                                <p className="text-sm text-muted-foreground">
                                    Already recorded for {result.asOf}
                                </p>
                            )}
                            {row.missingFieldLabels.length > 0 && (
                                <p className="text-sm text-destructive">
                                    Needs: {row.missingFieldLabels.join('; ')}
                                </p>
                            )}
                            <SizingSummary
                                diffCents={row.diffCents}
                                sizing={sizing}
                            />
                            <LastDecisionLine decision={row.lastDecision} />
                            <WeekViolations
                                violations={row.violations}
                                weekStart={result.weekStart}
                                windowEnd={result.windowEnd}
                            />
                            <LogViolationSection
                                accountId={row.accountId}
                                isOpen={loggingAccountId === row.accountId}
                                label={row.label}
                                offer={row.violationOffer}
                                onClose={() => {
                                    setLoggingAccountId(null);
                                }}
                                onOpen={() => {
                                    setLoggingAccountId(row.accountId);
                                }}
                            />
                            {row.isRecorded &&
                                sizing.kind ===
                                    WeeklyReviewSizingKind.Ready && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={isAccepted}
                                            id={`accept-${row.accountId}`}
                                            onCheckedChange={(checked) => {
                                                const next = new Map(
                                                    acceptedHeadlines,
                                                );
                                                if (checked === true) {
                                                    next.set(
                                                        row.accountId,
                                                        sizing.headlineRiskCents,
                                                    );
                                                } else {
                                                    next.delete(row.accountId);
                                                }
                                                setAcceptedHeadlines(next);
                                            }}
                                        />
                                        <Label
                                            htmlFor={`accept-${row.accountId}`}
                                        >
                                            Accept this size into the decision
                                            log
                                        </Label>
                                    </div>
                                )}
                        </CardContent>
                    </Card>
                );
            })}
            <Button
                disabled={isSubmitting || submission.isPending}
                onClick={() => {
                    void submit();
                }}
            >
                Submit this week&rsquo;s review
            </Button>
        </div>
    );
}

function acceptedAccountIdsOf(
    rows: readonly WeeklyReviewAccountRow[],
    acceptedHeadlines: ReadonlyMap<string, number>,
): ReadonlySet<string> {
    return new Set(
        rows.flatMap((row) =>
            row.sizing.kind === WeeklyReviewSizingKind.Ready &&
            acceptedHeadlines.get(row.accountId) ===
                row.sizing.headlineRiskCents
                ? row.accountId
                : [],
        ),
    );
}

function AdherenceSummary({
    adherence,
    stepCents,
}: {
    readonly adherence: DecisionAdherence;
    readonly stepCents: number;
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
                Followed means the actual risk is within{' '}
                {formatUsdCents(usdCents(stepCents))} of the accepted risk (
                {ADHERENCE_STEP_REASON}), the same rule as the overview.
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
    return error instanceof Error
        ? error.message
        : 'Could not save this review';
}

function fieldTextOf(input: SnapshotInputKind, value: number | string): string {
    return typeof value === 'string' || input !== SnapshotInputKind.Money
        ? String(value)
        : usdCentsToText(usdCents(value));
}

function formValuesFromDraft(
    base: SnapshotFormValues,
    draft: WeeklyReviewSnapshotValues,
    rules: readonly SnapshotFieldRule[],
): SnapshotFormValues {
    const values = { ...base };
    for (const rule of rules) {
        if (rule.field === SnapshotField.AsOf) continue;
        const value = draft[rule.field];
        values[rule.field] =
            value === null ? '' : fieldTextOf(rule.input, value);
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
            {decision.adherence === DecisionAdherenceKind.NotFollowed &&
                !decision.isAboveAccepted &&
                ' (traded below the accepted risk)'}
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

function LogViolationSection({
    accountId,
    isOpen,
    label,
    offer,
    onClose,
    onOpen,
}: {
    readonly accountId: string;
    readonly isOpen: boolean;
    readonly label: string;
    readonly offer: WeeklyReviewViolationOffer;
    readonly onClose: () => void;
    readonly onOpen: () => void;
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const noticeRef = useRef<HTMLParagraphElement>(null);
    const wasOpenRef = useRef(false);
    const isLogged = offer.kind === ViolationOfferKind.AlreadyLogged;
    const wasLoggedRef = useRef(isLogged);

    useEffect(() => {
        if (!isOpen && wasOpenRef.current) buttonRef.current?.focus();
        wasOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (isLogged && !wasLoggedRef.current) noticeRef.current?.focus();
        wasLoggedRef.current = isLogged;
    }, [isLogged]);

    switch (offer.kind) {
        case ViolationOfferKind.AlreadyLogged: {
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
        case ViolationOfferKind.Available: {
            if (isOpen) {
                return (
                    <ViolationForm
                        accountId={accountId}
                        decisions={[offer.decision]}
                        initial={offer.initial}
                        isDecisionLocked
                        onDone={onClose}
                        onFailure={(error) => {
                            toast.error(errorTextOf(error));
                        }}
                    />
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
        case ViolationOfferKind.None: {
            return null;
        }
    }
}

function notUpdatedText(count: number): string {
    const subject = count === 1 ? '1 account' : `${String(count)} accounts`;
    return `${subject} not updated: ${count === 1 ? 'it is' : 'they are'} left out of the snapshots and decisions of this review unless you enter a snapshot or tick Record as unchanged.`;
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
        <div className="flex flex-col gap-1">
            <p className="text-sm">
                {sizing.headlineLabel}:{' '}
                {formatUsdCents(usdCents(sizing.headlineRiskCents))}
                {diffCents !== null && (
                    <span className="ml-2 text-muted-foreground">
                        ({diffCents >= 0 ? '+' : ''}
                        {formatUsdCents(usdCents(diffCents))} vs last week)
                    </span>
                )}
            </p>
            <p className="text-sm text-muted-foreground">
                {SIZING_ASSUMPTIONS}
            </p>
        </div>
    );
}

function UnchangedControl({
    isBlocked,
    isConfirmed,
    onToggle,
    rowId,
    since,
}: {
    readonly isBlocked: boolean;
    readonly isConfirmed: boolean;
    readonly onToggle: (isChecked: boolean) => void;
    readonly rowId: string;
    readonly since: null | string;
}) {
    return (
        <div className="flex flex-col gap-2 text-sm">
            <p className="text-muted-foreground">
                Unchanged since {since ?? NOT_APPLICABLE}
            </p>
            {!isBlocked && (
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={isConfirmed}
                        id={`unchanged-${rowId}`}
                        onCheckedChange={(checked) => {
                            onToggle(checked === true);
                        }}
                    />
                    <Label htmlFor={`unchanged-${rowId}`}>
                        Record as unchanged
                    </Label>
                </div>
            )}
        </div>
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
