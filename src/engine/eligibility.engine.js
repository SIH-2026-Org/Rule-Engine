/**
 * SAARTHI-SETU — Deterministic Eligibility Engine
 *
 * Pure function evaluator. No I/O, no side effects.
 * Takes a BeneficiaryProfile + a Scheme and returns a deterministic
 * eligibility result with full pass/fail/missing breakdown.
 *
 * Channel-agnostic: used by WhatsApp, IVR, SMS, Web, Mobile.
 */

// ─── Result Status Constants ──────────────────────────────────────────────────
export const ELIGIBLE         = 'ELIGIBLE';
export const NOT_ELIGIBLE     = 'NOT_ELIGIBLE';
export const NEEDS_MORE_INFO  = 'NEEDS_MORE_INFO';

// ─── Custom Rule Operators ────────────────────────────────────────────────────
const OPERATORS = {
  gt:      (a, b) => a >  b,
  gte:     (a, b) => a >= b,
  lt:      (a, b) => a <  b,
  lte:     (a, b) => a <= b,
  eq:      (a, b) => a === b,
  neq:     (a, b) => a !== b,
  in:      (a, b) => Array.isArray(b) && b.map(s => String(s).toLowerCase()).includes(String(a).toLowerCase()),
  not_in:  (a, b) => Array.isArray(b) && !b.map(s => String(s).toLowerCase()).includes(String(a).toLowerCase()),
  between: (a, b) => Array.isArray(b) && b.length === 2 && a >= b[0] && a <= b[1],
};

/**
 * Normalises a string value for comparison (lowercase, trimmed).
 * @param {*} val
 * @returns {string}
 */
function norm(val) {
  return val == null ? '' : String(val).toLowerCase().trim();
}

/**
 * Checks whether two activity strings match. Supports partial/synonym matching
 * for common Indian business activity terms.
 * @param {string} profileActivity  - e.g. "dairy farming"
 * @param {string} schemeActivity   - e.g. "dairy"
 * @returns {boolean}
 */
function activitiesMatch(profileActivity, schemeActivity) {
  const p = norm(profileActivity);
  const s = norm(schemeActivity);
  if (!p || !s) return false;
  if (p === s) return true;
  if (p.includes(s) || s.includes(p)) return true;

  // Synonym map for common activity aliases
  const SYNONYMS = {
    dairy:        ['dairy', 'milk', 'cattle', 'cow', 'buffalo', 'gau', 'dugdh'],
    poultry:      ['poultry', 'chicken', 'broiler', 'layer', 'egg'],
    agriculture:  ['agriculture', 'farming', 'crop', 'khet', 'kisaan', 'kisan'],
    fishery:      ['fish', 'fishery', 'fisheries', 'aquaculture', 'machli'],
    retail:       ['retail', 'shop', 'dukan', 'store', 'trader', 'trading'],
    street_vending: ['street', 'vending', 'vendor', 'rehdi', 'thela', 'hawker'],
    tailoring:    ['tailoring', 'tailor', 'sewing', 'stitching', 'garment'],
    weaving:      ['weaving', 'weaver', 'handloom', 'loom', 'bunkar'],
    food:         ['food', 'food processing', 'catering', 'restaurant', 'dhaba', 'bakery'],
    beauty:       ['beauty', 'salon', 'parlour', 'parlor', 'barbershop'],
    transport:    ['transport', 'taxi', 'auto', 'rickshaw', 'logistics'],
    construction: ['construction', 'carpenter', 'plumber', 'mason', 'electrician'],
    handicraft:   ['handicraft', 'craft', 'artisan', 'pottery', 'sculpture'],
    electronics:  ['electronics', 'repair', 'mobile repair', 'computer'],
    manufacturing:['manufacturing', 'production', 'factory', 'unit'],
    education:    ['education', 'tuition', 'coaching', 'school', 'college'],
    health:       ['health', 'clinic', 'pharmacy', 'medical'],
  };

  for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
    const pMatches = aliases.some(alias => p.includes(alias));
    const sMatches = aliases.some(alias => s.includes(alias)) || s === canonical;
    if (pMatches && sMatches) return true;
  }
  return false;
}

/**
 * Checks if a user's state matches scheme's location rules.
 * @param {string|null} userState
 * @param {import('./scheme.schema.js').LocationRule|null} locationRule
 * @returns {{ pass: boolean, missing: boolean }}
 */
