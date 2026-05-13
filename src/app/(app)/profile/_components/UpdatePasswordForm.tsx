'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { setPassword, updatePassword } from '~/lib/auth-actions';
import {
    type SetPasswordInput,
    setPasswordInputSchema,
    type UpdatePasswordInput,
    updatePasswordInputSchema,
} from '~/lib/schemas/auth';

export function UpdatePasswordForm({
    hasEmail,
    hasPassword,
}: {
    hasEmail: boolean;
    hasPassword: boolean;
}) {
    const [pending, startTransition] = useTransition();

    const changeForm = useForm<UpdatePasswordInput>({
        defaultValues: { confirm: '', current: '', password: '' },
        mode: 'onTouched',
        resolver: zodResolver(updatePasswordInputSchema),
    });

    const setForm = useForm<SetPasswordInput>({
        defaultValues: { confirm: '', password: '' },
        mode: 'onTouched',
        resolver: zodResolver(setPasswordInputSchema),
    });

    const onChangeSubmit = (data: UpdatePasswordInput) => {
        startTransition(async () => {
            await updatePassword(data);
            changeForm.reset({ confirm: '', current: '', password: '' });
        });
    };

    const onSetSubmit = (data: SetPasswordInput) => {
        startTransition(async () => {
            await setPassword(data);
        });
    };

    if (!hasPassword && !hasEmail) {
        return (
            <p className="text-sm text-muted-foreground">
                Set an email address above before adding a password — passwords
                require an email to sign in with.
            </p>
        );
    }

    if (!hasPassword) {
        return (
            <Form {...setForm}>
                <form
                    className="flex flex-col gap-3"
                    onSubmit={setForm.handleSubmit(onSetSubmit)}
                >
                    <FormField
                        control={setForm.control}
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
                        control={setForm.control}
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
                        className="mt-2 self-start"
                        disabled={pending}
                        type="submit"
                    >
                        {pending ? 'Setting…' : 'Set password'}
                    </Button>
                </form>
            </Form>
        );
    }

    return (
        <Form {...changeForm}>
            <form
                className="flex flex-col gap-3"
                onSubmit={changeForm.handleSubmit(onChangeSubmit)}
            >
                <FormField
                    control={changeForm.control}
                    name="current"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Current password</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="current-password"
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
                    control={changeForm.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New password</FormLabel>
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
                    control={changeForm.control}
                    name="confirm"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm new password</FormLabel>
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
                    className="mt-2 self-start"
                    disabled={pending}
                    type="submit"
                >
                    {pending ? 'Changing…' : 'Change password'}
                </Button>
            </form>
        </Form>
    );
}
