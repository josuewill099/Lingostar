#!/usr/bin/env node
// lingostar.ai — programmatic conjugation page pipeline (pilot).
// Parses Jehle verb DB -> per-verb JSON with irregularity analysis.
// Node port of build_verbs.py (Python unavailable on this machine).
import fs from 'node:fs';

const TOP_VERBS = ["ser","estar","tener","hacer","poder","decir","ir","ver","dar","saber",
"querer","llegar","pasar","deber","poner","parecer","quedar","creer","hablar","llevar",
"dejar","seguir","encontrar","llamar","venir","pensar","salir","volver","tomar","conocer",
"vivir","sentir","mirar","contar","empezar","esperar","buscar","entrar","trabajar","escribir",
"perder","ocurrir","entender","pedir","recibir","recordar","terminar","permitir","aparecer","comenzar"];

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const ENDINGS = {
 ar: { Presente: ['o','as','a','amos','áis','an'],
       Imperfecto: ['aba','abas','aba','ábamos','abais','aban'],
       'Pretérito': ['é','aste','ó','amos','asteis','aron'] },
 er: { Presente: ['o','es','e','emos','éis','en'],
       Imperfecto: ['ía','ías','ía','íamos','íais','ían'],
       'Pretérito': ['í','iste','ió','imos','isteis','ieron'] },
 ir: { Presente: ['o','es','e','imos','ís','en'],
       Imperfecto: ['ía','ías','ía','íamos','íais','ían'],
       'Pretérito': ['í','iste','ió','imos','isteis','ieron'] },
};

function regularForms(inf, tense) {
  const stem = inf.slice(0, -2), cls = inf.slice(-2);
  if (!ENDINGS[cls] || !ENDINGS[cls][tense]) return null;
  return ENDINGS[cls][tense].map(e => stem + e);
}

// --- Conjugation drill (3 questions per verb, precomputed at build time) --
// Irregular verbs: 2 questions biased to the person where an irregular
// tense diverges most from the regular reconstruction (Levenshtein
// distance against regularForms()), plus 1 easy Present/Preterite question
// so beginners get a win. Fully-regular verbs get a Pretérito/Imperfecto
// contrast pair (same person, two tenses) instead -- that's their real
// difficulty -- plus the same easy win.

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// No full phonological-rule classifier here -- instead, mechanically isolate
// the substring that actually changed between the regular reconstruction and
// the real form. It's more literal than "irregular stem hic-" but always
// accurate and still tells the learner exactly what to watch for.
function describeIrregularity(regular, actual) {
  if (!regular || !actual || regular === actual) return 'irregular form';
  const maxPrefix = Math.min(regular.length, actual.length);
  let i = 0;
  while (i < maxPrefix && regular[i] === actual[i]) i++;
  const maxSuffix = Math.min(regular.length - i, actual.length - i);
  let j = 0;
  while (j < maxSuffix && regular[regular.length - 1 - j] === actual[actual.length - 1 - j]) j++;
  const regMid = regular.slice(i, regular.length - j);
  const actMid = actual.slice(i, actual.length - j);
  if (!regMid && !actMid) return 'irregular form';
  if (!regMid) return `adds "${actMid}"`;
  if (!actMid) return `drops "${regMid}"`;
  return `"${regMid}" changes to "${actMid}"`;
}

