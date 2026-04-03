import type { GlobalConfig } from 'payload';

export const Site: GlobalConfig = {
    slug: 'site',
    label: 'Site',
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
                    label: 'Meta title',
                    required: true,
                },
                {
                    name: 'metaDescription',
                    type: 'textarea',
                    label: 'Meta description',
                    required: true,
                },
            ],
        },
        {
            name: 'navBrand',
            type: 'text',
            label: 'Navbar brand',
            required: true,
        },
        {
            name: 'socialLinks',
            type: 'array',
            label: 'Social links',
            minRows: 1,
            fields: [
                {
                    name: 'platform',
                    type: 'select',
                    required: true,
                    options: [
                        { label: 'Youtube', value: 'youtube' },
                        { label: 'Github', value: 'github' },
                        { label: 'WhatsApp', value: 'whatsapp' },
                        { label: 'Instagram', value: 'instagram' },
                        { label: 'LinkedIn', value: 'linkedin' },
                    ],
                },
                {
                    name: 'url',
                    type: 'text',
                    required: true,
                },
            ],
        },
        {
            type: 'group',
            name: 'pageLinks',
            label: 'Page links',
            fields: [
                {
                    name: 'resumeUrl',
                    type: 'text',
                    label: 'Resume page URL',
                    required: true,
                    defaultValue: '/resume',
                },
            ],
        },
    ],
};
