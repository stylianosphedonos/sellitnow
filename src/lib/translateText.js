const https = require('https');

const CACHE = new Map();
const MIN_DELAY_MS = 350;
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Translate text via MyMemory (free tier, no API key).
 * @param {string} text
 * @param {'en'|'el'} from
 * @param {'en'|'el'} to
 */
async function translateText(text, from, to) {
  const source = String(text || '').trim();
  if (!source || from === to) return source;

  const cacheKey = `${from}|${to}|${source}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const chunks = [];
  const maxLen = 450;
  let rest = source;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);

  const translatedParts = [];
  for (const chunk of chunks) {
    const now = Date.now();
    const wait = MIN_DELAY_MS - (now - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const q = encodeURIComponent(chunk);
    const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${from}|${to}`;
    const data = await fetchJson(url);
    if (data.quotaFinished) {
      throw new Error('Translation quota reached. Try again later.');
    }
    const part = data?.responseData?.translatedText;
    if (!part || typeof part !== 'string') {
      throw new Error(`Translation failed for: ${chunk.slice(0, 40)}…`);
    }
    translatedParts.push(part);
  }

  const result = translatedParts.join(' ').trim();
  CACHE.set(cacheKey, result);
  return result;
}

module.exports = { translateText };
