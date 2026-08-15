/**
 * Canonical Cyprus city labels used in checkout (aligned with Akis English names).
 * Greek Box Now localities and common suburbs map into these districts.
 */

const CANONICAL = {
  NICOSIA: 'Nicosia',
  LIMASSOL: 'Limassol',
  LARNACA: 'Larnaca',
  PAPHOS: 'Paphos',
  AMMOCHOSTOS: 'Ammochostos',
  POLIS: 'Polis',
};

/** Lowercased keys (Greek + Latin + common variants) → canonical English city */
const CITY_TO_CANONICAL = {
  // Nicosia district
  nicosia: CANONICAL.NICOSIA,
  lefkosia: CANONICAL.NICOSIA,
  lefkosía: CANONICAL.NICOSIA,
  λευκωσία: CANONICAL.NICOSIA,
  στρόβολος: CANONICAL.NICOSIA,
  strovolos: CANONICAL.NICOSIA,
  έγκωμη: CANONICAL.NICOSIA,
  engomi: CANONICAL.NICOSIA,
  egkomi: CANONICAL.NICOSIA,
  λακατάμεια: CANONICAL.NICOSIA,
  lakatamia: CANONICAL.NICOSIA,
  αγλαντζιά: CANONICAL.NICOSIA,
  aglantzia: CANONICAL.NICOSIA,
  λατσιά: CANONICAL.NICOSIA,
  latsia: CANONICAL.NICOSIA,
  δευτερά: CANONICAL.NICOSIA,
  deftera: CANONICAL.NICOSIA,
  γέρι: CANONICAL.NICOSIA,
  geri: CANONICAL.NICOSIA,
  τσέρι: CANONICAL.NICOSIA,
  tseri: CANONICAL.NICOSIA,
  ιδάλιον: CANONICAL.NICOSIA,
  idalion: CANONICAL.NICOSIA,
  δακλιά: CANONICAL.NICOSIA,
  κοκκινοτριμιθιά: CANONICAL.NICOSIA,
  kokkinotrimithia: CANONICAL.NICOSIA,
  αρεδιού: CANONICAL.NICOSIA,
  arediou: CANONICAL.NICOSIA,
  αστρομερίτης: CANONICAL.NICOSIA,
  ακάκι: CANONICAL.NICOSIA,
  ψιμολόφου: CANONICAL.NICOSIA,
  'πέρα χωριό': CANONICAL.NICOSIA,
  λύμπια: CANONICAL.NICOSIA,
  'καλό χωριό': CANONICAL.NICOSIA,
  μοσφιλωτή: CANONICAL.NICOSIA,

  // Limassol district
  limassol: CANONICAL.LIMASSOL,
  lemesos: CANONICAL.LIMASSOL,
  λεμεσός: CANONICAL.LIMASSOL,
  γερμασόγεια: CANONICAL.LIMASSOL,
  germasogeia: CANONICAL.LIMASSOL,
  ύψωνας: CANONICAL.LIMASSOL,
  ypsonas: CANONICAL.LIMASSOL,
  'μέσα γειτονιά': CANONICAL.LIMASSOL,
  'mesa geitonia': CANONICAL.LIMASSOL,
  'κάτω πολεμίδια': CANONICAL.LIMASSOL,
  'kato polemidia': CANONICAL.LIMASSOL,
  'αγ. αθανάσιος': CANONICAL.LIMASSOL,
  'αγία φύλα λεμεσός': CANONICAL.LIMASSOL,
  agiosathanasios: CANONICAL.LIMASSOL,
  μουτταγιάκα: CANONICAL.LIMASSOL,
  mouttagiaka: CANONICAL.LIMASSOL,

  // Larnaca district
  larnaca: CANONICAL.LARNACA,
  larnaka: CANONICAL.LARNACA,
  λάρνακα: CANONICAL.LARNACA,
  αραδίππου: CANONICAL.LARNACA,
  aradippou: CANONICAL.LARNACA,
  λιβάδια: CANONICAL.LARNACA,
  livadia: CANONICAL.LARNACA,
  κίτι: CANONICAL.LARNACA,
  kiti: CANONICAL.LARNACA,
  ορόκλινη: CANONICAL.LARNACA,
  oroklini: CANONICAL.LARNACA,
  μενεού: CANONICAL.LARNACA,
  meneou: CANONICAL.LARNACA,
  μαζωτός: CANONICAL.LARNACA,
  πύλα: CANONICAL.LARNACA,
  pyla: CANONICAL.LARNACA,
  ξυλοτύμπου: CANONICAL.LARNACA,
  ορμίδεια: CANONICAL.LARNACA,
  σκαρίνου: CANONICAL.LARNACA,
  αθηένου: CANONICAL.LARNACA,
  αγγλισίδες: CANONICAL.LARNACA,
  τρούλλοι: CANONICAL.LARNACA,

  // Paphos district
  paphos: CANONICAL.PAPHOS,
  pafos: CANONICAL.PAPHOS,
  πάφος: CANONICAL.PAPHOS,
  έμπα: CANONICAL.PAPHOS,
  empa: CANONICAL.PAPHOS,
  γεροσκήπου: CANONICAL.PAPHOS,
  geroskipou: CANONICAL.PAPHOS,

  // Famagusta / Ammochostos free areas
  ammochostos: CANONICAL.AMMOCHOSTOS,
  famagusta: CANONICAL.AMMOCHOSTOS,
  αμμόχωστος: CANONICAL.AMMOCHOSTOS,
  παραλίμνι: CANONICAL.AMMOCHOSTOS,
  paralimni: CANONICAL.AMMOCHOSTOS,
  'αγ. νάπα': CANONICAL.AMMOCHOSTOS,
  'αγία νάπα': CANONICAL.AMMOCHOSTOS,
  ayianapa: CANONICAL.AMMOCHOSTOS,
  'agia napa': CANONICAL.AMMOCHOSTOS,
  δερύνεια: CANONICAL.AMMOCHOSTOS,
  deryneia: CANONICAL.AMMOCHOSTOS,
  σωτήρα: CANONICAL.AMMOCHOSTOS,
  φρέναρος: CANONICAL.AMMOCHOSTOS,
  αυγόρου: CANONICAL.AMMOCHOSTOS,
  ξυλοφάγου: CANONICAL.AMMOCHOSTOS,
  πρωταράς: CANONICAL.AMMOCHOSTOS,
  protaras: CANONICAL.AMMOCHOSTOS,
  λιόπετρι: CANONICAL.AMMOCHOSTOS,
  λιοπέτρι: CANONICAL.AMMOCHOSTOS,

  // Polis
  polis: CANONICAL.POLIS,
  'πόλη χρυσοχούς': CANONICAL.POLIS,
  'polis chrysochous': CANONICAL.POLIS,
};

