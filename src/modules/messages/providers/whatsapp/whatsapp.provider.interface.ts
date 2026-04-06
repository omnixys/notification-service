export interface SendWhatsappInput {
  to: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppProvider {
  send(input: SendWhatsappInput): Promise<void>;
  isReady(): boolean;
}
