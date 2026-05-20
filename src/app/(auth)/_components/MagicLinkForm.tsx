'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';

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
import { signInWithMagicLink } from '~/lib/auth/actions';
import { type MagicLinkInput, magicLinkInputSchema } from '~/lib/schemas/auth';

export function MagicLinkForm() {
    const [pending, startTransition] = useTransition();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') ?? undefined;

    const form = useForm<MagicLinkInput>({
        defaultValues: { callbackUrl, email: '' },
        mode: 'onTouched',
        resolver: zodResolver(magicLinkInputSchema),
    });

    const onSubmit = (data: MagicLinkInput) => {
        startTransition(async () => {
            await signInWithMagicLink({ ...data, callbackUrl });
        });
    };

    return (
        <Form {...form}>
            <form
                className={`app-auth__magic-link-form flex flex-col gap-3`}
                onSubmit={form.handleSubmit(onSubmit)}
            >
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
                <Button
                    className="mt-5 w-full"
                    disabled={pending}
                    type="submit"
                >
                    {pending ? 'Sending link…' : 'Email me a sign-in link'}
                </Button>
            </form>
        </Form>
    );
}
