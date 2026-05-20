'use client';

import { Printer } from 'lucide-react';

import { Button } from '~/components/ui/Button';

export function PrintButton() {
    return (
        <Button onClick={() => window.print()} size="sm" variant="outline">
            <Printer className="mr-1 size-3.5" /> Download PDF
        </Button>
    );
}
