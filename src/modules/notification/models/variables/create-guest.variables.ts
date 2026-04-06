export interface CreateGuestVariables {
  firstName: string;
  lastName: string;
  eventName: string;
  seat?: string;
  actionUrl: string;
  expiresInMinutes: number;
  hostName?: string;
  supportEmail: string;
  supportPhone?: string;
  verificationChannel: string;
}
