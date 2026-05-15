import Link from 'next/link';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { env } from '~/env';
import { loginSearchSchema } from '~/lib/schemas/url';
import { cn } from '~/lib/utils';

import { OAuthButtons } from '../_components/OAuthButtons';
import { SignInMethodTabs } from '../_components/SignInMethodTabs';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { error, success } = loginSearchSchema.parse(await searchParams);

    return (
        <div
            className={cn(
                'app-auth__page',
                'flex min-h-screen items-center justify-center px-4',
            )}
        >
            <div className="w-full max-w-sm">
                <Link
                    className={cn(
                        'app-auth__logo',
                        'mb-8 block text-center font-orbitron text-lg font-semibold tracking-widest text-white',
                    )}
                    href="/"
                >
                    sadra.nl
                </Link>
                <Card>
                    <CardHeader>
                        <CardTitle>Sign in</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {success === 'reset' && (
                            <Alert variant="success">
                                <AlertDescription>
                                    Password reset — sign in with your new
                                    password.
                                </AlertDescription>
                            </Alert>
                        )}
                        {success === 'created' && (
                            <Alert variant="success">
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
                                env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET,
                            )}
                            hasGoogle={Boolean(
                                env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
                            )}
                        />
                        <SignInMethodTabs />
                        <div className="mt-1 text-right">
                            <Link
                                className="text-xs text-muted-foreground underline underline-offset-4 hover:opacity-70"
                                href="/forgot-password"
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
                                href="/signup"
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
