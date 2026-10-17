'use client';

import { type MouseEvent, type ReactNode } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip';

export function ConfirmDialog({
    children,
    confirmLabel,
    description,
    isPending = false,
    onCloseAutoFocus,
    onConfirm,
    onOpenChange,
    open,
    title,
    tooltip,
}: {
    readonly children?: ReactNode;
    readonly confirmLabel: ReactNode;
    readonly description: ReactNode;
    readonly isPending?: boolean;
    readonly onCloseAutoFocus?: (event: Event) => void;
    readonly onConfirm: (event: MouseEvent<HTMLButtonElement>) => void;
    readonly onOpenChange?: (isOpen: boolean) => void;
    readonly open?: boolean;
    readonly title: ReactNode;
    readonly tooltip?: string;
}) {
    const trigger =
        children === undefined ? null : (
            <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
        );
    return (
        <AlertDialog onOpenChange={onOpenChange} open={open}>
            {tooltip === undefined || trigger === null ? (
                trigger
            ) : (
                <Tooltip>
                    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                    <TooltipContent>{tooltip}</TooltipContent>
                </Tooltip>
            )}
            <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction disabled={isPending} onClick={onConfirm}>
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
