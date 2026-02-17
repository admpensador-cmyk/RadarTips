/**
 * API-Football v3 Client
 * Low-level HTTP client for API-Football v3
 * 
 * Endpoint: https://v3.football.api-sports.io
 * Auth: x-apisports-key header
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.APIFOOTBALL_KEY;

if (!API_KEY) {
  console.error('❌ Error: APIFOOTBALL_KEY env var not set');
  process.exit(1);
}

/**
 * Make HTTP GET request to API-Football v3
 * Uses fetch with retry logic (max 2 retries)
 * 
 * @param {string} path - endpoint path (e.g., '/leagues?id=40')
 * @param {object} options - request options (timeout, retries)
 * @returns {Promise<{status, data, headers, rateLimit}>}
 */
export async function apiGet(path, options = {}) {
  const { timeout = 10000, retries = 2 } = options;
  const url = new URL(path, API_BASE).toString();

  let lastError = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-apisports-key': API_KEY,
          'Accept': 'application/json',
          'User-Agent': 'RadarTips/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.text();
      let data = null;

      try {
        data = JSON.parse(body);
      } catch (e) {
        throw new Error(`Failed to parse JSON response: ${e.message}`);
      }

      return {
        status: response.status,
        data,
        headers: Object.fromEntries(response.headers),
        rateLimit: {
          requests: response.headers.get('x-ratelimit-requests-remaining'),
          requestsLimit: response.headers.get('x-ratelimit-requests-allotted'),
        },
      };
    } catch (error) {
      lastError = error;

      // Check if it's a timeout
      if (error.name === 'AbortError') {
        lastError = new Error(`Request timeout (${timeout}ms)`);
      }

      // Only retry on network/timeout errors, not on parse errors
      if (attempt < retries + 1) {
        const delay = attempt * 1000;
        console.warn(
          `⚠️  Attempt ${attempt}/${retries + 1} failed: ${lastError.message}, ` +
          `retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `apiGet failed after ${retries + 1} attempts. ` +
    `Last error: ${lastError.message}`
  );
}

/**
 * Helper to make API requests with structured error handling
 * Returns only the response.response array from API
 * 
 * @param {string} path - endpoint path (e.g., '/leagues?id=40')
 * @returns {Promise<Array>} - response.response from API
 * @throws {Error} - structured error with context
 */
export async function apiGetJson(path) {
  try {
    const response = await apiGet(path, { timeout: 10000, retries: 2 });

    // Check HTTP status
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Check API errors
    if (
      response.data.errors &&
      typeof response.data.errors === 'object' &&
      Object.keys(response.data.errors).length > 0
    ) {
      const errorMsg = Object.values(response.data.errors)
        .filter(e => e)
        .join('; ');
      throw new Error(`API error: ${errorMsg}`);
    }

    // Return response data
    return response.data.response;
  } catch (error) {
    // Enhance error with context
    if (error.message.includes('ENOTFOUND')) {
      throw new Error(
        `Failed to connect to API-Football: ${error.message}. ` +
        `Check API_BASE URL and network connectivity.`
      );
    }

    throw new Error(`apiGetJson(${path}): ${error.message}`);
  }
}
