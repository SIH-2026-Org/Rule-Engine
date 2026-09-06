/**
 * SAARTHI-SETU — Beneficiary Profile Builder
 *
 * Constructs a structured BeneficiaryProfile from:
 *   1. Session data (accumulated across conversation turns)
 *   2. NLP/LLM-extracted entities (from Sarvam AI or any parser)
 *   3. Raw text (basic regex fallback parser for prototype)
 *
 * Channel-agnostic. Used by WhatsApp, IVR, SMS, Web, Mobile controllers.
 */

// ─── Activity Normalizer ──────────────────────────────────────────────────────
const ACTIVITY_PATTERNS = [
  { pattern: /dairy|milk|cow|buffalo|cattle|gau|dugdh/i,         activity: 'dairy',           category: 'agriculture' },
  { pattern: /poultry|chicken|broiler|layer|egg|murgi/i,         activity: 'poultry',         category: 'agriculture' },
  { pattern: /goat|sheep|bakri|pashu|livestock|animal/i,         activity: 'animal_husbandry',category: 'agriculture' },
  { pattern: /fish|fishery|fisheries|aquaculture|machli/i,       activity: 'fishery',         category: 'agriculture' },
  { pattern: /farm|crop|khet|kheti|kisaan|kisan|agriculture/i,   activity: 'agriculture',     category: 'agriculture' },
  { pattern: /street.?vend|rehdi|thela|hawker|footpath|vendor/i, activity: 'street_vending',  category: 'services'    },
  { pattern: /tailor|sewing|stitch|kapda|garment|cloth/i,        activity: 'tailoring',       category: 'msme'        },
  { pattern: /weav|handloom|loom|bunkar|khaddar/i,               activity: 'weaving',         category: 'msme'        },
  { pattern: /food.?process|pickle|papad|snack|bakery|catering/i,activity: 'food_processing', category: 'msme'        },
  { pattern: /restaurant|dhaba|hotel|canteen|tiffin/i,           activity: 'food_services',   category: 'services'    },
  { pattern: /beauty|salon|parlour|parlor|barber/i,              activity: 'beauty_services', category: 'services'    },
  { pattern: /transport|taxi|auto|rickshaw|logistics|truck/i,    activity: 'transport',       category: 'services'    },
  { pattern: /electronic|mobile.?repair|computer|laptop/i,       activity: 'electronics',     category: 'msme'        },
  { pattern: /manufactur|production|factory|unit/i,              activity: 'manufacturing',   category: 'msme'        },
  { pattern: /shop|dukan|retail|store|trader/i,                  activity: 'retail',          category: 'msme'        },
  { pattern: /handicraft|craft|artisan|pottery|sculpture/i,      activity: 'handicraft',      category: 'msme'        },
  { pattern: /construct|carpenter|plumber|mason|electric/i,      activity: 'construction',    category: 'services'    },
  { pattern: /education|tuition|coaching|school|teaching/i,      activity: 'education',       category: 'education'   },
  { pattern: /pharmacy|medical|clinic|health|doctor/i,           activity: 'health_services', category: 'services'    },
  { pattern: /tech|software|it|digital|online/i,                 activity: 'technology',      category: 'services'    },
  { pattern: /solar|renewable|energy/i,                          activity: 'energy',          category: 'agriculture' },
  { pattern: /msme|small.?business|micro|enterprise/i,           activity: 'msme',            category: 'msme'        },
];

// ─── Amount Extractor ─────────────────────────────────────────────────────────
const AMOUNT_PATTERNS = [
  // "1.2 lakh", "1 lakh", "10 lakh", "1.5 crore"
  { pattern: /(\d+(?:\.\d+)?)\s*(?:lakh|lac|lacs|lakhs)/i,  multiplier: 100000 },
  // "1 crore", "2.5 crore"
  { pattern: /(\d+(?:\.\d+)?)\s*crore/i,                     multiplier: 10000000 },
  // "50 thousand", "5 thousand"
  { pattern: /(\d+(?:\.\d+)?)\s*(?:thousand|hazar)/i,        multiplier: 1000 },
  // "50000", "120000", "1,20,000"
  { pattern: /(?:rs\.?|₹|inr)?\s*([1-9]\d{3,}(?:[,\d]*)?)/i, multiplier: 1, clean: true },
];

