import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FilePicker } from '~/components/ui/file-picker';

const PICKER_ID = 'csv-file';

describe('the file picker drop zone', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        onFile: (file: File) => void,
        fileName: null | string = null,
    ) {
        act(() => {
            root.render(
                <FilePicker
                    accept=".csv,text/plain"
                    buttonLabel="Choose CSV"
                    fileName={fileName}
                    id={PICKER_ID}
                    onFile={onFile}
                />,
            );
        });
    }

    function zone(): HTMLButtonElement {
        const element = container.querySelector(`:scope #${PICKER_ID}`);
        if (!(element instanceof HTMLButtonElement)) {
            throw new TypeError('No drop zone');
        }
        return element;
    }

    function drop(file: File) {
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', {
            value: { files: [file] },
        });
        act(() => {
            zone().dispatchEvent(event);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('invites a choice or a drop before a file is picked', () => {
        render(vi.fn());
        expect(zone().textContent).toBe('Choose CSVor drop it here');
    });

    it('hands over a dropped file whose extension or type is accepted', () => {
        const onFile = vi.fn();
        render(onFile);
        const csv = new File(['a,b'], 'Accounts.CSV');
        const notes = new File(['a'], 'notes', { type: 'text/plain' });
        drop(csv);
        drop(notes);
        expect(onFile.mock.calls).toEqual([[csv], [notes]]);
        expect(zone().dataset.invalid).toBe('false');
    });

    it('turns down a dropped file of another type and says so', () => {
        const onFile = vi.fn();
        render(onFile);
        drop(new File(['x'], 'photo.png', { type: 'image/png' }));
        expect(onFile).not.toHaveBeenCalled();
        expect(zone().dataset.invalid).toBe('true');
        expect(zone().textContent).toContain(
            'That file type is not accepted here',
        );
    });

    it('names the picked file and offers to replace it', () => {
        render(vi.fn(), 'accounts.csv');
        expect(zone().textContent).toBe(
            'accounts.csvChoose or drop another file to replace it',
        );
    });
});
