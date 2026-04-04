import { ConversationState } from '../types/whatsapp';
import type { WhatsAppIncomingMessage, WhatsAppButton } from '../types/whatsapp';
import type { DiagnosisResult } from '../types/diagnosis';
import * as sessionService from './whatsappSessionService';
import * as api from './whatsappApiService';
import * as mediaService from './whatsappMediaService';
import { analyzePlantImage } from './diseaseDetectionService';
import { getRelevantSchemes } from './schemeService';
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

    // Send action buttons (titles must be <= 20 chars)
    const isEn = language === 'en-IN';
    const actionButtons: WhatsAppButton[] = [
      { type: 'reply', reply: { id: 'action_retry', title: isEn ? 'Scan Again' : 'दोबारा जाँचें' } },
      { type: 'reply', reply: { id: 'action_shop', title: isEn ? 'Find Shop' : 'दवाई की दुकान' } },
      { type: 'reply', reply: { id: 'action_expert', title: isEn ? 'Expert/Schemes' : 'विशेषज्ञ/योजना' } },
    ];

    await api.sendInteractiveButtons(
      phone,
      isEn ? 'What else can I help with?' : 'और क्या मदद चाहिए?',
      actionButtons
    );

    // Store last diagnosis disease name for scheme lookups
    await sessionService.setContext(phone, 'lastDisease', diagnosis.primaryDiagnosis.name);

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
      // Also send relevant government scheme recommendations
      await sendSchemeRecommendations(phone, language);
      break;

    case 'crop_diseases':
      await api.sendTextMessage(phone, getMsg(language, 'comingSoon'));
      break;

    case 'crop_photo_check':
      await api.sendTextMessage(phone, getMsg(language, 'sendNewPhoto'));
      await sessionService.setState(phone, ConversationState.AWAITING_PHOTO);
      break;

    case 'open_menu':
      await sendSettingsMenu(phone, language);
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

    case 'menu_schemes':
      await sendSchemeRecommendations(phone, language);
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

  // Button titles must be <= 20 chars
  const buttons: WhatsAppButton[] = [
    { type: 'reply', reply: { id: 'crop_diseases', title: language === 'en-IN' ? 'Common Diseases' : 'आम बीमारियाँ' } },
    { type: 'reply', reply: { id: 'crop_photo_check', title: language === 'en-IN' ? 'Diagnose Photo' : 'फोटो से जाँच' } },
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

  // Section title: max 24 chars; row title: max 24 chars; row desc: max 72 chars
  // Button text: max 20 chars; max 10 rows per section
  const sections = [
    {
      title: 'भाषा चुनें / Language',   // 21 chars
      rows: Object.entries(LANGUAGE_MAP).map(([key, lang]) => ({
        id: key,
        title: truncate(lang.nameNative, 24),
        description: truncate(lang.name, 72),
      })),
    },
  ];

  await api.sendInteractiveList(
    phone,
    'अपनी भाषा चुनें\nChoose your language:',
    'भाषा चुनें',       // 10 chars, under 20
    sections
  );
}

// ── Welcome message (with action buttons) ──

async function sendWelcomeMessage(phone: string, language: string = 'hi-IN'): Promise<void> {
  const isEn = language === 'en-IN';

  await api.sendTextMessage(phone, getMsg(language, 'welcome'));

  // Follow up with quick action buttons (max 3 buttons, title max 20 chars)
  const buttons: WhatsAppButton[] = [
    { type: 'reply', reply: { id: 'menu_photo', title: isEn ? 'Scan Crop' : 'फोटो भेजें' } },
    { type: 'reply', reply: { id: 'menu_language', title: isEn ? 'Language' : 'भाषा बदलें' } },
    { type: 'reply', reply: { id: 'open_menu', title: isEn ? 'Menu' : 'मेनू' } },
  ];

  await api.sendInteractiveButtons(
    phone,
    isEn ? 'What would you like to do?' : 'आप क्या करना चाहेंगे?',
    buttons
  );
}

// ── Help menu (with action buttons) ──

async function sendHelpMenu(phone: string, language: string = 'hi-IN'): Promise<void> {
  const isEn = language === 'en-IN';

  await api.sendTextMessage(phone, getMsg(language, 'help'));

  // Follow up with action buttons
  const buttons: WhatsAppButton[] = [
    { type: 'reply', reply: { id: 'menu_photo', title: isEn ? 'Scan Crop' : 'फोटो भेजें' } },
    { type: 'reply', reply: { id: 'open_menu', title: isEn ? 'Full Menu' : 'पूरा मेनू' } },
    { type: 'reply', reply: { id: 'action_expert', title: isEn ? 'Call Expert' : 'विशेषज्ञ' } },
  ];

  await api.sendInteractiveButtons(
    phone,
    isEn ? 'Quick actions:' : 'त्वरित कार्य:',
    buttons
  );
}

