import { ConversationState } from '../types/whatsapp';
import type { WhatsAppIncomingMessage, WhatsAppButton } from '../types/whatsapp';
import type { DiagnosisResult } from '../types/diagnosis';
import * as sessionService from './whatsappSessionService';
import * as api from './whatsappApiService';
import * as mediaService from './whatsappMediaService';
import { analyzePlantImage } from './diseaseDetectionService';
import logger from '../utils/logger';

// ── Known crop names (Hindi + English) for quick detection ──
const CROP_KEYWORDS: Record<string, string> = {
  // Hindi
  'धान': 'rice',
  'चावल': 'rice',
  'गेहूं': 'wheat',
  'गेहूँ': 'wheat',
  'मक्का': 'maize',
  'टमाटर': 'tomato',
  'आलू': 'potato',
  'प्याज': 'onion',
  'बैंगन': 'brinjal',
  'मिर्च': 'chilli',
  'कपास': 'cotton',
  'सोयाबीन': 'soybean',
  'गन्ना': 'sugarcane',
  'सरसों': 'mustard',
  'चना': 'gram',
  'मूंगफली': 'groundnut',
  'अरहर': 'pigeon pea',
  'मूंग': 'mung bean',
  'भिंडी': 'okra',
  'केला': 'banana',
  'अंगूर': 'grape',
  'अमरूद': 'guava',
  'आम': 'mango',
  // English
  'rice': 'rice',
  'wheat': 'wheat',
  'maize': 'maize',
  'corn': 'maize',
  'tomato': 'tomato',
  'potato': 'potato',
  'onion': 'onion',
  'brinjal': 'brinjal',
  'eggplant': 'brinjal',
  'chilli': 'chilli',
  'pepper': 'chilli',
  'cotton': 'cotton',
  'soybean': 'soybean',
  'sugarcane': 'sugarcane',
  'mustard': 'mustard',
  'gram': 'gram',
  'groundnut': 'groundnut',
  'peanut': 'groundnut',
  'okra': 'okra',
  'banana': 'banana',
  'grape': 'grape',
  'guava': 'guava',
  'mango': 'mango',
};

const LANGUAGE_MAP: Record<string, { code: string; name: string; nameNative: string }> = {
  hindi: { code: 'hi-IN', name: 'Hindi', nameNative: 'हिन्दी' },
  english: { code: 'en-IN', name: 'English', nameNative: 'English' },
  bengali: { code: 'bn-IN', name: 'Bengali', nameNative: 'বাংলা' },
  tamil: { code: 'ta-IN', name: 'Tamil', nameNative: 'தமிழ்' },
  telugu: { code: 'te-IN', name: 'Telugu', nameNative: 'తెలుగు' },
  marathi: { code: 'mr-IN', name: 'Marathi', nameNative: 'मराठी' },
  gujarati: { code: 'gu-IN', name: 'Gujarati', nameNative: 'ગુજરાતી' },
  kannada: { code: 'kn-IN', name: 'Kannada', nameNative: 'ಕನ್ನಡ' },
  punjabi: { code: 'pa-IN', name: 'Punjabi', nameNative: 'ਪੰਜਾਬੀ' },
  odia: { code: 'or-IN', name: 'Odia', nameNative: 'ଓଡ଼ିଆ' },
};

const SEVERITY_EMOJI: Record<string, string> = {
  mild: '🟢',
  moderate: '🟡',
  severe: '🟠',
  critical: '🔴',
};

// ── Multilingual messages ──
type MsgKey = 'sendPhotoOrText' | 'langChanged' | 'welcome' | 'help' | 'photoReceived' |
  'photoError' | 'errorGeneric' | 'settingsMenu' | 'cropAsk' | 'sendNewPhoto' |
  'shopInfo' | 'expertInfo' | 'comingSoon' | 'firstContact';

interface LangData { code: string; name: string; nameNative: string }

