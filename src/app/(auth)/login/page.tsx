import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { OAuthButtons } from '~/app/(auth)/_components/OAuthButtons';
import { SignInMethodTabs } from '~/app/(auth)/_components/SignInMethodTabs';
import { PageTransition } from '~/components/PageTransition';
import { Alert, AlertDescription } from '~/components/ui/Alert';
import { AutoDismissAlert } from '~/components/ui/AutoDismissAlert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { environment } from '~/environment';
import { readSession } from '~/lib/auth/session';
import { loginSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

type LoginSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({
    searchParams,
}: {
    searchParams: LoginSearchParams;
}) {
    return (
        <PageTransition>
            <div
                className={cn(
                    'app-auth__page',
                    'flex flex-1 items-center justify-center px-4 pt-20 pb-12',
                )}
            >
                <div className="w-full max-w-sm">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sign in</CardTitle>
                        </CardHeader>
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
                    </Card>
                </div>
            </div>
        </PageTransition>
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
                <AutoDismissAlert variant="success">
                    <AlertDescription>
                        Password reset. Sign in with your new password.
                    </AlertDescription>
                </AutoDismissAlert>
            )}
            {success === 'created' && (
                <AutoDismissAlert variant="success">
                    <AlertDescription>
                        Account created. Sign in to continue.
                    </AlertDescription>
                </AutoDismissAlert>
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
