const config = require('../config');
const PickupStoreService = require('./PickupStoreService');
const { normalizeCyprusCity } = require('../lib/cyprusCities');

const FETCH_HEADERS = {
  'User-Agent': 'SellitnowPickupSync/1.0 (+https://3nitylab.com)',
  Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
};

async function fetchText(url, { timeoutMs = 45000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { ...FETCH_HEADERS, ...headers },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeJsString(value) {
  if (value == null) return '';
  try {
    return JSON.parse(`"${String(value).replace(/"/g, '\\"')}"`);
  } catch {
    return String(value)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"');
  }
}

class CourierPickupSyncService {
  async syncAll() {
    await PickupStoreService.deletePlaceholderSeeds();
    const results = {
      boxnow: await this.syncBoxNow(),
      akis: await this.syncAkisExpress(),
      acs: await this.syncAcs(),
    };
    return results;
  }

  async syncBoxNow() {
    const url = config.pickup.boxnowUrl;
    try {
      const payload = await fetchJson(url);
      const items = Array.isArray(payload?.data) ? payload.data : [];
      const keepCodes = new Set();
      let inserted = 0;
      let updated = 0;

      for (const item of items) {
        if (String(item.country || '').toUpperCase() !== 'CY') continue;
        const state = String(item.state || '').toLowerCase();
        const active = state === 'boxnow-ready';
        const externalId = String(item.id || '').trim();
        if (!externalId) continue;
        const city = normalizeCyprusCity(stripHtml(item.addressLine2 || item.region || 'Cyprus'));
        const name = stripHtml(item.name || item.title || `Box Now ${externalId}`);
        const address = stripHtml(item.addressLine1 || item.title || name);
        const locality = stripHtml(item.addressLine2 || '');
        const addressWithLocality =
          locality && !address.toLowerCase().includes(locality.toLowerCase())
            ? `${address}, ${locality}`
            : address;
        const code = `boxnow-${externalId}`;
        keepCodes.add(code);
        const action = await PickupStoreService.upsertSyncedStore({
          code,
          provider: 'boxnow',
          external_id: externalId,
          name: `Box Now — ${name}`,
          address_line1: addressWithLocality,
          city,
          postal_code: String(item.postalCode || '').trim() || '0000',
          country: 'CY',
          hours: active ? 'Usually 24/7 locker access' : 'Temporarily unavailable',
          lat: item.lat,
          lng: item.lng,
          active,
          display_order: 100,
        });
        if (action === 'inserted') inserted += 1;
        else updated += 1;
      }

      await this.deactivateProviderExcept('boxnow', keepCodes);
      return {
        ok: true,
        provider: 'boxnow',
        fetched: items.length,
        inserted,
        updated,
        active: keepCodes.size,
      };
    } catch (err) {
      return { ok: false, provider: 'boxnow', error: err.message };
    }
  }

  async syncAkisExpress() {
    const url = config.pickup.akisStoresUrl;
    try {
      const html = await fetchText(url, {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      const stores = this.parseAkisStoresHtml(html);
      const keepCodes = new Set();
      let inserted = 0;
      let updated = 0;

      for (const store of stores) {
        keepCodes.add(store.code);
        const action = await PickupStoreService.upsertSyncedStore(store);
        if (action === 'inserted') inserted += 1;
        else updated += 1;
      }

      await this.deactivateProviderExcept('akis', keepCodes);
      return {
        ok: true,
        provider: 'akis',
        fetched: stores.length,
        inserted,
        updated,
        active: keepCodes.size,
      };
    } catch (err) {
      return { ok: false, provider: 'akis', error: err.message };
    }
  }

  parseAkisStoresHtml(html) {
    const chunks = String(html || '').split('"cssClass":');
    const stores = [];
    const seen = new Set();

    for (let i = 1; i < chunks.length; i += 1) {
      const blob = `"cssClass":${chunks[i]}`;
      const pick = (re) => {
        const m = blob.match(re);
        return m ? m[1] : null;
      };
      const titleRaw = pick(/"title":"((?:\\.|[^"\\])*)"/);
      const lat = pick(/"latitude":"([^"]+)"/);
      const lng = pick(/"longitude":"([^"]+)"/);
      const addressRaw = pick(/"address":"((?:\\.|[^"\\])*)"/);
      if (!titleRaw) continue;

      const city = normalizeCyprusCity(stripHtml(decodeJsString(titleRaw)));
      const addressFull = stripHtml(decodeJsString(addressRaw || ''));
      let phone = null;
      const phoneMatch = addressFull.match(/Telephone:\s*([0-9]+)/i);
      if (phoneMatch) phone = phoneMatch[1];

      let hours = null;
      const hoursMatch = addressFull.match(/Working Hours?:\s*(.+?)(?=(?:Telephone:|$))/i);
      if (hoursMatch) hours = hoursMatch[1].trim().replace(/[,\s]+$/, '');

      let addressLine = addressFull
        .replace(/Telephone:\s*[0-9]+/gi, '')
        .replace(/Working Hours?:[^]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[,\s]+$/, '');

      const postalMatch = addressLine.match(/\b(\d{4})\b/);
      const postal_code = postalMatch ? postalMatch[1] : '0000';
      const address_line1 = (addressLine.split(',')[0] || city).trim();
      const slug = city
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const coordKey = `${Number(lat).toFixed(5)}_${Number(lng).toFixed(5)}`;
      const code = `akis-${slug || 'store'}-${coordKey.replace(/\./g, '').replace(/_/g, '-')}`;
      if (seen.has(code)) continue;
      seen.add(code);

      stores.push({
        code,
        provider: 'akis',
        external_id: coordKey,
        name: `Akis Express — ${city}`,
        address_line1,
        city,
        postal_code,
        country: 'CY',
        phone,
        hours,
        lat,
        lng,
        active: true,
        display_order: 200,
      });
    }
    return stores;
  }

  async syncAcs() {
    const acs = config.pickup.acs || {};
    if (
      !acs.companyId ||
      !acs.companyPassword ||
      !acs.userId ||
      !acs.userPassword ||
      !acs.apiKey
    ) {
      return {
        ok: false,
        provider: 'acs',
        skipped: true,
        error:
          'ACS credentials not configured (ACS_COMPANY_ID, ACS_COMPANY_PASSWORD, ACS_USER_ID, ACS_USER_PASSWORD, ACS_API_KEY)',
      };
    }

    try {
      const keepCodes = new Set();
      let inserted = 0;
      let updated = 0;
      let fetched = 0;
      const kinds = acs.shopKinds?.length ? acs.shopKinds : [1, 4, 8];

      // Cyprus kinds from ACS PDF: 1 central, 4 Shop-in-a-Shop, 8 SmartPoints with locker
      for (const kind of kinds) {
        const body = {
          ACSAlias: 'ACS_Stations',
          ACSInputParameters: {
            Company_ID: acs.companyId,
            Company_Password: acs.companyPassword,
            User_ID: acs.userId,
            User_Password: acs.userPassword,
            language: acs.language || 'EN',
            ACS_SHOP_COUNTRY_ID: 'CY',
            ACS_SHOP_KIND: kind,
          },
        };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        let data;
        try {
          const res = await fetch(acs.apiUrl, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              ...FETCH_HEADERS,
              'Content-Type': 'application/json',
              AcsApiKey: acs.apiKey,
              ACSApiKey: acs.apiKey,
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            throw new Error(`ACS HTTP ${res.status}`);
          }
          data = await res.json();
        } finally {
          clearTimeout(timer);
        }

        if (data.ACSExecution_HasError) {
          continue;
        }
        const table =
          data?.ACSOutputResponce?.ACSTableOutput?.Table_Data ||
          data?.ACSOutputResponse?.ACSTableOutput?.Table_Data ||
          [];
        if (!Array.isArray(table)) continue;
        fetched += table.length;

        for (const row of table) {
          const station = String(
            row.ACS_SHOP_STATION_ID_EN ||
              row.ACS_SHOP_STATION_ID ||
              row.Acs_Station_Destination ||
              ''
          ).trim();
          const branch = String(
            row.ACS_SHOP_BRANCH_ID || row.Acs_Station_Branch_Destination || ''
          ).trim();
          const shopId = String(row.ACS_SHOP_ID_CODE || '').trim();
          const externalId = shopId || `${station}-${branch || '0'}-${kind}`;
          if (!station && !branch && !shopId) continue;
          const code = `acs-${externalId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
          keepCodes.add(code);
          const city = normalizeCyprusCity(
            stripHtml(
              row.ACS_SHOP_AREA_DESCR || row.ACS_SHOP_AREA || row.ACS_SHOP_CITY || 'Cyprus'
            )
          );
          const name = stripHtml(
            row.ACS_SHOP_STATION_DESCR ||
              row.ACS_SHOP_DESCRIPTION ||
              row.ACS_SHOP_NAME ||
              `ACS ${externalId}`
          );
          const address = stripHtml(row.ACS_SHOP_ADDRESS || name);
          const hoursParts = [
            row.ACS_SHOP_WORKING_HOURS ? `Mon–Fri ${row.ACS_SHOP_WORKING_HOURS}` : null,
            row.ACS_SHOP_WORKING_HOURS_SATURDAY
              ? `Sat ${row.ACS_SHOP_WORKING_HOURS_SATURDAY}`
              : null,
          ].filter(Boolean);
          const kindLabel =
            kind === 8 ? 'SmartPoint locker' : kind === 4 ? 'Shop-in-a-Shop' : 'Store';

          const action = await PickupStoreService.upsertSyncedStore({
            code,
            provider: 'acs',
            external_id: externalId,
            name: `ACS — ${name} (${kindLabel})`,
            address_line1: address,
            city,
            postal_code: String(row.ACS_SHOP_ZIPCODE || '').trim() || '0000',
            country: 'CY',
            phone: row.ACS_SHOP_PHONES || null,
            hours: hoursParts.join(', ') || null,
            lat: row.ACS_SHOP_LAT,
            lng: row.ACS_SHOP_LONG,
            active: true,
            display_order: 50,
          });
          if (action === 'inserted') inserted += 1;
          else updated += 1;
        }
      }

      if (!keepCodes.size) {
        return {
          ok: false,
          provider: 'acs',
          error: 'ACS returned no Cyprus stations for the configured account',
        };
      }

      await this.deactivateProviderExcept('acs', keepCodes);
      return {
        ok: true,
        provider: 'acs',
        fetched,
        inserted,
        updated,
        active: keepCodes.size,
      };
    } catch (err) {
      return { ok: false, provider: 'acs', error: err.message };
    }
  }

  async deactivateProviderExcept(provider, keepCodes) {
    // Portable: deactivate all for provider, then re-activate keepers one by one if needed.
    // Upserts already set active=true for current codes; deactivate the rest.
    const { pool } = require('../database/db');
    const codes = Array.from(keepCodes || []);
    if (!codes.length) {
      await pool.query(`UPDATE pickup_stores SET active = FALSE WHERE LOWER(provider) = $1`, [
        provider,
      ]);
      return;
    }
    const rows = await pool.query(
      `SELECT id, code FROM pickup_stores WHERE LOWER(provider) = $1`,
      [provider]
    );
    const keep = new Set(codes);
    for (const row of rows.rows) {
      if (!keep.has(row.code)) {
        await pool.query(`UPDATE pickup_stores SET active = FALSE WHERE id = $1`, [row.id]);
      }
    }
  }
}

module.exports = new CourierPickupSyncService();
