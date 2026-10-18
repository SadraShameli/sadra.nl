'use client';

import { Upload } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utilities';

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
    return (
        <div className={cn('flex min-w-0 items-center gap-3', className)}>
            <input
                accept={accept}
                aria-hidden
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file !== undefined) onFile(file);
                }}
                ref={inputReference}
                tabIndex={-1}
                type="file"
            />
            <Button
                aria-invalid={ariaInvalid}
                disabled={disabled}
                id={id}
                onClick={() => inputReference.current?.click()}
                type="button"
                variant="outline"
            >
                <Upload data-icon="inline-start" />
                {buttonLabel}
            </Button>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
                {fileName ?? 'No file selected'}
            </span>
        </div>
    );
}
