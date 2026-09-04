#!/usr/bin/env node
// lingostar.ai — French conjugation page pipeline (pilot).
// Sources full paradigms from french-verbs-lefff (LGPL-LR) via the
// french-verbs conjugation engine, reshapes them into the same
// moods -> tense -> forms[6] structure scripts/build_verbs.mjs produces
// for Spanish, and writes one JSON file per verb to
// src/content/frenchVerbs/. English glosses aren't in the Lefff data, so
// they're hand-curated below (ENGLISH_GLOSS), same pattern as the
// FR_MEANING/PT_MEANING lookups already used for the Spanish pages.
import fs from 'node:fs';
import * as fv from 'french-verbs';
import verbsData from 'french-verbs-lefff/dist/conjugations.json' with { type: 'json' };

// Roughly the 50 most common French verbs, front-loaded with irregular/
// 3rd-group verbs (where the pilot's irregularity badges matter most) and
// topped up with regular -er verbs. Trimmed to 50 after filtering against
// what french-verbs-lefff actually has.
const TOP_VERBS = [
  "être","avoir","faire","aller","dire","pouvoir","vouloir","devoir","savoir","voir",
  "venir","prendre","mettre","sortir","partir","tenir","connaître","croire","écrire","lire",
  "vivre","suivre","boire","courir","ouvrir",
  "attendre","vendre","répondre","rendre","descendre",
  "finir","choisir","réussir","réfléchir","obéir","grandir","remplir",
  "parler","aimer","donner","chercher","trouver","demander","rester","passer","arriver","entrer",
  "montrer","jouer","penser","sembler","laisser","marcher","tomber","regarder","écouter","aider",
];

const ENGLISH_GLOSS = {
  être: "to be", avoir: "to have", faire: "to do, make", aller: "to go", dire: "to say, tell",
  pouvoir: "to be able to, can", vouloir: "to want", devoir: "to have to, must, owe", savoir: "to know (a fact)",
  voir: "to see", venir: "to come", prendre: "to take", mettre: "to put, place", sortir: "to go out, leave",
  partir: "to leave, depart", tenir: "to hold", "connaître": "to know (a person/place)", croire: "to believe",
  "écrire": "to write", lire: "to read", vivre: "to live", suivre: "to follow", boire: "to drink",
  courir: "to run", ouvrir: "to open", attendre: "to wait for", vendre: "to sell", "répondre": "to answer, respond",
  rendre: "to give back, return", descendre: "to go down, descend", finir: "to finish", choisir: "to choose",
  "réussir": "to succeed", "réfléchir": "to think, reflect", "obéir": "to obey", grandir: "to grow (up)",
  remplir: "to fill", parler: "to speak, talk", aimer: "to like, love", donner: "to give", chercher: "to look for",
  trouver: "to find", demander: "to ask (for)", rester: "to stay, remain", passer: "to pass, spend (time)",
  arriver: "to arrive, happen", entrer: "to enter", montrer: "to show", jouer: "to play", penser: "to think",
  sembler: "to seem", laisser: "to let, leave", marcher: "to walk, work (function)", tomber: "to fall",
  regarder: "to look at, watch", "écouter": "to listen to", aider: "to help",
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const PERSON_COUNT = 6; // je, tu, il/elle/on, nous, vous, ils/elles

// Universal French imperfect rule: stem is the present "nous" form minus
// "-ons", plus the fixed endings below. True for ~every French verb
// except être (whose imperfect stem "ét-" isn't derived from "sommes") --
// that irregularity is exactly what comparing against actual data catches.
const IMPARFAIT_ENDINGS = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];

const ER_ENDINGS = {
  Present: ['e', 'es', 'e', 'ons', 'ez', 'ent'],
  Preterite: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'],
};
const IR_ENDINGS = {
  Present: ['is', 'is', 'it', 'issons', 'issez', 'issent'],
  Preterite: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'],
};

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

function isVowelStart(s) {
  return /^[aeiouyhâàéèêëîïôùû]/i.test(s || '');
}

// Mechanically report the substring that changed, same approach as
// build_verbs.mjs's describeIrregularity() -- not a phonological
// classifier, just an accurate "here's what differs" note.
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

function getForms(verb, tense, aux) {
  const composed = fv.isComposedTense(tense) ? { aux } : undefined;
  const forms = [];
  for (let p = 0; p < PERSON_COUNT; p++) {
    try {
      forms.push(fv.getConjugation(verbsData, verb, tense, p, composed));
    } catch {
      forms.push('');
    }
  }
  return forms;
}

function getNegativeImperative(verb) {
  const forms = [];
  for (let p = 0; p < PERSON_COUNT; p++) {
    try {
      const positive = fv.getConjugation(verbsData, verb, 'IMPERATIF_PRESENT', p);
      forms.push(isVowelStart(positive) ? `n'${positive} pas` : `ne ${positive} pas`);
    } catch {
      forms.push('');
    }
  }
  return forms;
}

function classify(verb, presentForms) {
  if (verb === 'aller') return 'irregular';
  if (verb.endsWith('er')) return 'er';
  if (verb.endsWith('ir') && (presentForms[3] || '').includes('iss')) return 'ir';
  return 'irregular';
}

