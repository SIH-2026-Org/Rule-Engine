import config from '../config/env.js';
import {
  LANGUAGE_SELECT_TEMPLATE,
  SCHEME_MENU_TEMPLATE,
  LOAN_DETAILS_TEMPLATES,
  LOAN_BUTTON_LABELS,
  SUPPORTED_LANGUAGES,
  LANGUAGE_ALIAS_MAP,
  GREETINGS,
} from '../constants/messages.js';
import * as whatsappService  from '../services/whatsapp.service.js';
import * as translationService from '../services/translation.service.js';
import * as sessionService   from '../services/session.service.js';
import { extractFromText, buildProfile } from '../services/profile.builder.js';
import { matchSchemes }      from '../engine/rule.engine.js';

// ─── Webhook Verification ─────────────────────────────────────────────────────

/**
 * Webhook Verification (GET /webhook)
 * Handles Meta's initial challenge-response handshake.
 */
function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
    console.log('[Webhook] Handshake successful.');
    return res.status(200).send(challenge);
  }
  console.warn('[Webhook] Verification failed — token mismatch.');
  return res.sendStatus(403);
}

// ─── Language Selection ───────────────────────────────────────────────────────

async function promptLanguageSelectionList(senderPhone) {
  sessionService.updateSession(senderPhone, {
    stage: 'AWAITING_LANGUAGE',
    selectedLanguageCode: null,
  });

  const listRows = SUPPORTED_LANGUAGES.map(lang => ({
    id:          lang.id,
    title:       lang.title,
    description: lang.name,
  }));

  await whatsappService.sendInteractiveList(
    senderPhone,
    LANGUAGE_SELECT_TEMPLATE,
    'Select Language',
    listRows,
    'Indian Languages'
  );
}

// ─── Scheme Menu ──────────────────────────────────────────────────────────────

async function sendSchemeMenu(senderPhone, languageCode) {
  sessionService.updateSession(senderPhone, {
    selectedLanguageCode: languageCode,
    stage: 'AWAITING_SCHEME_CATEGORY',
  });

  const translatedMenuText = await translationService.translateText(
    SCHEME_MENU_TEMPLATE, languageCode, 'en-IN'
  );

  const labels  = LOAN_BUTTON_LABELS[languageCode] || LOAN_BUTTON_LABELS['en-IN'];
  const buttons = [
    { id: 'LOAN_EDU',  title: labels.edu  },
    { id: 'LOAN_FARM', title: labels.farm },
    { id: 'LOAN_MSME', title: labels.msme },
  ];

  await whatsappService.sendInteractiveButtons(senderPhone, translatedMenuText, buttons);
}

// ─── Rule Engine Integration ──────────────────────────────────────────────────

/**
 * Runs the Deterministic Rule Engine for the user's accumulated profile
 * and sends the formatted results back via WhatsApp.
 *
 * @param {string} senderPhone
 * @param {string} languageCode
 */
