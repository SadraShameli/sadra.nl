'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Bookmark, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { Button } from '~/components/ui/Button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { useSession } from '~/lib/auth/client';
import { errorMessage } from '~/lib/errorMessage';
import { type TradingFirm } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import type { CalculatorState } from './types';

import {
    type AccountScenarioRecord,
    accountScenarioRecords,
    clearAccountScenarios,
    importLocalScenarios,
    isScenarioImportDone,
    scenarioImportNotice,
    ScenarioImportRuns,
    ScenarioImportStatus,
    scenarioRemovalNotice,
    ScenarioStore,
    scenarioStoreFor,
    validateAccountScenario,
} from './savedScenarioSync';
import {
    decodeState,
    encodeState,
    type EncodeStateOptions,
    loadScenarios,
    persistScenarios,
    type SavedScenarioRecord,
} from './urlState';

const savedScenarioFormSchema = z.object({
    name: z.string().trim().min(1),
});
type SavedScenarioFormValues = z.infer<typeof savedScenarioFormSchema>;

const LOADING_SCENARIOS_TEXT = 'Loading saved scenarios...';

const CLEAR_ALL_TEXT = 'Clear all';

const CLEAR_ACCOUNT_SCENARIOS_WARNING =
    'This permanently removes every scenario saved to your account, including any saved from another device that are not listed here yet.';

const scenarioImportRuns = new ScenarioImportRuns();

const subscribeToImportRuns = (listener: () => void) =>
    scenarioImportRuns.subscribe(listener);

interface ClearAllButtonProperties {
    busy: boolean;
    confirmation: null | string;
    onClearAll: () => void;
}

interface SavedScenariosProperties {
    encodeOptions: EncodeStateOptions;
    firms: readonly TradingFirm[];
    onLoad: (next: CalculatorState) => void;
    state: CalculatorState;
}

interface ScenarioPanelProperties<TRecord extends SavedScenarioRecord> {
    busy: boolean;
    clearAllConfirmation: null | string;
    heading: string;
    loadError: null | string;
    onClearAll: () => void;
    onDelete: (record: TRecord) => void;
    onLoad: (record: TRecord) => void;
    onReplace: (record: TRecord) => void;
    onSave: (name: string) => Promise<null | string>;
    scenarios: null | readonly TRecord[];
}

interface ScenarioStoreErrorProperties {
    message: string;
    onRetry: () => void;
}

interface ScenarioStoreProperties {
    encodeOptions: EncodeStateOptions;
    onLoad: (record: SavedScenarioRecord) => void;
    state: CalculatorState;
}

export default function SavedScenarios({
    encodeOptions,
    firms,
    onLoad,
    state,
}: SavedScenariosProperties) {
    const [open, setOpen] = useState(false);

    const handleLoad = (record: SavedScenarioRecord) => {
        const parameters = new URLSearchParams(record.params);
        const next = decodeState(parameters, firms, state);
        onLoad(next);
        setOpen(false);
    };

    return (
        <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
                <Button
                    className="h-7 gap-1.5 px-2 text-xs"
                    size="sm"
                    variant="outline"
                >
                    <Bookmark className="size-3.5" />
                    Saved scenarios
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <ScenarioStores
                    encodeOptions={encodeOptions}
                    onLoad={handleLoad}
                    state={state}
                />
            </PopoverContent>
        </Popover>
    );
}