// Compares actual forms against a mechanically-reconstructed "regular"
// guess (per-class endings for Present/Preterite, the universal
// nous-stem rule for Imperfect) and flags tenses that diverge. Mirrors
// build_verbs.mjs's regularForms()/is_irregular approach for Spanish --
// not a full grammar model, just consistent and accurate about what
// differs from the pattern.
function checkIrregularity(verb, verbClass, moodsIndicative) {
  const irregular = new Set();
  const present = moodsIndicative.Present.forms;
  const preterite = moodsIndicative.Preterite.forms;
  const imperfect = moodsIndicative.Imperfect.forms;

  if (verbClass === 'irregular') {
    irregular.add('Present');
    irregular.add('Preterite');
  } else {
    const stem = verb.slice(0, -2);
    const endings = verbClass === 'er' ? ER_ENDINGS : IR_ENDINGS;
    const regPresent = endings.Present.map((e) => stem + e);
    const regPreterite = endings.Preterite.map((e) => stem + e);
    if (present.some((f, i) => f && f !== regPresent[i])) irregular.add('Present');
    if (preterite.some((f, i) => f && f !== regPreterite[i])) irregular.add('Preterite');
  }

  // Universal imperfect rule: nous-present stem (minus "-ons") + endings.
  const nousPresent = present[3] || '';
  if (nousPresent.endsWith('ons')) {
    const impStem = nousPresent.slice(0, -3);
    const regImperfect = IMPARFAIT_ENDINGS.map((e) => impStem + e);
    if (imperfect.some((f, i) => f && f !== regImperfect[i])) irregular.add('Imperfect');
  }

  return [...irregular];
}

const available = TOP_VERBS.filter((w) => verbsData[w]).slice(0, 50);

// Precompute each verb's class up front so related-verb lookups can
// compare classes without reconjugating every candidate.
const classByVerb = new Map(
  available.map((verb) => [verb, classify(verb, getForms(verb, 'PRESENT', fv.alwaysAuxEtre(verb) ? 'ETRE' : 'AVOIR'))])
);

const OUT_DIR = 'src/content/frenchVerbs';
fs.mkdirSync(OUT_DIR, { recursive: true });

available.forEach((verb, i) => {
  const aux = fv.alwaysAuxEtre(verb) ? 'ETRE' : 'AVOIR';

  const present = getForms(verb, 'PRESENT', aux);
  const verbClass = classByVerb.get(verb);

  const moodsIndicative = {
    Present: { tense_fr: 'Présent', forms: present },
    Future: { tense_fr: 'Futur', forms: getForms(verb, 'FUTUR', aux) },
    Imperfect: { tense_fr: 'Imparfait', forms: getForms(verb, 'IMPARFAIT', aux) },
    Preterite: { tense_fr: 'Passé simple', forms: getForms(verb, 'PASSE_SIMPLE', aux) },
    Conditional: { tense_fr: 'Conditionnel', forms: getForms(verb, 'CONDITIONNEL_PRESENT', aux) },
    'Present Perfect': { tense_fr: 'Passé composé', forms: getForms(verb, 'PASSE_COMPOSE', aux) },
    'Future Perfect': { tense_fr: 'Futur antérieur', forms: getForms(verb, 'FUTUR_ANTERIEUR', aux) },
    'Past Perfect': { tense_fr: 'Plus-que-parfait', forms: getForms(verb, 'PLUS_QUE_PARFAIT', aux) },
    'Preterite (Archaic)': { tense_fr: 'Passé antérieur', forms: getForms(verb, 'PASSE_ANTERIEUR', aux) },
    'Conditional Perfect': { tense_fr: 'Conditionnel passé', forms: getForms(verb, 'CONDITIONNEL_PASSE_1', aux) },
  };

  const moodsSubjunctive = {
    Present: { tense_fr: 'Présent', forms: getForms(verb, 'SUBJONCTIF_PRESENT', aux) },
    Imperfect: { tense_fr: 'Imparfait', forms: getForms(verb, 'SUBJONCTIF_IMPARFAIT', aux) },
    'Present Perfect': { tense_fr: 'Passé', forms: getForms(verb, 'SUBJONCTIF_PASSE', aux) },
    'Past Perfect': { tense_fr: 'Plus-que-parfait', forms: getForms(verb, 'SUBJONCTIF_PLUS_QUE_PARFAIT', aux) },
  };

  const imperativePositive = getForms(verb, 'IMPERATIF_PRESENT', aux);

  const v = {
    infinitive: verb,
    english: ENGLISH_GLOSS[verb] || verb,
    gerund: fv.getConjugation(verbsData, verb, 'PARTICIPE_PRESENT', null),
    past_participle: fv.getConjugation(verbsData, verb, 'PARTICIPE_PASSE', null, { aux }),
    verb_class: verbClass,
    moods: {
      Indicative: moodsIndicative,
      Subjunctive: moodsSubjunctive,
      'Imperative Affirmative': { Present: { tense_fr: 'Présent', forms: imperativePositive } },
      'Imperative Negative': { Present: { tense_fr: 'Présent', forms: getNegativeImperative(verb) } },
    },
    irregular_tenses: checkIrregularity(verb, verbClass, moodsIndicative),
    frequency_rank: i + 1,
    slug: stripAccents(verb),
  };
  v.is_irregular = v.irregular_tenses.length > 0;

  const sameClass = available.filter((x) => x !== verb && classByVerb.get(x) === verbClass);
  const neighbors = available.slice(Math.max(0, i - 3), i + 4).filter((x) => x !== verb);
  v.related = [...new Set([...sameClass.slice(0, 3), ...neighbors.slice(0, 3)])].slice(0, 5).map(stripAccents);

  fs.writeFileSync(`${OUT_DIR}/${v.slug}.json`, JSON.stringify(v, null, 1), 'utf-8');
});

console.log(`French verbs available in Lefff: ${TOP_VERBS.filter((w) => verbsData[w]).length} | Pilot batch generated: ${available.length}`);
console.log('Irregular in pilot:', available.filter((w) => JSON.parse(fs.readFileSync(`${OUT_DIR}/${stripAccents(w)}.json`, 'utf-8')).is_irregular).length);