function checkLocation(userState, locationRule) {
  if (!locationRule) return { pass: true, missing: false };
  const { states } = locationRule;
  if (!states || states.includes('all') || states.length === 0) return { pass: true, missing: false };
  if (!userState) return { pass: true, missing: true }; // Can't determine — don't block
  const normState = norm(userState);
  const pass = states.some(s => norm(s) === normState || norm(s).includes(normState) || normState.includes(norm(s)));
  return { pass, missing: false };
}

// ─── Individual Rule Evaluators ───────────────────────────────────────────────

function evalAge(profile, eligibility) {
  const { age } = profile;
  const rule = eligibility.age;
  if (!rule) return null; // No restriction

  if (age === null || age === undefined) {
    return { rule: 'age', status: 'missing', message: 'Age not provided — required to verify eligibility.' };
  }
  const { min, max } = rule;
  const passMin = (min === null) || (age >= min);
  const passMax = (max === null) || (age <= max);
  if (passMin && passMax) {
    return { rule: 'age', status: 'pass', message: `Age ${age} is within eligible range (${min ?? ''}–${max ?? ''} years).` };
  }
  return {
    rule: 'age', status: 'fail',
    message: `Age ${age} does not meet requirement: must be between ${min ?? 'any'} and ${max ?? 'any'} years.`,
  };
}

function evalIncome(profile, eligibility) {
  const rule = eligibility.income_annual;
  if (!rule) return null;

  const { income_annual } = profile;
  if (income_annual === null || income_annual === undefined) {
    return { rule: 'income_annual', status: 'missing', message: 'Annual family income not provided — required to verify eligibility.' };
  }
  const passMax = (rule.max === null) || (income_annual <= rule.max);
  const passMin = (rule.min === null) || (income_annual >= rule.min);
  if (passMax && passMin) {
    return {
      rule: 'income_annual', status: 'pass',
      message: `Annual income ₹${income_annual.toLocaleString('en-IN')} meets requirement${rule.max ? ` (max ₹${rule.max.toLocaleString('en-IN')})` : ''}.`,
    };
  }
  return {
    rule: 'income_annual', status: 'fail',
    message: `Annual income ₹${income_annual.toLocaleString('en-IN')} exceeds the scheme limit of ₹${rule.max?.toLocaleString('en-IN') ?? 'N/A'}.`,
  };
}

function evalGender(profile, eligibility) {
  const rule = eligibility.gender;
  if (!rule || rule.length === 0) return null;

  const { gender } = profile;
  if (!gender) {
    return { rule: 'gender', status: 'missing', message: 'Gender not provided — required for this scheme.' };
  }
  if (rule.map(norm).includes(norm(gender))) {
    return { rule: 'gender', status: 'pass', message: `Gender "${gender}" is eligible for this scheme.` };
  }
  return {
    rule: 'gender', status: 'fail',
    message: `This scheme is only for: ${rule.join(', ')}. Your gender (${gender}) is not eligible.`,
  };
}

function evalSocialCategory(profile, eligibility) {
  const rule = eligibility.social_categories;
  if (!rule || rule.length === 0) return null;

  const { social_category } = profile;
  if (!social_category) {
    return { rule: 'social_category', status: 'missing', message: 'Social category (SC/ST/OBC/GEN) not provided — required for this scheme.' };
  }
  if (rule.map(norm).includes(norm(social_category))) {
    return { rule: 'social_category', status: 'pass', message: `Category "${social_category}" is eligible for this scheme.` };
  }
  return {
    rule: 'social_category', status: 'fail',
    message: `This scheme is reserved for: ${rule.join(', ')}. Your category (${social_category}) is not eligible.`,
  };
}

function evalActivity(profile, eligibility) {
  const rule = eligibility.activities;
  if (!rule || rule.length === 0) return null;

  const { activity } = profile;
  if (!activity) {
    return { rule: 'activity', status: 'missing', message: 'Business activity not provided — required to match scheme.' };
  }
  const matched = rule.some(a => activitiesMatch(activity, a));
  if (matched) {
    return { rule: 'activity', status: 'pass', message: `Business activity "${activity}" is supported by this scheme.` };
  }
  return {
    rule: 'activity', status: 'fail',
    message: `Activity "${activity}" is not covered. Scheme supports: ${rule.join(', ')}.`,
  };
}

