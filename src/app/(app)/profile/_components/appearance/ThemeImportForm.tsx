'use client';

import { useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';

export function ThemeImportForm({
    error,
    isPending,
    onImport,
}: {
    readonly error: null | string;
    readonly isPending: boolean;
    readonly onImport: (link: string) => void;
}) {
    const [link, setLink] = useState('');
    return (
        <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                if (link.trim() !== '') onImport(link);
            }}
        >
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    aria-label="tweakcn theme link"
                    onChange={(event) => {
                        setLink(event.target.value);
                    }}
                    placeholder="https://tweakcn.com/themes/..."
                    value={link}
                />
                <Button
                    disabled={isPending || link.trim() === ''}
                    type="submit"
                >
                    {isPending ? 'Importing…' : 'Use theme'}
                </Button>
            </div>
            {error !== null && (
                <p className="text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
        </form>
    );
}
