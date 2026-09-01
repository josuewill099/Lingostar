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
  fs.writeFileSync(`${OUT_DIR}/${stripAccents(w)}.json`, JSON.stringify(verbs[w], null, 1), 'utf-8');
});

console.log(`Verbs in DB: ${Object.keys(verbs).length} | Pilot batch generated: ${available.length}`);
console.log('Irregular in pilot:', available.filter(w => verbs[w].is_irregular).length);
const t = verbs['tener'];
console.log('Sample (tener):', JSON.stringify({
  english: t.english, is_irregular: t.is_irregular, irregular_tenses: t.irregular_tenses,
  related: t.related, frequency_rank: t.frequency_rank,
}));
