/**
 * SAARTHI-SETU — Document Checklist Generator
 *
 * Generates a personalized document readiness checklist for a given scheme,
 * categorized into: likely available, needs to be obtained, and mandatory missing.
 *
 * Channel-agnostic. Used by WhatsApp, IVR, SMS, Web, Mobile.
 */

// ─── Documents typically available with most beneficiaries ───────────────────
const COMMONLY_AVAILABLE = new Set([
  'aadhaar',
  'pan',
  'photo',
  'bank_passbook',
  'bank_account',
  'ration_card',
  'voter_id',
  'mobile_number',
]);

// ─── Documents that need to be obtained (and why) ────────────────────────────
const OBTAIN_GUIDANCE = {
  income_cert:       'Obtain from Tehsildar / Sub-Divisional Magistrate office.',
  category_cert:     'SC/ST/OBC certificate from District Social Welfare Office.',
  caste_cert:        'Caste certificate from District Social Welfare Office.',
  business_plan:     'Prepare a brief business plan (1–2 pages) with cost estimates.',
  project_report:    'Detailed Project Report (DPR) from a bank-empanelled consultant.',
  quotation:         'Obtain quotation/invoice from machinery or equipment supplier.',
  land_doc:          'Land record (Khasra/Patta) from Patwari / Revenue department.',
  lease_agreement:   'Registered shop/land lease agreement from lessor.',
  trade_license:     'Trade/business license from local municipal body (Nagar Panchayat/Palika).',
  gst_cert:          'GST registration certificate from GST portal (if applicable).',
  udyam_reg:         'Udyam registration from udyamregistration.gov.in (free, instant).',
  edu_certificate:   'Educational qualification certificate from school/college.',
  disability_cert:   'Disability certificate from Chief Medical Officer (CMO).',
  minority_cert:     'Self-declaration affidavit or community certificate for minority status.',
  age_proof:         'Birth certificate / Aadhaar / school leaving certificate.',
  address_proof:     'Utility bill / rental agreement / Aadhaar with current address.',
  experience_cert:   'Experience letter from previous employer or self-declaration.',
  training_cert:     'Skill training completion certificate from recognized institute.',
  survey_letter:     'Urban local body survey letter for street vendors (PM-SVANidhi).',
  vendor_id:         'Vendor identification certificate from Urban Local Body.',
  affidavit:         'Notarized self-declaration affidavit (available from any notary).',
  bank_statement:    '6-month bank account statement from your bank branch.',
};

/**
 * Classifies a document into one of three readiness tiers.
 * @param {import('./scheme.schema.js').Document} doc
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @returns {'available' | 'obtain' | 'required'}
 */
function classifyDocument(doc, profile) {
  const id = doc.id.toLowerCase();

  // Tier 1: Commonly available
  if (COMMONLY_AVAILABLE.has(id)) return 'available';

  // Profile-aware classification
  if (id === 'category_cert' || id === 'caste_cert') {
    // Only flag as needed if user has a reserved category
    if (profile.social_category && profile.social_category.toUpperCase() !== 'GEN') {
      return 'obtain';
    }
    return doc.required ? 'obtain' : 'available';
  }

  if (id === 'disability_cert') {
    return profile.disability ? 'obtain' : 'available';
  }

  if (id === 'minority_cert') {
    return profile.social_category === 'MINORITY' ? 'obtain' : 'available';
  }

  // Tier 2: Needs to be obtained
  if (OBTAIN_GUIDANCE[id]) return 'obtain';

  // Default: Required (mandatory unknown)
  return doc.required ? 'required' : 'obtain';
}

/**
 * Generates a personalized document checklist for a scheme.
 *
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @returns {DocumentChecklist}
 */
export function generateChecklist(profile, scheme) {
  const available = [];
  const obtain    = [];
  const required  = [];

  for (const doc of scheme.documents) {
    const tier = classifyDocument(doc, profile);
    const entry = {
      id:       doc.id,
      name:     doc.name,
      required: doc.required,
      note:     doc.note || OBTAIN_GUIDANCE[doc.id.toLowerCase()] || null,
    };

    if (tier === 'available')  available.push(entry);
    else if (tier === 'obtain') obtain.push(entry);
    else                        required.push(entry);
  }

  // Readiness score: how many mandatory docs are already likely available
  const mandatoryTotal = scheme.documents.filter(d => d.required).length;
  const mandatoryAvailable = available.filter(d => d.required).length;
  const readinessPct = mandatoryTotal > 0
    ? Math.round((mandatoryAvailable / mandatoryTotal) * 100)
    : 100;

  return {
    scheme_id:       scheme.scheme_id,
    scheme_name:     scheme.short_name,
    readiness_pct:   readinessPct,
    total_documents: scheme.documents.length,
    available,
    obtain,
    required,
    summary_text: buildChecklistText({ available, obtain, required, schemeName: scheme.short_name }),
  };
}

/**
 * Builds a plain-text checklist suitable for WhatsApp / SMS / IVR.
 * @private
 */
function buildChecklistText({ available, obtain, required, schemeName }) {
  const lines = [`📋 Document Checklist — ${schemeName}:`, ''];

  if (available.length > 0) {
    lines.push('✅ Likely already available:');
    available.forEach(d => lines.push(`  • ${d.name}`));
    lines.push('');
  }

  if (obtain.length > 0) {
    lines.push('⚠️  Need to obtain:');
    obtain.forEach(d => {
      lines.push(`  • ${d.name}${d.required ? ' (Required)' : ' (Optional)'}`);
      if (d.note) lines.push(`    → ${d.note}`);
    });
    lines.push('');
  }

  if (required.length > 0) {
    lines.push('❗ Mandatory — status unknown:');
    required.forEach(d => lines.push(`  • ${d.name}`));
    lines.push('');
  }

  return lines.join('\n');
}

export default { generateChecklist };
