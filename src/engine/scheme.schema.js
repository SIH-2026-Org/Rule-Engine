/**
 * SAARTHI-SETU — Canonical Scheme Schema
 *
 * This file defines the complete data contract for a government scheme.
 * Every scheme in schemes.db.js MUST conform to this shape.
 * The Deterministic Rule Engine (DRE) reads ONLY these fields.
 *
 * Channel-agnostic: used by WhatsApp, IVR, SMS, Web, and Mobile channels.
 */

/**
 * @typedef {Object} AgeRule
 * @property {number|null} min - Minimum age (inclusive). null = no lower bound.
 * @property {number|null} max - Maximum age (inclusive). null = no upper bound.
 */

/**
 * @typedef {Object} IncomeRule
 * @property {number|null} max - Maximum annual family income in INR. null = no ceiling.
 * @property {number|null} min - Minimum annual family income in INR. null = no floor.
 */

/**
 * @typedef {Object} LocationRule
 * @property {string[]|null} states    - List of eligible states/UTs. null or ["all"] = PAN India.
 * @property {boolean|null} urban_only - true = urban areas only. null = don't care.
 * @property {boolean|null} rural_only - true = rural areas only. null = don't care.
 */

/**
 * @typedef {Object} CustomRule
 * @property {string} field    - BeneficiaryProfile field name (e.g. "business_age_years")
 * @property {string} operator - One of: 'gt','gte','lt','lte','eq','neq','in','not_in','between'
 * @property {*}      value    - The value to compare against (scalar, array, or [min,max] for 'between')
 * @property {string} message  - Human-readable explanation for failure
 */

/**
 * @typedef {Object} Eligibility
 * @property {AgeRule|null}      age              - Age eligibility range.
 * @property {IncomeRule|null}   income_annual    - Annual family income eligibility.
 * @property {string[]|null}     gender           - Eligible genders: ['M','F','O']. null = all.
 * @property {string[]|null}     social_categories - ['SC','ST','OBC','GEN','MINORITY','EWS','PWD']. null = all.
 * @property {string[]|null}     activities       - Supported business activities (e.g. ['dairy','poultry']). null = all.
 * @property {string[]|null}     activity_categories - Top-level categories: ['agriculture','msme','education','services']. null = all.
 * @property {LocationRule|null} location         - Geographic restrictions.
 * @property {string[]|null}     occupation       - ['self_employed','salaried','farmer','entrepreneur','student']. null = all.
 * @property {boolean|null}      existing_business - true=must have existing biz, false=must be new, null=don't care.
 * @property {boolean|null}      disability       - true=must be PwD, null=don't care.
 * @property {boolean|null}      minority         - true=must be minority community, null=don't care.
 * @property {number|null}       min_project_cost - Minimum project cost in INR for eligibility.
 * @property {number|null}       max_project_cost - Maximum project cost in INR for eligibility.
 * @property {CustomRule[]}      custom_rules     - Additional pluggable rules for complex conditions.
 */

/**
 * @typedef {Object} InterestRate
 * @property {number} base           - Nominal/base interest rate (% per annum).
 * @property {number|null} subsidy_rate  - Interest subsidy rate (% per annum). null = no subsidy.
 * @property {number} effective_rate - Net effective rate after subsidy (% per annum).
 */

/**
 * @typedef {Object} TenureRange
 * @property {number} min - Minimum loan/scheme tenure in months.
 * @property {number} max - Maximum loan/scheme tenure in months.
 */

/**
 * @typedef {Object} Financing
 * @property {'loan'|'subsidy'|'grant'|'composite'|'guarantee'|'insurance'|'pension'|'scholarship'|'training'} type
 * @property {number|null}    max_amount            - Maximum financing amount in INR.
 * @property {number|null}    min_amount            - Minimum financing amount in INR.
 * @property {InterestRate}   interest_rate         - Interest rate structure.
 * @property {number}         own_contribution_pct  - % of project cost the beneficiary must contribute (0-100).
 * @property {TenureRange}    tenure_months         - Repayment tenure range in months.
 * @property {number}         moratorium_months     - Grace period before repayment starts (months).
 * @property {boolean}        collateral_required   - Whether collateral/security is mandatory.
 * @property {number|null}    subsidy_amount        - Fixed government subsidy in INR. null if not applicable.
 * @property {number|null}    subsidy_pct           - % subsidy on project cost. null if not applicable.
 * @property {string|null}    subsidy_notes         - Human-readable subsidy conditions.
 */

