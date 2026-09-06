/**
 * SAARTHI-SETU — Weighted Scoring & Ranking Engine
 *
 * Ranks eligible (and partial-eligible) schemes using a configurable
 * multi-factor weighted scoring model.
 *
 * Produces a total score (0–100) with a breakdown per dimension,
 * plus human-readable reason strings and warning strings.
 *
 * Channel-agnostic: output consumed by all channels.
 */

// ─── Default Scoring Weights (sum = 100) ─────────────────────────────────────
// These can be overridden per deployment via options.weights in matchSchemes().
export const DEFAULT_WEIGHTS = {
  eligibility_fit:       30,  // How many rules passed vs total applicable
  financial_fit:         25,  // How well financing covers the project cost
  activity_fit:          15,  // Specificity of activity match
  preference_fit:        10,  // User preference signals (category, purpose)
  channel_availability:  10,  // Breadth of partner network
  location_accessibility: 10, // Geographic coverage
};

/**
 * Clamps a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min = 0, max = 100) {
  return Math.min(max, Math.max(min, val));
}

/**
 * Scores eligibility fit: proportion of passed rules.
 * @param {import('./eligibility.engine.js').EligibilityResult} eligibilityResult
 * @param {number} weight
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scoreEligibilityFit(eligibilityResult, weight) {
  const { passed, failed, missing, confidence } = eligibilityResult;
  const reasons  = [];
  const warnings = [];

  // Base score = confidence * weight
  const score = clamp(Math.round((confidence / 100) * weight));

  for (const p of passed)  reasons.push(`✓ ${p.message}`);
  for (const f of failed)  warnings.push(`✗ ${f.message}`);
  for (const m of missing) warnings.push(`⚠ ${m.message}`);

  return { score, reasons, warnings };
}

/**
 * Scores how well the scheme's financing covers the user's project cost.
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @param {number} weight
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scoreFinancialFit(profile, scheme, weight) {
  const { project_cost, loan_required } = profile;
  const { financing } = scheme;
  const reasons  = [];
  const warnings = [];

  // If no cost info, give partial score
  if (!project_cost && !loan_required) {
    warnings.push('⚠ Project cost not provided — financial fit estimated at 50%.');
    return { score: Math.round(weight * 0.5), reasons, warnings };
  }

  const need = loan_required || project_cost;
  let score  = 0;

  // Check if scheme covers the required amount
  if (financing.max_amount === null) {
    // No cap — full marks
    score = weight;
    reasons.push(`✓ No upper financing limit — can cover ₹${need.toLocaleString('en-IN')}.`);
  } else if (need <= financing.max_amount) {
    // Fully covered — score proportional to how well it fits (not over-sized)
    const coverageRatio = need / financing.max_amount;
    // Best fit when ratio is 0.5–1.0 (not too small, not at limit)
    const fitScore = coverageRatio >= 0.3 ? 1.0 : coverageRatio / 0.3;
    score = clamp(Math.round(fitScore * weight));
    reasons.push(`✓ Financing up to ₹${financing.max_amount.toLocaleString('en-IN')} covers your requirement of ₹${need.toLocaleString('en-IN')}.`);
  } else {
    // Partially covers need
    const coverage = financing.max_amount / need;
    score = clamp(Math.round(coverage * weight * 0.7)); // Penalty for partial coverage
    warnings.push(`⚠ Scheme maximum ₹${financing.max_amount.toLocaleString('en-IN')} covers only ${Math.round(coverage * 100)}% of your requirement of ₹${need.toLocaleString('en-IN')}.`);
  }

  // Bonus/penalty for effective interest rate
  const rate = financing.interest_rate?.effective_rate ?? financing.interest_rate?.base ?? 10;
  if (rate <= 4) {
    score = clamp(score + Math.round(weight * 0.1));
    reasons.push(`✓ Very low effective interest rate: ${rate}% p.a.`);
  } else if (rate <= 7) {
    reasons.push(`✓ Competitive interest rate: ${rate}% p.a.`);
  } else if (rate <= 12) {
    warnings.push(`⚠ Moderate interest rate: ${rate}% p.a.`);
  } else {
    score = clamp(score - Math.round(weight * 0.1));
    warnings.push(`⚠ Higher interest rate: ${rate}% p.a.`);
  }

  // Subsidy bonus
  if (financing.subsidy_amount || financing.subsidy_pct) {
    const subsDesc = financing.subsidy_amount
      ? `₹${financing.subsidy_amount.toLocaleString('en-IN')} capital subsidy`
      : `${financing.subsidy_pct}% capital subsidy`;
    score = clamp(score + Math.round(weight * 0.1));
    reasons.push(`✓ Includes ${subsDesc}.`);
  }

  // Collateral bonus
  if (!financing.collateral_required) {
    reasons.push('✓ No collateral required.');
  } else {
    warnings.push('⚠ Collateral / security required.');
  }

  return { score: clamp(score), reasons, warnings };
}

/**
 * Scores activity specificity match.
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @param {number} weight
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scoreActivityFit(profile, scheme, weight) {
  const { activity, activity_category } = profile;
  const { eligibility, tags } = scheme;
  const reasons  = [];
  const warnings = [];

  if (!activity && !activity_category) {
    return { score: Math.round(weight * 0.5), reasons, warnings };
  }

  // Check if scheme has a specific activity list
  const schemeActivities = eligibility.activities;
  if (!schemeActivities || schemeActivities.length === 0) {
    // Generic scheme — moderate score
    reasons.push('✓ Scheme accepts all business activities.');
    return { score: Math.round(weight * 0.7), reasons, warnings };
  }

  // Check exact/synonym match
  const matched = activity && schemeActivities.some(a => {
    const p = activity.toLowerCase();
    const s = a.toLowerCase();
    return p === s || p.includes(s) || s.includes(p);
  });

  let score;
  if (matched) {
    score = weight;
    reasons.push(`✓ Scheme is specifically designed for "${activity}" activity.`);
  } else {
    // Check tag match
    const tagMatch = activity && tags?.some(tag => activity.toLowerCase().includes(tag.toLowerCase()));
    if (tagMatch) {
      score = Math.round(weight * 0.6);
      reasons.push(`✓ Activity partially matches scheme scope.`);
    } else {
      score = Math.round(weight * 0.3);
      warnings.push(`⚠ Activity "${activity}" may not be the primary focus of this scheme.`);
    }
  }

  return { score: clamp(score ?? Math.round(weight * 0.5)), reasons, warnings };
}

/**
 * Scores user preference signals (social category alignment, purpose match).
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @param {number} weight
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scorePreferenceFit(profile, scheme, weight) {
  const { social_category, purpose, gender } = profile;
  const { eligibility, category, tags } = scheme;
  const reasons  = [];
  const warnings = [];
  let score = Math.round(weight * 0.5); // Base

  // Category-specific schemes for SC/ST/OBC get a bonus when matched
  const schemeCategories = eligibility.social_categories;
  if (schemeCategories && schemeCategories.length < 4 && social_category) {
    if (schemeCategories.map(s => s.toUpperCase()).includes(social_category.toUpperCase())) {
      score = clamp(score + Math.round(weight * 0.3));
      reasons.push(`✓ Scheme specifically targets ${social_category} category — strong preference match.`);
    }
  }

  // Women-specific scheme preference
  if (eligibility.gender && eligibility.gender.length === 1 && eligibility.gender[0] === 'F') {
    if (gender === 'F') {
      score = clamp(score + Math.round(weight * 0.2));
      reasons.push('✓ Women-specific scheme — aligned with your profile.');
    }
  }

  // Purpose alignment
  if (purpose && tags) {
    const purposeNorm = purpose.toLowerCase().replace(/_/g, ' ');
    const tagMatch = tags.some(tag => purposeNorm.includes(tag.toLowerCase()) || tag.toLowerCase().includes(purposeNorm));
    if (tagMatch) {
      score = clamp(score + Math.round(weight * 0.2));
      reasons.push(`✓ Scheme purpose aligns with your goal.`);
    }
  }

  return { score: clamp(score), reasons, warnings };
}

/**
 * Scores channel/partner availability.
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @param {number} weight
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scoreChannelAvailability(scheme, weight) {
  const { channel_partners } = scheme;
  const reasons  = [];
  const warnings = [];

  const partnerCount = channel_partners?.types?.length ?? 0;
  let score = clamp(Math.round((Math.min(partnerCount, 5) / 5) * weight));

  if (channel_partners?.pm_suraj_integrated) {
    score = clamp(score + Math.round(weight * 0.3));
    reasons.push('✓ Available on PM-SURAJ portal — easy online application.');
  }

  if (partnerCount >= 3) {
    reasons.push(`✓ Wide partner network: ${channel_partners.types.join(', ')}.`);
  } else if (partnerCount === 1) {
    warnings.push(`⚠ Limited to a single partner type: ${channel_partners.types[0]}.`);
  }

  if (channel_partners?.specific_banks?.length > 0) {
    reasons.push(`✓ Specific banks: ${channel_partners.specific_banks.slice(0, 3).join(', ')}.`);
  }

  return { score: clamp(score), reasons, warnings };
}

/**
 * Scores geographic accessibility.
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @param {number} weight
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scoreLocationAccessibility(profile, scheme, weight) {
  const { state } = profile;
  const { eligibility } = scheme;
  const reasons  = [];
  const warnings = [];

  const locationRule = eligibility.location;
  if (!locationRule || !locationRule.states || locationRule.states.includes('all') || locationRule.states.length === 0) {
    reasons.push('✓ Available PAN India — no geographic restriction.');
    return { score: weight, reasons, warnings };
  }

  if (!state) {
    warnings.push(`⚠ Scheme available in specific states: ${locationRule.states.slice(0, 5).join(', ')}${locationRule.states.length > 5 ? '...' : ''}.`);
    return { score: Math.round(weight * 0.5), reasons, warnings };
  }

  const stateNorm = state.toLowerCase();
  const inState = locationRule.states.some(s => s.toLowerCase().includes(stateNorm) || stateNorm.includes(s.toLowerCase()));
  if (inState) {
    reasons.push(`✓ Available in ${state}.`);
    return { score: weight, reasons, warnings };
  }

  warnings.push(`⚠ Scheme not available in ${state}. Eligible states: ${locationRule.states.slice(0, 4).join(', ')}.`);
  return { score: 0, reasons, warnings };
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

/**
 * Scores and ranks a single scheme for a given profile.
 *
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @param {import('./eligibility.engine.js').EligibilityResult} eligibilityResult
 * @param {typeof DEFAULT_WEIGHTS} [weights]
 * @returns {SchemeScore}
 */
