'use client';

import { keepPreviousData, skipToken } from '@tanstack/react-query';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Circle,
    CircleAlert,
    ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { STICKY_ACTION_BAR_PROPS } from '~/app/(app)/_components/ScrollToTop';
import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { WeeklyReviewSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { ViolationForm } from '~/app/(app)/prop-calculator/accounts/_components/detail/ViolationsSection';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import {
    emptySnapshotFormValues,
    parseSnapshotForm,
    type SnapshotFieldIssue,
    SnapshotFormResultKind,
    type SnapshotFormValues,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import {
    SnapshotFields,
    SnapshotHintDisplay,
} from '~/app/(app)/prop-calculator/accounts/_components/SnapshotFields';
import { InfoNote } from '~/components/InfoNote';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { CheckboxCard } from '~/components/ToggleCard';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Dialog } from '~/components/ui/dialog';
import { EmptyStatePanel } from '~/components/ui/empty-state';
import InfoPopover from '~/components/ui/info-popover';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import { formatDisplayDate } from '~/lib/format';
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
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import {
    buildWeeklyReview,
    DecisionAdherenceKind,
    planOf,
    RECORD_UNCHANGED_LABEL,
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
    [WeeklyReviewSizingKind.NotModeled]: 'Complete the entry above to size it',
    [WeeklyReviewSizingKind.ReconstructionFailed]:
        'Could not size this account from the entry',
    [WeeklyReviewSizingKind.Stale]: 'Stale; no amount suggested',
};

enum ReviewRowStatus {
    NeedsFixes = 'needs-fixes',
    NotUpdated = 'not-updated',
    Ready = 'ready',
    Recorded = 'recorded',
}

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
    const [activeAccountId, setActiveAccountId] = useState<null | string>(null);

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
        return <WeeklyReviewSkeleton />;
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
            toast.error(result.nothingToRecordNotice);
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

    const activeRow =
        result.rows.find((row) => row.accountId === activeAccountId) ??
        result.rows[0];

    return (
        <div className="flex flex-col gap-6">
            {hasRefreshError && (
                <StatusRow
                    detail="Some data could not be reloaded, so what you see may be out of date. Your entries are kept. Reload the page to try again."
                    title="Could not refresh"
                    tone={StatusTone.Warn}
                />
            )}
            <AdherenceSummary
                adherence={result.adherence}
                asOf={result.asOf}
                stepCents={result.adherenceStepCents}
            />
            {result.ledgerOnlyExcludedCount > 0 && (
                <InfoNote>
                    {ledgerOnlyText(result.ledgerOnlyExcludedCount)}
                </InfoNote>
            )}
            {result.notUpdatedNotice !== null && (
                <StatusRow
                    title={result.notUpdatedNotice}
                    tone={StatusTone.Warn}
                />
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
            {activeRow === undefined ? (
                <EmptyStatePanel
                    action={
                        <Button asChild>
                            <Link href={routes.propCalculator.accounts.new}>
                                Add account
                            </Link>
                        </Button>
                    }
                    description="The review covers active accounts on a modeled plan."
                    icon={ClipboardList}
                    title="No account to review"
                />
            ) : (
                <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                    <ReviewAccountNav
                        activeAccountId={activeRow.accountId}
                        onSelect={setActiveAccountId}
                        rows={result.rows}
                        typedAccountIds={valuesByAccount}
                    />
                    <div className="min-w-0">
                        {result.rows.map((row, index) => {
                            const plan = plansById.get(row.accountId) ?? null;
                            const rules =
                                plan === null
                                    ? []
                                    : snapshotFieldRules(
                                          plan,
                                          row.stageOnAsOf,
                                      ).filter(
                                          (rule) =>
                                              rule.field !== SnapshotField.AsOf,
                                      );
                            const isAccepted = acceptedAccountIds.has(
                                row.accountId,
                            );
                            const isAlreadyRecorded = alreadyRecordedIds.has(
                                row.accountId,
                            );
                            const isActive =
                                row.accountId === activeRow.accountId;
                            const previous = result.rows[index - 1];
                            const next = result.rows[index + 1];
                            const { sizing } = row;
                            return (
                                <ToolPanel
                                    actions={
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {index + 1} of {result.rows.length}
                                        </span>
                                    }
                                    className={cn(!isActive && 'hidden')}
                                    contentClassName="gap-4"
                                    hidden={!isActive}
                                    key={row.accountId}
                                    title={row.label}
                                >
                                    <SnapshotFields
                                        fieldWarnings={row.fieldWarnings}
                                        formIssues={row.blockedMessages}
                                        formWarnings={row.formWarnings}
                                        hintDisplay={
                                            SnapshotHintDisplay.Popover
                                        }
                                        idPrefix={row.accountId}
                                        isReadOnly={isAlreadyRecorded}
                                        issues={row.parseIssues}
                                        onChange={(field, value) => {
                                            onFieldChange(
                                                row.accountId,
                                                field,
                                                value,
                                            );
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
                                                const nextIds = new Set(
                                                    confirmedUnchanged,
                                                );
                                                if (checked) {
                                                    nextIds.add(row.accountId);
                                                } else {
                                                    nextIds.delete(
                                                        row.accountId,
                                                    );
                                                }
                                                setConfirmedUnchanged(nextIds);
                                            }}
                                            rowId={row.accountId}
                                            since={row.unchangedSince}
                                        />
                                    )}
                                    {row.entryKind ===
                                        WeeklyReviewEntryKind.AlreadyRecorded && (
                                        <p className="text-sm text-muted-foreground">
                                            Already recorded for{' '}
                                            {formatDisplayDate(result.asOf)}
                                        </p>
                                    )}
                                    {row.missingFieldLabels.length > 0 && (
                                        <p
                                            className={
                                                valuesByAccount.has(
                                                    row.accountId,
                                                )
                                                    ? 'text-sm text-destructive'
                                                    : 'text-sm text-muted-foreground'
                                            }
                                        >
                                            Needs:{' '}
                                            {row.missingFieldLabels.join('; ')}
                                        </p>
                                    )}
                                    <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
                                        <SizingSummary
                                            diffCents={row.diffCents}
                                            sizing={sizing}
                                        />
                                        <LastDecisionLine
                                            decision={row.lastDecision}
                                        />
                                        <WeekViolations
                                            violations={row.violations}
                                            weekStart={result.weekStart}
                                            windowEnd={result.windowEnd}
                                        />
                                    </div>
                                    <LogViolationSection
                                        accountId={row.accountId}
                                        isOpen={
                                            loggingAccountId === row.accountId
                                        }
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
                                            <CheckboxCard
                                                checked={isAccepted}
                                                id={`accept-${row.accountId}`}
                                                label="Accept this size into the decision log"
                                                onCheckedChange={(
                                                    isChecked,
                                                ) => {
                                                    const nextHeadlines =
                                                        new Map(
                                                            acceptedHeadlines,
                                                        );
                                                    if (isChecked) {
                                                        nextHeadlines.set(
                                                            row.accountId,
                                                            sizing.headlineRiskCents,
                                                        );
                                                    } else {
                                                        nextHeadlines.delete(
                                                            row.accountId,
                                                        );
                                                    }
                                                    setAcceptedHeadlines(
                                                        nextHeadlines,
                                                    );
                                                }}
                                            />
                                        )}
                                    <div className="flex items-center justify-between gap-2">
                                        <Button
                                            disabled={previous === undefined}
                                            onClick={() => {
                                                if (previous !== undefined) {
                                                    setActiveAccountId(
                                                        previous.accountId,
                                                    );
                                                }
                                            }}
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <ChevronLeft />
                                            Previous account
                                        </Button>
                                        <Button
                                            disabled={next === undefined}
                                            onClick={() => {
                                                if (next !== undefined) {
                                                    setActiveAccountId(
                                                        next.accountId,
                                                    );
                                                }
                                            }}
                                            size="sm"
                                            type="button"
                                            variant="outline"
                                        >
                                            Next account
                                            <ChevronRight />
                                        </Button>
                                    </div>
                                </ToolPanel>
                            );
                        })}
                    </div>
                </div>
            )}
            <div
                className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm"
                {...STICKY_ACTION_BAR_PROPS}
            >
                <Button
                    disabled={isSubmitting || submission.isPending}
                    onClick={() => {
                        void submit();
                    }}
                >
                    Submit this week&rsquo;s review
                </Button>
                <p className="text-sm text-muted-foreground" role="status">
                    {readyText(
                        result.rows.filter((row) => row.isRecorded).length,
                        result.rows.length,
                    )}
                </p>
            </div>
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
    asOf,
    stepCents,
}: {
    readonly adherence: DecisionAdherence;
    readonly asOf: string;
    readonly stepCents: number;
}) {
    return (
        <ToolPanel
            description={`Reviewing as of ${formatDisplayDate(asOf)}.`}
            info={
                <p>
                    Based on each account latest decision, whatever its date.
                    Followed means the actual risk is within{' '}
                    {formatUsdCents(usdCents(stepCents))} of the accepted risk (
                    {ADHERENCE_STEP_REASON}), the same rule as the overview.
                </p>
            }
            title="Adherence"
        >
            <StatusRow
                detail={
                    adherence.notRecorded > 0
                        ? `${adherence.notRecorded === 1 ? '1 decision has no recorded actual risk' : `${String(adherence.notRecorded)} decisions have no recorded actual risk`}; record it in the decision log on the account page.`
                        : undefined
                }
                title={
                    adherence.rate === null
                        ? 'Adherence: no decision has a recorded actual risk yet'
                        : `Adherence: ${(adherence.rate * 100).toFixed(0)}% (${String(adherence.followed)} of ${String(adherence.measured)} latest decisions with a recorded actual risk followed)`
                }
                tone={StatusTone.Neutral}
            />
        </ToolPanel>
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
            Last decision on {formatDisplayDate(decision.decidedOn)}:{' '}
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
                    <Dialog
                        onOpenChange={(open) => {
                            if (!open) onClose();
                        }}
                        open={isOpen}
                    >
                        {isOpen && (
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
                        )}
                    </Dialog>
                </div>
            );
        }
        case ViolationOfferKind.None: {
            return null;
        }
    }
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
            <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <span>
                    {sizing.headlineLabel}:{' '}
                    {formatUsdCents(usdCents(sizing.headlineRiskCents))}
                </span>
                {diffCents !== null && (
                    <span className="text-muted-foreground">
                        ({diffCents >= 0 ? '+' : ''}
                        {formatUsdCents(usdCents(diffCents))} vs last week)
                    </span>
                )}
                <InfoPopover title="Sizing assumptions">
                    {SIZING_ASSUMPTIONS}
                </InfoPopover>
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
            {since !== null && (
                <p className="text-muted-foreground">
                    Unchanged since {formatDisplayDate(since)}
                </p>
            )}
            {!isBlocked && (
                <CheckboxCard
                    checked={isConfirmed}
                    id={`unchanged-${rowId}`}
                    label={RECORD_UNCHANGED_LABEL}
                    onCheckedChange={onToggle}
                />
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
                No violations recorded from {formatDisplayDate(weekStart)} to{' '}
                {formatDisplayDate(windowEnd)}.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-1 text-sm">
            <p>
                Violations from {formatDisplayDate(weekStart)} to{' '}
                {formatDisplayDate(windowEnd)}:
            </p>
            <ul className="flex flex-col gap-1">
                {violations.map((violation) => (
                    <li key={violation.id}>
                        <span className="tabular-nums">
                            {formatDisplayDate(violation.occurredOn)}
                        </span>
                        : {ruleViolationKindLabel(violation.kind)}
                        {violation.costCents === null
                            ? ''
                            : ` (cost ${formatUsdCents(usdCents(violation.costCents))})`}
                        {violation.note === null ? '' : `: ${violation.note}`}
                    </li>
                ))}
            </ul>
        </div>
    );
}

