import { WhatsAppSession, IWhatsAppSession } from '../models/WhatsAppSession';
import { ConversationState, SessionContext } from '../types/whatsapp';

export async function getOrCreateSession(phoneNumber: string): Promise<IWhatsAppSession> {
  let session = await WhatsAppSession.findOne({ phoneNumber });

  if (!session) {
    session = await WhatsAppSession.create({
      phoneNumber,
      state: ConversationState.IDLE,
      context: new Map(),
    });
  } else {
    session.lastActive = new Date();
    await session.save();
  }

  return session;
}

export async function updateState(
  phoneNumber: string,
  state: ConversationState,
  context?: SessionContext
): Promise<IWhatsAppSession | null> {
  const update: Record<string, unknown> = {
    state,
    lastActive: new Date(),
  };

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      update[`context.${key}`] = value;
    }
  }

  return WhatsAppSession.findOneAndUpdate(
    { phoneNumber },
    { $set: update },
    { new: true }
  );
}

export async function setState(
  phoneNumber: string,
  state: ConversationState,
  context?: SessionContext
): Promise<IWhatsAppSession | null> {
  const update: Record<string, unknown> = {
    state,
    lastActive: new Date(),
  };

  if (context) {
    update.context = context;
  } else {
    update.context = {};
  }

  return WhatsAppSession.findOneAndUpdate(
    { phoneNumber },
    { $set: update },
    { new: true }
  );
}

export async function setLanguage(
  phoneNumber: string,
  language: string
): Promise<IWhatsAppSession | null> {
  return WhatsAppSession.findOneAndUpdate(
    { phoneNumber },
    { $set: { language, lastActive: new Date() } },
    { new: true }
  );
}

export async function setCrop(
  phoneNumber: string,
  crop: string
): Promise<IWhatsAppSession | null> {
  return WhatsAppSession.findOneAndUpdate(
    { phoneNumber },
    { $set: { lastCropMentioned: crop, lastActive: new Date() } },
    { new: true }
  );
}

export async function setDiagnosisId(
  phoneNumber: string,
  diagnosisId: string
): Promise<IWhatsAppSession | null> {
  return WhatsAppSession.findOneAndUpdate(
    { phoneNumber },
    { $set: { lastDiagnosisId: diagnosisId, lastActive: new Date() } },
    { new: true }
  );
}

export async function clearSession(phoneNumber: string): Promise<void> {
  await WhatsAppSession.findOneAndUpdate(
    { phoneNumber },
    {
      $set: {
        state: ConversationState.IDLE,
        context: {},
        lastCropMentioned: null,
        lastDiagnosisId: null,
        lastActive: new Date(),
      },
    }
  );
}
