import Link from 'next/link';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { authErrorSearchSchema } from '~/lib/schemas/url';

const errorMessages: Record<string, string> = {
    sign_in: 'We could not sign you in. Please try again.',
    email_send: 'Could not send the sign-in email. Please try again.',
    rate_limited: 'Too many requests. Please wait a few minutes and retry.',
    Configuration: 'Authentication is misconfigured. Please contact support.',
    AccessDenied: 'Access denied.',
    Verification:
        'This sign-in link has expired or already been used. Request a new one.',
    OAuthSignInError: 'Could not start the sign-in flow with that provider.',
    OAuthCallbackError: 'Sign-in failed during the provider callback.',
    OAuthAccountNotLinked:
        'This email is already used with a different sign-in method.',
    EmailSignInError: 'Could not send the sign-in email.',
    CredentialsSignin: 'Invalid email or password.',
    SessionRequired: 'Please sign in to continue.',
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
                        <CardTitle>Sign-in problem</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert variant="destructive" persistent>
                            <AlertDescription>{message}</AlertDescription>
                        </Alert>
                    </CardContent>
                    <CardFooter className="mt-2 flex flex-col gap-3">
                        <p className="text-center text-sm text-muted-foreground">
                            <Link
                                href="/login"
                                className="text-foreground underline underline-offset-4 hover:opacity-70"
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
