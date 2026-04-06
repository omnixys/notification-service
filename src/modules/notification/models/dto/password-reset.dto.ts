export interface PasswordResetRequestDTO {
  recipientUsername: string;
  firstName: string;
  lastName: string;
  resetUrl: string;
  requestedAt: string;
  ipAddress?: string;
}

export interface SecurityPasswordResetAlertDTO {
  username: string;
  email: string;
  requestedAt: string;
  ipAddress?: string;
  alert: string;
}
