'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { useDeferredValue, useState } from 'react';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/ToggleGroup';
import { useIsClient } from '~/components/useIsClient';
import {
    type AppliedTheme,
    applyBrowserTheme,
    ColorMode,
    parseColorMode,
    ThemeSource,
} from '~/lib/theme';
import { api } from '~/trpc/react';

import {
    parseThemeBrowseFilter,
    THEME_BROWSE_FILTERS,
    ThemeBrowseFilter,
    themeBrowseSource,
} from './ThemeBrowseFilter';
import { ThemeCard } from './ThemeCard';
import { ThemeImportForm } from './ThemeImportForm';

const DEFAULT_THEME_NAME = 'Deep Purple';

const THEME_SOURCE_LABELS: Readonly<Record<ThemeSource, string>> = {
    [ThemeSource.Community]: 'Community',
    [ThemeSource.Imported]: 'Imported link',
    [ThemeSource.Preset]: 'Preset',
};

const COLOR_MODE_OPTIONS: readonly {
    readonly label: string;
    readonly mode: ColorMode;
}[] = [
    { label: 'Light', mode: ColorMode.Light },
    { label: 'Dark', mode: ColorMode.Dark },
];

export function AppearanceTab() {
    const isClient = useIsClient();
    const utilities = api.useUtils();
    const { resolvedTheme, setTheme } = useTheme();
    const [filter, setFilter] = useState(ThemeBrowseFilter.All);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const deferredSearch = useDeferredValue(search);
    const current = api.user.theme.current.useQuery(undefined, {
        staleTime: Infinity,
    });
    const catalog = api.user.theme.catalog.useQuery(
        { page, search: deferredSearch, source: themeBrowseSource(filter) },
        { placeholderData: keepPreviousData },
    );
    const applied = (theme: AppliedTheme | null) => {
        applyBrowserTheme(theme);
        utilities.user.theme.current.setData(undefined, theme);
    };
    const select = api.user.theme.select.useMutation({ onSuccess: applied });
    const importTheme = api.user.theme.import.useMutation({
        onSuccess: applied,
    });
    const reset = api.user.theme.reset.useMutation({ onSuccess: applied });
    const isSaving =
        select.isPending || importTheme.isPending || reset.isPending;
    const pageCount = Math.max(
        1,
        Math.ceil((catalog.data?.total ?? 0) / (catalog.data?.pageSize ?? 1)),
    );
    const activeId = current.data?.id ?? null;

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Current theme</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                            {current.data?.name ?? DEFAULT_THEME_NAME}
                        </span>
                        <Badge variant="outline">
                            {current.data
                                ? THEME_SOURCE_LABELS[current.data.source]
                                : 'Site default'}
                        </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <ToggleGroup
                            aria-label="Color mode"
                            onValueChange={(value) => {
                                if (value !== '')
                                    setTheme(parseColorMode(value));
                            }}
                            size="sm"
                            type="single"
                            value={
                                isClient ? parseColorMode(resolvedTheme) : ''
                            }
                            variant="outline"
                        >
                            {COLOR_MODE_OPTIONS.map((option) => (
                                <ToggleGroupItem
                                    key={option.mode}
                                    value={option.mode}
                                >
                                    {option.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <Button
                            disabled={isSaving || current.data === null}
                            onClick={() => {
                                reset.mutate();
                            }}
                            size="sm"
                            variant="outline"
                        >
                            Reset to default
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Use a tweakcn link</CardTitle>
                </CardHeader>
                <CardContent>
                    <ThemeImportForm
                        error={importTheme.error?.message ?? null}
                        isPending={importTheme.isPending}
                        onImport={(link) => {
                            importTheme.mutate({ link });
                        }}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Browse tweakcn themes</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <ToggleGroup
                            aria-label="Theme source"
                            onValueChange={(value) => {
                                if (value === '') return;
                                setFilter(parseThemeBrowseFilter(value));
                                setPage(1);
                            }}
                            size="sm"
                            type="single"
                            value={filter}
                            variant="outline"
                        >
                            {THEME_BROWSE_FILTERS.map((option) => (
                                <ToggleGroupItem
                                    key={option.filter}
                                    value={option.filter}
                                >
                                    {option.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <Input
                            aria-label="Search themes"
                            className="sm:max-w-xs"
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Search by name or author"
                            value={search}
                        />
                    </div>
                    {select.error !== null && (
                        <p className="text-sm text-destructive" role="alert">
                            {select.error.message}
                        </p>
                    )}
                    {catalog.data?.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No themes match.
                        </p>
                    ) : (
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {catalog.data?.items.map((theme) => (
                                <li key={`${theme.source}-${theme.id}`}>
                                    <ThemeCard
                                        disabled={isSaving}
                                        isActive={theme.id === activeId}
                                        onSelect={() => {
                                            if (
                                                theme.source ===
                                                    ThemeSource.Community ||
                                                theme.source ===
                                                    ThemeSource.Preset
                                            )
                                                select.mutate({
                                                    id: theme.id,
                                                    source: theme.source,
                                                });
                                        }}
                                        theme={theme}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                        <span className="tabular-nums">
                            Page {String(page)} of {String(pageCount)}
                            {catalog.data
                                ? ` · ${String(catalog.data.total)} themes`
                                : ''}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                disabled={page <= 1}
                                onClick={() => {
                                    setPage(page - 1);
                                }}
                                size="sm"
                                variant="outline"
                            >
                                Previous
                            </Button>
                            <Button
                                disabled={page >= pageCount}
                                onClick={() => {
                                    setPage(page + 1);
                                }}
                                size="sm"
                                variant="outline"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
