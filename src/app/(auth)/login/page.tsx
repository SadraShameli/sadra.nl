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
import { OAuthButtons } from '../_components/OAuthButtons';
import { SignInMethodTabs } from '../_components/SignInMethodTabs';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { error, success } = loginSearchSchema.parse(await searchParams);

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <Link
                    href="/"
                    className="mb-8 block text-center font-orbitron text-lg font-semibold tracking-widest text-white"
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
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    Invalid email or password.
                                </AlertDescription>
                            </Alert>
                        )}
                        <OAuthButtons
                            hasGoogle={Boolean(
                                env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
                            )}
                            hasGithub={Boolean(
                                env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET,
                            )}
                        />
                        <SignInMethodTabs />
                        <div className="mt-1 text-right">
                            <Link
                                href="/forgot-password"
                                className="text-xs text-muted-foreground underline underline-offset-4 hover:opacity-70"
                            >
                                Forgot password?
                            </Link>
                        </div>
                    </CardContent>
                    <CardFooter className="mt-2 flex flex-col gap-3">
                        <p className="text-center text-sm text-muted-foreground">
                            No account?{' '}
                            <Link
                                href="/signup"
                                className="text-foreground underline underline-offset-4 hover:opacity-70"
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
