'use client';

import { useState } from 'react';

import { cn } from '~/lib/utils';

import { LoginForm } from '../login/LoginForm';
import { MagicLinkForm } from './MagicLinkForm';

type Method = 'magic' | 'password';

export function SignInMethodTabs() {
    const [method, setMethod] = useState<Method>('password');

    return (
        <div className="flex flex-col gap-3">
            <div className="flex rounded-md bg-muted p-0.5 text-sm">
                <button
                    className={cn(
                        'flex-1 rounded px-3 py-1.5 transition',
                        method === 'password'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setMethod('password')}
                    type="button"
                >
                    Password
                </button>
                <button
                    className={cn(
                        'flex-1 rounded px-3 py-1.5 transition',
                        method === 'magic'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
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
