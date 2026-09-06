/**
 * SAARTHI-SETU — Financial Simulator
 *
 * Produces indicative financial breakdowns for a recommended scheme.
 * Uses standard reducing-balance EMI formula with moratorium handling.
 *
 * IMPORTANT: All outputs are INDICATIVE only.
 * Final terms are determined by the authorized lending institution.
 *
 * Channel-agnostic. No I/O, no side effects.
 */

export const DISCLAIMER =
  'Indicative financial calculation only. Actual loan amount, interest rate, tenure and EMI will be determined by the authorized financing institution based on assessment.';

/**
 * Calculates standard reducing-balance EMI.
 * EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 *
 * @param {number} principal    - Loan amount in INR
 * @param {number} annualRatePct - Annual interest rate (e.g. 7.5 for 7.5%)
 * @param {number} tenureMonths - Repayment tenure in months (AFTER moratorium)
 * @returns {number} Monthly EMI (rounded to nearest rupee)
 */
function calculateEMI(principal, annualRatePct, tenureMonths) {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (annualRatePct === 0) return Math.round(principal / tenureMonths);

  const r = annualRatePct / 100 / 12; // Monthly rate
  const n = tenureMonths;
  const emi = principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  return Math.round(emi);
}

/**
 * Determines the eligible financing amount based on the scheme's rules
 * and the user's project cost / loan requirement.
 *
 * @param {number|null} projectCost
 * @param {number|null} loanRequired
 * @param {import('./scheme.schema.js').Financing} financing
 * @returns {{ eligible_financing: number, own_contribution: number, subsidy_received: number }}
 */
function computeFinancingBreakdown(projectCost, loanRequired, financing) {
  const cost = projectCost || loanRequired || 0;
  if (cost === 0) {
    return { eligible_financing: 0, own_contribution: 0, subsidy_received: 0 };
  }

  // Own contribution deducted first
  const ownContribPct = financing.own_contribution_pct ?? 0;
  const ownContrib    = Math.round(cost * ownContribPct / 100);
  const loanNeeded    = cost - ownContrib;

  // Cap to scheme maximum
  let eligibleFinancing = loanNeeded;
  if (financing.max_amount !== null && eligibleFinancing > financing.max_amount) {
    eligibleFinancing = financing.max_amount;
  }

  // Subsidy deducted from principal
  let subsidyReceived = 0;
  if (financing.subsidy_amount) {
    subsidyReceived = Math.min(financing.subsidy_amount, eligibleFinancing);
  } else if (financing.subsidy_pct) {
    subsidyReceived = Math.round(eligibleFinancing * financing.subsidy_pct / 100);
  }

  return {
    eligible_financing: eligibleFinancing,
    own_contribution:   ownContrib,
    subsidy_received:   subsidyReceived,
  };
}

/**
 * Runs the full financial simulation for a scheme + user profile.
 *
 * @param {import('./rule.engine.js').BeneficiaryProfile} profile
 * @param {import('./scheme.schema.js').Scheme} scheme
 * @returns {FinancialSimulation}
 */
