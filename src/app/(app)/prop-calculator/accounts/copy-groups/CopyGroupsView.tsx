'use client';

import { Layers, Pencil, Trash2, TriangleAlert, UserMinus } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    type CopyGroupMember,
    copyGroupNameError,
    type CopyGroupRow,
    copyGroupRows,
    memberStateLabel,
    stageConflictsOf,
    stageRosterOf,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Skeleton } from '~/components/ui/Skeleton';
import { formatConjunctionList } from '~/lib/format';
import {
    PropMutationRejection,
    propRejectionOf,
} from '~/lib/schemas/propAccountOutputs';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { copyGroupSizingSectionsOf } from './copyGroupSizingModel';
import {
    GroupSizingSection,
    type GroupSizingView,
    GroupSizingViewKind,
} from './GroupSizingSection';

const CHOOSE_ACCOUNT = 'Choose an account to add.';

interface AssignRejection {
    readonly accountLabel: string;
    readonly explanation: null | string;
    readonly message: string;
}

export function CopyGroupsView({ userId }: { readonly userId: string }) {
    const groupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const snapshotsQuery = api.propAccounts.snapshot.latestForAll.useQuery();
    const headingReference = useRef<HTMLHeadingElement>(null);
    const today = useTodayIsoDate();
    const groups = groupsQuery.data;
    const accounts = accountsQuery.data;
    const overview = useMemo(
        () =>
            groups === undefined || accounts === undefined
                ? null
                : copyGroupRows(groups, accounts),
        [groups, accounts],
    );
    const sizingQueries = [
        eventsQuery,
        payoutsQuery,
        rulebookQuery,
        snapshotsQuery,
    ];
    const sizingFailure =
        sizingQueries.find((query) => query.isError && query.data === undefined)
            ?.error.message ?? null;
    const sizingRefreshFailure =
        sizingQueries.find((query) => query.isError && query.data !== undefined)
            ?.error.message ?? null;
    const sizingSections = useMemo(() => {
        return sizingFailure === null &&
            overview !== null &&
            accounts !== undefined &&
            eventsQuery.data !== undefined &&
            payoutsQuery.data !== undefined &&
            rulebookQuery.data !== undefined &&
            snapshotsQuery.data !== undefined
            ? copyGroupSizingSectionsOf(
                  rulebookQuery.data,
                  userId,
                  today,
                  accounts,
                  eventsQuery.data,
                  payoutsQuery.data,
                  snapshotsQuery.data,
                  overview.groups,
              )
            : null;
    }, [
        sizingFailure,
        overview,
        accounts,
        eventsQuery.data,
        payoutsQuery.data,
        rulebookQuery.data,
        snapshotsQuery.data,
        today,
        userId,
    ]);
    const sizingViewFor = (groupId: string): GroupSizingView => {
        if (sizingFailure !== null) {
            return { kind: GroupSizingViewKind.Failed, message: sizingFailure };
        }
        const section = sizingSections?.get(groupId);
        return section === undefined
            ? { kind: GroupSizingViewKind.Pending }
            : {
                  kind: GroupSizingViewKind.Ready,
                  refreshFailure: sizingRefreshFailure,
                  section,
              };
    };

    return (
        <>
            <header className="mb-8">
                <h1
                    className="text-3xl font-bold tracking-tight text-white outline-none sm:text-4xl"
                    ref={headingReference}
                    tabIndex={-1}
                >
                    Copy groups
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
                    Accounts you trade together through a trade copier. Every
                    member of a group must be in one stage, inactive and
                    archived members included. The active members are sized
                    together as one correlated bet.
                </p>
            </header>
            <div className="flex flex-col gap-8">
                <CreateGroupForm />
                {groupsQuery.isError && groups === undefined && (
                    <LoadError
                        message={groupsQuery.error.message}
                        title="Your copy groups could not be loaded"
                    />
                )}
                {accountsQuery.isError && accounts === undefined && (
                    <LoadError
                        message={accountsQuery.error.message}
                        title="Your accounts could not be loaded"
                    />
                )}
                {(groupsQuery.isPending || accountsQuery.isPending) && (
                    <div aria-busy="true" aria-label="Loading your copy groups">
                        <Skeleton className="h-64 w-full" />
                    </div>
                )}
                {overview !== null && (
                    <>
                        {overview.groups.length === 0 ? (
                            <EmptyState
                                description="Create a group above, then add the accounts your copier trades together."
                                icon={Layers}
                                title="No copy groups yet"
                            />
                        ) : (
                            overview.groups.map((row) => (
                                <GroupSection
                                    candidates={overview.unassigned}
                                    key={row.group.id}
                                    onDeleted={() => {
                                        headingReference.current?.focus();
                                    }}
                                    row={row}
                                    sizing={sizingViewFor(row.group.id)}
                                />
                            ))
                        )}
                        <UnassignedSection members={overview.unassigned} />
                    </>
                )}
            </div>
        </>
    );
}

