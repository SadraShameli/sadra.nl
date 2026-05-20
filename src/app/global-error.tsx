'use client';

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[global] unhandled error', error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    alignItems: 'center',
                    background: '#000',
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily:
                        'ui-sans-serif, system-ui, -apple-system, sans-serif',
                    gap: '1rem',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '2rem',
                    textAlign: 'center',
                }}
            >
                <h1 style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                    Application error
                </h1>
                <p style={{ color: '#a1a1aa', maxWidth: 480 }}>
                    Something went wrong outside of the app shell. Try reloading
                    the page.
                </p>
                {error.digest && (
                    <code style={{ color: '#71717a', fontSize: '0.75rem' }}>
                        ref: {error.digest}
                    </code>
                )}
                <button
                    onClick={() => reset()}
                    style={{
                        background: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        color: '#000',
                        cursor: 'pointer',
                        fontWeight: 600,
                        padding: '0.5rem 1rem',
                    }}
                    type="button"
                >
                    Reload
                </button>
            </body>
        </html>
    );
}