async function runEngineAndRespond(senderPhone, languageCode) {
  // Build profile from accumulated session data
  const sessionProfile = sessionService.getProfile(senderPhone);
  const profile = buildProfile(
    sessionProfile,
    {},
    'whatsapp',
    languageCode,
    senderPhone
  );

  console.log(`[RuleEngine] Running for ${senderPhone}:`, JSON.stringify(profile));

  const result = await matchSchemes(profile, { topN: 3, nearMissN: 2 });

  // Build WhatsApp-friendly response (max ~4096 chars per message)
  let responseText = '';

  // Echo what was understood
  const understood = result.profile_summary?.understood;
  if (understood) {
    responseText += `🔍 *I understood your request as:*\n`;
    if (understood.activity      !== 'not provided') responseText += `• Activity: ${understood.activity}\n`;
    if (understood.project_cost  !== 'not provided') responseText += `• Amount: ${understood.project_cost}\n`;
    if (understood.location      !== 'not provided') responseText += `• Location: ${understood.location}\n`;
    if (understood.social_category !== 'not provided') responseText += `• Category: ${understood.social_category}\n`;
    responseText += '\n';
  }

  if (result.status === 'OK' && result.eligible_schemes.length > 0) {
    responseText += `✅ *Found ${result.eligible_schemes.length} matching scheme(s):*\n\n`;

    result.eligible_schemes.slice(0, 3).forEach((ms, i) => {
      const { scheme, score, simulation } = ms;
      responseText += `${i + 1}️⃣ *${scheme.name}*\n`;
      responseText += `   Ministry: ${scheme.ministry}\n`;
      responseText += `   Score: ${score.total_score}/100\n`;
      if (score.reasons.slice(0, 2).length > 0) {
        responseText += `   ${score.reasons.slice(0, 2).join('\n   ')}\n`;
      }
      if (simulation?.available && simulation.emi_monthly > 0) {
        responseText += `   💰 Est. EMI: ₹${simulation.emi_monthly.toLocaleString('en-IN')}/month\n`;
      }
      if (simulation?.eligible_financing) {
        responseText += `   💵 Max Financing: ₹${simulation.eligible_financing.toLocaleString('en-IN')}\n`;
      }
      responseText += `   🔗 ${scheme.metadata?.application_portal || scheme.metadata?.official_url || 'Contact nearest bank'}\n`;
      responseText += '\n';
    });

    // Document readiness for top scheme
    const topDocs = result.eligible_schemes[0]?.documents;
    if (topDocs && (topDocs.obtain?.length > 0 || topDocs.required?.length > 0)) {
      responseText += `📋 *Documents to arrange (for ${result.eligible_schemes[0].scheme.short_name}):*\n`;
      topDocs.obtain?.slice(0, 3).forEach(d => {
        responseText += `• ${d.name}${d.required ? ' ✳️' : ''}\n`;
      });
      responseText += '\n';
    }

    responseText += `_Type "more" for full details or share more information to refine results._`;

  } else if (result.status === 'NEEDS_MORE_INFO') {
    if (result.partial_schemes.length > 0) {
      responseText += `⚡ *Potential matches found — need a few more details:*\n\n`;
      result.partial_schemes.slice(0, 2).forEach((ms, i) => {
        responseText += `${i + 1}️⃣ *${ms.scheme.name}* (${ms.score.total_score}/100)\n`;
      });
      responseText += '\n';
    }

    if (result.clarification_questions.length > 0) {
      responseText += `❓ *Please answer to get better results:*\n`;
      result.clarification_questions.slice(0, 3).forEach((q, i) => {
        responseText += `${i + 1}. ${q}\n`;
      });
    }

  } else {
    responseText += `❌ *No matching scheme found with current information.*\n\n`;
    if (result.near_miss_schemes.length > 0) {
      responseText += `*Closest options (not currently eligible):*\n`;
      result.near_miss_schemes.slice(0, 2).forEach(nm => {
        responseText += `• ${nm.scheme.name}: ${nm.failure_reasons[0] || 'Does not meet eligibility criteria'}\n`;
      });
      responseText += '\n';
    }
    responseText += `Please share more details or contact your nearest CSC centre for assisted help.`;
  }

  // Translate response if not English
  const translated = await translationService.translateText(responseText, languageCode, 'en-IN');
  await whatsappService.sendTextMessage(senderPhone, translated);
}

// ─── Main Webhook Handler ─────────────────────────────────────────────────────

/**
 * Webhook Event Handler (POST /webhook)
 */
