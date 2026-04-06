// src/messaging/handlers/user-created.schema.ts
// import { z } from 'zod';

// export const UserCreatedSchema = z.object({
//     username: z.string().min(3),
//     password: z.string().min(1),      // Achtung: sensitive
//     userId: z.string().uuid(),
//     firstName: z.string().min(1),
//     phone: z.string().optional(),  // für WhatsApp
// });
// export type UserCreatedEvent = z.infer<typeof UserCreatedSchema>;

export interface UserCredentialDTO {
  username: string;
  password: string;
  userId: string;
  firstName: string;
  phone?: string;
  email?: string;
}
