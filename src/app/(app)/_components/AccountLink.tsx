import { LogIn, UserRound } from 'lucide-react';
import Link from 'next/link';

import { Button } from '~/components/ui/button';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

export function AccountLink({ signedIn }: { signedIn: boolean }) {
    const label = signedIn ? 'Profile' : 'Log in';
    const Icon = signedIn ? UserRound : LogIn;
    return (
        <Button
            asChild
            className={cn(
                'app-shell__account-link',
                'md:bg-surface-high md:text-ink md:hover:bg-line',
            )}
            size="icon-tap"
            variant="capsule"
        >
            <Link
                aria-label={label}
                href={signedIn ? routes.profile : routes.auth.login}
                title={label}
            >
                <Icon aria-hidden strokeWidth={1.6} />
            </Link>
        </Button>
    );
}
