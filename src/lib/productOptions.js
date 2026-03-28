function parseOptionsJson(raw) {
  if (raw == null || raw === '') return { colors: [], sizes: [] };
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const uniq = (arr) =>
      [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean))];
    return { colors: uniq(o.colors), sizes: uniq(o.sizes) };
  } catch {
    return { colors: [], sizes: [] };
  }
}

function stringifyOptionsJson(options) {
  const colors = Array.isArray(options?.colors) ? options.colors : [];
  const sizes = Array.isArray(options?.sizes) ? options.sizes : [];
  const uniq = (arr) => [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
  return JSON.stringify({ colors: uniq(colors), sizes: uniq(sizes) });
}

function validateVariantForProduct(product, color, size) {
  const opts =
    product.options && typeof product.options === 'object'
      ? {
          colors: Array.isArray(product.options.colors) ? product.options.colors : [],
          sizes: Array.isArray(product.options.sizes) ? product.options.sizes : [],
        }
      : parseOptionsJson(product.options_json);
  const c = (color || '').trim();
  const s = (size || '').trim();
  if (opts.colors.length > 0 && !c) {
    throw new Error('Please choose a color');
  }
  if (opts.sizes.length > 0 && !s) {
    throw new Error('Please choose a size');
  }
  return { color: c, size: s };
}

module.exports = { parseOptionsJson, stringifyOptionsJson, validateVariantForProduct };
