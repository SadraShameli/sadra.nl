import { CapsulePage } from '~/app/(app)/_components/CapsulePage';

export const ensureStatic = 'prefetch';

export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
    return (
        <CapsulePage className="prose prose-sm max-w-capsule text-sm/relaxed prose-theme">
            {children}
        </CapsulePage>
    );
}
