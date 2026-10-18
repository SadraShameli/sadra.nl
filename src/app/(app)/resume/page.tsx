import { type Instant, type Metadata } from 'next';

import { CapsulePage } from '~/components/CapsulePage';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { siteContent } from '~/lib/site/content';
import {
    coverLetters,
    defaultResumeVariantKey,
    resumeVariants,
} from '~/lib/site/resume';

import ResumeCard from './_components/ResumeCard';

const RESUME_PAGE_TITLE = 'Resume';

export const instant: Instant = false;

export const metadata: Metadata = {
    title: RESUME_PAGE_TITLE,
};

const resumes = [
    {
        name: 'sadra',
        role: 'Full-stack developer & trader',
    },
];

export default async function ResumePage() {
    await requireRootUser();

    const variantOptions = Object.values(resumeVariants).map((variant) => ({
        key: variant.key,
        label: variant.label,
    }));
    const coverOptions = coverLetters.map((letter) => ({
        key: letter.key,
        label: letter.label,
    }));

    return (
        <PageTransition>
            <CapsulePage>
                <PageHeader
                    eyebrow={siteContent.manifest.name}
                    lead="Formatted as a PDF, view inline or download."
                    title={RESUME_PAGE_TITLE}
                />

                <div className="flex flex-col gap-4">
                    {resumes.map((resume) => (
                        <ResumeCard
                            coverOptions={coverOptions}
                            defaultVariantKey={defaultResumeVariantKey}
                            key={resume.name}
                            resume={resume}
                            variantOptions={variantOptions}
                        />
                    ))}
                </div>
            </CapsulePage>
        </PageTransition>
    );
}
