import Link from 'next/link';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { routes } from '~/lib/routes';
import { authErrorSearchSchema } from '~/lib/schemas/url';
import { cn } from '~/lib/utils';

const errorMessages: Record<string, string> = {
    AccessDenied: 'Access denied.',
    Configuration: 'Authentication is misconfigured. Please contact support.',
    CredentialsSignin: 'Invalid email or password.',
    email_send: 'Could not send the sign-in email. Please try again.',
    EmailSignInError: 'Could not send the sign-in email.',
    OAuthAccountNotLinked:
        'This email is already used with a different sign-in method.',
    OAuthCallbackError: 'Sign-in failed during the provider callback.',
    OAuthSignInError: 'Could not start the sign-in flow with that provider.',
    rate_limited: 'Too many requests. Please wait a few minutes and retry.',
    SessionRequired: 'Please sign in to continue.',
    sign_in: 'We could not sign you in. Please try again.',
    Verification:
        'This sign-in link has expired or already been used. Request a new one.',
};

export const dynamic = 'force-dynamic';

export default async function AuthErrorPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { error } = authErrorSearchSchema.parse(await searchParams);
    const message =
        (error && errorMessages[error]) ?? 'Something went wrong. Try again.';

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
                    href={routes.home}
                >
                    sadra.nl
                </Link>
                <Card>
                    <CardHeader>
                        <CardTitle>Sign-in problem</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert persistent variant="destructive">
                            <AlertDescription>{message}</AlertDescription>
                        </Alert>
                    </CardContent>
                    <CardFooter className="mt-2 flex flex-col gap-3">
                        <p className="text-center text-sm text-muted-foreground">
                            <Link
                                className="text-foreground underline underline-offset-4 hover:opacity-70"
                                href={routes.auth.login}
                            >
                                Back to sign in
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