const MESSAGES: Record<string, Record<MsgKey, string | ((d: LangData) => string)>> = {
  'en-IN': {
    sendPhotoOrText: 'Please send a text message or a photo of your plant. 📸',
    langChanged: (d: LangData) => `✅ Language changed to: ${d.nameNative} (${d.name})\n\nNow send a photo of your plant! 📸`,
    firstContact:
      '🌾 *Welcome to KisanSeva!*\n\nPlease choose your language to get started:\n\nकृपया अपनी भाषा चुनें:',
    welcome:
      'Hello! 🌾 Welcome to *KisanSeva*\n\n' +
      'Send a *photo of your plant* to identify diseases. 📸\n\n' +
      '🔍 We will tell you:\n  • Disease name\n  • Severity level\n  • Treatment options\n  • Which pesticide to use\n\n' +
      '━━━━━━━━━━━━━━━\n' +
      '📋 *Menu:* Type "menu"\n🌐 *Language:* Type "language"\n❓ *Help:* Type "help"\n' +
      '━━━━━━━━━━━━━━━',
    help:
      '📖 *KisanSeva Help*\n\n' +
      '1️⃣ *Send a photo* — We identify the disease\n' +
      '2️⃣ *Type crop name* — e.g., "rice", "tomato"\n' +
      '3️⃣ *"menu"* — Open settings menu\n' +
      '4️⃣ *"language"* — Change language\n' +
      '5️⃣ *"help"* — Show this help\n\n' +
      '━━━━━━━━━━━━━━━\n' +
      '💡 *Photo tips:*\n  • Close-up of affected leaf/part\n  • Good lighting\n  • One leaf/fruit per photo\n\n' +
      '📞 *KisanCall Center:* 1800-180-1551\n━━━━━━━━━━━━━━━',
    settingsMenu: '⚙️ *Settings Menu*',
    photoReceived: '📸 Photo received! 🔍 Analyzing...\nPlease wait 10-15 seconds.',
    photoError: '❌ Could not analyze the photo.\nPlease send a clear close-up of the affected leaf/part.',
    errorGeneric: '❌ Something went wrong. Please try again.',
    cropAsk: '🌱 You mentioned *{{crop}}*!\n\nWhat would you like to know?',
    sendNewPhoto: '📸 Send a new photo of your plant.',
    shopInfo:
      '🏪 *Nearest Agricultural Shop*\n\nSearch "agricultural shop near me" on Google Maps.\n\n💡 Show the pesticide names from the diagnosis to the shopkeeper.',
    expertInfo:
      '👨‍🌾 *Contact Agricultural Expert*\n\n📞 KisanCall Center: 1800-180-1551 (Toll-free)\n🌐 kisansuvidha.gov.in\n\nThis service will soon be available in the KisanSeva app!',
    comingSoon: '📋 This feature is coming soon!\n\nFor now, send a photo of your plant and we will diagnose it! 📸',
  },
  'hi-IN': {
    sendPhotoOrText: 'कृपया टेक्स्ट संदेश या पौधे की फोटो भेजें। 📸',
    langChanged: (d: LangData) => `✅ भाषा बदल दी गई: ${d.nameNative} (${d.name})\n\nअब अपने पौधे की फोटो भेजें! 📸`,
    firstContact:
      '🌾 *KisanSeva में आपका स्वागत है!*\n\nकृपया अपनी भाषा चुनें:\n\nPlease choose your language:',
    welcome:
      'नमस्ते! 🌾 *KisanSeva* में आपका स्वागत है।\n\n' +
      'अपने पौधे की बीमारी जानने के लिए *फोटो भेजें*। 📸\n\n' +
      '🔍 हम बताएंगे:\n  • बीमारी का नाम\n  • कितनी गंभीर है\n  • इलाज कैसे करें\n  • कौन सी दवाई लगाएँ\n\n' +
      '━━━━━━━━━━━━━━━\n' +
      '📋 *मेनू:* "मेनू" लिखें\n🌐 *भाषा:* "भाषा" लिखें\n❓ *मदद:* "मदद" लिखें\n' +
      '━━━━━━━━━━━━━━━',
    help:
      '📖 *KisanSeva मदद मेनू*\n\n' +
      '1️⃣ *फोटो भेजें* — पौधे की फोटो भेजें, हम बीमारी बताएंगे\n' +
      '2️⃣ *फसल का नाम* — "धान", "टमाटर", "गेहूं" आदि लिखें\n' +
      '3️⃣ *"मेनू"* — सेटिंग्स खोलें\n' +
      '4️⃣ *"भाषा"* — अपनी भाषा बदलें\n' +
      '5️⃣ *"मदद"* — यह मेनू दोबारा देखें\n\n' +
      '━━━━━━━━━━━━━━━\n' +
      '💡 *फोटो लेने के सुझाव:*\n  • प्रभावित पत्ती/हिस्से की करीबी फोटो\n  • अच्छी रोशनी में फोटो लें\n  • एक बार में एक पत्ती/फल की फोटो\n\n' +
      '📞 *KisanCall Center:* 1800-180-1551\n━━━━━━━━━━━━━━━',
    settingsMenu: '⚙️ *सेटिंग्स मेनू*',
    photoReceived: '📸 फोटो मिल गई! 🔍 जाँच हो रही है...\nकृपया 10-15 सेकंड रुकें।',
    photoError: '❌ फोटो की जाँच में समस्या हुई।\nकृपया एक साफ़ फोटो दोबारा भेजें।\n\n💡 सुझाव: पत्ती या प्रभावित हिस्से की करीबी फोटो भेजें।',
    errorGeneric: '❌ कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।',
    cropAsk: '🌱 अच्छा! *{{crop}}* के बारे में जानकारी चाहिए?',
    sendNewPhoto: '📸 अपने पौधे की नई फोटो भेजें।',
    shopInfo:
      '🏪 *नज़दीकी कृषि दवाई दुकान*\n\nGoogle Maps पर "agricultural shop near me" खोजें।\n\n💡 ऊपर बताई गई दवाइयों का नाम दुकानदार को दिखाएँ।',
    expertInfo:
      '👨‍🌾 *कृषि विशेषज्ञ से संपर्क*\n\n📞 KisanCall Center: 1800-180-1551 (टोल-फ्री)\n🌐 kisansuvidha.gov.in\n\nयह सेवा जल्द ही KisanSeva ऐप में उपलब्ध होगी!',
    comingSoon: '📋 यह सुविधा जल्द आ रही है।\n\nअभी के लिए, अपने पौधे की फोटो भेजें! 📸',
  },
};

