import { ConversationState } from '../types/whatsapp';
import type { WhatsAppIncomingMessage, WhatsAppButton } from '../types/whatsapp';
import type { DiagnosisResult } from '../types/diagnosis';
import * as sessionService from './whatsappSessionService';
import * as api from './whatsappApiService';
import * as mediaService from './whatsappMediaService';
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
    // ── Handle image messages (photo of plant) ──
    if (message.type === 'image' && message.image) {
      await handlePhotoMessage(phone, message.image.id, message.image.caption, session.language);
      return;
    }

    // No text content to process
    if (!input) {
      await api.sendTextMessage(phone, 'कृपया टेक्स्ट संदेश या पौधे की फोटो भेजें। 📸');
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
      await sendHelpMenu(phone);
      return;
    }

    // ── Language selection from interactive list ──
    if (session.state === ConversationState.AWAITING_LANGUAGE || LANGUAGE_MAP[inputLower]) {
      const lang = LANGUAGE_MAP[inputLower];
      if (lang) {
        await sessionService.setLanguage(phone, lang.code);
        await sessionService.setState(phone, ConversationState.IDLE);
        await api.sendTextMessage(
          phone,
          `✅ भाषा बदल दी गई: ${lang.nameNative} (${lang.name})\n\nअब अपने पौधे की फोटो भेजें। 📸`
        );
        return;
      }
    }

    // ── Interactive button replies ──
    if (message.type === 'interactive') {
      await handleInteractiveReply(phone, input, session.language);
      return;
    }

    // ── Check if the input is a crop name ──
    const detectedCrop = detectCropName(inputLower);
    if (detectedCrop) {
      await handleCropMention(phone, detectedCrop);
      return;
    }

    // ── Default: send welcome message ──
    await sendWelcomeMessage(phone);
  } catch (error) {
    logger.error('Error processing WhatsApp message', {
      phone: redactPhone(phone),
      error: (error as Error).message,
    });
    await api.sendTextMessage(
      phone,
      '❌ कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।\nSomething went wrong. Please try again.'
    ).catch((sendErr: Error) => {
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

  await api.sendTextMessage(
    phone,
    '📸 फोटो मिल गई! 🔍 जाँच हो रही है...\nकृपया 10-15 सेकंड रुकें।\n\nAnalyzing your plant photo...'
  );

  try {
    // Download image from WhatsApp
    const { buffer } = await mediaService.downloadMedia(mediaId);

    // Call disease detection service
    // TODO: Replace with actual diseaseDetectionService.analyzePlantImage(buffer) once built
    const diagnosis = await analyzePlantImageStub(buffer, caption);

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
    await api.sendTextMessage(
      phone,
      '❌ फोटो की जाँच में समस्या हुई।\nकृपया एक साफ़ फोटो दोबारा भेजें।\n\n💡 सुझाव: पत्ती या प्रभावित हिस्से की करीबी फोटो भेजें।'
    );
    await sessionService.setState(phone, ConversationState.IDLE);
  }
}

// ── Interactive reply handler ──

async function handleInteractiveReply(
  phone: string,
  buttonId: string,
  _language: string
): Promise<void> {
  switch (buttonId) {
    case 'action_retry':
      await api.sendTextMessage(
        phone,
        '📸 अपने पौधे की नई फोटो भेजें।\nSend a new photo of your plant.'
      );
      await sessionService.setState(phone, ConversationState.AWAITING_PHOTO);
      break;

    case 'action_shop':
      await api.sendTextMessage(
        phone,
        '🏪 *नज़दीकी कृषि दवाई दुकान*\n\n' +
        'अपनी जगह की कृषि दवाई की दुकान खोजने के लिए Google Maps पर "agricultural shop near me" खोजें।\n\n' +
        '💡 ऊपर बताई गई दवाइयों का नाम दुकानदार को दिखाएँ।'
      );
      break;

    case 'action_expert':
      await api.sendTextMessage(
        phone,
        '👨‍🌾 *कृषि विशेषज्ञ से संपर्क*\n\n' +
        '📞 KisanCall Center: 1800-180-1551 (टोल-फ्री)\n' +
        '🌐 मंडी भाव और सलाह: kisansuvidha.gov.in\n\n' +
        'यह सेवा जल्द ही KisanSeva ऐप में उपलब्ध होगी!'
      );
      break;

    case 'crop_diseases':
      await api.sendTextMessage(
        phone,
        '📋 फसल की आम बीमारियाँ देखने की सुविधा जल्द आ रही है।\n\nअभी के लिए, अपने पौधे की फोटो भेजें और हम जाँच करेंगे! 📸'
      );
      break;

    case 'crop_photo_check':
      await api.sendTextMessage(
        phone,
        '📸 अपने पौधे की फोटो भेजें।\nSend a photo of your plant.'
      );
      await sessionService.setState(phone, ConversationState.AWAITING_PHOTO);
      break;

    default:
      // Check if it's a language selection
      if (LANGUAGE_MAP[buttonId]) {
        const lang = LANGUAGE_MAP[buttonId];
        await sessionService.setLanguage(phone, lang.code);
        await sessionService.setState(phone, ConversationState.IDLE);
        await api.sendTextMessage(
          phone,
          `✅ भाषा बदल दी गई: ${lang.nameNative} (${lang.name})\n\nअब अपने पौधे की फोटो भेजें। 📸`
        );
      } else {
        await sendWelcomeMessage(phone);
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

async function handleCropMention(phone: string, crop: string): Promise<void> {
  await sessionService.setCrop(phone, crop);

  const cropDisplay = crop.charAt(0).toUpperCase() + crop.slice(1);

  const buttons: WhatsAppButton[] = [
    { type: 'reply', reply: { id: 'crop_diseases', title: '📋 आम बीमारियाँ' } },
    { type: 'reply', reply: { id: 'crop_photo_check', title: '📸 फोटो से जाँच' } },
  ];

  await api.sendInteractiveButtons(
    phone,
    `🌱 अच्छा! *${cropDisplay}* के बारे में जानकारी चाहिए?\n\nWhat would you like to know about *${cropDisplay}*?`,
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

async function sendWelcomeMessage(phone: string): Promise<void> {
  await api.sendTextMessage(
    phone,
    'नमस्ते! 🌾 *KisanSeva* में आपका स्वागत है।\n\n' +
    'अपने पौधे की बीमारी जानने के लिए *फोटो भेजें*। 📸\n\n' +
    '🔍 हम बताएंगे:\n' +
    '  • बीमारी का नाम\n' +
    '  • कितनी गंभीर है\n' +
    '  • इलाज कैसे करें\n' +
    '  • कौन सी दवाई लगाएँ\n\n' +
    '━━━━━━━━━━━━━━━\n' +
    '📝 *कमांड:*\n' +
    '  • "भाषा" — भाषा बदलें\n' +
    '  • "मदद" — मदद मेनू\n' +
    '  • फसल का नाम लिखें (जैसे: धान, टमाटर)\n' +
    '━━━━━━━━━━━━━━━'
  );
}

// ── Help menu ──

async function sendHelpMenu(phone: string): Promise<void> {
  await api.sendTextMessage(
    phone,
    '📖 *KisanSeva मदद मेनू*\n\n' +
    '1️⃣ *फोटो भेजें* — पौधे की फोटो भेजें, हम बीमारी बताएंगे\n' +
    '2️⃣ *फसल का नाम* — "धान", "टमाटर", "गेहूं" आदि लिखें\n' +
    '3️⃣ *"भाषा"* — अपनी भाषा बदलें\n' +
    '4️⃣ *"मदद"* — यह मेनू दोबारा देखें\n\n' +
    '━━━━━━━━━━━━━━━\n' +
    '💡 *फोटो लेने के सुझाव:*\n' +
    '  • प्रभावित पत्ती/हिस्से की करीबी फोटो\n' +
    '  • अच्छी रोशनी में फोटो लें\n' +
    '  • एक बार में एक पत्ती/फल की फोटो\n\n' +
    '📞 *KisanCall Center:* 1800-180-1551\n' +
    '━━━━━━━━━━━━━━━'
  );
}

// ── Diagnosis formatting ──

function formatDiagnosisForWhatsApp(diagnosis: DiagnosisResult, _language: string): string {
  const primary = diagnosis.primaryDiagnosis;
  const severityEmoji = SEVERITY_EMOJI[primary.severity] || '⚪';
  const confidencePercent = Math.round(primary.confidence * 100);

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

// ── Stub for disease detection until the real service is built ──
// TODO: Replace with actual diseaseDetectionService.analyzePlantImage()

async function analyzePlantImageStub(
  _buffer: Buffer,
  _caption: string | undefined
): Promise<DiagnosisResult> {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    primaryDiagnosis: {
      name: 'Late Blight',
      nameHi: 'पछेती अंगमारी',
      scientificName: 'Phytophthora infestans',
      type: 'fungal',
      confidence: 0.87,
      severity: 'moderate',
    },
    differentialDiagnoses: [
      { name: 'Early Blight', confidence: 0.08 },
      { name: 'Septoria Leaf Spot', confidence: 0.03 },
    ],
    visibleSymptoms: [
      'पत्तियों पर भूरे-काले धब्बे',
      'पत्तियों के किनारे पीले पड़ रहे हैं',
      'तने पर काले निशान',
    ],
    affectedPart: 'पत्तियाँ और तना (Leaves and stem)',
    treatments: {
      mechanical: [
        'प्रभावित पत्तियों को तोड़कर जला दें',
        'पौधों के बीच हवा का प्रवाह बढ़ाएँ',
      ],
      physical: [
        'सिंचाई कम करें, ज़मीन सूखने दें',
      ],
      chemical: [
        {
          name: 'Mancozeb 75% WP',
          dosage: '2.5 ग्राम/लीटर पानी',
          applicationMethod: 'छिड़काव (Spray)',
          frequency: 'हर 7-10 दिन में',
        },
        {
          name: 'Metalaxyl 8% + Mancozeb 64% WP',
          dosage: '2.5 ग्राम/लीटर पानी',
          applicationMethod: 'छिड़काव (Spray)',
          frequency: 'हर 10-14 दिन में',
        },
      ],
      biological: [
        'Trichoderma viride का प्रयोग करें',
      ],
    },
    recommendedPesticides: [
      {
        name: 'Mancozeb',
        tradeName: ['Dithane M-45', 'Indofil M-45'],
        dosage: { perLiter: '2.5 ग्राम', perAcre: '500 ग्राम' },
        safetyPrecautions: ['मास्क और दस्ताने पहनें', 'छिड़काव के बाद हाथ धोएँ'],
      },
    ],
    preventionTips: [
      'प्रतिरोधी किस्में लगाएँ',
      'फसल चक्र अपनाएँ',
      'खेत में जल-निकासी की व्यवस्था करें',
      'बीज उपचार करें',
    ],
    sampleImages: [],
    disclaimer: 'यह AI-आधारित सुझाव है। अंतिम निर्णय के लिए कृषि विशेषज्ञ से सलाह लें।',
  };
}
