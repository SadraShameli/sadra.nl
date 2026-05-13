'use client';

import { useTransition } from 'react';

import { Button } from '~/components/ui/Button';
import { logout } from '~/lib/auth-actions';

export function LogoutButton() {
    const [pending, startTransition] = useTransition();
    return (
        <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => logout())}
        >
            {pending ? 'Signing out…' : 'Sign out'}
        </Button>
    );
}