export function scoreScheme(profile, scheme, eligibilityResult, weights = DEFAULT_WEIGHTS) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const eligFit   = scoreEligibilityFit(eligibilityResult, w.eligibility_fit);
  const finFit    = scoreFinancialFit(profile, scheme, w.financial_fit);
  const actFit    = scoreActivityFit(profile, scheme, w.activity_fit);
  const prefFit   = scorePreferenceFit(profile, scheme, w.preference_fit);
  const chanAvail = scoreChannelAvailability(scheme, w.channel_availability);
  const locAccess = scoreLocationAccessibility(profile, scheme, w.location_accessibility);

  const total = clamp(
    eligFit.score + finFit.score + actFit.score + prefFit.score + chanAvail.score + locAccess.score
  );

  const allReasons  = [...eligFit.reasons,  ...finFit.reasons,  ...actFit.reasons,  ...prefFit.reasons,  ...chanAvail.reasons,  ...locAccess.reasons];
  const allWarnings = [...eligFit.warnings, ...finFit.warnings, ...actFit.warnings, ...prefFit.warnings, ...chanAvail.warnings, ...locAccess.warnings];

  return {
    scheme_id: scheme.scheme_id,
    total_score: total,
    breakdown: {
      eligibility_fit:       eligFit.score,
      financial_fit:         finFit.score,
      activity_fit:          actFit.score,
      preference_fit:        prefFit.score,
      channel_availability:  chanAvail.score,
      location_accessibility: locAccess.score,
    },
    reasons:  allReasons.filter(Boolean),
    warnings: allWarnings.filter(Boolean),
  };
}

/**
 * Sorts an array of SchemeScore objects by total_score descending.
 * @param {SchemeScore[]} scores
 * @returns {SchemeScore[]}
 */
export function rankScores(scores) {
  return [...scores].sort((a, b) => b.total_score - a.total_score);
}

export default { scoreScheme, rankScores, DEFAULT_WEIGHTS };
