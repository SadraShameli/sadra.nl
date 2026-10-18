'use client';

import { useTransition } from 'react';

import { Button } from '~/components/ui/button';
import GithubIcon from '~/components/ui/icons/github';
import GoogleIcon from '~/components/ui/icons/google';
import { authClient } from '~/lib/auth/client';
import { currentCallbackUrl } from '~/lib/site/privateRoutes';
import { cn } from '~/lib/utilities';

export function OAuthButtons({
    hasGithub,
    hasGoogle,
}: {
    hasGithub: boolean;
    hasGoogle: boolean;
}) {
    const [pendingGoogle, startGoogle] = useTransition();
    const [pendingGithub, startGithub] = useTransition();

    if (!hasGoogle && !hasGithub) return null;

    return (
        <div className={cn('app-auth__oauth-buttons', 'flex flex-col gap-2')}>
            {hasGoogle && (
                <Button
                    className={cn('app-auth__oauth-google', 'w-full')}
                    disabled={pendingGoogle}
                    onClick={() =>
                        startGoogle(async () => {
                            await signInWith('google');
                        })
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
                        startGithub(async () => {
                            await signInWith('github');
                        })
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

function signInWith(provider: 'github' | 'google') {
    return authClient.signIn.social({
        callbackURL: currentCallbackUrl(),
        provider,
    });
}