function evalActivityCategory(profile, eligibility) {
  const rule = eligibility.activity_categories;
  if (!rule || rule.length === 0) return null;

  const { activity_category } = profile;
  if (!activity_category) return null; // Soft check — activity field handles it

  const matched = rule.map(norm).includes(norm(activity_category));
  if (matched) {
    return { rule: 'activity_category', status: 'pass', message: `Activity category "${activity_category}" is supported.` };
  }
  return {
    rule: 'activity_category', status: 'fail',
    message: `Activity category "${activity_category}" not supported. Eligible categories: ${rule.join(', ')}.`,
  };
}

function evalLocation(profile, eligibility) {
  const locationRule = eligibility.location;
  if (!locationRule) return null;

  const { state, area_type } = profile;
  const results = [];

  // State check
  const { pass: statePass, missing: stateMissing } = checkLocation(state, locationRule);
  if (stateMissing) {
    results.push({ rule: 'location_state', status: 'missing', message: 'State not provided — needed to confirm geographic eligibility.' });
  } else if (!statePass) {
    results.push({
      rule: 'location_state', status: 'fail',
      message: `State "${state}" is not in the eligible states for this scheme: ${locationRule.states?.join(', ')}.`,
    });
  } else if (state) {
    results.push({ rule: 'location_state', status: 'pass', message: `State "${state}" is eligible for this scheme.` });
  }

  // Urban/Rural check
  if (locationRule.urban_only && area_type && norm(area_type) !== 'urban') {
    results.push({ rule: 'location_area', status: 'fail', message: 'This scheme is only for urban areas.' });
  } else if (locationRule.rural_only && area_type && norm(area_type) !== 'rural') {
    results.push({ rule: 'location_area', status: 'fail', message: 'This scheme is only for rural areas.' });
  } else if (locationRule.urban_only || locationRule.rural_only) {
    const required = locationRule.urban_only ? 'urban' : 'rural';
    if (!area_type) {
      results.push({ rule: 'location_area', status: 'missing', message: `Area type (urban/rural) required — scheme is ${required}-only.` });
    } else {
      results.push({ rule: 'location_area', status: 'pass', message: `Area type "${area_type}" is eligible.` });
    }
  }

  return results.length > 0 ? results : null;
}

function evalOccupation(profile, eligibility) {
  const rule = eligibility.occupation;
  if (!rule || rule.length === 0) return null;

  const { occupation } = profile;
  if (!occupation) return null; // Soft check

  if (rule.map(norm).includes(norm(occupation))) {
    return { rule: 'occupation', status: 'pass', message: `Occupation "${occupation}" is eligible.` };
  }
  return {
    rule: 'occupation', status: 'fail',
    message: `Occupation "${occupation}" is not eligible. Scheme is for: ${rule.join(', ')}.`,
  };
}

function evalExistingBusiness(profile, eligibility) {
  const rule = eligibility.existing_business;
  if (rule === null || rule === undefined) return null;

  const { existing_business } = profile;
  if (existing_business === null || existing_business === undefined) {
    const needed = rule ? 'an existing business' : 'a new/upcoming business';
    return { rule: 'existing_business', status: 'missing', message: `Please confirm: do you have an existing business? This scheme requires ${needed}.` };
  }
  if (existing_business === rule) {
    return { rule: 'existing_business', status: 'pass', message: `Business status (${existing_business ? 'existing' : 'new'}) meets scheme requirement.` };
  }
  return {
    rule: 'existing_business', status: 'fail',
    message: rule
      ? 'This scheme requires an already-operating business. New businesses are not eligible.'
      : 'This scheme is for new business start-ups. Existing businesses are not eligible.',
  };
}

function evalDisability(profile, eligibility) {
  const rule = eligibility.disability;
  if (rule === null || rule === undefined) return null;

  if (!rule) return null; // scheme doesn't require PwD
  const { disability } = profile;
  if (disability === null || disability === undefined) {
    return { rule: 'disability', status: 'missing', message: 'This scheme is for Persons with Disabilities (PwD). Please confirm disability status.' };
  }
  if (disability === true) {
    return { rule: 'disability', status: 'pass', message: 'PwD status confirmed — eligible for this scheme.' };
  }
  return { rule: 'disability', status: 'fail', message: 'This scheme is exclusively for Persons with Disabilities (PwD).' };
}