/** Get a localized message. Falls back to Hindi, then English. */
function getMsg(lang: string, key: MsgKey, data?: LangData): string {
  const msgs = MESSAGES[lang] || MESSAGES['hi-IN'] || MESSAGES['en-IN'];
  const val = msgs[key];
  if (typeof val === 'function') return data ? val(data) : val({ code: lang, name: lang, nameNative: lang });
  return (val as string) || '';
}

// ── Main entry point ──

export async function handleIncomingMessage(message: WhatsAppIncomingMessage): Promise<void> {
  const phone = message.from;
  const input = getMessageText(message);

  // Mark message as read (fire-and-forget)
  api.markAsRead(message.id).catch((err: Error) => {
    logger.warn('Failed to mark message as read', { messageId: message.id, error: err.message });
  });

  const session = await sessionService.getOrCreateSession(phone);

  try {
    // ── First-time user: prompt language selection ──
    if (session.state === ConversationState.IDLE && session.language === 'hi-IN' && !session.context?.get('languageSet')) {
      await sendLanguageSelectionOnFirstContact(phone);
      await sessionService.setState(phone, ConversationState.AWAITING_LANGUAGE);
      return;
    }

    // ── Language selection from interactive list (priority) ──
    if (session.state === ConversationState.AWAITING_LANGUAGE) {
      const inputLower = (input || '').toLowerCase().trim();
      const lang = LANGUAGE_MAP[inputLower];
      if (lang) {
        await sessionService.setLanguage(phone, lang.code);
        await sessionService.setState(phone, ConversationState.IDLE);
        await sessionService.setContext(phone, 'languageSet', 'true');
        await api.sendTextMessage(phone, getMsg(lang.code, 'langChanged', lang));
        await sendWelcomeMessage(phone, lang.code);
        return;
      }
      // If they sent something else during language selection, still show the list
      await sendLanguageSelectionOnFirstContact(phone);
      return;
    }

    // ── Handle image messages (photo of plant) ──
    if (message.type === 'image' && message.image) {
      await handlePhotoMessage(phone, message.image.id, message.image.caption, session.language);
      return;
    }

    // No text content to process
    if (!input) {
      await api.sendTextMessage(phone, getMsg(session.language, 'sendPhotoOrText'));
      return;
    }

    const inputLower = input.toLowerCase().trim();

    // ── Language change request ──
    if (inputLower === 'भाषा' || inputLower === 'language' || inputLower === 'lang') {
      await handleLanguageRequest(phone);
      return;
    }

    // ── Help command ──
    if (inputLower === 'मदद' || inputLower === 'help' || inputLower === 'sahayata') {
      await sendHelpMenu(phone, session.language);
      return;
    }

    // ── Menu / Settings command ──
    if (inputLower === 'menu' || inputLower === 'मेनू' || inputLower === 'settings' || inputLower === 'सेटिंग') {
      await sendSettingsMenu(phone, session.language);
      return;
    }

    // ── Interactive button replies ──
    if (message.type === 'interactive') {
      await handleInteractiveReply(phone, input, session.language);
      return;
    }

    // ── Direct language name typed ──
    if (LANGUAGE_MAP[inputLower]) {
      const lang = LANGUAGE_MAP[inputLower];
      await sessionService.setLanguage(phone, lang.code);
      await sessionService.setContext(phone, 'languageSet', 'true');
      await api.sendTextMessage(phone, getMsg(lang.code, 'langChanged', lang));
      return;
    }

    // ── Check if the input is a crop name ──
    const detectedCrop = detectCropName(inputLower);
    if (detectedCrop) {
      await handleCropMention(phone, detectedCrop, session.language);
      return;
    }

    // ── Default: send welcome message ──
    await sendWelcomeMessage(phone, session.language);
  } catch (error) {
    logger.error('Error processing WhatsApp message', {
      phone: redactPhone(phone),
      error: (error as Error).message,
    });
    await api.sendTextMessage(phone, getMsg(session.language, 'errorGeneric')).catch((sendErr: Error) => {
      logger.error('Failed to send error message to user', { error: sendErr.message });
    });
  }
}

