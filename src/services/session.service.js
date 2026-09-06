/**
 * In-Memory User Session Service for SAARTHI-SETU
 *
 * Manages user state, conversation stage, selected language,
 * and the progressively accumulated BeneficiaryProfile.
 *
 * A session persists across multiple conversation turns so that
 * entities extracted from each message are merged into one profile.
 */

const sessions = new Map();

/**
 * Gets a user session (or null if none exists).
 * @param {string} phone - User phone number / user ID
 * @returns {object|null} Session data
 */
function getSession(phone) {
  return sessions.get(phone) || null;
}

/**
 * Sets or updates session data for a user ID.
 * @param {string} phone - User phone number / user ID
 * @param {object} data  - Session fields to merge (shallow merge)
 * @returns {object} Updated session
 */
function updateSession(phone, data) {
  const current = sessions.get(phone) || { phone, createdAt: new Date() };
  const updated = {
    ...current,
    ...data,
    updatedAt: new Date(),
  };
  sessions.set(phone, updated);
  return updated;
}

/**
 * Merges new beneficiary profile fields into the session's accumulated profile.
 * Existing non-null values in the profile are NOT overwritten unless newData has a non-null value.
 *
 * @param {string} phone   - User phone number / user ID
 * @param {object} newData - Newly extracted BeneficiaryProfile fields
 * @returns {object} Updated accumulated profile
 */
function mergeProfileData(phone, newData) {
  const session = sessions.get(phone) || { phone, createdAt: new Date() };
  const existingProfile = session.beneficiaryProfile || {};

  // Merge: only overwrite if new value is non-null
  const mergedProfile = { ...existingProfile };
  for (const [key, value] of Object.entries(newData)) {
    if (value !== null && value !== undefined) {
      mergedProfile[key] = value;
    }
  }

  const updated = {
    ...session,
    beneficiaryProfile: mergedProfile,
    updatedAt: new Date(),
  };
  sessions.set(phone, updated);
  return mergedProfile;
}

/**
 * Returns the accumulated BeneficiaryProfile for a session.
 * @param {string} phone
 * @returns {object} Accumulated profile (may be partially filled)
 */
function getProfile(phone) {
  return sessions.get(phone)?.beneficiaryProfile || {};
}

/**
 * Clears a session completely (e.g. on greeting / restart).
 * @param {string} phone - User phone number / user ID
 */
function resetSession(phone) {
  sessions.delete(phone);
}

/**
 * Returns all active session IDs (useful for debugging/admin).
 * @returns {string[]}
 */
function getActiveSessions() {
  return [...sessions.keys()];
}

export {
  getSession,
  updateSession,
  mergeProfileData,
  getProfile,
  resetSession,
  getActiveSessions,
  sessions,
};

export default {
  getSession,
  updateSession,
  mergeProfileData,
  getProfile,
  resetSession,
  getActiveSessions,
  sessions,
};