function foldKey(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Map a raw locality (Greek/English/suburb) to a checkout city label.
 * Unknown values are returned trimmed unchanged.
 */
function normalizeCyprusCity(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const mapped = CITY_TO_CANONICAL[foldKey(raw)];
  if (mapped) return mapped;
  // Collapse "Ag. X" / spacing variants already covered; keep original otherwise
  return raw;
}

/**
 * All known raw labels that belong to the same canonical city (for DB filters).
 */
function cityFilterValues(city) {
  const canonical = normalizeCyprusCity(city);
  if (!canonical) return [];
  const values = new Set([canonical, String(city || '').trim()].filter(Boolean));
  for (const [key, canon] of Object.entries(CITY_TO_CANONICAL)) {
    if (canon === canonical) values.add(key);
  }
  // Also include original Greek forms with proper casing from keys — SQL uses LOWER()
  return [...values];
}

function sortCheckoutCities(cities) {
  const preferred = [
    CANONICAL.NICOSIA,
    CANONICAL.LIMASSOL,
    CANONICAL.LARNACA,
    CANONICAL.PAPHOS,
    CANONICAL.AMMOCHOSTOS,
    CANONICAL.POLIS,
  ];
  return [...cities].sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  });
}

module.exports = {
  CANONICAL,
  normalizeCyprusCity,
  cityFilterValues,
  sortCheckoutCities,
};
