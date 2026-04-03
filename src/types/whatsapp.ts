/**
 * WhatsApp Cloud API types for KisanSeva.
 * Adapted from Medigent health-backend patterns.
 */

export enum ConversationState {
  IDLE = 'IDLE',
  AWAITING_PHOTO = 'AWAITING_PHOTO',
  AWAITING_CROP = 'AWAITING_CROP',
  AWAITING_LANGUAGE = 'AWAITING_LANGUAGE',
  PROCESSING = 'PROCESSING',
}

export interface SessionContext {
  [key: string]: string | undefined;
}

// ── Incoming webhook payload types from Meta Cloud API ──

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: Array<{
      profile: { name: string };
      wa_id: string;
    }>;
    messages?: WhatsAppIncomingMessage[];
    statuses?: Array<{
      id: string;
      status: string;
      timestamp: string;
    }>;
  };
  field: string;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'image' | 'document' | 'audio' | 'location' | 'button';
  text?: {
    body: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  document?: {
    id: string;
    mime_type: string;
    sha256: string;
    filename?: string;
    caption?: string;
  };
  audio?: {
    id: string;
    mime_type: string;
    sha256: string;
    voice?: boolean;
  };
  button?: {
    payload: string;
    text: string;
  };
}

// ── Outgoing message types ──

export interface WhatsAppButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppTemplateComponent {
  type: string;
  parameters?: Array<Record<string, unknown>>;
}