function conflictExplanation(
    row: CopyGroupRow,
    candidate: CopyGroupMember | undefined,
): null | string {
    if (candidate === undefined) return null;
    const conflicts = stageConflictsOf(row, candidate.stage);
    if (conflicts.length === 0) return null;
    const named = conflicts
        .map((member) => {
            const state = memberStateLabel(member);
            return `${member.label} (${member.stageLabel}${state === null ? '' : `, ${state}`})`;
        })
        .join(', ');
    return `${candidate.label} is ${candidate.stageLabel}, but ${row.group.name} already has members in another stage: ${named}. Every member of a group must share one stage, inactive and archived members included. Remove those members first, or add ${candidate.label} to a group of ${candidate.stageLabel} accounts.`;
}

function CreateGroupForm() {
    const utilities = api.useUtils();
    const inputId = useId();
    const errorId = useId();
    const [name, setName] = useState('');
    const [error, setError] = useState<null | string>(null);
    const create = api.propAccounts.copyGroup.create.useMutation({
        onError: (mutationError) => {
            setError(mutationError.message);
        },
        onSuccess: (_group, variables) => {
            toast.success(`${variables.name} created`);
            setName('');
            setError(null);
            return utilities.propAccounts.invalidate();
        },
    });

    function submit() {
        const problem = copyGroupNameError(name);
        setError(problem);
        if (problem === null) create.mutate({ name: name.trim() });
    }

    return (
        <form
            className="flex flex-wrap items-end gap-3"
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <div className="flex min-w-64 flex-col gap-2">
                <Label htmlFor={inputId}>Group name</Label>
                <Input
                    aria-describedby={error === null ? undefined : errorId}
                    aria-invalid={error !== null}
                    id={inputId}
                    onChange={(event) => {
                        setName(event.target.value);
                        setError(null);
                    }}
                    value={name}
                />
            </div>
            <Button disabled={create.isPending} type="submit">
                Create group
            </Button>
            {error !== null && (
                <p className="basis-full text-sm text-destructive" id={errorId}>
                    {error}
                </p>
            )}
        </form>
    );
}

