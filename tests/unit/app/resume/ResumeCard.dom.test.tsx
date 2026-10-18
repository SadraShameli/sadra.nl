import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ResumeCard from '~/app/(app)/resume/_components/ResumeCard';
import {
    coverLetters,
    defaultResumeVariantKey,
    resumeVariants,
} from '~/lib/site/resume';

function triggerTexts(html: string): string[] {
    const container = document.createElement('div');
    container.innerHTML = html;
    return [
        ...container.querySelectorAll(':scope button[role="combobox"]'),
    ].map((trigger) => trigger.textContent);
}

describe('the resume card rendered on the server', () => {
    it('shows the chosen target and cover letter before hydration', () => {
        const variantOptions = Object.values(resumeVariants).map((variant) => ({
            key: variant.key,
            label: variant.label,
        }));
        const html = renderToString(
            <ResumeCard
                coverOptions={coverLetters.map((letter) => ({
                    key: letter.key,
                    label: letter.label,
                }))}
                defaultVariantKey={defaultResumeVariantKey}
                resume={{ name: 'sadra', role: 'Full-stack developer' }}
                variantOptions={variantOptions}
            />,
        );
        const expected = [
            variantOptions.find(
                (option) => option.key === defaultResumeVariantKey,
            )?.label,
            ...(coverLetters.length > 0 ? ['None'] : []),
        ];
        expect(triggerTexts(html)).toEqual(expected);
    });
});
