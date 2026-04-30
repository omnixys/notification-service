export interface SendWhatsappInput {
  to: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SendWhatsappResult {
  id?: {
    _serialized?: string;
  };
}

export interface WhatsAppProvider {
  send(input: SendWhatsappInput): Promise<SendWhatsappResult>;
  isReady(): boolean;
}
