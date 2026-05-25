import { z } from 'zod';
import zxcvbn from 'zxcvbn';

import { ROLE_VALUES } from '~/lib/auth/roles';

export const roleSchema = z.enum(ROLE_VALUES);

export const emailSchema = z.email().max(256).toLowerCase();

export const passwordSchema = z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(256)
    .refine((p) => /[a-z]/.test(p), {
        message: 'Must contain a lowercase letter',
    })
    .refine((p) => /[A-Z]/.test(p), {
        message: 'Must contain an uppercase letter',
    })
    .refine((p) => /\d/.test(p), { message: 'Must contain a digit' })
    .refine((p) => zxcvbn(p).score >= 2, {
        message: 'Password is too weak or too common',
    });

export const displayNameSchema = z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(256);

export const callbackUrlSchema = z
    .string()
    .max(512)
    .regex(/^\/(?!\/)/, 'Must be a same-origin path');
export const optionalCallbackUrlSchema = callbackUrlSchema.optional();

export const loginInputSchema = z.object({
    callbackUrl: optionalCallbackUrlSchema,
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(256),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const signupInputSchema = z
    .object({
        callbackUrl: optionalCallbackUrlSchema,
        confirm: z.string(),
        email: emailSchema,
        name: displayNameSchema,
        password: passwordSchema,
    })
    .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
    });

export type SignupInput = z.infer<typeof signupInputSchema>;

export const forgotPasswordInputSchema = z.object({
    email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

export const magicLinkInputSchema = z.object({
    callbackUrl: optionalCallbackUrlSchema,
    email: emailSchema,
});

export type MagicLinkInput = z.infer<typeof magicLinkInputSchema>;

export const resetPasswordInputSchema = z
    .object({
        confirm: z.string(),
        password: passwordSchema,
        token: z.string().min(1, 'Reset token is required'),
    })
    .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
    });

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const updateNameInputSchema = z
    .object({
        currentName: z.string(),
        name: displayNameSchema,
    })
    .refine((data) => data.name !== data.currentName.trim(), {
        message: 'No changes to save',
        path: ['name'],
    });

export type UpdateNameInput = z.infer<typeof updateNameInputSchema>;

export const updatePasswordInputSchema = z
    .object({
        confirm: z.string(),
        current: z.string().min(1, 'Current password is required').max(256),
        password: passwordSchema,
    })
    .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
    });

export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;

export const updateEmailInputSchema = z.object({
    email: emailSchema,
});
export type UpdateEmailInput = z.infer<typeof updateEmailInputSchema>;

const adminUserRoleSchema = z.enum(['admin', 'user']);

export const adminUserCreateInputSchema = z.object({
    email: emailSchema,
    name: displayNameSchema,
    password: passwordSchema,
    role: adminUserRoleSchema,
});
export type AdminUserCreateInput = z.infer<typeof adminUserCreateInputSchema>;
