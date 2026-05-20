import { z } from 'zod';

export const contactInputSchema = z.object({
    email: z.email('Enter a valid email').max(256),
    honeypot: z.string().max(0).optional(),
    message: z
        .string()
        .trim()
        .min(10, 'Message must be at least 10 characters')
        .max(4000, 'Message is too long'),
    name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(100, 'Name is too long'),
});

export type ContactInput = z.infer<typeof contactInputSchema>;
