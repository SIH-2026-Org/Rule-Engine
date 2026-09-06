/**
 * SAARTHI-SETU — Deterministic Rule Engine (Public API)
 *
 * This is the SINGLE entry point for ALL channels:
 *   - WhatsApp Chatbot
 *   - IVR (Voice)
 *   - SMS
 *   - Web / PWA
 *   - Mobile App (Android/iOS)
 *   - CSC / Assisted Access
 *
 * Usage:
 *   import { matchSchemes } from './rule.engine.js';
 *   const result = await matchSchemes(beneficiaryProfile);
 *
 * The engine:
 *   1. Loads the scheme database
 *   2. Runs deterministic eligibility evaluation on ALL active schemes
 *   3. Scores and ranks eligible schemes
 *   4. Runs financial simulation for top schemes
 *   5. Generates document checklists for top schemes
 *   6. Returns a structured MatchResult
 *
 * AI/LLM is NOT involved in eligibility decisions.
 * All decisions are deterministic, reproducible, and auditable.
 */

import { evaluateAllSchemes, ELIGIBLE, NEEDS_MORE_INFO, NOT_ELIGIBLE } from './eligibility.engine.js';
import { scoreScheme, rankScores, DEFAULT_WEIGHTS }                     from './scoring.engine.js';
import { simulate }                                                     from './financial.simulator.js';
import { generateChecklist }                                            from './document.generator.js';

// Lazy-loaded scheme database (loaded once on first call)
let _schemesCache = null;

/**
 * Loads the scheme database. Cached after first load.
 * @returns {Promise<import('./scheme.schema.js').Scheme[]>}
 */
async function loadSchemes() {
  if (_schemesCache) return _schemesCache;
  try {
    const { SCHEMES } = await import('./schemes.db.js');
    _schemesCache = SCHEMES;
    console.log(`[RuleEngine] Loaded ${_schemesCache.length} schemes from database.`);
    return _schemesCache;
  } catch (err) {
    console.error('[RuleEngine] Failed to load schemes database:', err.message);
    return [];
  }
}

// ─── BeneficiaryProfile Type ──────────────────────────────────────────────────
/**
 * @typedef {Object} BeneficiaryProfile
 *
 * IDENTITY
 * @property {number|null}                                age              - Age in years.
 * @property {'M'|'F'|'O'|null}                          gender           - Gender: M/F/O.
 * @property {'SC'|'ST'|'OBC'|'GEN'|'MINORITY'|'EWS'|'PWD'|null} social_category - Social category.
 * @property {boolean|null}                               disability       - Is Person with Disability?
 *
 * LOCATION
 * @property {string|null}                                state            - Indian state name (English).
 * @property {string|null}                                district         - District name.
 * @property {'urban'|'rural'|null}                       area_type        - Urban or rural area.
 *
 * ECONOMIC
 * @property {number|null}                                income_annual    - Annual family income (INR).
 * @property {boolean|null}                               existing_loans   - Has existing loans?
 *
 * BUSINESS / ACTIVITY
 * @property {string|null}                                activity         - Business activity (e.g. "dairy").
 * @property {string|null}                                activity_category- Category: agriculture/msme/education/services.
 * @property {boolean|null}                               existing_business - Does business already exist?
 * @property {number|null}                                business_age_years - How many years in business.
 * @property {number|null}                                employees_count  - Number of employees.
 *
 * FINANCIAL NEED
 * @property {number|null}                                project_cost     - Total estimated project cost (INR).
 * @property {number|null}                                loan_required    - Loan amount requested (INR).
 * @property {string|null}                                purpose          - Purpose: starting_business/expansion/working_capital.
 *
 * CHANNEL METADATA
 * @property {'whatsapp'|'ivr'|'sms'|'web'|'mobile'|'csc'} channel       - Source channel.
 * @property {string}                                     language_code    - Sarvam language code (e.g. 'hi-IN').
 * @property {string}                                     session_id       - Unique session identifier.
 */

// ─── Match Result Types ───────────────────────────────────────────────────────
/**
 * @typedef {Object} MatchedScheme
 * @property {number}   rank
 * @property {import('./scheme.schema.js').Scheme} scheme
 * @property {import('./eligibility.engine.js').EligibilityResult} eligibility
 * @property {import('./scoring.engine.js').SchemeScore} score
 * @property {import('./financial.simulator.js').FinancialSimulation} simulation
 * @property {import('./document.generator.js').DocumentChecklist} documents
 */

/**
 * @typedef {Object} MatchResult
 * @property {'OK'|'NEEDS_MORE_INFO'|'NO_MATCH'|'ERROR'} status
 * @property {string[]}        missing_fields       - Fields needed to improve results.
 * @property {string[]}        clarification_questions - Human-readable questions for missing fields.
 * @property {MatchedScheme[]} eligible_schemes     - Ranked fully-eligible schemes.
 * @property {MatchedScheme[]} partial_schemes      - Ranked partial-match schemes (missing info).
 * @property {Object[]}        near_miss_schemes    - Top ineligible schemes with failure reasons.
 * @property {Object}          profile_summary      - Echo of what was understood from the profile.
 * @property {string}          summary_text         - Plain-text summary for text channels.
 * @property {number}          total_schemes_checked
 */

