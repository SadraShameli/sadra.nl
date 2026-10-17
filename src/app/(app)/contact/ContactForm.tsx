'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { type ContactInput, contactInputSchema } from '~/lib/schemas/contact';
import { api } from '~/trpc/react';

export function ContactForm() {
    const form = useForm<ContactInput>({
        defaultValues: { email: '', honeypot: '', message: '', name: '' },
        resolver: zodResolver(contactInputSchema),
    });
    const formId = useId();

    const send = api.contact.send.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
            toast.success("Thanks, I'll reply soon.");
            form.reset();
        },
    });

    const onSubmit = form.handleSubmit((values) => send.mutate(values));

    return (
        <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
                <Controller
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-name`}>
                                Name
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="name"
                                id={`${formId}-name`}
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="email"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-email`}>
                                Email
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="email"
                                id={`${formId}-email`}
                                type="email"
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            </div>
            <Controller
                control={form.control}
                name="message"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-message`}>
                            Message
                        </FieldLabel>
                        <Textarea
                            aria-invalid={fieldState.invalid}
                            className="min-h-56"
                            id={`${formId}-message`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-2499.75 size-0 overflow-hidden"
            >
                <label>
                    Leave this empty
                    <input
                        autoComplete="off"
                        tabIndex={-1}
                        type="text"
                        {...form.register('honeypot')}
                    />
                </label>
            </div>
            <div className="mt-2 flex justify-end">
                <Button disabled={send.isPending} type="submit">
                    {send.isPending ? 'Sending…' : 'Send'}
                </Button>
            </div>
        </form>
    );
}
