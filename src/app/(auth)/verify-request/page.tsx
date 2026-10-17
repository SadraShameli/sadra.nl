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
import { emailLinkSentText } from '~/lib/auth/EmailLink';
import { verifyRequestSearchSchema } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

export default function VerifyRequestPage({
    searchParams,
}: Pick<PageProps<'/verify-request'>, 'searchParams'>) {
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
                            <CardTitle>Check your email</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Alert variant="success">
                                <AlertDescription>
                                    <Suspense
                                        fallback={
                                            "We've sent you a link. Click it to continue."
                                        }
                                    >
                                        <VerifyRequestNotice
                                            searchParams={searchParams}
                                        />
                                    </Suspense>
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                        <CardFooter>
                            <p className="text-center text-sm text-muted-foreground">
                                Didn&apos;t get the email? Check spam, then{' '}
                                <Link
                                    className="text-foreground underline underline-offset-4 hover:opacity-70"
                                    href={routes.auth.login}
                                >
                                    try again
                                </Link>
                                .
                            </p>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}

async function VerifyRequestNotice({
    searchParams,
}: Pick<PageProps<'/verify-request'>, 'searchParams'>) {
    const { link } = verifyRequestSearchSchema.parse(await searchParams);
    return emailLinkSentText(link);
}
