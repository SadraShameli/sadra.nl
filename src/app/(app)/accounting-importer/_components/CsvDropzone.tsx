'use client';

import { FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { RawTransaction } from '~/lib/accounting-importer/core/types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { apiRoutes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';

export interface ParsedCsvFile {
    error: null | string;
    headers: string[];
    name: string;
    size: number;
    sourceId: null | string;
    sourceLabel: null | string;
    transactions: RawTransaction[];
}

interface Props {
    onChange: (files: ParsedCsvFile[]) => void;
    value: ParsedCsvFile[];
}

export function CsvDropzone({ onChange, value }: Props) {
    const [busy, setBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const upload = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            if (busy) {
                toast.error('Already uploading — wait for the current batch.');
                return;
            }
            setBusy(true);
            try {
                const form = new FormData();
                for (const f of files) form.append('files', f);
                const resp = await fetch(apiRoutes.accountingImporter.upload, {
                    body: form,
                    method: 'POST',
                });
                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(`Upload failed: ${resp.status} ${text}`);
                }
                const json = (await resp.json()) as { files: ParsedCsvFile[] };
                onChange([...value, ...json.files]);
                const okCount = json.files.filter((f) => !f.error).length;
                toast.success(
                    `Parsed ${okCount}/${json.files.length} file(s).`,
                );
            } catch (error) {
                toast.error(
                    error instanceof Error ? error.message : 'Upload failed',
                );
            } finally {
                setBusy(false);
            }
        },
        [busy, onChange, value],
    );

    return (
        <div className="flex flex-col gap-3">
            <button
                className={cn(
                    'group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 bg-card/40 p-6 transition',
                    dragOver && 'border-sky-500/50 bg-sky-500/10',
                    busy && 'cursor-wait opacity-60',
                )}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDrop={async (e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = [...e.dataTransfer.files].filter(
                        (f) =>
                            f.name.toLowerCase().endsWith('.csv') ||
                            f.type.includes('csv'),
                    );
                    await upload(files);
                }}
                type="button"
            >
                <Upload className="size-5 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">
                    Drop CSV files here
                </div>
                <div className="text-xs text-muted-foreground">
                    or click to choose
                </div>
                <input
                    accept=".csv,text/csv"
                    className="hidden"
                    multiple
                    onChange={async (e) => {
                        const files = [...(e.target.files ?? [])];
                        await upload(files);
                        e.target.value = '';
                    }}
                    ref={inputRef}
                    type="file"
                />
            </button>

            {value.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {value.map((file, idx) => (
                        <li
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-card/40 p-3"
                            key={`${file.name}-${idx}`}
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-medium">
                                        {file.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {file.error ? (
                                    <Badge variant="destructive">
                                        {file.error}
                                    </Badge>
                                ) : (
                                    <>
                                        <Badge variant="secondary">
                                            {file.sourceLabel}
                                        </Badge>
                                        <Badge variant="outline">
                                            {file.transactions.length} txns
                                        </Badge>
                                    </>
                                )}
                                <Button
                                    onClick={() =>
                                        onChange(
                                            value.filter((_, i) => i !== idx),
                                        )
                                    }
                                    size="icon-sm"
                                    variant="ghost"
                                >
                                    <Trash2 className="size-3" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
