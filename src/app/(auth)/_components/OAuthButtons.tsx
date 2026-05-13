'use client';

import { useTransition } from 'react';

import { Button } from '~/components/ui/Button';
import { signInWithGithub, signInWithGoogle } from '~/lib/auth-actions';

function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path
                fill="#EA4335"
                d="M12 5c1.617 0 3.067.555 4.207 1.643l3.087-3.087C17.453 1.795 14.969.8 12 .8 7.392.8 3.397 3.46 1.387 7.34l3.595 2.787C5.94 7.255 8.74 5 12 5z"
            />
            <path
                fill="#34A853"
                d="M23.2 12.27c0-.815-.073-1.6-.21-2.354H12v4.452h6.29c-.27 1.45-1.09 2.68-2.32 3.5l3.59 2.78c2.1-1.94 3.31-4.79 3.31-8.378z"
            />
            <path
                fill="#FBBC05"
                d="M4.98 14.13a7.21 7.21 0 0 1-.38-2.13c0-.74.13-1.46.36-2.13L1.39 7.08A11.95 11.95 0 0 0 0 12c0 1.94.47 3.77 1.39 5.42l3.59-2.79z"
            />
            <path
                fill="#4285F4"
                d="M12 23.2c3.24 0 5.96-1.07 7.95-2.91l-3.59-2.78c-1 .67-2.28 1.06-4.36 1.06-3.26 0-6.06-2.25-7.06-5.42L1.39 16.94C3.4 20.74 7.39 23.2 12 23.2z"
            />
        </svg>
    );
}

function GithubIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.6-4.04-1.6-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.21.09 1.85 1.24 1.85 1.24 1.08 1.85 2.83 1.32 3.52 1.01.11-.78.42-1.32.76-1.62-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.12-3.19 0 0 1-.32 3.3 1.23.96-.27 1.99-.4 3.02-.4 1.03 0 2.06.13 3.02.4 2.3-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.89.12 3.19.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.005 12.005 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
        </svg>
    );
}

export function OAuthButtons({
    hasGoogle,
    hasGithub,
}: {
    hasGoogle: boolean;
    hasGithub: boolean;
}) {
    const [pendingGoogle, startGoogle] = useTransition();
    const [pendingGithub, startGithub] = useTransition();

    if (!hasGoogle && !hasGithub) return null;

    return (
        <div className="flex flex-col gap-2">
            {hasGoogle && (
                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={pendingGoogle}
                    onClick={() => startGoogle(() => signInWithGoogle())}
                >
                    <GoogleIcon />
                    {pendingGoogle ? 'Redirecting…' : 'Continue with Google'}
                </Button>
            )}
            {hasGithub && (
                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={pendingGithub}
                    onClick={() => startGithub(() => signInWithGithub())}
                >
                    <GithubIcon />
                    {pendingGithub ? 'Redirecting…' : 'Continue with GitHub'}
                </Button>
            )}
            <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or</span>
                <span className="h-px flex-1 bg-border" />
            </div>
        </div>
    );
}