const REVIEW_ROW_STATUS_LABEL: Readonly<Record<ReviewRowStatus, string>> = {
    [ReviewRowStatus.NeedsFixes]: 'Needs fixes',
    [ReviewRowStatus.NotUpdated]: 'Not updated',
    [ReviewRowStatus.Ready]: 'Ready to record',
    [ReviewRowStatus.Recorded]: 'Already recorded',
};

const REVIEW_ROW_STATUS_ICON: Readonly<Record<ReviewRowStatus, ReactNode>> = {
    [ReviewRowStatus.NeedsFixes]: (
        <CircleAlert aria-hidden className="size-4" />
    ),
    [ReviewRowStatus.NotUpdated]: <Circle aria-hidden className="size-4" />,
    [ReviewRowStatus.Ready]: <Check aria-hidden className="size-4" />,
    [ReviewRowStatus.Recorded]: <Check aria-hidden className="size-4" />,
};

function readyText(ready: number, total: number): string {
    return `${String(ready)} of ${String(total)} ${total === 1 ? 'account' : 'accounts'} ready to record`;
}

function ReviewAccountNav({
    activeAccountId,
    onSelect,
    rows,
    typedAccountIds,
}: {
    readonly activeAccountId: string;
    readonly onSelect: (accountId: string) => void;
    readonly rows: readonly WeeklyReviewAccountRow[];
    readonly typedAccountIds: ReadonlyMap<string, SnapshotFormValues>;
}) {
    return (
        <>
            <div className="md:hidden">
                <ToolbarSelect
                    label="Account to review"
                    onValueChange={onSelect}
                    options={rows.map((row) => ({
                        label: `${row.label}: ${REVIEW_ROW_STATUS_LABEL[reviewRowStatusOf(row, typedAccountIds)]}`,
                        value: row.accountId,
                    }))}
                    value={activeAccountId}
                />
            </div>
            <nav aria-label="Accounts in this review" className="max-md:hidden">
                <ol className="flex flex-col gap-1">
                    {rows.map((row) => {
                        const status = reviewRowStatusOf(row, typedAccountIds);
                        const isActive = row.accountId === activeAccountId;
                        return (
                            <li key={row.accountId}>
                                <Button
                                    aria-current={isActive ? 'step' : undefined}
                                    className={cn(
                                        'h-auto w-full items-start justify-start gap-2 px-3 py-2 text-left',
                                        isActive && 'bg-muted',
                                    )}
                                    onClick={() => {
                                        onSelect(row.accountId);
                                    }}
                                    type="button"
                                    variant="ghost"
                                >
                                    <span className="mt-0.5 text-muted-foreground">
                                        {REVIEW_ROW_STATUS_ICON[status]}
                                    </span>
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="truncate font-medium">
                                            {row.label}
                                        </span>
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {REVIEW_ROW_STATUS_LABEL[status]}
                                        </span>
                                    </span>
                                </Button>
                            </li>
                        );
                    })}
                </ol>
            </nav>
        </>
    );
}

function reviewRowStatusOf(
    row: WeeklyReviewAccountRow,
    typedAccountIds: ReadonlyMap<string, SnapshotFormValues>,
): ReviewRowStatus {
    if (row.entryKind === WeeklyReviewEntryKind.AlreadyRecorded) {
        return ReviewRowStatus.Recorded;
    }
    if (row.isRecorded) return ReviewRowStatus.Ready;
    return row.isBlocked && typedAccountIds.has(row.accountId)
        ? ReviewRowStatus.NeedsFixes
        : ReviewRowStatus.NotUpdated;
}
