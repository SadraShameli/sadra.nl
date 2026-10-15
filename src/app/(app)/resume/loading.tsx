import { Skeleton } from '~/components/ui/Skeleton';

export default function ResumeLoading() {
    return (
        <main
            aria-busy="true"
            aria-label="Loading"
            className="container grid w-full pt-spacing pb-24"
        >
            <div className="mx-auto w-full max-w-4xl">
                <div aria-hidden className="h-[5.5rem] sm:h-24" />
                <div className="mt-12 flex flex-col gap-4">
                    <Skeleton className="h-56 w-full rounded-xl" />
                </div>
            </div>
        </main>
    );
}
