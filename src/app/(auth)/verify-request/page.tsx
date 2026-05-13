import Link from 'next/link';

import { Alert, AlertDescription } from '~/components/ui/Alert';

export const dynamic = 'force-dynamic';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';

export default function VerifyRequestPage() {
    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <Link
                    className="mb-8 block text-center font-orbitron text-lg font-semibold tracking-widest text-white"
                    href="/"
                >
                    sadra.nl
                </Link>
                <Card>
                    <CardHeader>
                        <CardTitle>Check your email</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert variant="success">
                            <AlertDescription>
                                We&apos;ve sent you a sign-in link. Click it to
                                continue. The link expires in 24 hours.
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                    <CardFooter>
                        <p className="text-center text-sm text-muted-foreground">
                            Didn&apos;t get the email? Check spam, then{' '}
                            <Link
                                className="text-foreground underline underline-offset-4 hover:opacity-70"
                                href="/login"
                            >
                                try again
                            </Link>
                            .
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
