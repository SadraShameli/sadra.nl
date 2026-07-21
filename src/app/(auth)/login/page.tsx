import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { environment } from '~/environment';
import { getServerSession } from '~/lib/auth/server';
import { loginSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { OAuthButtons } from '../_components/OAuthButtons';
import { SignInMethodTabs } from '../_components/SignInMethodTabs';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await getServerSession();
    if (session?.user.id) redirect(routes.home);

    const { error, success } = loginSearchSchema.parse(await searchParams);

    return (
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
                        {success === 'reset' && (
                            <Alert autoDismiss variant="success">
                                <AlertDescription>
                                    Password reset — sign in with your new
                                    password.
                                </AlertDescription>
                            </Alert>
                        )}
                        {success === 'created' && (
                            <Alert autoDismiss variant="success">
                                <AlertDescription>
                                    Account created — sign in to continue.
                                </AlertDescription>
                            </Alert>
                        )}
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    Invalid email or password.
                                </AlertDescription>
                            </Alert>
                        )}
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
    );
}
