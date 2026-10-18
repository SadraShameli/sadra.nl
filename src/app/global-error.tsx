'use client';

import '~/styles/styles.css';

import * as Sentry from '@sentry/nextjs';
import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { PageHeader } from '~/components/PageHeader';
import { type SectionErrorProperties } from '~/components/SectionError';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { bodoniModa, hankenGrotesk, jetBrainsMono } from '~/fonts';
import { cn } from '~/lib/utilities';

export default function GlobalError({ error, retry }: SectionErrorProperties) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html
            className={cn(
                'dark antialiased',
                bodoniModa.variable,
                hankenGrotesk.variable,
                jetBrainsMono.variable,
            )}
            lang="en"
        >
            <body
                className={cn(
                    'app-global-error',
                    'flex min-h-screen flex-col bg-background text-foreground',
                )}
            >
                <title>Something went wrong</title>
                <main className="flex flex-1 items-center justify-center px-6 py-16">
                    <Card className="w-full max-w-xl items-center gap-0 px-8 py-12 text-center">
                        <PageHeader
                            className="mb-0 justify-center"
                            lead="The site hit an unexpected error. Your data is safe. Try again, and if it keeps happening, come back in a few minutes."
                            title="Something went wrong"
                        />
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