// ── Message type extraction ──

function getMessageText(message: WhatsAppIncomingMessage): string {
  if (message.type === 'text' && message.text) {
    return message.text.body.trim();
  }
  if (message.type === 'interactive' && message.interactive) {
    if (message.interactive.button_reply) {
      return message.interactive.button_reply.id;
    }
    if (message.interactive.list_reply) {
      return message.interactive.list_reply.id;
    }
  }
  if (message.type === 'button' && message.button?.payload) {
    return message.button.payload;
  }
  return '';
}

// ── Photo handling (core feature) ──

async function handlePhotoMessage(
  phone: string,
  mediaId: string,
  caption: string | undefined,
  language: string
): Promise<void> {
  // Update state to processing
  await sessionService.setState(phone, ConversationState.PROCESSING);

  await api.sendTextMessage(phone, getMsg(language, 'photoReceived'));

  try {
    // Download image from WhatsApp
    const { buffer } = await mediaService.downloadMedia(mediaId);

    // Call hybrid disease detection (CNN → Claude Vision fallback)
    const diagnosis = await analyzePlantImage(buffer, caption);

    // Format and send diagnosis
    const diagnosisMessage = formatDiagnosisForWhatsApp(diagnosis, language);
    await api.sendTextMessage(phone, diagnosisMessage);

    // Send action buttons
    const actionButtons: WhatsAppButton[] = [
      { type: 'reply', reply: { id: 'action_retry', title: '🔄 दोबारा जाँचें' } },
      { type: 'reply', reply: { id: 'action_shop', title: '💊 दवाई की दुकान' } },
      { type: 'reply', reply: { id: 'action_expert', title: '📞 विशेषज्ञ से बात' } },
    ];

    await api.sendInteractiveButtons(
      phone,
      'और क्या मदद चाहिए? What else can I help with?',
      actionButtons
    );

    // Update session
    await sessionService.setState(phone, ConversationState.IDLE);

    logger.info('Diagnosis sent to farmer', {
      phone: redactPhone(phone),
      disease: diagnosis.primaryDiagnosis.name,
      confidence: diagnosis.primaryDiagnosis.confidence,
    });
  } catch (error) {
    logger.error('Disease detection failed', {
      phone: redactPhone(phone),
      error: (error as Error).message,
    });
    await api.sendTextMessage(phone, getMsg(language, 'photoError'));
    await sessionService.setState(phone, ConversationState.IDLE);
  }
}