// ─── Missing Field Detector ───────────────────────────────────────────────────

const CLARIFICATION_QUESTIONS = {
  age:               'How old are you? (Please share your age in years)',
  gender:            'What is your gender? (Male / Female / Other)',
  social_category:   'What is your social category? (General / SC / ST / OBC / Minority / EWS)',
  state:             'Which state do you live in?',
  area_type:         'Do you live in an urban area (town/city) or a rural area (village)?',
  income_annual:     'What is your approximate annual family income? (in rupees)',
  activity:          'What type of business or work are you planning to do?',
  project_cost:      'What is the estimated total cost of your project? (in rupees)',
  existing_business: 'Do you already have an existing business, or are you starting a new one?',
  loan_required:     'How much loan amount do you need? (in rupees)',
};

/**
 * Identifies which profile fields are missing that would improve results.
 * @param {BeneficiaryProfile} profile
 * @param {string[]} missingFromEngine - Fields flagged as missing by eligibility engine
 * @returns {{ fields: string[], questions: string[] }}
 */
function detectMissingFields(profile, missingFromEngine) {
  const CRITICAL_FIELDS = ['activity', 'project_cost', 'state'];
  const fields    = [];
  const questions = [];

  // Always check critical fields first
  for (const f of CRITICAL_FIELDS) {
    if ((profile[f] === null || profile[f] === undefined) && !fields.includes(f)) {
      fields.push(f);
      if (CLARIFICATION_QUESTIONS[f]) questions.push(CLARIFICATION_QUESTIONS[f]);
    }
  }

  // Add engine-detected missing fields
  for (const rule of missingFromEngine) {
    const fieldName = rule.replace('custom_', '');
    if (!fields.includes(fieldName) && CLARIFICATION_QUESTIONS[fieldName]) {
      fields.push(fieldName);
      questions.push(CLARIFICATION_QUESTIONS[fieldName]);
    }
  }

  return { fields, questions };
}

// ─── Summary Text Builder ─────────────────────────────────────────────────────

/**
 * Builds a plain-text summary of the top match result.
 * Suitable for WhatsApp, SMS, IVR TTS.
 * @param {MatchedScheme[]} topSchemes
 * @param {string} status
 * @returns {string}
 */