// ─── State Names ──────────────────────────────────────────────────────────────
const INDIAN_STATES = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
  'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
  'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram',
  'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
  'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
  'delhi', 'jammu and kashmir', 'ladakh', 'chandigarh', 'puducherry',
  'andaman', 'lakshadweep', 'dadra', 'daman',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a monetary amount from free text.
 * @param {string} text
 * @returns {number|null}
 */
function extractAmount(text) {
  for (const { pattern, multiplier, clean } of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let numStr = match[1];
      if (clean) numStr = numStr.replace(/,/g, '');
      const val = parseFloat(numStr) * multiplier;
      if (!isNaN(val) && val > 0) return Math.round(val);
    }
  }
  return null;
}

/**
 * Detects business activity from free text.
 * @param {string} text
 * @returns {{ activity: string, activity_category: string }|null}
 */
function extractActivity(text) {
  for (const { pattern, activity, category } of ACTIVITY_PATTERNS) {
    if (pattern.test(text)) {
      return { activity, activity_category: category };
    }
  }
  return null;
}

/**
 * Detects Indian state from free text.
 * @param {string} text
 * @returns {string|null}
 */
function extractState(text) {
  const lower = text.toLowerCase();
  for (const state of INDIAN_STATES) {
    if (lower.includes(state)) {
      return state.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  // Common abbreviations
  const abbr = {
    'up': 'Uttar Pradesh', 'mp': 'Madhya Pradesh', 'wb': 'West Bengal',
    'ap': 'Andhra Pradesh', 'hp': 'Himachal Pradesh', 'jk': 'Jammu and Kashmir',
    'uk': 'Uttarakhand', 'hr': 'Haryana', 'pb': 'Punjab',
  };
  for (const [short, full] of Object.entries(abbr)) {
    if (new RegExp(`\\b${short}\\b`, 'i').test(text)) return full;
  }
  return null;
}

/**
 * Extracts social category from text.
 * @param {string} text
 * @returns {string|null}
 */
function extractSocialCategory(text) {
  const t = text.toUpperCase();
  if (/\bSC\b|SCHEDULED.?CASTE|DALIT/i.test(t))               return 'SC';
  if (/\bST\b|SCHEDULED.?TRIBE|ADIVASI|TRIBAL/i.test(t))      return 'ST';
  if (/\bOBC\b|OTHER.?BACKWARD/i.test(t))                      return 'OBC';
  if (/\bEWS\b|ECONOMICALLY.?WEAKER/i.test(t))                 return 'EWS';
  if (/MINORITY|MUSLIM|CHRISTIAN|SIKH|BUDDHIST|JAIN/i.test(t)) return 'MINORITY';
  if (/GENERAL|GEN\b|OPEN\b/i.test(t))                         return 'GEN';
  return null;
}

/**
 * Extracts gender from text.
 * @param {string} text
 * @returns {'M'|'F'|'O'|null}
 */
function extractGender(text) {
  if (/\bfemale\b|\bwoman\b|\bwomen\b|\bмахिला\b|\bستری\b/i.test(text))  return 'F';
  if (/\bmale\b|\bman\b|\bpurush\b/i.test(text))                          return 'M';
  if (/\bother\b|\btransgender\b|\bthird.?gender/i.test(text))            return 'O';
  return null;
}

/**
 * Extracts age from text.
 * @param {string} text
 * @returns {number|null}
 */
function extractAge(text) {
  const match = text.match(/(\d{2})\s*(?:year|yr|saal|sal|age)/i)
    || text.match(/age[:\s]+(\d{2})/i)
    || text.match(/i\s+am\s+(\d{2})/i);
  if (match) {
    const age = parseInt(match[1]);
    if (age >= 16 && age <= 75) return age;
  }
  return null;
}

/**
 * Extracts purpose from text.
 * @param {string} text
 * @returns {string|null}
 */
function extractPurpose(text) {
  if (/start|new|open|launch|shuru|naya/i.test(text))        return 'starting_business';
  if (/expand|grow|upgrade|badhana|vishtar/i.test(text))     return 'expansion';
  if (/working.?capital|stock|inventory|raqam/i.test(text))  return 'working_capital';
  if (/equipment|machine|tool|yantra/i.test(text))           return 'equipment_purchase';
  if (/education|study|college|school/i.test(text))          return 'education';
  if (/house|home|ghar|awas/i.test(text))                    return 'housing';
  return null;
}

// ─── Main Profile Builder ─────────────────────────────────────────────────────

/**
 * Extracts structured entities from free text using regex-based NLP.
 * This is used as a fallback / lightweight parser for the prototype.
 * In production, this would be replaced / augmented by Sarvam AI NLU output.
 *
 * @param {string} text - Raw user message (any language if romanized, otherwise English)
 * @returns {Partial<BeneficiaryProfile>}
 */
export function extractFromText(text) {
  if (!text) return {};

  const extracted = {};

  const amounts = [];
  for (const { pattern, multiplier, clean } of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let numStr = match[1];
      if (clean) numStr = numStr.replace(/,/g, '');
      const val = parseFloat(numStr) * multiplier;
      if (!isNaN(val) && val > 0) amounts.push(Math.round(val));
    }
  }

  if (amounts.length > 0) {
    // If two amounts mentioned, larger = project_cost, smaller or equal = loan_required
    const sortedAmounts = [...amounts].sort((a, b) => b - a);
    extracted.project_cost  = sortedAmounts[0];
    extracted.loan_required = sortedAmounts[sortedAmounts.length - 1];
  }

  const activityInfo = extractActivity(text);
  if (activityInfo) {
    extracted.activity          = activityInfo.activity;
    extracted.activity_category = activityInfo.activity_category;
  }

  const state = extractState(text);
  if (state) extracted.state = state;

  const category = extractSocialCategory(text);
  if (category) extracted.social_category = category;

  const gender = extractGender(text);
  if (gender) extracted.gender = gender;

  const age = extractAge(text);
  if (age) extracted.age = age;

  const purpose = extractPurpose(text);
  if (purpose) extracted.purpose = purpose;

  // Urban/Rural detection
  if (/\burban\b|city|town|nagar|sheher/i.test(text))  extracted.area_type = 'urban';
  if (/\brural\b|village|gaon|gram\b/i.test(text))     extracted.area_type = 'rural';

  // Existing business detection
  if (/existing|already|pehle se|running|established/i.test(text)) extracted.existing_business = true;
  if (/new business|start.?up|shuru karna|naya/i.test(text))       extracted.existing_business = false;

  return extracted;
}

/**
 * Merges NLP-extracted entities into an existing session profile.
 * Session data takes lower priority than freshly extracted data.
 *
 * @param {Partial<BeneficiaryProfile>} sessionProfile - Accumulated session data
 * @param {Partial<BeneficiaryProfile>} extracted      - Freshly extracted from current message
 * @param {string} channel
 * @param {string} languageCode
 * @param {string} sessionId
 * @returns {BeneficiaryProfile}
 */
export function buildProfile(sessionProfile = {}, extracted = {}, channel = 'whatsapp', languageCode = 'en-IN', sessionId = '') {
  // Fresh extracted data overrides session data for the same field
  const merged = {
    // Identity defaults
    age:               null,
    gender:            null,
    social_category:   null,
    disability:        null,

    // Location defaults
    state:             null,
    district:          null,
    area_type:         null,

    // Economic defaults
    income_annual:     null,
    existing_loans:    null,

    // Business defaults
    activity:          null,
    activity_category: null,
    existing_business: null,
    business_age_years: null,
    employees_count:   null,

    // Financial need defaults
    project_cost:      null,
    loan_required:     null,
    purpose:           null,

    // Channel metadata
    channel,
    language_code:     languageCode,
    session_id:        sessionId,

    // Apply session first
    ...sessionProfile,

    // Apply fresh extraction (overrides session for non-null values)
    ...Object.fromEntries(
      Object.entries(extracted).filter(([, v]) => v !== null && v !== undefined)
    ),
  };

  return merged;
}

/**
 * Returns a list of fields that are still needed for a complete profile.
 * @param {BeneficiaryProfile} profile
 * @returns {string[]}
 */
export function getMissingCriticalFields(profile) {
  const critical = ['activity', 'project_cost'];
  const important = ['state', 'social_category', 'income_annual'];
  const missing = [];

  for (const f of critical) {
    if (profile[f] === null || profile[f] === undefined) missing.push(f);
  }
  for (const f of important) {
    if (profile[f] === null || profile[f] === undefined) missing.push(f);
  }
  return missing;
}

export default { extractFromText, buildProfile, getMissingCriticalFields };