// ── Interactive reply handler ──

async function handleInteractiveReply(
  phone: string,
  buttonId: string,
  language: string
): Promise<void> {
  switch (buttonId) {
    case 'action_retry':
      await api.sendTextMessage(phone, getMsg(language, 'sendNewPhoto'));
      await sessionService.setState(phone, ConversationState.AWAITING_PHOTO);
      break;

    case 'action_shop':
      await api.sendTextMessage(phone, getMsg(language, 'shopInfo'));
      break;

    case 'action_expert':
      await api.sendTextMessage(phone, getMsg(language, 'expertInfo'));
      break;

    case 'crop_diseases':
      await api.sendTextMessage(phone, getMsg(language, 'comingSoon'));
      break;

    case 'crop_photo_check':
      await api.sendTextMessage(phone, getMsg(language, 'sendNewPhoto'));
      await sessionService.setState(phone, ConversationState.AWAITING_PHOTO);
      break;

    case 'menu_language':
      await handleLanguageRequest(phone);
      break;

    case 'menu_help':
      await sendHelpMenu(phone, language);
      break;

    case 'menu_photo':
      await api.sendTextMessage(phone, getMsg(language, 'sendNewPhoto'));
      await sessionService.setState(phone, ConversationState.AWAITING_PHOTO);
      break;

    default:
      // Check if it's a language selection
      if (LANGUAGE_MAP[buttonId]) {
        const lang = LANGUAGE_MAP[buttonId];
        await sessionService.setLanguage(phone, lang.code);
        await sessionService.setState(phone, ConversationState.IDLE);
        await sessionService.setContext(phone, 'languageSet', 'true');
        await api.sendTextMessage(phone, getMsg(lang.code, 'langChanged', lang));
      } else {
        await sendWelcomeMessage(phone, language);
      }
      break;
  }
}

// ── Crop name detection ──

function detectCropName(input: string): string | null {
  // Direct match
  if (CROP_KEYWORDS[input]) {
    return CROP_KEYWORDS[input];
  }

  // Check if any crop keyword is contained in the input
  for (const [keyword, crop] of Object.entries(CROP_KEYWORDS)) {
    if (input.includes(keyword)) {
      return crop;
    }
  }

  return null;
}

async function handleCropMention(phone: string, crop: string, language: string): Promise<void> {
  await sessionService.setCrop(phone, crop);
  const cropDisplay = crop.charAt(0).toUpperCase() + crop.slice(1);

  const buttons: WhatsAppButton[] = [
    { type: 'reply', reply: { id: 'crop_diseases', title: language === 'en-IN' ? '📋 Common Diseases' : '📋 आम बीमारियाँ' } },
    { type: 'reply', reply: { id: 'crop_photo_check', title: language === 'en-IN' ? '📸 Diagnose Photo' : '📸 फोटो से जाँच' } },
  ];

  await api.sendInteractiveButtons(
    phone,
    getMsg(language, 'cropAsk').replace('{{crop}}', cropDisplay),
    buttons
  );
}

// ── Language selection ──

