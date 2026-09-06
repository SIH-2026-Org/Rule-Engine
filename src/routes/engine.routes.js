/**
 * SAARTHI-SETU — Rule Engine API Routes
 *
 * Mounts the Deterministic Rule Engine endpoints under /api/v1/
 *
 * Routes:
 *   POST /api/v1/match            → Full scheme matching pipeline
 *   GET  /api/v1/schemes          → List all schemes (?category= ?active=)
 *   GET  /api/v1/scheme/:id       → Single scheme detail
 *   POST /api/v1/simulate         → Standalone financial simulation
 *   GET  /api/v1/engine/health    → Engine health check
 */

import { Router } from 'express';
import {
  handleMatch,
  handleListSchemes,
  handleGetScheme,
  handleSimulate,
  handleEngineHealth,
} from '../controllers/engine.controller.js';

const router = Router();

// Full scheme matching pipeline (primary endpoint for all channels)
router.post('/match', handleMatch);

// List all schemes (with optional ?category= and ?active= filters)
router.get('/schemes', handleListSchemes);

// Single scheme detail
router.get('/scheme/:id', handleGetScheme);

// Standalone financial simulation
router.post('/simulate', handleSimulate);

// Engine health check
router.get('/engine/health', handleEngineHealth);

export default router;
