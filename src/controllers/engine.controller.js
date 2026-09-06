/**
 * SAARTHI-SETU — Rule Engine REST Controller
 *
 * Handles HTTP requests for the Deterministic Rule Engine API.
 * All channels (Web, Mobile, IVR, SMS gateway) can call these endpoints.
 *
 * Endpoints:
 *   POST /api/v1/match          → Run scheme matching for a beneficiary profile
 *   GET  /api/v1/schemes        → List all schemes (optional ?category= filter)
 *   GET  /api/v1/scheme/:id     → Get single scheme details
 *   POST /api/v1/simulate       → Run financial simulation only
 *   GET  /api/v1/health         → Engine health check
 */

import { matchSchemes, getSchemeById, listSchemes } from '../engine/rule.engine.js';
import { simulate }                                 from '../engine/financial.simulator.js';
import { generateChecklist }                        from '../engine/document.generator.js';
import { extractFromText, buildProfile }            from '../services/profile.builder.js';

// ─── Input Validator ──────────────────────────────────────────────────────────

/**
 * Validates and sanitises a raw BeneficiaryProfile from request body.
 * @param {object} raw
 * @returns {{ profile: object|null, errors: string[] }}
 */
function validateProfile(raw) {
  const errors = [];

  if (!raw || typeof raw !== 'object') {
    return { profile: null, errors: ['Request body must be a JSON object.'] };
  }

  // Type checks for numeric fields
  const numericFields = ['age', 'income_annual', 'project_cost', 'loan_required', 'business_age_years', 'employees_count'];
  for (const f of numericFields) {
    if (raw[f] !== undefined && raw[f] !== null && typeof raw[f] !== 'number') {
      errors.push(`Field "${f}" must be a number or null.`);
    }
    if (typeof raw[f] === 'number' && raw[f] < 0) {
      errors.push(`Field "${f}" must be non-negative.`);
    }
  }

  // Gender
  if (raw.gender) raw.gender = String(raw.gender).toUpperCase();
  if (raw.gender && !['M', 'F', 'O'].includes(raw.gender)) {
    errors.push('Field "gender" must be one of: M, F, O.');
  }

  // Social category
  const validCategories = ['SC', 'ST', 'OBC', 'GEN', 'MINORITY', 'EWS', 'PWD'];
  if (raw.social_category) raw.social_category = String(raw.social_category).toUpperCase();
  if (raw.social_category && !validCategories.includes(raw.social_category)) {
    errors.push(`Field "social_category" must be one of: ${validCategories.join(', ')}.`);
  }

  // Channel
  const validChannels = ['whatsapp', 'ivr', 'sms', 'web', 'mobile', 'csc'];
  if (raw.channel) raw.channel = String(raw.channel).toLowerCase();
  if (raw.channel && !validChannels.includes(raw.channel)) {
    errors.push(`Field "channel" must be one of: ${validChannels.join(', ')}.`);
  }

  // Area type
  if (raw.area_type && !['urban', 'rural'].includes(raw.area_type)) {
    errors.push('Field "area_type" must be "urban" or "rural".');
  }

  if (errors.length > 0) return { profile: null, errors };

  // Build sanitised profile
  const profile = {
    age:               raw.age               ?? null,
    gender:            raw.gender            ?? null,
    social_category:   raw.social_category   ?? null,
    disability:        raw.disability        ?? null,
    state:             raw.state             ?? null,
    district:          raw.district          ?? null,
    area_type:         raw.area_type         ?? null,
    income_annual:     raw.income_annual     ?? null,
    existing_loans:    raw.existing_loans    ?? null,
    activity:          raw.activity          ?? null,
    activity_category: raw.activity_category ?? null,
    existing_business: raw.existing_business ?? null,
    business_age_years: raw.business_age_years ?? null,
    employees_count:   raw.employees_count   ?? null,
    project_cost:      raw.project_cost      ?? null,
    loan_required:     raw.loan_required     ?? null,
    purpose:           raw.purpose           ?? null,
    channel:           raw.channel           || 'web',
    language_code:     raw.language_code     || 'en-IN',
    session_id:        raw.session_id        || `api_${Date.now()}`,
  };

  return { profile, errors: [] };
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/match
 * Runs the complete scheme matching pipeline for a beneficiary profile.
 *
 * Body: BeneficiaryProfile (structured) OR { text: "...", channel: "...", language_code: "..." }
 * Options: { topN, nearMissN, simulate, documents, weights }
 */
export async function handleMatch(req, res) {
  try {
    const body = req.body || {};

    let rawProfile;

    // Support text-based input (for quick integration from chatbots)
    if (body.text && typeof body.text === 'string') {
      const extracted = extractFromText(body.text);
      rawProfile = buildProfile(
        {},
        extracted,
        body.channel || 'web',
        body.language_code || 'en-IN',
        body.session_id || `txt_${Date.now()}`
      );
    } else {
      rawProfile = body.profile || body;
    }

    // Validate
    const { profile, errors } = validateProfile(rawProfile);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        hint: 'Provide a valid BeneficiaryProfile object or a { text, channel, language_code } object.',
      });
    }

    // Engine options
    const options = {
      topN:      parseInt(body.topN)      || 5,
      nearMissN: parseInt(body.nearMissN) || 3,
      simulate:  body.simulate  !== false,
      documents: body.documents !== false,
      weights:   body.weights   || undefined,
    };

    const startTime = Date.now();
    const result = await matchSchemes(profile, options);
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      duration_ms: duration,
      ...result,
    });

  } catch (err) {
    console.error('[EngineController] handleMatch error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error in rule engine.',
      message: err.message,
    });
  }
}