async function handleLanguageRequest(phone: string): Promise<void> {
  await sessionService.setState(phone, ConversationState.AWAITING_LANGUAGE);

  const sections = [
    {
      title: 'भाषा चुनें / Choose Language',
      rows: Object.entries(LANGUAGE_MAP).map(([key, lang]) => ({
        id: key,
        title: lang.nameNative,
        description: lang.name,
      })),
    },
  ];

  await api.sendInteractiveList(
    phone,
    '🌐 अपनी भाषा चुनें\nChoose your preferred language:',
    'भाषा चुनें',
    sections
  );
}

// ── Welcome message ──

async function sendWelcomeMessage(phone: string, language: string = 'hi-IN'): Promise<void> {
  await api.sendTextMessage(phone, getMsg(language, 'welcome'));
}

// ── Help menu ──

async function sendHelpMenu(phone: string, language: string = 'hi-IN'): Promise<void> {
  await api.sendTextMessage(phone, getMsg(language, 'help'));
}

// ── First contact: language selection with greeting ──

async function sendLanguageSelectionOnFirstContact(phone: string): Promise<void> {
  const sections = [
    {
      title: 'भाषा चुनें / Choose Language',
      rows: Object.entries(LANGUAGE_MAP).map(([key, lang]) => ({
        id: key,
        title: lang.nameNative,
        description: lang.name,
      })),
    },
  ];

  await api.sendInteractiveList(
    phone,
    '🌾 *Welcome to KisanSeva!*\n*KisanSeva में आपका स्वागत है!*\n\n' +
    'कृपया अपनी भाषा चुनें 👇\nPlease choose your language 👇',
    'भाषा चुनें / Language',
    sections
  );
}

// ── Settings / Menu ──

async function sendSettingsMenu(phone: string, language: string): Promise<void> {
  const isEn = language === 'en-IN';

  const sections = [
    {
      title: isEn ? 'Settings' : 'सेटिंग्स',
      rows: [
        {
          id: 'menu_language',
          title: isEn ? '🌐 Change Language' : '🌐 भाषा बदलें',
          description: isEn ? 'Switch to Hindi, Tamil, Bengali...' : 'हिन्दी, तमिल, बंगाली...',
        },
        {
          id: 'menu_help',
          title: isEn ? '❓ Help & Tips' : '❓ मदद और सुझाव',
          description: isEn ? 'How to use KisanSeva' : 'KisanSeva कैसे इस्तेमाल करें',
        },
        {
          id: 'menu_photo',
          title: isEn ? '📸 Diagnose Plant' : '📸 पौधे की जाँच करें',
          description: isEn ? 'Send a photo for diagnosis' : 'फोटो भेजें, बीमारी जानें',
        },
        {
          id: 'action_shop',
          title: isEn ? '🏪 Find Agri Shop' : '🏪 दवाई की दुकान',
          description: isEn ? 'Find pesticide shops near you' : 'नज़दीकी कृषि दवाई दुकान',
        },
        {
          id: 'action_expert',
          title: isEn ? '📞 Call Expert' : '📞 विशेषज्ञ से बात',
          description: isEn ? 'KisanCall: 1800-180-1551' : 'KisanCall: 1800-180-1551',
        },
      ],
    },
  ];

  await api.sendInteractiveList(
    phone,
    getMsg(language, 'settingsMenu'),
    isEn ? 'Open Menu' : 'मेनू खोलें',
    sections
  );
}

// ── Diagnosis formatting ──

