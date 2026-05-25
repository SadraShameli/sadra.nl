'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { authClient } from '~/lib/auth/client';
import { type SignupInput, signupInputSchema } from '~/lib/schemas/auth';
import { routes } from '~/lib/site/routes';

export function SignupForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [topError, setTopError] = useState<null | string>(null);
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') ?? routes.home;

    const form = useForm<SignupInput>({
        defaultValues: {
            callbackUrl,
            confirm: '',
            email: '',
            name: '',
            password: '',
        },
        mode: 'onTouched',
        resolver: zodResolver(signupInputSchema),
    });

    const onSubmit = (data: SignupInput) => {
        setTopError(null);
        startTransition(async () => {
            const result = await authClient.signUp.email({
                callbackURL: callbackUrl,
                email: data.email,
                name: data.name,
                password: data.password,
            });
            if (result.error) {
                setTopError(
                    result.error.message ?? 'Could not create account.',
                );
                return;
            }
            router.push(routes.auth.verifyRequest);
        });
    };

    return (
        <Form {...form}>
            <form
                className={`app-auth__signup-form flex flex-col gap-3`}
                method="post"
                onSubmit={form.handleSubmit(onSubmit)}
            >
                {topError && (
                    <Alert variant="destructive">
                        <AlertDescription>{topError}</AlertDescription>
                    </Alert>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="name"
                                    placeholder="Your name"
                                    type="text"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    type="email"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    type="password"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="confirm"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm password</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    type="password"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    className="mt-7 w-full"
                    disabled={pending}
                    type="submit"
                >
                    {pending ? 'Creating account…' : 'Create account'}
                </Button>
            </form>
        </Form>
    );
}
