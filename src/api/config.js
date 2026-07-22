/**
 * Central API configuration.
 *
 * Set REACT_APP_API_BASE_URL to the full base URL including any path prefix.
 *
 * Examples:
 *   REACT_APP_API_BASE_URL=http://localhost:4001          (local, no prefix)
 *   REACT_APP_API_BASE_URL=https://iquana.ni.dfki.de/api  (prod, with /api prefix)
 */
export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:4001').replace(/\/$/, '');