function formatDiagnosisForWhatsApp(diagnosis: DiagnosisResult, _language: string): string {
  const primary = diagnosis.primaryDiagnosis;
  const severityEmoji = SEVERITY_EMOJI[primary.severity] || '⚪';
  const confidencePercent = Math.round(primary.confidence);

  let text = '';

  // Header
  text += `🔬 *जाँच रिपोर्ट / Diagnosis Report*\n`;
  text += `━━━━━━━━━━━━━━━\n\n`;

  // Primary diagnosis
  text += `🦠 *बीमारी:* ${primary.nameHi}\n`;
  text += `    _${primary.name}_ (${primary.scientificName})\n`;
  text += `📊 *प्रकार:* ${translateType(primary.type)}\n`;
  text += `${severityEmoji} *गंभीरता:* ${translateSeverity(primary.severity)}\n`;
  text += `🎯 *सटीकता:* ${confidencePercent}%\n\n`;

  // Symptoms
  if (diagnosis.visibleSymptoms.length > 0) {
    text += `👁️ *दिखाई देने वाले लक्षण:*\n`;
    for (const symptom of diagnosis.visibleSymptoms) {
      text += `  • ${symptom}\n`;
    }
    text += `\n`;
  }

  // Affected part
  if (diagnosis.affectedPart) {
    text += `🌿 *प्रभावित भाग:* ${diagnosis.affectedPart}\n\n`;
  }

  // Treatments
  text += `━━━━━━━━━━━━━━━\n`;
  text += `💊 *इलाज / Treatment:*\n\n`;

  if (diagnosis.treatments.mechanical.length > 0) {
    text += `🔧 *यांत्रिक उपाय:*\n`;
    for (const t of diagnosis.treatments.mechanical) {
      text += `  • ${t}\n`;
    }
    text += `\n`;
  }

  if (diagnosis.treatments.physical.length > 0) {
    text += `☀️ *भौतिक उपाय:*\n`;
    for (const t of diagnosis.treatments.physical) {
      text += `  • ${t}\n`;
    }
    text += `\n`;
  }

  if (diagnosis.treatments.chemical.length > 0) {
    text += `🧪 *रासायनिक उपचार:*\n`;
    for (const chem of diagnosis.treatments.chemical) {
      text += `  • *${chem.name}*\n`;
      text += `    मात्रा: ${chem.dosage}\n`;
      text += `    तरीका: ${chem.applicationMethod}\n`;
      text += `    कितनी बार: ${chem.frequency}\n`;
    }
    text += `\n`;
  }

  if (diagnosis.treatments.biological.length > 0) {
    text += `🌿 *जैविक उपाय:*\n`;
    for (const t of diagnosis.treatments.biological) {
      text += `  • ${t}\n`;
    }
    text += `\n`;
  }

  // Recommended pesticides
  if (diagnosis.recommendedPesticides.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    text += `🏷️ *सुझाई गई दवाइयाँ:*\n\n`;
    for (const pest of diagnosis.recommendedPesticides) {
      text += `  • *${pest.name}*`;
      if (pest.tradeName.length > 0) {
        text += ` (${pest.tradeName.join(', ')})`;
      }
      text += `\n`;
      text += `    ${pest.dosage.perLiter}/लीटर | ${pest.dosage.perAcre}/एकड़\n`;
    }
    text += `\n`;
  }

  // Prevention tips
  if (diagnosis.preventionTips.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    text += `🛡️ *बचाव के उपाय:*\n`;
    for (const tip of diagnosis.preventionTips) {
      text += `  • ${tip}\n`;
    }
    text += `\n`;
  }

  // Disclaimer
  text += `━━━━━━━━━━━━━━━\n`;
  text += `⚠️ _${diagnosis.disclaimer}_`;

  return text;
}

function translateType(type: string): string {
  const typeMap: Record<string, string> = {
    fungal: 'फफूंद (Fungal)',
    bacterial: 'जीवाणु (Bacterial)',
    viral: 'वायरस (Viral)',
    deficiency: 'कमी (Deficiency)',
    pest: 'कीट (Pest)',
    unknown: 'अज्ञात (Unknown)',
  };
  return typeMap[type] || type;
}

function translateSeverity(severity: string): string {
  const sevMap: Record<string, string> = {
    mild: 'हल्की (Mild)',
    moderate: 'मध्यम (Moderate)',
    severe: 'गंभीर (Severe)',
    critical: 'अत्यंत गंभीर (Critical)',
  };
  return sevMap[severity] || severity;
}

// ── Phone redaction for logs ──

function redactPhone(phone: string): string {
  if (!phone || phone.length <= 4) return '****';
  return '****' + phone.slice(-4);
}