function AccountScenarios({
    encodeOptions,
    onLoad,
    state,
    userId,
}: ScenarioStoreProperties & { userId: string }) {
    const utilities = api.useUtils();
    const listQuery = api.propAccounts.scenario.list.useQuery(undefined, {
        refetchOnMount: true,
    });
    const { isPending: isSaving, mutateAsync: saveScenario } =
        api.propAccounts.scenario.save.useMutation();
    const { isPending: isRemoving, mutateAsync: removeScenario } =
        api.propAccounts.scenario.remove.useMutation();
    const { isPending: isImportingMany, mutateAsync: importScenarios } =
        api.propAccounts.scenario.importMany.useMutation();
    const { isPending: isClearing, mutateAsync: removeAllScenarios } =
        api.propAccounts.scenario.removeAll.useMutation();
    const isImporting = useSyncExternalStore(
        subscribeToImportRuns,
        () => scenarioImportRuns.isRunning(userId),
        () => false,
    );
    const serverRows = listQuery.data;

    useEffect(() => {
        if (isScenarioImportDone(userId)) return;
        void scenarioImportRuns.run(userId, async () => {
            try {
                const server = await utilities.propAccounts.scenario.list.fetch(
                    undefined,
                    { staleTime: 0 },
                );
                const outcome = await importLocalScenarios({
                    importMany: importScenarios,
                    local: loadScenarios(),
                    server,
                    userId,
                });
                const notice = scenarioImportNotice(outcome);
                if (notice !== null) {
                    if (outcome.status === ScenarioImportStatus.Failed) {
                        toast.error(notice);
                    } else {
                        toast.success(notice);
                    }
                }
                await utilities.propAccounts.scenario.list.invalidate();
            } catch (error) {
                toast.error(
                    `Could not import saved scenarios from this browser: ${errorMessage(error)}`,
                );
            }
        });
    }, [importScenarios, userId, utilities]);

    const refresh = () => utilities.propAccounts.scenario.list.invalidate();

    const handleSave = async (name: string) => {
        const validation = validateAccountScenario(
            name,
            encodeState(state, encodeOptions).toString(),
        );
        if (!validation.ok) return validation.error;
        try {
            await saveScenario(validation.scenario);
        } catch (error) {
            return errorMessage(error);
        }
        await refresh();
        return null;
    };

    const handleReplace = async (record: AccountScenarioRecord) => {
        const validation = validateAccountScenario(
            record.name,
            encodeState(state, encodeOptions).toString(),
        );
        if (!validation.ok) {
            toast.error(validation.error);
            return;
        }
        try {
            await saveScenario(validation.scenario);
        } catch (error) {
            toast.error(errorMessage(error));
        }
        await refresh();
    };

    const handleDelete = async (record: AccountScenarioRecord) => {
        try {
            await removeScenario({ id: record.id });
        } catch (error) {
            toast.error(errorMessage(error));
        }
        await refresh();
    };

    const handleClearAll = async (
        records: readonly AccountScenarioRecord[],
    ) => {
        const outcome = await clearAccountScenarios(records.length, () =>
            removeAllScenarios(),
        );
        const notice = scenarioRemovalNotice(outcome);
        if (notice !== null) toast.error(notice);
        await refresh();
    };

    const scenarios =
        serverRows === undefined
            ? null
            : accountScenarioRecords(serverRows, userId);

    return (
        <ScenarioPanel
            busy={
                isImporting ||
                isImportingMany ||
                isSaving ||
                isRemoving ||
                isClearing
            }
            clearAllConfirmation={CLEAR_ACCOUNT_SCENARIOS_WARNING}
            heading="Saved to your account"
            loadError={
                listQuery.isError
                    ? `Could not load saved scenarios: ${listQuery.error.message}`
                    : null
            }
            onClearAll={() => void handleClearAll(scenarios ?? [])}
            onDelete={(record) => void handleDelete(record)}
            onLoad={onLoad}
            onReplace={(record) => void handleReplace(record)}
            onSave={handleSave}
            scenarios={scenarios}
        />
    );
}

function ClearAllButton({
    busy,
    confirmation,
    onClearAll,
}: ClearAllButtonProperties) {
    const button = (
        <Button
            className="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={confirmation === null ? onClearAll : undefined}
            size="sm"
            type="button"
            variant="ghost"
        >
            {CLEAR_ALL_TEXT}
        </Button>
    );
    if (confirmation === null) return button;
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Clear all saved scenarios?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {confirmation}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onClearAll}>
                        {CLEAR_ALL_TEXT}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function isSettledScenarioStore(store: ScenarioStore): boolean {
    return store === ScenarioStore.Account || store === ScenarioStore.Local;
}

function LocalScenarios({
    encodeOptions,
    onLoad,
    state,
}: ScenarioStoreProperties) {
    const [scenarios, setScenarios] = useState<SavedScenarioRecord[]>([]);

    useEffect(() => {
        setScenarios(loadScenarios());
    }, []);

    const handleSave = (name: string) => {
        const parameters = encodeState(state, encodeOptions).toString();
        const filtered = scenarios.filter((s) => s.name !== name);
        const next: SavedScenarioRecord[] = [
            ...filtered,
            { name, params: parameters, savedAt: Date.now() },
        ].toSorted((a, b) => b.savedAt - a.savedAt);
        persistScenarios(next);
        setScenarios(next);
        return Promise.resolve(null);
    };

    const handleReplace = (record: SavedScenarioRecord) => {
        const parameters = encodeState(state, encodeOptions).toString();
        const next = scenarios.map((s) =>
            s.name === record.name
                ? { ...s, params: parameters, savedAt: Date.now() }
                : s,
        );
        persistScenarios(next);
        setScenarios(next);
    };

    const handleDelete = (record: SavedScenarioRecord) => {
        const next = scenarios.filter((s) => s.name !== record.name);
        persistScenarios(next);
        setScenarios(next);
    };

    const handleClearAll = () => {
        persistScenarios([]);
        setScenarios([]);
    };

    return (
        <ScenarioPanel
            busy={false}
            clearAllConfirmation={null}
            heading="Saved"
            loadError={null}
            onClearAll={handleClearAll}
            onDelete={handleDelete}
            onLoad={onLoad}
            onReplace={handleReplace}
            onSave={handleSave}
            scenarios={scenarios}
        />
    );
}

function scenarioListStatus(
    loadError: null | string,
    scenarios: null | readonly SavedScenarioRecord[],
): null | string {
    if (loadError !== null) return loadError;
    if (scenarios === null) return LOADING_SCENARIOS_TEXT;
    return scenarios.length === 0 ? 'No saved scenarios yet.' : null;
}

