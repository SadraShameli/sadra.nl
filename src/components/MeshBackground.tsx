import { cn } from '~/lib/utilities';

export function MeshBackground() {
    return (
        <div
            aria-hidden
            className={cn(
                'app-shell__mesh',
                'pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-50',
            )}
        >
            <div className="size-full mesh-dots" />
        </div>
    );
}