function DeleteGroupDialog({
    onDeleted,
    row,
}: {
    readonly onDeleted: () => void;
    readonly row: CopyGroupRow;
}) {
    const utilities = api.useUtils();
    const isDeletedReference = useRef(false);
    const [isOpen, setIsOpen] = useState(false);
    const { group } = row;
    const memberCount = row.members.length + row.otherMembers.length;
    const remove = api.propAccounts.copyGroup.remove.useMutation({
        onError: (error) => {
            setIsOpen(false);
            toast.error(error.message);
        },
        onSuccess: () => {
            isDeletedReference.current = true;
            setIsOpen(false);
            toast.success(`${group.name} deleted`);
            return utilities.propAccounts.invalidate();
        },
    });

    return (
        <AlertDialog
            onOpenChange={(open) => {
                if (remove.isPending) return;
                if (open) isDeletedReference.current = false;
                setIsOpen(open);
            }}
            open={isOpen}
        >
            <AlertDialogTrigger asChild>
                <Button
                    aria-label={`Delete ${group.name}`}
                    disabled={remove.isPending}
                    size="icon"
                    variant="ghost"
                >
                    <Trash2 />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent
                onCloseAutoFocus={(event) => {
                    if (!isDeletedReference.current) return;
                    event.preventDefault();
                    onDeleted();
                }}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Delete the copy group &ldquo;{group.name}&rdquo;?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {memberCount === 0
                            ? 'It has no members. Nothing else is deleted.'
                            : `Its ${memberCount} ${memberCount === 1 ? 'member leaves' : 'members leave'} the group and stay as accounts. Nothing else is deleted.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={remove.isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={remove.isPending}
                        onClick={(event) => {
                            event.preventDefault();
                            remove.mutate({ id: group.id });
                        }}
                    >
                        Delete group
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function GroupSection({
    candidates,
    onDeleted,
    row,
    sizing,
}: {
    readonly candidates: readonly CopyGroupMember[];
    readonly onDeleted: () => void;
    readonly row: CopyGroupRow;
    readonly sizing: GroupSizingView;
}) {
    const utilities = api.useUtils();
    const headingId = useId();
    const selectId = useId();
    const selectErrorId = useId();
    const renameReference = useRef<HTMLButtonElement>(null);
    const groupHeadingReference = useRef<HTMLHeadingElement>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [chosenId, setChosenId] = useState('');
    const [chooseError, setChooseError] = useState<null | string>(null);
    const [rejection, setRejection] = useState<AssignRejection | null>(null);
    const { group } = row;
    const membersById = useMemo(
        () =>
            new Map(
                [...row.members, ...row.otherMembers, ...candidates].map(
                    (member) => [member.id, member],
                ),
            ),
        [row.members, row.otherMembers, candidates],
    );
    const assign = api.propAccounts.copyGroup.assign.useMutation({
        onError: (error, variables) => {
            if (
                propRejectionOf(error)?.reason ===
                PropMutationRejection.MixedStageCopyGroup
            ) {
                const candidate = membersById.get(variables.accountId);
                setRejection({
                    accountLabel: candidate?.label ?? 'This account',
                    explanation: conflictExplanation(row, candidate),
                    message: error.message,
                });
                return;
            }
            toast.error(error.message);
        },
        onSuccess: () => {
            setRejection(null);
            setChosenId('');
            groupHeadingReference.current?.focus();
            return utilities.propAccounts.invalidate();
        },
    });

    function add() {
        if (candidates.every((candidate) => candidate.id !== chosenId)) {
            setChosenId('');
            setChooseError(CHOOSE_ACCOUNT);
            return;
        }
        setRejection(null);
        assign.mutate({ accountId: chosenId, copyGroupId: group.id });
    }

    function remove(member: CopyGroupMember) {
        setRejection(null);
        assign.mutate({ accountId: member.id, copyGroupId: null });
    }

    return (
        <section
            aria-labelledby={headingId}
            className="flex flex-col gap-4 rounded-lg border p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2
                        className="text-xl font-semibold outline-none"
                        id={headingId}
                        ref={groupHeadingReference}
                        tabIndex={-1}
                    >
                        {group.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {row.stageSummary}
                        {row.firmNames.length > 0 &&
                            `. Firms: ${row.firmNames.join(', ')}`}
                    </p>
                    {group.notes !== null && group.notes !== '' && (
                        <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
                            {group.notes}
                        </p>
                    )}
                </div>
                <div className="flex gap-1">
                    <Button
                        aria-expanded={isRenaming}
                        aria-label={`Rename ${group.name}`}
                        onClick={() => {
                            setIsRenaming(true);
                        }}
                        ref={renameReference}
                        size="icon"
                        variant="ghost"
                    >
                        <Pencil />
                    </Button>
                    <DeleteGroupDialog onDeleted={onDeleted} row={row} />
                </div>
            </div>
            {isRenaming && (
                <RenameGroupForm
                    onClose={() => {
                        setIsRenaming(false);
                        renameReference.current?.focus();
                    }}
                    row={row}
                />
            )}
            {row.isMixedStage && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>Mixed stages</AlertTitle>
                    <AlertDescription>
                        {row.stageSummary}. {mixedStageAdvice(row)}
                    </AlertDescription>
                </Alert>
            )}
            {rejection !== null && (
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>
                        {rejection.accountLabel} cannot join {group.name}
                    </AlertTitle>
                    <AlertDescription>
                        {rejection.explanation !== null && (
                            <p>{rejection.explanation}</p>
                        )}
                        <p>{rejection.message}</p>
                    </AlertDescription>
                </Alert>
            )}
            <MemberList
                groupName={group.name}
                isPending={assign.isPending}
                members={row.members}
                onRemove={remove}
            />
            {row.members.length > 0 && (
                <GroupSizingSection row={row} sizing={sizing} />
            )}
            {row.otherMembers.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                        Inactive or archived members. They get no group sizing,
                        but they still count when a new member&apos;s stage is
                        checked.
                    </p>
                    <MemberList
                        groupName={group.name}
                        isPending={assign.isPending}
                        members={row.otherMembers}
                        onRemove={remove}
                    />
                </div>
            )}
            {candidates.length > 0 && (
                <form
                    className="flex flex-wrap items-end gap-3"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        add();
                    }}
                >
                    <div className="flex min-w-64 flex-col gap-2">
                        <Label htmlFor={selectId}>
                            Account to add to {group.name}
                        </Label>
                        <select
                            aria-describedby={
                                chooseError === null ? undefined : selectErrorId
                            }
                            aria-invalid={chooseError !== null}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            id={selectId}
                            onChange={(event) => {
                                setChosenId(event.target.value);
                                setChooseError(null);
                            }}
                            value={chosenId}
                        >
                            <option value="">Choose an account</option>
                            {candidates.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.label} ({candidate.stageLabel},{' '}
                                    {candidate.firmName})
                                </option>
                            ))}
                        </select>
                    </div>
                    <Button
                        aria-label={`Add to ${group.name}`}
                        disabled={assign.isPending}
                        type="submit"
                        variant="outline"
                    >
                        Add
                    </Button>
                    {chooseError !== null && (
                        <p
                            className="basis-full text-sm text-destructive"
                            id={selectErrorId}
                        >
                            {chooseError}
                        </p>
                    )}
                </form>
            )}
        </section>
    );
}

function LoadError({
    message,
    title,
}: {
    readonly message: string;
    readonly title: string;
}) {
    return (
        <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}

function MemberList({
    groupName,
    isPending,
    members,
    onRemove,
}: {
    readonly groupName: string;
    readonly isPending: boolean;
    readonly members: readonly CopyGroupMember[];
    readonly onRemove: (member: CopyGroupMember) => void;
}) {
    if (members.length === 0) return null;
    return (
        <ul className="flex flex-col divide-y rounded-md border">
            {members.map((member) => (
                <li
                    className={cn(
                        'flex flex-wrap items-center justify-between gap-2 px-3 py-2',
                        member.isArchived && 'opacity-60',
                    )}
                    key={member.id}
                >
                    <MemberSummary member={member} />
                    <Button
                        aria-label={`Remove ${member.label} from ${groupName}`}
                        disabled={isPending}
                        onClick={() => {
                            onRemove(member);
                        }}
                        size="icon"
                        variant="ghost"
                    >
                        <UserMinus />
                    </Button>
                </li>
            ))}
        </ul>
    );
}

function MemberSummary({ member }: { readonly member: CopyGroupMember }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{member.label}</span>
            <Badge variant="secondary">{member.stageLabel}</Badge>
            <span className="text-xs text-muted-foreground">
                {member.firmName}
            </span>
            {member.isArchived && <Badge variant="outline">Archived</Badge>}
        </div>
    );
}

function mixedStageAdvice(row: CopyGroupRow): string {
    const rosters = stageRosterOf(row.members);
    const roster = rosters
        .map(
            ({ members, stageLabel }) =>
                `${stageLabel}: ${members.map((member) => member.label).join(', ')}`,
        )
        .join('. ');
    const stages = formatConjunctionList(
        rosters.map(({ stageLabel }) => stageLabel),
    );
    return `${roster}. Group sizing needs every active member in one stage. Decide which stage this group trades, take the other accounts off the copier now, then remove them from the group. Do not copy one size across stages: each stage has its own sizing rule, so one size copied across ${stages} accounts is wrong for at least one of them.`;
}

function RenameGroupForm({
    onClose,
    row,
}: {
    readonly onClose: () => void;
    readonly row: CopyGroupRow;
}) {
    const utilities = api.useUtils();
    const inputId = useId();
    const errorId = useId();
    const { group } = row;
    const [name, setName] = useState(group.name);
    const [error, setError] = useState<null | string>(null);
    const update = api.propAccounts.copyGroup.update.useMutation({
        onError: (mutationError) => {
            setError(mutationError.message);
        },
        onSuccess: () => {
            onClose();
            return utilities.propAccounts.invalidate();
        },
    });

    function submit() {
        const problem = copyGroupNameError(name);
        setError(problem);
        if (problem === null) {
            update.mutate({
                id: group.id,
                name: name.trim(),
                notes: group.notes,
            });
        }
    }

    return (
        <form
            className="flex flex-wrap items-end gap-3"
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <div className="flex min-w-64 flex-col gap-2">
                <Label htmlFor={inputId}>New name for {group.name}</Label>
                <Input
                    aria-describedby={error === null ? undefined : errorId}
                    aria-invalid={error !== null}
                    id={inputId}
                    onChange={(event) => {
                        setName(event.target.value);
                        setError(null);
                    }}
                    value={name}
                />
            </div>
            <Button disabled={update.isPending} type="submit">
                Save name
            </Button>
            <Button onClick={onClose} type="button" variant="ghost">
                Cancel
            </Button>
            {error !== null && (
                <p className="basis-full text-sm text-destructive" id={errorId}>
                    {error}
                </p>
            )}
        </form>
    );
}

function UnassignedSection({
    members,
}: {
    readonly members: readonly CopyGroupMember[];
}) {
    const headingId = useId();
    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold" id={headingId}>
                Accounts not in a group
            </h2>
            {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Every active account is in a group.
                </p>
            ) : (
                <ul className="flex flex-col divide-y rounded-md border">
                    {members.map((member) => (
                        <li className="px-3 py-2" key={member.id}>
                            <MemberSummary member={member} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
