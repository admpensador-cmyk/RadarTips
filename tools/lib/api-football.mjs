/**
 * API-Football v3 Client
 * Low-level HTTP client for API-Football v3
 */

import https from 'https';

const API_BASE = 'https://api.api-football.com/v3';
const API_KEY = process.env.APIFOOTBALL_KEY;

if (!API_KEY) {
  console.error('❌ Error: APIFOOTBALL_KEY env var not set');
  process.exit(1);
}

/**
 * Make HTTP GET request to API-Football v3
 * @param {string} path - endpoint path (e.g., '/leagues?id=40')
 * @param {object} options - request options (timeout, retries, etc.)
 * @returns {Promise<{status, data, headers}>}
 */
export async function apiGet(path, options = {}) {
  const { timeout = 10000, retries = 2 } = options;
  const url = new URL(path, API_BASE).toString();

  return new Promise((resolve, reject) => {
    let attempt = 0;

    const makeRequest = () => {
      attempt++;
      const req = https.get(url, {
        headers: {
          'x-apisports-key': API_KEY,
          'User-Agent': 'RadarTips/1.0'
        },
        timeout
      }, (res) => {
        let body = '';

        res.on('data', chunk => body += chunk);

        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({
              status: res.statusCode,
              data,
              headers: res.headers,
              rateLimit: {
                requests: res.headers['x-ratelimit-requests-remaining'],
                requestsLimit: res.headers['x-ratelimit-requests-allotted']
              }
            });
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempt < retries) {
          console.warn(`⏱️  Timeout, retrying (attempt ${attempt}/${retries})...`);
          setTimeout(makeRequest, 2000);
        } else {
          reject(new Error(`Request timeout after ${retries} attempts`));
        }
      });

      req.on('error', (err) => {
        if (attempt < retries) {
          console.warn(`⚠️  Error: ${err.message}, retrying (attempt ${attempt}/${retries})...`);
          setTimeout(makeRequest, 2000);
        } else {
          reject(new Error(`Request failed after ${retries} attempts: ${err.message}`));
        }
      });
    };

    makeRequest();
  });
}

/**
 * Helper to make API requests with error handling
 * @param {string} path
 * @returns {Promise<object>}
 */
export async function apiGetJson(path) {
  try {
    const response = await apiGet(path, { timeout: 10000, retries: 2 });
    
    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      const errorMsg = Object.values(response.data.errors).join('; ');
      throw new Error(`API error: ${errorMsg}`);
    }

    return response.data.response;
  } catch (error) {
    throw new Error(`apiGetJson failed: ${error.message}`);
  }
}
