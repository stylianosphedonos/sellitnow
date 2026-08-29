const GREEK_RE = /[\u0370-\u03FF\u1F00-\u1FFF]/;

function containsGreek(value) {
  return GREEK_RE.test(String(value || ''));
}

function trimToNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

async function copyGreekContentToElColumns(pool) {
  const products = await pool.query(
    'SELECT id, title, title_el, description, description_el FROM products'
  );
  for (const row of products.rows || []) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (isBlank(row.title_el) && containsGreek(row.title)) {
      sets.push(`title_el = $${i++}`);
      vals.push(row.title);
    }
    if (isBlank(row.description_el) && containsGreek(row.description)) {
      sets.push(`description_el = $${i++}`);
      vals.push(row.description);
    }
    if (!sets.length) continue;
    vals.push(row.id);
    await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  }

  const categories = await pool.query(
    'SELECT id, name, name_el, description, description_el, request_prompt, request_prompt_el FROM categories'
  );
  for (const row of categories.rows || []) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (isBlank(row.name_el) && containsGreek(row.name)) {
      sets.push(`name_el = $${i++}`);
      vals.push(row.name);
    }
    if (isBlank(row.description_el) && containsGreek(row.description)) {
      sets.push(`description_el = $${i++}`);
      vals.push(row.description);
    }
    if (isBlank(row.request_prompt_el) && containsGreek(row.request_prompt)) {
      sets.push(`request_prompt_el = $${i++}`);
      vals.push(row.request_prompt);
    }
    if (!sets.length) continue;
    vals.push(row.id);
    await pool.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  }
}

module.exports = {
  containsGreek,
  trimToNull,
  isBlank,
  copyGreekContentToElColumns,
};