/**
 * @typedef {Object} Document
 * @property {string}  id       - Unique document identifier.
 * @property {string}  name     - Human-readable document name.
 * @property {boolean} required - true = mandatory. false = optional / desirable.
 * @property {string}  [note]   - Clarifying note about when/why this document is needed.
 */

/**
 * @typedef {Object} ChannelPartners
 * @property {string[]} types               - Partner institution types: ['bank','MFI','NBFC','SCA','cooperative','KVIC','NSIC','NABARD','SIDBI'].
 * @property {boolean}  pm_suraj_integrated - Whether scheme is accessible via PM-SURAJ portal.
 * @property {string[]} [specific_banks]    - Named institutions if scheme is bank-specific.
 */

/**
 * @typedef {Object} SchemeMetadata
 * @property {boolean} active             - Whether the scheme is currently accepting applications.
 * @property {string}  version            - Data version/last-updated date (YYYY-MM format).
 * @property {string}  official_url       - Official government scheme URL.
 * @property {string}  [application_portal] - Name/URL of the application portal.
 * @property {string}  [nodal_agency]     - Primary nodal agency responsible for implementation.
 * @property {string}  [helpline]         - Scheme helpline number.
 */

/**
 * @typedef {Object} Scheme
 * @property {string}          scheme_id        - Unique scheme identifier (e.g. "SCHEME_001").
 * @property {string}          name             - Full scheme name.
 * @property {string}          short_name       - Short/display name (≤ 40 chars for UI).
 * @property {string}          ministry         - Issuing ministry/department.
 * @property {string}          category         - Top-level category: 'MSME'|'Agriculture'|'Education'|'Housing'|'SocialWelfare'|'Women'|'Minority'|'Rural'|'Urban'|'Financial'.
 * @property {string}          description      - One-paragraph scheme description.
 * @property {string[]}        tags             - Searchable tags for fuzzy matching.
 * @property {Eligibility}     eligibility      - Deterministic eligibility rules.
 * @property {Financing}       financing        - Financial terms.
 * @property {Document[]}      documents        - Required/optional documents.
 * @property {ChannelPartners} channel_partners - Implementation partners.
 * @property {SchemeMetadata}  metadata         - Administrative metadata.
 */

// ─── Sentinel values ─────────────────────────────────────────────────────────
// Use these constants for clarity when writing scheme rules.
export const ALL_CATEGORIES    = null; // No social category restriction
export const ALL_GENDERS       = null; // No gender restriction
export const ALL_STATES        = null; // PAN India
export const ALL_ACTIVITIES    = null; // All business activities
export const ANY_AGE           = null; // No age restriction
export const ANY_INCOME        = null; // No income restriction
export const NO_CUSTOM_RULES   = [];   // No additional custom rules

/**
 * Validates a scheme object against the canonical schema.
 * Throws descriptive errors for malformed scheme data.
 * @param {Scheme} scheme
 * @returns {boolean}
 */
export function validateScheme(scheme) {
  const required = ['scheme_id', 'name', 'short_name', 'ministry', 'category',
    'description', 'eligibility', 'financing', 'documents', 'channel_partners', 'metadata'];
  for (const field of required) {
    if (scheme[field] === undefined) {
      throw new Error(`[SchemaValidation] Scheme "${scheme.scheme_id}" missing required field: "${field}"`);
    }
  }
  if (!Array.isArray(scheme.documents)) {
    throw new Error(`[SchemaValidation] Scheme "${scheme.scheme_id}": documents must be an array`);
  }
  if (typeof scheme.financing.max_amount !== 'number' && scheme.financing.max_amount !== null) {
    throw new Error(`[SchemaValidation] Scheme "${scheme.scheme_id}": financing.max_amount must be number or null`);
  }
  return true;
}

export default { validateScheme, ALL_CATEGORIES, ALL_GENDERS, ALL_STATES, ALL_ACTIVITIES, ANY_AGE, ANY_INCOME, NO_CUSTOM_RULES };
