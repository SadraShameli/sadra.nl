import Link from 'next/link';

import { Button } from '~/components/ui/Button';
import { routes } from '~/lib/site/routes';

export default function NotFound() {
    return (
        <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground">
                404
            </p>
            <h1 className="text-3xl font-semibold">Page not found</h1>
            <p className="max-w-md text-sm text-muted-foreground">
                The page you were looking for doesn&apos;t exist or was moved.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button asChild>
                    <Link href={routes.home}>Home</Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href={routes.resume}>Resume</Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href={routes.propCalculator}>Prop calculator</Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href={routes.tradeChecklist.index}>
                        Trade checklist
                    </Link>
                </Button>
            </div>
        </main>
    );
}
