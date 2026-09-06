/**
 * SAARTHI-SETU — Interactive Manual CLI Tester
 * Run: node test_interactive.js
 */

import { extractFromText, buildProfile } from './src/services/profile.builder.js';
import { evaluateScheme, ELIGIBLE, NOT_ELIGIBLE, NEEDS_MORE_INFO } from './src/engine/eligibility.engine.js';
import { scoreScheme } from './src/engine/scoring.engine.js';
import { simulate } from './src/engine/financial.simulator.js';
import { generateChecklist } from './src/engine/document.generator.js';

import { SCHEMES } from './src/engine/schemes.db.js';

const testPrompts = [
  'Mujhe dairy business ke liye 1.2 lakh chahiye. Main Rajasthan mein rehta hoon. SC category.',
  'I am a street vendor in Delhi needing 20 thousand for my fruit cart.',
  'I am 16 years old and want 2 lakh for cattle farming.'
];

console.log('================================================================');
console.log('       SAARTHI-SETU DETERMINISTIC RULE ENGINE (DRE) CLI         ');
console.log('================================================================\n');

for (let i = 0; i < testPrompts.length; i++) {
  const prompt = testPrompts[i];
  console.log(`\n───────────────── Scenario ${i + 1} ─────────────────`);
  console.log(`📝 Input: "${prompt}"\n`);

  // Step 1: NLP Entity Extraction
  const extracted = extractFromText(prompt);
  const profile = buildProfile({}, extracted, 'cli', 'en-IN', `cli_${i}`);
  console.log('🔍 [1] Extracted Profile Entities:');
  console.log(JSON.stringify(extracted, null, 2));

  // Step 2: Deterministic Evaluation & Ranking across Schemes
  console.log(`\n⚙️ [2] Evaluating against all ${SCHEMES.length} Government Schemes:`);
  const evaluated = SCHEMES.map(scheme => {
    const elig = evaluateScheme(profile, scheme);
    const score = scoreScheme(profile, scheme, elig);
    const fin = simulate(profile, scheme);
    const docs = generateChecklist(profile, scheme);
    return { scheme, elig, score, fin, docs };
  }).sort((a, b) => b.score.total_score - a.score.total_score);

  const topMatches = evaluated.slice(0, 3);
  for (const { scheme, elig, score, fin, docs } of topMatches) {
    console.log(`\n  • Scheme: ${scheme.name} (${scheme.short_name})`);
    console.log(`    Status:        ${elig.status === ELIGIBLE ? '✅ ELIGIBLE' : elig.status === NEEDS_MORE_INFO ? '⚠️  NEEDS MORE INFO' : '❌ NOT ELIGIBLE'}`);
    console.log(`    Match Score:   ${score.total_score} / 100`);

    if (elig.status === NOT_ELIGIBLE) {
      console.log(`    Failure Reason: ${elig.failed.map(f => f.message).join(', ')}`);
    } else {
      console.log(`    Indicative EMI: ₹${fin.emi_monthly}/month (Tenure: ${fin.repayment_months || fin.tenure_months_max} mos, Interest: ${fin.interest_rate_effective}% p.a.)`);
      console.log(`    Govt. Subsidy:  ₹${fin.subsidy_received}`);
      console.log(`    Documents:      ${docs.available.length} available, ${docs.obtain.length} to obtain`);
    }
  }
}

console.log('\n================================================================');
console.log('       ✔ ALL SCENARIOS EVALUATED DETERMINISTICALLY              ');
console.log('================================================================\n');
