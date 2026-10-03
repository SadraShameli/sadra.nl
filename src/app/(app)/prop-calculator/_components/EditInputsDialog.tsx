'use client';

import { SlidersHorizontal } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/Dialog';

import { EvalLadderScope } from './AppliedEvalLadderNotice';
import { CalculatorInputsForm } from './CalculatorInputsForm';

interface EditInputsDialogProperties {
    evalLadderScope?: EvalLadderScope;
}

export function EditInputsDialog({
    evalLadderScope = EvalLadderScope.Applied,
}: EditInputsDialogProperties) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    className="h-7 gap-1.5 px-2 text-xs"
                    size="sm"
                    variant="outline"
                >
                    <SlidersHorizontal className="size-3.5" />
                    Edit inputs
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Edit inputs</DialogTitle>
                    <DialogDescription>
                        Firm, plan and trading inputs shared by every tool.
                        Changes apply to this page as you type.
                    </DialogDescription>
                </DialogHeader>
                <CalculatorInputsForm evalLadderScope={evalLadderScope} />
            </DialogContent>
        </Dialog>
    );
}
