import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { resetPasswordSearchSchema } from '~/lib/schemas/url';
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
    const { token, error } = resetPasswordSearchSchema.parse(
        await searchParams,
    );

    if (!token && !error) redirect('/forgot-password');

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
                        <CardTitle>Set new password</CardTitle>
                    </CardHeader>
                    {error === 'expired' ? (
                        <CardContent className="flex flex-col gap-4">
                            <Alert variant="destructive" persistent>
                                <AlertDescription>
                                    {errorMessages.expired}
                                </AlertDescription>
                            </Alert>
                            <Link
                                href="/forgot-password"
                                className="text-sm underline underline-offset-4 hover:opacity-70"
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
