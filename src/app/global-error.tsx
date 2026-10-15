'use client';

import '~/styles/styles.css';

import * as Sentry from '@sentry/nextjs';
import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { type SectionErrorProperties } from '~/components/SectionError';
import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { jetBrainsMono, orbitron, plusJakartaSans } from '~/fonts';
import { cn } from '~/lib/utilities';

export default function GlobalError({ error, retry }: SectionErrorProperties) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html
            className={cn(
                'dark antialiased',
                plusJakartaSans.variable,
                jetBrainsMono.variable,
            )}
            lang="en"
        >
            <body
                className={cn(
                    'app-global-error',
                    'flex min-h-screen flex-col bg-background text-foreground',
                    orbitron.variable,
                )}
            >
                <title>Something went wrong</title>
                <main className="flex flex-1 items-center justify-center px-6 py-16">
                    <Card className="w-full max-w-xl items-center gap-0 px-8 py-12 text-center">
                        <h1 className="font-orbitron text-3xl font-bold tracking-tight text-white">
                            Something went wrong
                        </h1>
                        <p className="mt-3 max-w-md text-sm text-muted-foreground">
                            The site hit an unexpected error. Your data is safe.
                            Try again, and if it keeps happening, come back in a
                            few minutes.
                        </p>
                        <Button
                            className="mt-8 gap-2"
                            onClick={retry}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            <RotateCcw className="size-4" />
                            Try again
                        </Button>
                    </Card>
                </main>
            </body>
        </html>
    );
}