/**
 * GET /api/v1/schemes
 * Returns the full list of schemes, optionally filtered by category.
 * Query params: ?category=Agriculture, ?active=true
 */
export async function handleListSchemes(req, res) {
  try {
    const { category, active } = req.query;
    let schemes = await listSchemes(category);

    if (active === 'true') {
      schemes = schemes.filter(s => s.metadata?.active);
    }

    return res.status(200).json({
      success: true,
      count:   schemes.length,
      schemes: schemes.map(s => ({
        scheme_id:   s.scheme_id,
        name:        s.name,
        short_name:  s.short_name,
        ministry:    s.ministry,
        category:    s.category,
        description: s.description,
        active:      s.metadata?.active ?? true,
        max_amount:  s.financing?.max_amount,
        tags:        s.tags,
      })),
    });
  } catch (err) {
    console.error('[EngineController] handleListSchemes error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/scheme/:id
 * Returns full details for a single scheme.
 */
export async function handleGetScheme(req, res) {
  try {
    const { id } = req.params;
    const scheme = await getSchemeById(id);

    if (!scheme) {
      return res.status(404).json({ success: false, error: `Scheme "${id}" not found.` });
    }

    return res.status(200).json({ success: true, scheme });
  } catch (err) {
    console.error('[EngineController] handleGetScheme error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/simulate
 * Runs financial simulation for a specific scheme + profile combination.
 * Body: { scheme_id: "SCHEME_001", profile: { project_cost, loan_required, ... } }
 */
export async function handleSimulate(req, res) {
  try {
    const { scheme_id, profile: rawProfile } = req.body || {};

    if (!scheme_id) {
      return res.status(400).json({ success: false, error: '"scheme_id" is required.' });
    }

    const scheme = await getSchemeById(scheme_id);
    if (!scheme) {
      return res.status(404).json({ success: false, error: `Scheme "${scheme_id}" not found.` });
    }

    const { profile, errors } = validateProfile(rawProfile || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const simulation = simulate(profile, scheme);
    const documents  = generateChecklist(profile, scheme);

    return res.status(200).json({
      success: true,
      scheme_id,
      scheme_name: scheme.name,
      simulation,
      documents,
    });
  } catch (err) {
    console.error('[EngineController] handleSimulate error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/engine/health
 * Health check for the rule engine — confirms DB loaded correctly.
 */
export async function handleEngineHealth(req, res) {
  try {
    const schemes = await listSchemes();
    return res.status(200).json({
      success: true,
      status:  'healthy',
      schemes_loaded: schemes.length,
      active_schemes: schemes.filter(s => s.metadata?.active).length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, status: 'unhealthy', error: err.message });
  }
}

export default {
  handleMatch,
  handleListSchemes,
  handleGetScheme,
  handleSimulate,
  handleEngineHealth,
};