function buildSummaryText(topSchemes, status) {
  if (status === 'NO_MATCH') {
    return '❌ No suitable government scheme was found matching your profile at this time. Please share more details or contact your nearest CSC centre for assistance.';
  }
  if (status === 'NEEDS_MORE_INFO' && topSchemes.length === 0) {
    return '⚠️ We need a few more details to find the best scheme for you. Please answer the questions above.';
  }

  const lines = ['🎯 Top Scheme Recommendations:\n'];
  topSchemes.slice(0, 3).forEach((ms, i) => {
    const { scheme, score } = ms;
    lines.push(`${i + 1}. *${scheme.name}*`);
    lines.push(`   Ministry: ${scheme.ministry}`);
    lines.push(`   Score: ${score.total_score}/100`);
    if (score.reasons.length > 0) {
      lines.push(`   ${score.reasons.slice(0, 2).join(' | ')}`);
    }
    if (ms.simulation?.available && ms.simulation.emi_monthly > 0) {
      lines.push(`   Est. EMI: ₹${ms.simulation.emi_monthly.toLocaleString('en-IN')}/month`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

// ─── Main Engine Function ─────────────────────────────────────────────────────

/**
 * Core entry point for all channels.
 * Deterministically matches a beneficiary profile to government schemes.
 *
 * @param {BeneficiaryProfile} profile    - Structured user profile from NLP/form/session.
 * @param {Object} [options]              - Optional overrides.
 * @param {typeof DEFAULT_WEIGHTS} [options.weights]   - Custom scoring weights.
 * @param {number} [options.topN=5]       - Max number of results to return.
 * @param {number} [options.nearMissN=3]  - Number of near-miss (ineligible) results to include.
 * @param {boolean} [options.simulate=true] - Whether to run financial simulation.
 * @param {boolean} [options.documents=true] - Whether to generate document checklists.
 * @returns {Promise<MatchResult>}
 */
export async function matchSchemes(profile, options = {}) {
  const {
    weights   = DEFAULT_WEIGHTS,
    topN      = 5,
    nearMissN = 3,
    simulate: runSim = true,
    documents: runDocs = true,
  } = options;

  // 1. Load scheme database
  const schemes = await loadSchemes();
  if (schemes.length === 0) {
    return {
      status: 'ERROR',
      missing_fields: [],
      clarification_questions: [],
      eligible_schemes: [],
      partial_schemes: [],
      near_miss_schemes: [],
      profile_summary: profile,
      summary_text: '⚠️ Scheme database unavailable. Please try again later.',
      total_schemes_checked: 0,
    };
  }

  // 2. Run deterministic eligibility evaluation across all active schemes
  const { eligible, partial, ineligible } = evaluateAllSchemes(profile, schemes);

  // 3. Collect all missing field names from partial results
  const allMissingRules = partial.flatMap(r => r.missing.map(m => m.rule));
  const { fields: missingFields, questions: clarificationQs } =
    detectMissingFields(profile, allMissingRules);

  // 4. Score and rank eligible schemes
  const eligibleScored = eligible.map(er => {
    const scheme = er._scheme;
    const score  = scoreScheme(profile, scheme, er, weights);
    return { eligibilityResult: er, scheme, score };
  });
  const eligibleRanked = rankScores(eligibleScored.map(e => e.score))
    .map((score, idx) => {
      const match = eligibleScored.find(e => e.score.scheme_id === score.scheme_id);
      return { rank: idx + 1, score, scheme: match.scheme, eligibility: match.eligibilityResult };
    });

  // 5. Score and rank partial schemes (may still be useful)
  const partialScored = partial.map(er => {
    const scheme = er._scheme;
    const score  = scoreScheme(profile, scheme, er, weights);
    return { eligibilityResult: er, scheme, score };
  });
  const partialRanked = rankScores(partialScored.map(e => e.score))
    .map((score, idx) => {
      const match = partialScored.find(e => e.score.scheme_id === score.scheme_id);
      return { rank: idx + 1, score, scheme: match.scheme, eligibility: match.eligibilityResult };
    });

  // 6. Build near-miss list from ineligible (top N by most rules passed)
  const nearMisses = ineligible
    .sort((a, b) => b.passed.length - a.passed.length)
    .slice(0, nearMissN)
    .map(er => ({
      scheme:      er._scheme,
      eligibility: er,
      failure_reasons: er.failed.map(f => f.message),
    }));

  // 7. Attach simulation + document checklist to top results
  const topEligible = eligibleRanked.slice(0, topN);
  const topPartial  = partialRanked.slice(0, Math.max(0, topN - topEligible.length));

  const attachExtras = async (matchedSchemes) => {
    return matchedSchemes.map(ms => ({
      ...ms,
      simulation: runSim  ? simulate(profile, ms.scheme)               : null,
      documents:  runDocs ? generateChecklist(profile, ms.scheme)       : null,
      partner_types: ms.scheme.channel_partners?.types ?? [],
    }));
  };

  const enrichedEligible = await attachExtras(topEligible);
  const enrichedPartial  = await attachExtras(topPartial);

  // 8. Determine overall status
  let status;
  if (enrichedEligible.length > 0) {
    status = 'OK';
  } else if (enrichedPartial.length > 0 || missingFields.length > 0) {
    status = 'NEEDS_MORE_INFO';
  } else {
    status = 'NO_MATCH';
  }

  // 9. Build profile echo summary
  const profileSummary = {
    understood: {
      activity:        profile.activity        || 'not provided',
      project_cost:    profile.project_cost    ? `₹${profile.project_cost.toLocaleString('en-IN')}` : 'not provided',
      location:        profile.state           || 'not provided',
      social_category: profile.social_category || 'not provided',
      age:             profile.age             || 'not provided',
      income_annual:   profile.income_annual   ? `₹${profile.income_annual.toLocaleString('en-IN')}` : 'not provided',
    },
    channel: profile.channel,
    language: profile.language_code,
  };

  return {
    status,
    missing_fields:          missingFields,
    clarification_questions: clarificationQs,
    eligible_schemes:        enrichedEligible,
    partial_schemes:         enrichedPartial,
    near_miss_schemes:       nearMisses,
    profile_summary:         profileSummary,
    summary_text:            buildSummaryText(enrichedEligible.length > 0 ? enrichedEligible : enrichedPartial, status),
    total_schemes_checked:   schemes.filter(s => s.metadata?.active).length,
  };
}

/**
 * Returns a single scheme's full details by scheme_id.
 * Useful for /api/v1/scheme/:id endpoint.
 * @param {string} schemeId
 * @returns {Promise<import('./scheme.schema.js').Scheme|null>}
 */
export async function getSchemeById(schemeId) {
  const schemes = await loadSchemes();
  return schemes.find(s => s.scheme_id === schemeId) || null;
}

/**
 * Returns all schemes (optionally filtered by category).
 * Useful for /api/v1/schemes endpoint.
 * @param {string} [category]
 * @returns {Promise<import('./scheme.schema.js').Scheme[]>}
 */
export async function listSchemes(category) {
  const schemes = await loadSchemes();
  if (category) {
    return schemes.filter(s => s.category?.toLowerCase() === category.toLowerCase());
  }
  return schemes;
}

/**
 * Clears the in-memory scheme cache. Useful for testing or after DB updates.
 */
export function clearSchemeCache() {
  _schemesCache = null;
}

export default { matchSchemes, getSchemeById, listSchemes, clearSchemeCache };
