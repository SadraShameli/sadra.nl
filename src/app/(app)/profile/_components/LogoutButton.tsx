'use client';

import { useTransition } from 'react';

import { Button } from '~/components/ui/Button';
import { logout } from '~/lib/auth-actions';

export function LogoutButton() {
    const [pending, startTransition] = useTransition();
    return (
        <Button
            disabled={pending}
            onClick={() => startTransition(() => logout())}
            type="button"
            variant="outline"
        >
            {pending ? 'Signing out…' : 'Sign out'}
        </Button>
    );
}
