import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

export function AccountLink({ signedIn }: { signedIn: boolean }) {
    return (
        <Link
            className={cn(
                'app-shell__account-link',
                'ml-1 flex h-11 items-center gap-2 rounded-full bg-surface-high pr-4 pl-4.5 text-[15px] font-medium text-ink focus-camel transition-colors hover:bg-line',
            )}
            href={signedIn ? routes.profile : routes.auth.login}
        >
            {signedIn ? 'Profile' : 'Log in'}
            <ArrowRight aria-hidden className="size-4" strokeWidth={1.8} />
        </Link>
    );
}
