import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { resetPasswordSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';

import { ResetPasswordForm } from './ResetPasswordForm';

const errorMessages: Record<string, string> = {
    expired:
        'This reset link has expired or already been used. Request a new one.',
};

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { error, token } = resetPasswordSearchSchema.parse(
        await searchParams,
    );

    if (!token && !error) redirect(routes.auth.forgotPassword);

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
                        <CardTitle>Set new password</CardTitle>
                    </CardHeader>
                    {error === 'expired' ? (
                        <CardContent className="flex flex-col gap-4">
                            <Alert persistent variant="destructive">
                                <AlertDescription>
                                    {errorMessages.expired}
                                </AlertDescription>
                            </Alert>
                            <Link
                                className="text-sm underline underline-offset-4 hover:opacity-70"
                                href={routes.auth.forgotPassword}
                            >
                                Request a new link
                            </Link>
                        </CardContent>
                    ) : (
                        <CardContent>
                            <ResetPasswordForm token={token ?? ''} />
                        </CardContent>
                    )}
                </Card>
            </div>
        </div>
    );
}