// ── First contact: language selection with greeting ──

async function sendLanguageSelectionOnFirstContact(phone: string): Promise<void> {
  // Section title: max 24 chars; button text: max 20 chars
  const sections = [
    {
      title: 'भाषा चुनें / Language',   // 21 chars
      rows: Object.entries(LANGUAGE_MAP).map(([key, lang]) => ({
        id: key,
        title: truncate(lang.nameNative, 24),
        description: truncate(lang.name, 72),
      })),
    },
  ];

  await api.sendInteractiveList(
    phone,
    '*KisanSeva में स्वागत है!*\n\n' +
    'कृपया अपनी भाषा चुनें\nPlease choose your language',
    'भाषा चुनें',       // 10 chars, under 20
    sections
  );
}

// ── Settings / Menu ──

async function sendSettingsMenu(phone: string, language: string): Promise<void> {
  const isEn = language === 'en-IN';

  // Section title: max 24 chars; row title: max 24 chars; row desc: max 72 chars
  // Button text: max 20 chars
  const sections = [
    {
      title: isEn ? 'Settings' : 'सेटिंग्स',
      rows: [
        {
          id: 'menu_language',
          title: isEn ? 'Change Language' : 'भाषा बदलें',              // 15 / 10 chars
          description: isEn ? 'Switch to Hindi, Tamil, Bengali...' : 'हिन्दी, तमिल, बंगाली...',
        },
        {
          id: 'menu_help',
          title: isEn ? 'Help & Tips' : 'मदद और सुझाव',              // 11 / 12 chars
          description: isEn ? 'How to use KisanSeva' : 'KisanSeva कैसे इस्तेमाल करें',
        },
        {
          id: 'menu_photo',
          title: isEn ? 'Diagnose Plant' : 'पौधे की जाँच',            // 14 / 12 chars
          description: isEn ? 'Send a photo for diagnosis' : 'फोटो भेजें, बीमारी जानें',
        },
        {
          id: 'action_shop',
          title: isEn ? 'Find Agri Shop' : 'दवाई की दुकान',           // 14 / 13 chars
          description: isEn ? 'Find pesticide shops near you' : 'नज़दीकी कृषि दवाई दुकान',
        },
        {
          id: 'action_expert',
          title: isEn ? 'Call Expert' : 'विशेषज्ञ से बात',            // 11 / 14 chars
          description: isEn ? 'KisanCall: 1800-180-1551' : 'KisanCall: 1800-180-1551',
        },
        {
          id: 'menu_schemes',
          title: isEn ? 'Govt Schemes' : 'सरकारी योजनाएँ',            // 12 / 14 chars
          description: isEn ? 'Insurance & subsidy schemes' : 'बीमा और सब्सिडी योजनाएँ',
        },
      ],
    },
  ];

  await api.sendInteractiveList(
    phone,
    getMsg(language, 'settingsMenu'),
    isEn ? 'Open Menu' : 'मेनू खोलें',    // 9 / 10 chars
    sections
  );
}

// ── Scheme recommendations ──

