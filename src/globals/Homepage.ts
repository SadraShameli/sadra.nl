import type { GlobalConfig } from 'payload';

export const Homepage: GlobalConfig = {
    slug: 'homepage',
    label: 'Homepage',
    access: {
        read: () => true,
    },
    fields: [
        {
            type: 'tabs',
            tabs: [
                {
                    label: 'Hero',
                    fields: [
                        {
                            name: 'heroImage',
                            type: 'upload',
                            relationTo: 'media',
                            label: 'Profile image',
                            required: true,
                        },
                        {
                            name: 'heroTitle',
                            type: 'text',
                            required: true,
                        },
                        {
                            name: 'heroSubtitle',
                            type: 'textarea',
                            required: true,
                        },
                        {
                            name: 'ctaLabel',
                            type: 'text',
                            label: 'Hero CTA label',
                            required: true,
                        },
                    ],
                },
                {
                    label: 'Sensor Hub',
                    fields: [
                        {
                            name: 'sensorHubTitle',
                            type: 'text',
                            required: true,
                        },
                        {
                            name: 'sensorHubDescription',
                            type: 'textarea',
                            required: true,
                        },
                        {
                            name: 'sensorHubVideo',
                            type: 'upload',
                            relationTo: 'media',
                            label: 'Section video (MP4)',
                            required: true,
                        },
                    ],
                },
                {
                    label: 'Recordings',
                    fields: [
                        {
                            name: 'recordingsTitle',
                            type: 'text',
                            required: true,
                        },
                        {
                            name: 'recordingsDescription',
                            type: 'textarea',
                            required: true,
                        },
                        {
                            name: 'recordingDecorVideo',
                            type: 'upload',
                            relationTo: 'media',
                            label: 'Decor video in player card (MP4)',
                            required: true,
                        },
                    ],
                },
                {
                    label: 'Readings',
                    fields: [
                        {
                            name: 'readingsTitle',
                            type: 'text',
                            required: true,
                        },
                        {
                            name: 'readingsDescription',
                            type: 'textarea',
                            required: true,
                        },
                    ],
                },
                {
                    label: 'About',
                    fields: [
                        {
                            name: 'aboutSectionTitle',
                            type: 'text',
                            required: true,
                        },
                        {
                            name: 'aboutSpotifyEmbedUrl',
                            type: 'text',
                            label: 'Spotify embed URL',
                            required: true,
                        },
                        {
                            name: 'gallery',
                            type: 'array',
                            label: 'Gallery images',
                            minRows: 1,
                            maxRows: 8,
                            fields: [
                                {
                                    name: 'image',
                                    type: 'upload',
                                    relationTo: 'media',
                                    required: true,
                                },
                                {
                                    name: 'alt',
                                    type: 'text',
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
};
