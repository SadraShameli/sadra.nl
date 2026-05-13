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
import { Label } from '~/components/ui/Label';
import { updateName } from '~/lib/auth-actions';
import {
    updateNameInputSchema,
    type UpdateNameInput,
} from '~/lib/schemas/auth';

export function UpdateNameForm({
    currentName,
    email,
}: {
    currentName: string;
    email: string;
}) {
    const [pending, startTransition] = useTransition();
    const form = useForm<UpdateNameInput>({
        resolver: zodResolver(updateNameInputSchema),
        defaultValues: { name: currentName, currentName },
        mode: 'onTouched',
    });

    const onSubmit = (data: UpdateNameInput) => {
        startTransition(async () => {
            await updateName(data);
        });
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-3"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Display name</FormLabel>
                            <FormControl>
                                <Input
                                    type="text"
                                    placeholder="Your name"
                                    autoComplete="name"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                        value={email}
                        disabled
                        readOnly
                        className="opacity-50"
                    />
                </div>
                <Button
                    type="submit"
                    className="mt-2 self-start"
                    disabled={pending}
                >
                    {pending ? 'Saving…' : 'Save changes'}
                </Button>
            </form>
        </Form>
    );
}
