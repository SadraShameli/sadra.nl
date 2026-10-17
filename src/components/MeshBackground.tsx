import { cn } from '~/lib/utilities';

const GLOW_CLASS =
    'absolute size-250 rounded-full bg-radial-[circle_400px_at_50%_400px] from-glow to-transparent opacity-75';

export function MeshBackground() {
    return (
        <div
            aria-hidden
            className={cn(
                'app-shell__mesh',
                'pointer-events-none fixed inset-0 -z-10 overflow-hidden',
            )}
        >
            <div className={cn(GLOW_CLASS, 'top-[60%] -left-24')} />
            <div className={cn(GLOW_CLASS, '-right-24 bottom-[30%]')} />
            <div className="size-full mesh-dots" />
        </div>
    );
}