async function sendSchemeRecommendations(phone: string, language: string): Promise<void> {
  const isEn = language === 'en-IN';

  try {
    // Get the farmer's last diagnosed crop from session context
    const session = await sessionService.getOrCreateSession(phone);
    const crop = session.lastCropMentioned || undefined;

    const schemes = await getRelevantSchemes(undefined, crop, 'disease');

    if (!schemes || schemes.length === 0) {
      const noSchemeMsg = isEn
        ? 'No matching government schemes found at this time. Check back later or call KisanCall: 1800-180-1551.'
        : 'अभी कोई मिलती-जुलती सरकारी योजना नहीं मिली। बाद में जाँचें या KisanCall: 1800-180-1551 पर कॉल करें।';
      await api.sendTextMessage(phone, noSchemeMsg);
      return;
    }

    // Format top 5 schemes as a message
    const topSchemes = schemes.slice(0, 5);
    let text = isEn
      ? '*Relevant Government Schemes:*\n\n'
      : '*सरकारी योजनाएँ:*\n\n';

    for (const scheme of topSchemes) {
      const name = isEn ? scheme.name : (scheme.nameHi || scheme.name);
      text += `*${name}*\n`;
      if (scheme.benefits || scheme.benefitsHi) {
        const benefits = isEn ? scheme.benefits : (scheme.benefitsHi || scheme.benefits);
        if (benefits) {
          text += `  ${truncate(benefits, 120)}\n`;
        }
      }
      if (scheme.applicationUrl) {
        text += `  ${scheme.applicationUrl}\n`;
      }
      if (scheme.helpline) {
        text += `  ${isEn ? 'Helpline' : 'हेल्पलाइन'}: ${scheme.helpline}\n`;
      }
      text += '\n';
    }

    text += isEn
      ? '_More schemes at: pmkisan.gov.in_'
      : '_अधिक जानकारी: pmkisan.gov.in_';

    await api.sendTextMessage(phone, text);
  } catch (error) {
    logger.error('Failed to fetch scheme recommendations', {
      phone: redactPhone(phone),
      error: (error as Error).message,
    });
    // Don't fail silently - send a fallback
    const fallback = isEn
      ? 'Could not load schemes. Visit pmkisan.gov.in or call 1800-180-1551.'
      : 'योजनाएँ लोड नहीं हो सकीं। pmkisan.gov.in पर जाएँ या 1800-180-1551 पर कॉल करें।';
    await api.sendTextMessage(phone, fallback).catch(() => { /* swallow */ });
  }
}

// ── Utility: truncate string to max length ──

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

// ── Diagnosis formatting ──

