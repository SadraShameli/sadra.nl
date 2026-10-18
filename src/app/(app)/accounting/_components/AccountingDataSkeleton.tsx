import { CardSkeleton } from '~/components/PageSkeleton';

const ACCOUNTING_SKELETON_ROWS = 6;

export function AccountingDataSkeleton() {
    return (
        <div aria-busy="true">
            <CardSkeleton rows={ACCOUNTING_SKELETON_ROWS} />
        </div>
    );
}
