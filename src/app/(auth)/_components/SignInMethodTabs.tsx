'use client';

import { useState } from 'react';

import { cn } from '~/lib/utils';

import { LoginForm } from '../login/LoginForm';
import { MagicLinkForm } from './MagicLinkForm';

type Method = 'magic' | 'password';

export function SignInMethodTabs() {
    const [method, setMethod] = useState<Method>('password');

    return (
        <div className={cn('app-auth__sign-in-tabs', 'flex flex-col gap-3')}>
            <div className="flex rounded-md bg-muted p-0.5 text-sm">
                <button
                    className={cn(
                        'app-auth__tab-password',
                        'flex-1 rounded px-3 py-1.5 transition',
                        method === 'password'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                    data-state={method === 'password' ? 'active' : undefined}
                    onClick={() => setMethod('password')}
                    type="button"
                >
                    Password
                </button>
                <button
                    className={cn(
                        'app-auth__tab-magic',
                        'flex-1 rounded px-3 py-1.5 transition',
                        method === 'magic'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                    data-state={method === 'magic' ? 'active' : undefined}
                    onClick={() => setMethod('magic')}
                    type="button"
                >
                    Email link
                </button>
            </div>
            {method === 'password' ? <LoginForm /> : <MagicLinkForm />}
        </div>
    );
}
