export interface PasswordResetVariables {
  username: string;
  actionUrl: string;
  expiresInMinutes: number;
  requestTime: string;
  ip: string;
  device: string;
  location: string;
  supportEmail?: string;
}
