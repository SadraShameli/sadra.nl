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
    setPasswordInputSchema,
    updatePasswordInputSchema,
    type SetPasswordInput,
    type UpdatePasswordInput,
} from '~/lib/schemas/auth';

export function UpdatePasswordForm({ hasPassword }: { hasPassword: boolean }) {
    const [pending, startTransition] = useTransition();

    const changeForm = useForm<UpdatePasswordInput>({
        resolver: zodResolver(updatePasswordInputSchema),
        defaultValues: { current: '', password: '', confirm: '' },
        mode: 'onTouched',
    });

    const setForm = useForm<SetPasswordInput>({
        resolver: zodResolver(setPasswordInputSchema),
        defaultValues: { password: '', confirm: '' },
        mode: 'onTouched',
    });

    const onChangeSubmit = (data: UpdatePasswordInput) => {
        startTransition(async () => {
            await updatePassword(data);
            changeForm.reset({ current: '', password: '', confirm: '' });
        });
    };

    const onSetSubmit = (data: SetPasswordInput) => {
        startTransition(async () => {
            await setPassword(data);
        });
    };

    if (!hasPassword) {
        return (
            <Form {...setForm}>
                <form
                    onSubmit={setForm.handleSubmit(onSetSubmit)}
                    className="flex flex-col gap-3"
                >
                    <FormField
                        control={setForm.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <Input
                                        type="password"
                                        placeholder="••••••••"
                                        autoComplete="new-password"
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
                                        type="password"
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button
                        type="submit"
                        className="mt-2 self-start"
                        disabled={pending}
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
                onSubmit={changeForm.handleSubmit(onChangeSubmit)}
                className="flex flex-col gap-3"
            >
                <FormField
                    control={changeForm.control}
                    name="current"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Current password</FormLabel>
                            <FormControl>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
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
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
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
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="mt-2 self-start"
                    disabled={pending}
                >
                    {pending ? 'Changing…' : 'Change password'}
                </Button>
            </form>
        </Form>
    );
}
