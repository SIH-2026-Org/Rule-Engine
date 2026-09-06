/**
 * SAARTHI-SETU DRE Unit & Integration Test Suite
 * Tests deterministic eligibility, scoring, financial simulation, and profile builder.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateScheme, ELIGIBLE, NOT_ELIGIBLE, NEEDS_MORE_INFO } from '../src/engine/eligibility.engine.js';
import { scoreScheme } from '../src/engine/scoring.engine.js';
import { simulate } from '../src/engine/financial.simulator.js';
import { generateChecklist } from '../src/engine/document.generator.js';
import { extractFromText, buildProfile } from '../src/services/profile.builder.js';

// Sample Canonical Mock Scheme for Testing
const MOCK_DAIRY_SCHEME = {
  scheme_id: 'NABARD_DAIRY_TEST',
  name: 'NABARD Dairy Entrepreneurship Scheme',
  short_name: 'NABARD Dairy',
  category: 'ANIMAL_HUSBANDRY',
  tags: ['dairy', 'milk', 'cattle', 'animal husbandry'],
  eligibility: {
    age: { min: 18, max: 65 },
    gender: ['M', 'F', 'O'],
    social_categories: ['SC', 'ST', 'OBC', 'GEN'],
    activities: ['dairy', 'milk production', 'cattle farming'],
    location: { states: ['all'], urban_only: false, rural_only: false },
    income_annual: { min: null, max: null }
  },
  financing: {
    type: 'composite',
    max_amount: 1500000,
    own_contribution_pct: 10,
    subsidy_pct: 25,
    subsidy_amount: null,
    interest_rate: { base: 8.5, subsidy_rate: 0, effective_rate: 8.5 },
    tenure_months: { min: 36, max: 84 },
    moratorium_months: 6,
    collateral_required: false
  },
  documents: [
    { id: 'aadhaar', name: 'Aadhaar Card', required: true, note: null },
    { id: 'category_cert', name: 'Caste Certificate', required: true, note: 'From Tehsildar office' }
  ],
  channel_partners: {
    types: ['Commercial Banks', 'RRBs', 'Cooperative Banks'],
    pm_suraj_integrated: true
  },
  metadata: { active: true }
};

describe('Deterministic Rule Engine (DRE) Tests', () => {

  test('1. NLP Profile Extraction from Hinglish Text', () => {
    const input = 'Mujhe dairy business ke liye 1.2 lakh chahiye. Main Rajasthan mein rehta hoon. SC category.';
    const extracted = extractFromText(input);

    assert.equal(extracted.activity, 'dairy');
    assert.equal(extracted.project_cost, 120000);
    assert.equal(extracted.state, 'Rajasthan');
    assert.equal(extracted.social_category, 'SC');
  });

  test('2. Eligibility Evaluation with Missing Info (NEEDS_MORE_INFO)', () => {
    const partialProfile = {
      activity: 'dairy',
      project_cost: 120000,
      social_category: 'SC',
      state: 'Rajasthan',
      age: null // Missing age
    };

    const result = evaluateScheme(partialProfile, MOCK_DAIRY_SCHEME);
    assert.equal(result.status, NEEDS_MORE_INFO);
    assert.ok(result.missing.some(m => m.rule === 'age'));
  });

  test('3. Eligibility Evaluation - Fully ELIGIBLE', () => {
    const fullProfile = {
      age: 30,
      gender: 'M',
      activity: 'dairy',
      project_cost: 120000,
      social_category: 'SC',
      state: 'Rajasthan',
      income_annual: 150000
    };

    const result = evaluateScheme(fullProfile, MOCK_DAIRY_SCHEME);
    assert.equal(result.status, ELIGIBLE);
    assert.equal(result.failed.length, 0);
  });

  test('4. Eligibility Evaluation - NOT_ELIGIBLE (Age Underage)', () => {
    const underageProfile = {
      age: 15,
      gender: 'M',
      activity: 'dairy',
      project_cost: 120000,
      social_category: 'SC',
      state: 'Rajasthan'
    };

    const result = evaluateScheme(underageProfile, MOCK_DAIRY_SCHEME);
    assert.equal(result.status, NOT_ELIGIBLE);
    assert.ok(result.failed.some(f => f.rule === 'age'));
  });

  test('5. Financial Simulation (Reducing Balance EMI & Subsidy)', () => {
    const profile = { project_cost: 120000, loan_required: 120000 };
    const sim = simulate(profile, MOCK_DAIRY_SCHEME);

    assert.equal(sim.available, true);
    assert.equal(sim.project_cost, 120000);
    assert.equal(sim.own_contribution, 12000); // 10%
    assert.equal(sim.eligible_financing, 108000); // 120000 - 12000
    assert.equal(sim.subsidy_received, 27000); // 25% of 108000
    assert.equal(sim.net_loan_amount, 81000); // 108000 - 27000
    assert.ok(sim.emi_monthly > 0);
  });

  test('6. 3-Tier Document Checklist Generation', () => {
    const profile = { social_category: 'SC' };
    const checklist = generateChecklist(profile, MOCK_DAIRY_SCHEME);

    assert.equal(checklist.available.length, 1);
    assert.equal(checklist.available[0].name, 'Aadhaar Card');
    assert.equal(checklist.obtain.length, 1);
    assert.equal(checklist.obtain[0].name, 'Caste Certificate');
  });

  test('7. Weighted Scoring Calculation (0 - 100 Scale)', () => {
    const fullProfile = {
      age: 30,
      gender: 'F',
      social_category: 'SC',
      activity: 'dairy',
      project_cost: 120000,
      state: 'Rajasthan',
      income_annual: 150000
    };

    const eligResult = evaluateScheme(fullProfile, MOCK_DAIRY_SCHEME);
    const scoreResult = scoreScheme(fullProfile, MOCK_DAIRY_SCHEME, eligResult);

    assert.ok(scoreResult.total_score >= 70);
    assert.ok(scoreResult.breakdown.eligibility_fit > 0);
    assert.ok(scoreResult.breakdown.financial_fit > 0);
  });

});
