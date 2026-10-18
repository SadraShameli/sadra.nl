'use client';

import { STICKY_ACTION_BAR_PROPS } from '~/app/(app)/_components/ScrollToTop';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utilities';

const SAVE_LABEL = 'Save changes';
const SAVING_LABEL = 'Saving…';

export function ProfileFormFooter({
    isDirty,
    isPending,
    isSaveDisabled = false,
    isSticky = false,
    onCancel,
}: {
    readonly isDirty: boolean;
    readonly isPending: boolean;
    readonly isSaveDisabled?: boolean;
    readonly isSticky?: boolean;
    readonly onCancel: () => void;
}) {
    const isStuck = isSticky && isDirty;
    return (
        <div
            className={cn(
                'app-profile__form-footer',
                'flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4',
                isStuck &&
                    'sticky bottom-0 z-10 bg-card/95 pb-4 backdrop-blur-sm',
            )}
            {...(isStuck ? STICKY_ACTION_BAR_PROPS : {})}
        >
            {isDirty && (
                <p
                    className="mr-auto text-sm text-ink-muted max-md:sr-only"
                    role="status"
                >
                    Unsaved changes
                </p>
            )}
            {isDirty && (
                <Button
                    disabled={isPending}
                    onClick={onCancel}
                    type="button"
                    variant="ghost"
                >
                    Cancel
                </Button>
            )}
            <Button disabled={isPending || isSaveDisabled} type="submit">
                {isPending ? SAVING_LABEL : SAVE_LABEL}
            </Button>
        </div>
    );
}
