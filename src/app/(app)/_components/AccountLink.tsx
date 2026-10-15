import { User } from 'lucide-react';
import Link from 'next/link';

import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

export function AccountLink({ signedIn }: { signedIn: boolean }) {
    return (
        <Link
            aria-label={signedIn ? 'Profile' : 'Sign in'}
            className={cn(
                'app-shell__account-link',
                'flex size-5 items-center justify-center text-foreground transition hover:opacity-60',
            )}
            href={signedIn ? routes.profile : routes.auth.login}
        >
            <User className="size-5" strokeWidth={1.75} />
        </Link>
    );
}