function ScenarioPanel<TRecord extends SavedScenarioRecord>({
    busy,
    clearAllConfirmation,
    heading,
    loadError,
    onClearAll,
    onDelete,
    onLoad,
    onReplace,
    onSave,
    scenarios,
}: ScenarioPanelProperties<TRecord>) {
    const form = useForm<SavedScenarioFormValues>({
        defaultValues: { name: '' },
        resolver: zodResolver(savedScenarioFormSchema),
    });

    const status = scenarioListStatus(loadError, scenarios);

    const handleSave = form.handleSubmit(async (values) => {
        const error = await onSave(values.name);
        if (error === null) {
            form.reset({ name: '' });
        } else {
            form.setError('name', { message: error });
        }
    });

    return (
        <div className="flex flex-col gap-3">
            <div className="text-sm font-semibold">Save current scenario</div>
            <Form {...form}>
                <form className="flex gap-2" onSubmit={handleSave}>
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormControl>
                                    <Input
                                        className="h-8"
                                        placeholder="Name"
                                        type="text"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button
                        className="h-8 px-3 text-xs"
                        disabled={busy || !form.watch('name').trim()}
                        size="sm"
                        type="submit"
                    >
                        Save
                    </Button>
                </form>
            </Form>

            <div className="border-t border-border/50 pt-2">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {heading}
                    </span>
                    {scenarios !== null && scenarios.length > 0 && (
                        <ClearAllButton
                            busy={busy}
                            confirmation={clearAllConfirmation}
                            onClearAll={onClearAll}
                        />
                    )}
                </div>
                {status === null && scenarios !== null ? (
                    <ul
                        className={cn(
                            'app-prop-calculator__saved-scenarios-list',
                            'flex flex-col gap-1',
                        )}
                    >
                        {scenarios.map((s) => (
                            <li
                                className={cn(
                                    'app-prop-calculator__saved-scenario-item',
                                    'flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent',
                                )}
                                key={s.name}
                            >
                                <Button
                                    className="h-auto flex-1 justify-start px-1 py-0 text-sm font-normal"
                                    onClick={() => onLoad(s)}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    {s.name}
                                </Button>
                                <div className="flex items-center gap-1">
                                    <Button
                                        aria-label={`Replace ${s.name} with current config`}
                                        className="size-6 p-0 text-muted-foreground"
                                        disabled={busy}
                                        onClick={() => onReplace(s)}
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <RotateCcw className="size-3.5" />
                                    </Button>
                                    <Button
                                        aria-label={`Delete ${s.name}`}
                                        className="size-6 p-0 text-muted-foreground hover:text-destructive"
                                        disabled={busy}
                                        onClick={() => onDelete(s)}
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p
                        className={cn(
                            'text-xs',
                            loadError === null
                                ? 'text-muted-foreground'
                                : 'text-destructive',
                        )}
                        role={loadError === null ? undefined : 'alert'}
                    >
                        {status}
                    </p>
                )}
            </div>
        </div>
    );
}

function ScenarioStoreError({
    message,
    onRetry,
}: ScenarioStoreErrorProperties) {
    return (
        <div className="flex flex-col items-start gap-2">
            <p className="text-xs text-destructive" role="alert">
                {message}
            </p>
            <Button
                className="h-7 px-2 text-xs"
                onClick={onRetry}
                size="sm"
                type="button"
                variant="outline"
            >
                Try again
            </Button>
        </div>
    );
}

function ScenarioStoreLoading() {
    return (
        <p className="text-xs text-muted-foreground">
            {LOADING_SCENARIOS_TEXT}
        </p>
    );
}

function ScenarioStores({
    encodeOptions,
    onLoad,
    state,
}: ScenarioStoreProperties) {
    const session = useSession();
    const userId = session.data?.user.id ?? null;
    const store = scenarioStoreFor({
        hasError: session.error !== null,
        isPending: session.isPending,
        userId,
    });
    const [settledStore, setSettledStore] = useState<null | ScenarioStore>(
        null,
    );
    if (store !== settledStore && isSettledScenarioStore(store)) {
        setSettledStore(store);
    }
    switch (visibleScenarioStore(store, settledStore)) {
        case ScenarioStore.Account: {
            return userId === null ? null : (
                <AccountScenarios
                    encodeOptions={encodeOptions}
                    onLoad={onLoad}
                    state={state}
                    userId={userId}
                />
            );
        }
        case ScenarioStore.Local: {
            return (
                <LocalScenarios
                    encodeOptions={encodeOptions}
                    onLoad={onLoad}
                    state={state}
                />
            );
        }
        case ScenarioStore.Pending: {
            return <ScenarioStoreLoading />;
        }
        case ScenarioStore.Unavailable: {
            return (
                <ScenarioStoreError
                    message="Could not check whether you are signed in, so saved scenarios are unavailable."
                    onRetry={() => void session.refetch()}
                />
            );
        }
    }
}

function visibleScenarioStore(
    store: ScenarioStore,
    settledStore: null | ScenarioStore,
): ScenarioStore {
    return settledStore === ScenarioStore.Local &&
        !isSettledScenarioStore(store)
        ? ScenarioStore.Local
        : store;
}
