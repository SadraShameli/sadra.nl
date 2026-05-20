'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { type ContactInput, contactInputSchema } from '~/lib/schemas/contact';
import { api } from '~/trpc/react';

export function ContactForm() {
    const form = useForm<ContactInput>({
        defaultValues: { email: '', honeypot: '', message: '', name: '' },
        resolver: zodResolver(contactInputSchema),
    });
    const { errors } = form.formState;

    const send = api.contact.send.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: () => {
            toast.success("Thanks — I'll reply soon.");
            form.reset();
        },
    });

    const onSubmit = form.handleSubmit((values) => send.mutate(values));

    return (
        <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
            <Field
                error={errors.name?.message}
                htmlFor="contact-name"
                label="Name"
            >
                <Input
                    aria-invalid={!!errors.name}
                    id="contact-name"
                    {...form.register('name')}
                />
            </Field>
            <Field
                error={errors.email?.message}
                htmlFor="contact-email"
                label="Email"
            >
                <Input
                    aria-invalid={!!errors.email}
                    id="contact-email"
                    type="email"
                    {...form.register('email')}
                />
            </Field>
            <Field
                error={errors.message?.message}
                htmlFor="contact-message"
                label="Message"
            >
                <textarea
                    aria-invalid={!!errors.message}
                    className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"
                    id="contact-message"
                    {...form.register('message')}
                />
            </Field>
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-2499.75 h-0 w-0 overflow-hidden"
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

function Field({
    children,
    error,
    htmlFor,
    label,
}: {
    children: React.ReactNode;
    error?: string;
    htmlFor: string;
    label: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
