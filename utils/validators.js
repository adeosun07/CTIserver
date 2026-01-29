/**
 * Validation Utilities
 *
 * Helper functions for validating request inputs
 */

import { validate as validateUUID } from "uuid";

/**
 * Validate UUID format
 * @param {string} id - UUID to validate
 * @returns {boolean} - True if valid UUID
 */
export function isValidUUID(id) {
  return validateUUID(id);
}

/**
 * Validate that a value is a positive integer
 * @param {any} value - Value to validate
 * @returns {boolean} - True if valid positive integer
 */
export function isValidInteger(value) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0 && String(num) === String(value);
}

/**
 * Validate phone number (basic check: 10+ digits)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
export function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
export function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
