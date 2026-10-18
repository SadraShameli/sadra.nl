'use client';

import { Upload } from 'lucide-react';
import * as React from 'react';

import { FIELD_SURFACE_CLASS } from '~/components/ui/field-surface';
import { cn } from '~/lib/utilities';

const DROP_HINT = 'or drop it here';

const REPLACE_HINT = 'Choose or drop another file to replace it';

const REJECTED_HINT = 'That file type is not accepted here';

const ACCEPT_SEPARATOR = ',';

const EXTENSION_PREFIX = '.';

const ANY_SUBTYPE_SUFFIX = '/*';

const WILDCARD = '*';

export function FilePicker({
    accept,
    'aria-invalid': ariaInvalid,
    buttonLabel = 'Choose file',
    className,
    disabled,
    fileName,
    id,
    onFile,
}: {
    readonly accept: string;
    readonly 'aria-invalid'?: boolean;
    readonly buttonLabel?: string;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly fileName: null | string;
    readonly id: string;
    readonly onFile: (file: File) => void;
}) {
    const inputReference = React.useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isRejected, setIsRejected] = React.useState(false);
    const hintId = React.useId();
    const take = (file: File) => {
        const isAccepted = isAcceptedFile(file, accept);
        setIsRejected(!isAccepted);
        if (isAccepted) onFile(file);
    };
    return (
        <div className={cn('min-w-0', className)}>
            <input
                accept={accept}
                aria-hidden
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file !== undefined) take(file);
                }}
                ref={inputReference}
                tabIndex={-1}
                type="file"
            />
            <button
                aria-describedby={hintId}
                className={cn(
                    FIELD_SURFACE_CLASS,
                    'flex w-full min-w-0 cursor-pointer items-center gap-3 border-dashed px-4 py-3 text-left text-sm hover:border-ink-muted data-[invalid=true]:border-destructive',
                    isDragging && 'border-camel',
                )}
                data-invalid={ariaInvalid === true || isRejected}
                disabled={disabled}
                id={id}
                onClick={() => inputReference.current?.click()}
                onDragLeave={() => {
                    setIsDragging(false);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file !== undefined) take(file);
                }}
                type="button"
            >
                <Upload
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium text-ink">
                        {fileName ?? buttonLabel}
                    </span>
                    <span className="text-xs text-ink-muted" id={hintId}>
                        {pickerHint(fileName, isRejected)}
                    </span>
                </span>
            </button>
        </div>
    );
}

function isAcceptedFile(file: File, accept: string): boolean {
    const name = file.name.toLowerCase();
    return accept
        .split(ACCEPT_SEPARATOR)
        .map((token) => token.trim().toLowerCase())
        .some((token) => {
            if (token.startsWith(EXTENSION_PREFIX)) return name.endsWith(token);
            return token.endsWith(ANY_SUBTYPE_SUFFIX)
                ? file.type.startsWith(token.slice(0, -WILDCARD.length))
                : file.type === token;
        });
}

function pickerHint(fileName: null | string, isRejected: boolean): string {
    if (isRejected) return REJECTED_HINT;
    return fileName === null ? DROP_HINT : REPLACE_HINT;
}