function buildDrill(v) {
  const cls = v.verb_class;
  const indicative = v.moods['Indicative'] || {};

  function tenseInfo(tenseKey) {
    const t = indicative[tenseKey];
    if (!t) return null;
    const reg = ENDINGS[cls] ? regularForms(v.infinitive, t.tense_es) : null;
    return { t, reg };
  }

  const items = [];
  const used = new Set();

  function pushItem(tenseKey, personIndex, note) {
    const info = tenseInfo(tenseKey);
    if (!info || !info.t.forms[personIndex]) return false;
    const key = `${tenseKey}|${personIndex}`;
    if (used.has(key)) return false;
    used.add(key);
    items.push({ tense: tenseKey, tenseEs: info.t.tense_es, personIndex, answer: info.t.forms[personIndex], note });
    return true;
  }

  function divergenceScores(info) {
    return info.t.forms.map((actual, i) => {
      const regular = info.reg ? info.reg[i] : null;
      if (!actual || !regular) return -1;
      return levenshtein(actual.toLowerCase(), regular.toLowerCase());
    });
  }

  if (v.is_irregular) {
    const priority = ['Preterite', 'Present', 'Imperfect'];
    const candidates = [];
    for (const tenseKey of priority) {
      if (!v.irregular_tenses.includes(tenseKey)) continue;
      const info = tenseInfo(tenseKey);
      if (!info || !info.reg) continue;
      divergenceScores(info).forEach((score, personIndex) => {
        if (score > 0) candidates.push({ tenseKey, personIndex, score });
      });
    }
    candidates.sort((a, b) => b.score - a.score);

    for (const c of candidates) {
      if (items.length >= 2) break;
      const info = tenseInfo(c.tenseKey);
      const note = describeIrregularity(info.reg[c.personIndex], info.t.forms[c.personIndex]);
      pushItem(c.tenseKey, c.personIndex, note);
    }

    for (const tenseKey of ['Present', 'Preterite']) {
      if (items.length >= 3) break;
      const info = tenseInfo(tenseKey);
      if (!info) continue;
      const scores = divergenceScores(info);
      const order = scores.map((s, i) => [s < 0 ? Infinity : s, i]).sort((a, b) => a[0] - b[0]);
      for (const [, personIndex] of order) {
        if (pushItem(tenseKey, personIndex, '')) break;
      }
    }
  } else {
    let person = 0;
    const pInfo = tenseInfo('Preterite'), iInfo = tenseInfo('Imperfect');
    for (let p = 0; p < 6; p++) {
      if (pInfo?.t.forms[p] && iInfo?.t.forms[p]) { person = p; break; }
    }
    pushItem('Preterite', person, 'pretérito marks a single completed action');
    pushItem('Imperfect', person, 'imperfecto marks an ongoing or repeated past action, not a one-time event');

    const info = tenseInfo('Present');
    if (info) {
      const winPerson = info.t.forms[(person + 1) % 6] ? (person + 1) % 6 : 0;
      pushItem('Present', winPerson, '');
    }
  }

  return items.slice(0, 3);
}

// Minimal RFC-4180 CSV parser (handles quoted fields containing commas).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const csvText = fs.readFileSync(new URL('./data/jehle_verbs.csv', import.meta.url), 'utf-8').replace(/^﻿/, '');
const records = parseCSV(csvText);

const rowsByInf = new Map();
for (const r of records) {
  if (!rowsByInf.has(r.infinitive)) rowsByInf.set(r.infinitive, []);
  rowsByInf.get(r.infinitive).push(r);
}

const verbs = {};
for (const [inf, entries] of rowsByInf) {
  const v = {
    infinitive: inf,
    english: entries[0].infinitive_english,
    gerund: entries[0].gerund,
    past_participle: entries[0].pastparticiple,
    verb_class: ['ar','er','ir'].includes(inf.slice(-2)) ? inf.slice(-2) : 'other',
    moods: {},
    irregular_tenses: [],
  };
  for (const e of entries) {
    const forms = ['form_1s','form_2s','form_3s','form_1p','form_2p','form_3p'].map(k => e[k]);
    if (!v.moods[e.mood_english]) v.moods[e.mood_english] = {};
    v.moods[e.mood_english][e.tense_english] = { tense_es: e.tense, english_gloss: e.verb_english, forms };
    if (e.mood_english === 'Indicative' && ['Presente','Imperfecto','Pretérito'].includes(e.tense)) {
      const reg = regularForms(inf, e.tense);
      if (reg && forms.some((a, i) => a && a !== reg[i])) v.irregular_tenses.push(e.tense_english);
    }
  }
  v.is_irregular = v.irregular_tenses.length > 0;
  verbs[inf] = v;
}

const OUT_DIR = 'src/content/verbs';
fs.mkdirSync(OUT_DIR, { recursive: true });

const available = TOP_VERBS.filter(w => verbs[w]);
available.forEach((w, i) => {
  verbs[w].frequency_rank = i + 1;
  const sameClass = available.filter(x => x !== w && verbs[x].verb_class === verbs[w].verb_class);
  const neighbors = available.slice(Math.max(0, i - 3), i + 4).filter(x => x !== w);
  verbs[w].related = [...new Set([...sameClass.slice(0, 3), ...neighbors.slice(0, 3)])].slice(0, 5);
  verbs[w].slug = stripAccents(w);
  verbs[w].drill = buildDrill(verbs[w]);
  fs.writeFileSync(`${OUT_DIR}/${stripAccents(w)}.json`, JSON.stringify(verbs[w], null, 1), 'utf-8');
});

console.log(`Verbs in DB: ${Object.keys(verbs).length} | Pilot batch generated: ${available.length}`);
console.log('Irregular in pilot:', available.filter(w => verbs[w].is_irregular).length);
const t = verbs['tener'];
console.log('Sample (tener):', JSON.stringify({
  english: t.english, is_irregular: t.is_irregular, irregular_tenses: t.irregular_tenses,
  related: t.related, frequency_rank: t.frequency_rank,
}));
