import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { FormSelectField } from '~/components/FormFields';
import { ToolbarSelect } from '~/components/ui/toolbar-select';

const OPTIONS = [
    { label: 'All firms', value: 'all' },
    { label: 'Lucid Trading', value: 'lucid' },
];

function FirmForm() {
    const { control } = useForm<{ firm: string }>({
        defaultValues: { firm: 'lucid' },
    });
    return (
        <FormSelectField
            control={control}
            keyOf={(value) => value}
            label="Firm"
            name="firm"
            options={OPTIONS}
        />
    );
}

function triggerText(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;
    return (
        container.querySelector(':scope button[role="combobox"]')
            ?.textContent ?? ''
    );
}

describe('selects rendered on the server', () => {
    it('shows the toolbar selection before hydration', () => {
        const html = renderToString(
            <ToolbarSelect
                label="Firm"
                onValueChange={vi.fn()}
                options={OPTIONS}
                value="all"
            />,
        );
        expect(triggerText(html)).toBe('All firms');
    });

    it('shows the form field selection before hydration', () => {
        expect(triggerText(renderToString(<FirmForm />))).toBe('Lucid Trading');
    });
});
