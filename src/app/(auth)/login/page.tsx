import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AuthPageFrame } from '~/app/(auth)/_components/AuthPageFrame';
import { OAuthButtons } from '~/app/(auth)/_components/OAuthButtons';
import { SignInMethodTabs } from '~/app/(auth)/_components/SignInMethodTabs';
import { FlashToast } from '~/components/FlashToast';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { CardContent, CardFooter } from '~/components/ui/card';
import { environment } from '~/environment';
import { readSession } from '~/lib/auth/session';
import { loginSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

type LoginSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({
    searchParams,
}: {
    searchParams: LoginSearchParams;
}) {
    return (
        <AuthPageFrame title="Sign in">
            <CardContent className="flex flex-col gap-3">
                <Suspense fallback={null}>
                    <RedirectWhenSignedIn />
                </Suspense>
                <Suspense fallback={null}>
                    <LoginNotices searchParams={searchParams} />
                </Suspense>
                <OAuthButtons
                    hasGithub={Boolean(
                        environment.AUTH_GITHUB_ID &&
                        environment.AUTH_GITHUB_SECRET,
                    )}
                    hasGoogle={Boolean(
                        environment.AUTH_GOOGLE_ID &&
                        environment.AUTH_GOOGLE_SECRET,
                    )}
                />
                <SignInMethodTabs />
                <div className="mt-1 text-right">
                    <Link
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:opacity-70"
                        href={routes.auth.forgotPassword}
                    >
                        Forgot password?
                    </Link>
                </div>
            </CardContent>
            <CardFooter className="mt-2 flex flex-col gap-3">
                <p className="text-center text-sm text-muted-foreground">
                    No account?{' '}
                    <Link
                        className="text-foreground underline underline-offset-4 hover:opacity-70"
                        href={routes.auth.signup}
                    >
                        Sign up
                    </Link>
                </p>
            </CardFooter>
        </AuthPageFrame>
    );
}

async function LoginNotices({
    searchParams,
}: {
    searchParams: LoginSearchParams;
}) {
    const { error, success } = loginSearchSchema.parse(await searchParams);
    return (
        <>
            {success === 'reset' && (
                <FlashToast message="Password reset. Sign in with your new password." />
            )}
            {success === 'created' && (
                <FlashToast message="Account created. Sign in to continue." />
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>
                        Invalid email or password.
                    </AlertDescription>
                </Alert>
            )}
        </>
    );
}

async function RedirectWhenSignedIn() {
    const session = await readSession();
    if (session?.user.id) redirect(routes.home);
    return null;
}
