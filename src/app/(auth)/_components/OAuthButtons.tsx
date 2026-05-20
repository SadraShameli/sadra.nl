'use client';

import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '~/components/ui/Button';
import GithubIcon from '~/components/ui/Icons/Github';
import GoogleIcon from '~/components/ui/Icons/Google';
import { signInWithGithub, signInWithGoogle } from '~/lib/auth/actions';
import { cn } from '~/lib/utils';

export function OAuthButtons({
    hasGithub,
    hasGoogle,
}: {
    hasGithub: boolean;
    hasGoogle: boolean;
}) {
    const [pendingGoogle, startGoogle] = useTransition();
    const [pendingGithub, startGithub] = useTransition();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') ?? undefined;

    if (!hasGoogle && !hasGithub) return null;

    return (
        <div className={cn('app-auth__oauth-buttons', 'flex flex-col gap-2')}>
            {hasGoogle && (
                <Button
                    className={cn('app-auth__oauth-google', 'w-full')}
                    disabled={pendingGoogle}
                    onClick={() =>
                        startGoogle(() => signInWithGoogle({ callbackUrl }))
                    }
                    type="button"
                    variant="outline"
                >
                    <GoogleIcon className="size-4" />
                    {pendingGoogle ? 'Redirecting…' : 'Continue with Google'}
                </Button>
            )}
            {hasGithub && (
                <Button
                    className={cn('app-auth__oauth-github', 'w-full')}
                    disabled={pendingGithub}
                    onClick={() =>
                        startGithub(() => signInWithGithub({ callbackUrl }))
                    }
                    type="button"
                    variant="outline"
                >
                    <GithubIcon className="size-4" colored />
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
