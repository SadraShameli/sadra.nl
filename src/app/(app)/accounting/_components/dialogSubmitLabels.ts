export enum DialogMode {
    Create = 'create',
    Edit = 'edit',
}

export interface DialogSubmitLabels {
    readonly pendingLabel: string;
    readonly submitLabel: string;
}

const SUBMIT_LABELS: Readonly<Record<DialogMode, DialogSubmitLabels>> = {
    [DialogMode.Create]: { pendingLabel: 'Creating…', submitLabel: 'Create' },
    [DialogMode.Edit]: {
        pendingLabel: 'Saving…',
        submitLabel: 'Save changes',
    },
};

export function dialogModeOf(isEdit: boolean): DialogMode {
    return isEdit ? DialogMode.Edit : DialogMode.Create;
}

export function dialogSubmitLabels(mode: DialogMode): DialogSubmitLabels {
    return SUBMIT_LABELS[mode];
}