function formatDiagnosisForWhatsApp(diagnosis: DiagnosisResult, language: string): string {
  const primary = diagnosis.primaryDiagnosis;
  const severityEmoji = SEVERITY_EMOJI[primary.severity] || '⚪';
  const confidencePercent = Math.round(primary.confidence);
  const isEn = language === 'en-IN';

  // Language-aware labels
  const L = isEn ? {
    header: '🔬 *Diagnosis Report*',
    disease: '🦠 *Disease:*',
    type: '📊 *Type:*',
    severity: '🎯 *Severity:*',
    confidence: '🎯 *Confidence:*',
    symptoms: '👁️ *Visible Symptoms:*',
    affectedPart: '🌿 *Affected Part:*',
    treatment: '💊 *Treatment:*',
    mechanical: '🔧 *Mechanical:*',
    physical: '☀️ *Physical:*',
    chemical: '🧪 *Chemical Treatment:*',
    biological: '🌿 *Biological:*',
    pesticides: '🏷️ *Recommended Pesticides:*',
    prevention: '🛡️ *Prevention Tips:*',
    dosage: 'Dosage',
    method: 'Method',
    frequency: 'Frequency',
    noTreatment: 'No specific treatment data available. Consult a local agricultural expert.',
  } : {
    header: '🔬 *जाँच रिपोर्ट*',
    disease: '🦠 *बीमारी:*',
    type: '📊 *प्रकार:*',
    severity: '🎯 *गंभीरता:*',
    confidence: '🎯 *सटीकता:*',
    symptoms: '👁️ *दिखाई देने वाले लक्षण:*',
    affectedPart: '🌿 *प्रभावित भाग:*',
    treatment: '💊 *इलाज:*',
    mechanical: '🔧 *यांत्रिक उपाय:*',
    physical: '☀️ *भौतिक उपाय:*',
    chemical: '🧪 *रासायनिक उपचार:*',
    biological: '🌿 *जैविक उपाय:*',
    pesticides: '🏷️ *सुझाई गई दवाइयाँ:*',
    prevention: '🛡️ *बचाव के उपाय:*',
    dosage: 'मात्रा',
    method: 'तरीका',
    frequency: 'कितनी बार',
    noTreatment: 'उपचार की जानकारी उपलब्ध नहीं है। कृषि विशेषज्ञ से संपर्क करें।',
  };

  let text = '';

  // Header
  text += `${L.header}\n`;
  text += `━━━━━━━━━━━━━━━\n\n`;

  // Primary diagnosis — show name in selected language first
  const diseaseName = isEn ? primary.name : (primary.nameHi || primary.name);
  const diseaseAlt = isEn ? (primary.nameHi || '') : primary.name;
  text += `${L.disease} ${diseaseName}\n`;
  if (diseaseAlt) text += `    _${diseaseAlt}_ (${primary.scientificName})\n`;
  text += `${L.type} ${translateType(primary.type, isEn)}\n`;
  text += `${severityEmoji} ${L.severity} ${translateSeverity(primary.severity, isEn)}\n`;
  text += `${L.confidence} ${confidencePercent}%\n\n`;

  // Symptoms
  if (diagnosis.visibleSymptoms.length > 0) {
    text += `${L.symptoms}\n`;
    for (const symptom of diagnosis.visibleSymptoms) {
      text += `  • ${symptom}\n`;
    }
    text += `\n`;
  }

  // Affected part
  if (diagnosis.affectedPart) {
    text += `${L.affectedPart} ${diagnosis.affectedPart}\n\n`;
  }

  // Treatments
  text += `━━━━━━━━━━━━━━━\n`;
  text += `${L.treatment}\n\n`;

  let hasTreatment = false;

  if (diagnosis.treatments.mechanical.length > 0) {
    hasTreatment = true;
    text += `${L.mechanical}\n`;
    for (const t of diagnosis.treatments.mechanical) {
      text += `  • ${t}\n`;
    }
    text += `\n`;
  }

  if (diagnosis.treatments.physical.length > 0) {
    hasTreatment = true;
    text += `${L.physical}\n`;
    for (const t of diagnosis.treatments.physical) {
      text += `  • ${t}\n`;
    }
    text += `\n`;
  }

  if (diagnosis.treatments.chemical.length > 0) {
    hasTreatment = true;
    text += `${L.chemical}\n`;
    for (const chem of diagnosis.treatments.chemical) {
      text += `  • *${chem.name}*\n`;
      text += `    ${L.dosage}: ${chem.dosage}\n`;
      text += `    ${L.method}: ${chem.applicationMethod}\n`;
      text += `    ${L.frequency}: ${chem.frequency}\n`;
    }
    text += `\n`;
  }

  if (diagnosis.treatments.biological.length > 0) {
    hasTreatment = true;
    text += `${L.biological}\n`;
    for (const t of diagnosis.treatments.biological) {
      text += `  • ${t}\n`;
    }
    text += `\n`;
  }

  // If no treatment data at all, show a helpful message
  if (!hasTreatment) {
    text += `${L.noTreatment}\n\n`;
  }

  // Recommended pesticides
  if (diagnosis.recommendedPesticides.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    text += `${L.pesticides}\n\n`;
    const perLiter = isEn ? '/liter' : '/लीटर';
    const perAcre = isEn ? '/acre' : '/एकड़';
    for (const pest of diagnosis.recommendedPesticides) {
      text += `  • *${pest.name}*`;
      if (pest.tradeName.length > 0) {
        text += ` (${pest.tradeName.join(', ')})`;
      }
      text += `\n`;
      text += `    ${pest.dosage.perLiter}${perLiter} | ${pest.dosage.perAcre}${perAcre}\n`;
    }
    text += `\n`;
  }

  // Prevention tips
  if (diagnosis.preventionTips.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    text += `${L.prevention}\n`;
    for (const tip of diagnosis.preventionTips) {
      text += `  • ${tip}\n`;
    }
    text += `\n`;
  }

  // Disclaimer
  const disclaimer = isEn
    ? 'This is an AI-assisted diagnosis. Consult a local agricultural expert or KVK for confirmation.'
    : 'यह AI-आधारित सुझाव है। अंतिम निर्णय के लिए कृषि विशेषज्ञ से सलाह लें।';
  text += `━━━━━━━━━━━━━━━\n`;
  text += `⚠️ _${disclaimer}_`;

  return text;
}

function translateType(type: string, isEn: boolean = false): string {
  if (isEn) {
    const map: Record<string, string> = {
      fungal: 'Fungal', bacterial: 'Bacterial', viral: 'Viral',
      deficiency: 'Deficiency', pest: 'Pest', unknown: 'Unknown',
    };
    return map[type] || type;
  }
  const typeMap: Record<string, string> = {
    fungal: 'फफूंद (Fungal)', bacterial: 'जीवाणु (Bacterial)',
    viral: 'वायरस (Viral)', deficiency: 'कमी (Deficiency)',
    pest: 'कीट (Pest)', unknown: 'अज्ञात (Unknown)',
  };
  return typeMap[type] || type;
}

function translateSeverity(severity: string, isEn: boolean = false): string {
  if (isEn) {
    const map: Record<string, string> = {
      mild: 'Mild', moderate: 'Moderate', severe: 'Severe', critical: 'Critical',
    };
    return map[severity] || severity;
  }
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

