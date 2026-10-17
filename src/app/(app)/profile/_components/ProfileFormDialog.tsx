'use client';

import { type ReactNode } from 'react';
import { type FieldValues, type UseFormReturn } from 'react-hook-form';

import { Button } from '~/components/ui/button';
import {
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
import { Form } from '~/components/ui/form';

export function ProfileFormDialog<
    TFieldValues extends FieldValues,
    TTransformedValues,
>({
    children,
    description,
    form,
    onCancel,
    onSubmit,
    pending,
    submitDisabled = false,
    submitLabel,
    title,
}: {
    children: ReactNode;
    description?: string;
    form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
    onCancel: () => void;
    onSubmit: (values: TTransformedValues) => unknown;
    pending: boolean;
    submitDisabled?: boolean;
    submitLabel: string;
    title: string;
}) {
    return (
        <DialogContent>
            <Form {...form}>
                <form
                    className="flex flex-col gap-5"
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        {description !== undefined && (
                            <DialogDescription>{description}</DialogDescription>
                        )}
                    </DialogHeader>
                    <div className="flex flex-col gap-4">{children}</div>
                    <DialogFooter>
                        <Button
                            onClick={onCancel}
                            type="button"
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={pending || submitDisabled}
                            type="submit"
                        >
                            {pending ? 'Saving…' : submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    );
}