export function simulate(profile, scheme) {
  const { financing } = scheme;
  const { project_cost, loan_required } = profile;

  const cost = project_cost || loan_required || 0;

  // If no cost data, return a template simulation
  if (cost === 0) {
    return {
      available: false,
      message:   'Project cost not provided. Share your estimated project cost to see financial projections.',
      disclaimer: DISCLAIMER,
    };
  }

  const { eligible_financing, own_contribution, subsidy_received } =
    computeFinancingBreakdown(project_cost, loan_required, financing);

  // Actual principal = eligible financing minus subsidy (subsidy is front-loaded deduction)
  const principal = Math.max(0, eligible_financing - subsidy_received);

  // Effective interest rate
  const effectiveRate = financing.interest_rate?.effective_rate
    ?? financing.interest_rate?.base
    ?? 10;

  // Tenure: use midpoint of range or max
  const tenureMax = financing.tenure_months?.max ?? 60;
  const tenureMin = financing.tenure_months?.min ?? 12;
  const selectedTenure = tenureMax; // User can choose; default to max for lowest EMI

  // Moratorium period: interest accrues but no EMI
  const moratoriumMonths = financing.moratorium_months ?? 0;

  // During moratorium, simple interest accrues on principal
  const moratoriumInterest = moratoriumMonths > 0
    ? Math.round(principal * (effectiveRate / 100) * (moratoriumMonths / 12))
    : 0;

  // Principal after moratorium (interest added to principal)
  const principalAfterMoratorium = principal + moratoriumInterest;

  // Repayment tenure = selected tenure minus moratorium
  const repaymentMonths = Math.max(1, selectedTenure - moratoriumMonths);

  // EMI calculation
  const emi = calculateEMI(principalAfterMoratorium, effectiveRate, repaymentMonths);

  // Totals
  const totalRepayment  = emi * repaymentMonths;
  const totalInterest   = Math.max(0, totalRepayment - principalAfterMoratorium + moratoriumInterest);

  // Financing type label
  const typeLabel = {
    loan:      'Loan',
    subsidy:   'Subsidy',
    grant:     'Grant',
    composite: 'Loan + Subsidy',
    guarantee: 'Credit Guarantee',
    insurance: 'Insurance',
    pension:   'Pension',
    scholarship: 'Scholarship',
    training:  'Training Support',
  }[financing.type] ?? financing.type;

  return {
    available:              true,
    financing_type:         typeLabel,

    // Inputs
    project_cost:           cost,

    // Breakdown
    own_contribution:       own_contribution,
    eligible_financing:     eligible_financing,
    subsidy_received:       subsidy_received,
    net_loan_amount:        principal,

    // Interest & Tenure
    interest_rate_base:     financing.interest_rate?.base ?? effectiveRate,
    interest_rate_subsidy:  financing.interest_rate?.subsidy_rate ?? 0,
    interest_rate_effective: effectiveRate,
    tenure_months_max:      selectedTenure,
    tenure_months_min:      tenureMin,
    moratorium_months:      moratoriumMonths,
    repayment_months:       repaymentMonths,

    // Outputs
    moratorium_interest:    moratoriumInterest,
    total_interest:         totalInterest,
    total_repayment:        totalRepayment,
    emi_monthly:            emi,

    // Collateral
    collateral_required:    financing.collateral_required ?? false,

    // Subsidy notes
    subsidy_notes:          financing.subsidy_notes ?? null,

    // Legal disclaimer
    disclaimer:             DISCLAIMER,

    // Formatted summary for text channels (IVR, SMS, WhatsApp)
    summary_text: buildSummaryText({
      cost, own_contribution, eligible_financing, subsidy_received,
      principal, effectiveRate, selectedTenure, moratoriumMonths, emi,
      totalRepayment, typeLabel,
    }),
  };
}

/**
 * Builds a plain-text financial summary suitable for WhatsApp / IVR / SMS.
 * @private
 */
function buildSummaryText(d) {
  const fmt = n => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const lines = [
    `💰 Financial Estimate (${d.typeLabel}):`,
    `• Project Cost:        ${fmt(d.cost)}`,
    `• Your Contribution:   ${fmt(d.own_contribution)} (${d.cost > 0 ? Math.round(d.own_contribution / d.cost * 100) : 0}%)`,
    `• Eligible Financing:  ${fmt(d.eligible_financing)}`,
  ];
  if (d.subsidy_received > 0) {
    lines.push(`• Capital Subsidy:     ${fmt(d.subsidy_received)}`);
    lines.push(`• Net Loan Amount:     ${fmt(d.principal)}`);
  }
  lines.push(`• Interest Rate:       ${d.effectiveRate}% p.a. (effective)`);
  lines.push(`• Max Tenure:          ${d.selectedTenure} months`);
  if (d.moratoriumMonths > 0) {
    lines.push(`• Moratorium:          ${d.moratoriumMonths} months`);
  }
  if (d.emi > 0) {
    lines.push(`• Estimated EMI:       ${fmt(d.emi)}/month`);
    lines.push(`• Total Repayment:     ${fmt(d.totalRepayment)}`);
  }
  lines.push('');
  lines.push('📋 ' + DISCLAIMER);
  return lines.join('\n');
}

export default { simulate, DISCLAIMER };
