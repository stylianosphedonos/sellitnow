const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Minimal XLSX reader for simple single-sheet workbooks (shared strings + values).
 * Uses system `unzip` so local-file ZIP quirks in ACS exports are handled correctly.
 */
function readXlsxFirstSheet(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Excel file not found: ${abs}`);

  let sharedStrings = [];
  try {
    sharedStrings = parseSharedStrings(unzipEntry(abs, 'xl/sharedStrings.xml'));
  } catch {
    sharedStrings = [];
  }

  const sheetName = listSheetPaths(abs)[0];
  if (!sheetName) throw new Error('No worksheet found in Excel file');
  return parseSheetRows(unzipEntry(abs, sheetName), sharedStrings);
}

function unzipEntry(filePath, entryName) {
  try {
    return execFileSync('unzip', ['-p', filePath, entryName], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`Could not read ${entryName} from ${filePath}: ${err.message}`);
  }
}

function listSheetPaths(filePath) {
  const listing = execFileSync('unzip', ['-Z1', filePath], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  return listing
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(l))
    .sort();
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const texts = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRe.exec(m[1]))) {
      texts.push(decodeXml(tm[1]));
    }
    strings.push(texts.join(''));
  }
  return strings;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = {};
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] || '';
      const body = cm[2] || '';
      const refMatch = attrs.match(/\br="([A-Z]+)(\d+)"/);
      if (!refMatch) continue;
      const col = refMatch[1];
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : null;
      const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = body.match(/<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>/);
      if (isMatch) {
        cells[col] = decodeXml(isMatch[1]);
        continue;
      }
      if (!vMatch) {
        cells[col] = null;
        continue;
      }
      const raw = decodeXml(vMatch[1]);
      cells[col] = type === 's' ? sharedStrings[Number(raw)] ?? null : raw;
    }
    rows.push(cells);
  }
  return rows;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function resolveDefaultAcsExcelPath() {
  const fromEnv = String(process.env.ACS_NETWORK_XLSX || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const candidates = [
    path.resolve(__dirname, '../../data/acs-network-locations.xlsx'),
    path.resolve(__dirname, '../database/fixtures/acs-network-locations.xlsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1];
}

module.exports = {
  readXlsxFirstSheet,
  resolveDefaultAcsExcelPath,
};
