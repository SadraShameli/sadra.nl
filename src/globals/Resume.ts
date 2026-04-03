import type { Field, GlobalConfig } from 'payload';

const resumeEntryFields: Field[] = [
    {
        name: 'title',
        type: 'text',
        required: true,
    },
    {
        name: 'role',
        type: 'text',
    },
    {
        name: 'date',
        type: 'text',
        required: true,
    },
    {
        name: 'url',
        type: 'text',
    },
    {
        type: 'group',
        name: 'location',
        fields: [
            {
                name: 'title',
                type: 'text',
            },
            {
                name: 'url',
                type: 'text',
            },
        ],
    },
    {
        name: 'summary',
        type: 'textarea',
    },
    {
        name: 'highlights',
        type: 'array',
        fields: [
            {
                name: 'text',
                type: 'text',
                required: true,
            },
        ],
    },
    {
        name: 'skills',
        type: 'array',
        fields: [
            {
                name: 'text',
                type: 'text',
                required: true,
            },
        ],
    },
    {
        name: 'image',
        type: 'upload',
        relationTo: 'media',
    },
];

export const Resume: GlobalConfig = {
    slug: 'resume',
    label: 'Resume page',
    access: {
        read: () => true,
    },
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'metaTitle',
                    type: 'text',
                    label: 'Page meta title',
                    required: true,
                },
                {
                    name: 'metaDescription',
                    type: 'textarea',
                    label: 'Page meta description',
                    required: true,
                },
            ],
        },
        {
            name: 'projectsSectionTitle',
            type: 'text',
            required: true,
        },
        {
            name: 'projects',
            type: 'array',
            label: 'Projects',
            minRows: 1,
            fields: resumeEntryFields,
        },
        {
            name: 'experienceSectionTitle',
            type: 'text',
            required: true,
        },
        {
            name: 'experience',
            type: 'array',
            label: 'Experience',
            minRows: 1,
            fields: resumeEntryFields,
        },
        {
            name: 'educationSectionTitle',
            type: 'text',
            required: true,
        },
        {
            name: 'education',
            type: 'array',
            label: 'Education',
            minRows: 1,
            fields: resumeEntryFields,
        },
    ],
};