function evalProjectCost(profile, eligibility) {
  const { min_project_cost, max_project_cost } = eligibility;
  if (!min_project_cost && !max_project_cost) return null;

  const { project_cost } = profile;
  if (project_cost === null || project_cost === undefined) {
    return { rule: 'project_cost', status: 'missing', message: 'Project cost not provided — required to check financing eligibility.' };
  }
  const passMin = !min_project_cost || project_cost >= min_project_cost;
  const passMax = !max_project_cost || project_cost <= max_project_cost;
  if (passMin && passMax) {
    return {
      rule: 'project_cost', status: 'pass',
      message: `Project cost ₹${project_cost.toLocaleString('en-IN')} is within eligible range.`,
    };
  }
  return {
    rule: 'project_cost', status: 'fail',
    message: `Project cost ₹${project_cost.toLocaleString('en-IN')} is outside eligible range`
      + (min_project_cost ? ` (min: ₹${min_project_cost.toLocaleString('en-IN')})` : '')
      + (max_project_cost ? ` (max: ₹${max_project_cost.toLocaleString('en-IN')})` : '') + '.',
  };
}

function evalCustomRules(profile, eligibility) {
  const rules = eligibility.custom_rules;
  if (!rules || rules.length === 0) return null;

  const results = [];
  for (const cr of rules) {
    const { field, operator, value, message } = cr;
    const profileValue = profile[field];

    if (profileValue === null || profileValue === undefined) {
      results.push({ rule: `custom_${field}`, status: 'missing', message: message || `Field "${field}" is required for this scheme.` });
      continue;
    }

    const opFn = OPERATORS[operator];
    if (!opFn) {
      console.warn(`[EligibilityEngine] Unknown operator "${operator}" in custom rule for field "${field}"`);
      continue;
    }

    if (opFn(profileValue, value)) {
      results.push({ rule: `custom_${field}`, status: 'pass', message: message || `Custom rule "${field} ${operator} ${value}" passed.` });
    } else {
      results.push({ rule: `custom_${field}`, status: 'fail', message: message || `Custom rule failed: ${field} ${operator} ${value}.` });
    }
  }
  return results.length > 0 ? results : null;
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluates a single scheme against a beneficiary profile.
 *
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @returns {EligibilityResult}
 */
export function evaluateScheme(profile, scheme) {
  const { eligibility } = scheme;

  const rawResults = [
    evalAge(profile, eligibility),
    evalIncome(profile, eligibility),
    evalGender(profile, eligibility),
    evalSocialCategory(profile, eligibility),
    evalActivity(profile, eligibility),
    evalActivityCategory(profile, eligibility),
    evalLocation(profile, eligibility),
    evalOccupation(profile, eligibility),
    evalExistingBusiness(profile, eligibility),
    evalDisability(profile, eligibility),
    evalProjectCost(profile, eligibility),
    evalCustomRules(profile, eligibility),
  ];

  // Flatten — some evaluators return arrays (e.g. location)
  const allResults = rawResults.flat().filter(Boolean);

  const passed  = allResults.filter(r => r.status === 'pass');
  const failed  = allResults.filter(r => r.status === 'fail');
  const missing = allResults.filter(r => r.status === 'missing');

  // Determine overall status
  let status;
  if (failed.length > 0) {
    status = NOT_ELIGIBLE;
  } else if (missing.length > 0) {
    // Has missing info but no hard failures — partially eligible
    status = NEEDS_MORE_INFO;
  } else {
    status = ELIGIBLE;
  }

  // Confidence: % of applicable rules that passed
  const totalApplicable = passed.length + failed.length;
  const confidence = totalApplicable === 0 ? 50 : Math.round((passed.length / totalApplicable) * 100);

  return {
    scheme_id: scheme.scheme_id,
    status,
    passed,
    failed,
    missing,
    confidence,
    total_rules_checked: allResults.length,
  };
}

/**
 * Runs eligibility evaluation across ALL schemes in the database.
 *
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme[]} schemes
 * @returns {{ eligible: EligibilityResult[], partial: EligibilityResult[], ineligible: EligibilityResult[] }}
 */
export function evaluateAllSchemes(profile, schemes) {
  const eligible   = [];
  const partial    = [];
  const ineligible = [];

  for (const scheme of schemes) {
    if (!scheme.metadata?.active) continue; // Skip inactive schemes
    const result = evaluateScheme(profile, scheme);
    result._scheme = scheme; // Attach scheme reference for downstream use

    if (result.status === ELIGIBLE)        eligible.push(result);
    else if (result.status === NEEDS_MORE_INFO) partial.push(result);
    else                                   ineligible.push(result);
  }

  return { eligible, partial, ineligible };
}

export default { evaluateScheme, evaluateAllSchemes, ELIGIBLE, NOT_ELIGIBLE, NEEDS_MORE_INFO };
