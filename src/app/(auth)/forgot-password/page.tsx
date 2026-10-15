import Link from 'next/link';
import { Suspense } from 'react';

import { PageTransition } from '~/components/PageTransition';
import { Alert, AlertDescription } from '~/components/ui/Alert';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { forgotPasswordSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { ForgotPasswordForm } from './ForgotPasswordForm';

interface ForgotPasswordPageProperties {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ForgotPasswordPage({
    searchParams,
}: ForgotPasswordPageProperties) {
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
                            <CardTitle>Forgot password</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <Suspense fallback={<ForgotPasswordIntro />}>
                                <ForgotPasswordNotice
                                    searchParams={searchParams}
                                />
                            </Suspense>
                            <ForgotPasswordForm />
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
        </PageTransition>
    );
}

function ForgotPasswordIntro() {
    return (
        <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
        </p>
    );
}

async function ForgotPasswordNotice({
    searchParams,
}: ForgotPasswordPageProperties) {
    const { sent } = forgotPasswordSearchSchema.parse(await searchParams);
    return sent ? (
        <Alert variant="success">
            <AlertDescription>
                If an account exists for that email, a reset link has been sent.
            </AlertDescription>
        </Alert>
    ) : (
        <ForgotPasswordIntro />
    );
}