function handleWebhook(req, res) {
  // Respond immediately to satisfy Meta's 20-second timeout
  res.sendStatus(200);

  const changeValue = req.body?.entry?.[0]?.changes?.[0]?.value;
  if (!changeValue) return;

  // Status updates (delivered/read receipts)
  if (changeValue.statuses?.length > 0) {
    const status = changeValue.statuses[0];
    console.log(`[Status] → ${status.recipient_id}: ${status.status}`);
    return;
  }

  const message = changeValue.messages?.[0];
  if (!message) return;

  const senderPhone = message.from;
  const messageType = message.type;
  const session     = sessionService.getSession(senderPhone);

  // ── Interactive (button / list replies) ──────────────────────────────────
  if (messageType === 'interactive' && message.interactive) {
    const interaction = message.interactive.button_reply || message.interactive.list_reply;
    if (!interaction) return;

    const optionId = interaction.id;
    console.log(`[Interactive] ${senderPhone} → ${optionId}`);

    // Language selected
    if (optionId.startsWith('LANG_')) {
      const selectedLanguage = optionId.replace('LANG_', '');
      sendSchemeMenu(senderPhone, selectedLanguage).catch(err =>
        console.error('[Webhook] sendSchemeMenu error:', err)
      );
      return;
    }

    // Scheme category selected → prime the session with category context
    if (optionId.startsWith('LOAN_')) {
      const activeLanguage = session?.selectedLanguageCode || 'en-IN';
      const categoryMap = { LOAN_EDU: 'education', LOAN_FARM: 'agriculture', LOAN_MSME: 'msme' };
      const actCat = categoryMap[optionId] || null;

      if (actCat) {
        sessionService.mergeProfileData(senderPhone, { activity_category: actCat });
      }

      sessionService.updateSession(senderPhone, { stage: 'IN_CONVERSATION' });

      const englishTemplate = LOAN_DETAILS_TEMPLATES[optionId]
        || 'Please describe your requirement (e.g. activity, cost, location) to find matching schemes.';

      translationService.translateText(englishTemplate, activeLanguage, 'en-IN')
        .then(t => whatsappService.sendTextMessage(senderPhone, t))
        .catch(err => console.error('[Webhook] loan category reply error:', err));
      return;
    }
  }

  // ── Text messages ─────────────────────────────────────────────────────────
  if (messageType === 'text' && message.text?.body) {
    const incomingText  = message.text.body.trim();
    const normalizedInput = incomingText.toLowerCase();
    const isGreeting    = GREETINGS.has(normalizedInput);

    console.log(`[Message] ${senderPhone} → "${incomingText}"`);

    // Greeting → restart
    if (isGreeting) {
      sessionService.resetSession(senderPhone);
      promptLanguageSelectionList(senderPhone).catch(err =>
        console.error('[Webhook] Language prompt error:', err)
      );
      return;
    }

    // No language selected yet
    if (!session || !session.selectedLanguageCode) {
      const matchedLang = LANGUAGE_ALIAS_MAP[normalizedInput];
      if (matchedLang) {
        sendSchemeMenu(senderPhone, matchedLang).catch(err =>
          console.error('[Webhook] sendSchemeMenu error:', err)
        );
      } else {
        promptLanguageSelectionList(senderPhone).catch(err =>
          console.error('[Webhook] Language prompt error:', err)
        );
      }
      return;
    }

    const selectedLanguage = session.selectedLanguageCode;

    // ── IN_CONVERSATION: extract entities + run engine ────────────────────
    if (session.stage === 'IN_CONVERSATION' || session.stage === 'AWAITING_SCHEME_CATEGORY') {
      sessionService.updateSession(senderPhone, { stage: 'IN_CONVERSATION' });

      // Extract entities from this message and merge into session profile
      const extracted = extractFromText(incomingText);
      sessionService.mergeProfileData(senderPhone, extracted);

      console.log(`[Engine] Extracted from message:`, extracted);

      // Run the rule engine and respond
      runEngineAndRespond(senderPhone, selectedLanguage).catch(err =>
        console.error('[Webhook] Engine response error:', err)
      );
      return;
    }

    // Fallback for other stages
    const fallbackMsg =
      'Please describe your business or financial need (e.g. "I need ₹1.2 lakh for a dairy business in Rajasthan") to find matching government schemes.';
    translationService.translateText(fallbackMsg, selectedLanguage, 'en-IN')
      .then(t => whatsappService.sendTextMessage(senderPhone, t))
      .catch(err => console.error('[Webhook] Fallback reply error:', err));
    return;
  }

  console.log(`[Webhook] Unhandled message type: ${messageType} from ${senderPhone}`);
}

export {
  verifyWebhook,
  handleWebhook,
  promptLanguageSelectionList,
  sendSchemeMenu,
};

export default {
  verifyWebhook,
  handleWebhook,
  promptLanguageSelectionList,
  sendSchemeMenu,
};
