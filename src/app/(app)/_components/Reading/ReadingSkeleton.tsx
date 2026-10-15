import { Card } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

export default function ReadingSkeleton() {
    return (
        <div aria-busy="true" className={cn('app-reading', 'pt-spacing-inner')}>
            <Card className="container flex min-h-100 flex-col sm:min-h-[538.81px]">
                <Skeleton className="w-full flex-1 rounded-md" />
            </Card>
        </div>
    );
}
