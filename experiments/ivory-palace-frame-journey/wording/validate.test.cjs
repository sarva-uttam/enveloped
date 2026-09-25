const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {spawnSync} = require('node:child_process');

const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const load = rel => JSON.parse(read(rel));
const catalogue = load('catalogue.json');
const approved = catalogue.approvedCollections;
const legacy = catalogue.legacyEditorialCandidates;
const APPROVED = 'owner-approved-reusable-wording';
const approvedItems = Object.values(approved).flatMap(c => c.items.filter(x => x.status === APPROVED));
const approvedTexts = new Set(approvedItems.map(x => x.text));
const chapters = ['welcome', 'haldi', 'wedding', 'finale'];
const variants = ['micro', 'conciseMobile', 'standard', 'formalExtended'];
const substitutions = {bride:'Mihika Rajan',groom:'Tanish Narayan',brideFamily:'Rajan',groomFamily:'Narayan',families:'Rajan and Narayan families',brideParents:'Arvind and Meera Rajan',groomParents:'Rajesh and Kavita Narayan',grandparents:'Mahendra and Kamini Rajan',rememberedRelative:'Harish Rajan',charityName:'a charity chosen by the couple'};
const unsafe = /<|>|javascript:|data:text\/html|\bon\w+\s*=/i;
const devanagari = /[ऀ-ॿ]/;
function fill(text, data=substitutions) { return text.replace(/\{(\w+)\}/g, (_, key) => { assert.ok(key in data, `unknown field: ${key}`); return data[key]; }); }

test('approved collection counts are exact', () => {
  const counts = Object.fromEntries(Object.entries(approved).filter(([, c]) => c.status === APPROVED).map(([k, c]) => [k, c.items.length]));
  assert.deepEqual(counts, {
    'welcome.romanticOpenings': 100, 'haldi.titles': 12, 'haldi.introductions': 100, 'haldi.welcomeLines': 100, 'haldi.hostStructures': 10,
    'wedding.titles': 4, 'wedding.invitations': 10, 'wedding.giftPreference': 1, 'finale.presenceLines': 10, 'finale.complimentsSignOff': 1,
  });
  assert.equal(approvedItems.length, 348);
  assert.equal(catalogue.totals.ownerApprovedReusableWording, 348);
  assert.deepEqual(catalogue.totals.byCollection, counts);
  const ids = approvedItems.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'approved IDs are unique');
});

test('every approved sentence is preserved verbatim from its authoritative file', () => {
  const sources = {
    'welcome.romanticOpenings': load('welcome/romantic-openings/openings.json').variations,
    'haldi.titles': load('haldi/titles/titles.json').variations,
    'haldi.introductions': load('haldi/introductions/introductions.json').variations,
    'haldi.welcomeLines': load('haldi/welcome-lines/welcome-lines.json').variations,
    'finale.presenceLines': load('finale/presence-and-compliments/presence-and-compliments.json').presenceLines,
  };
  for (const [key, rows] of Object.entries(sources)) {
    assert.deepEqual(approved[key].items.map(x => [x.id, x.text]), rows.map(x => [x.id, x.text]), key);
  }
  for (const line of read('welcome/romantic-openings/REVIEW-DRAFT.md').match(/^\d{3}\. .+$/gm)) assert.ok(approvedTexts.has(line.slice(5)), line);
  for (const line of read('haldi/introductions/INTRODUCTIONS.md').match(/^HI-\d{3}\. .+$/gm)) assert.ok(approvedTexts.has(line.slice(8)), line);
  for (const line of read('haldi/welcome-lines/WELCOME-LINES.md').match(/^HW-\d{3}\. .+$/gm)) assert.ok(approvedTexts.has(line.slice(8)), line);
  for (const line of read('finale/presence-and-compliments/PRESENCE-AND-COMPLIMENTS.md').match(/^FP-\d{2}\. .+$/gm)) assert.ok(approvedTexts.has(line.slice(7)), line);
  for (const [, id, lead] of read('wedding/invitations/INVITATIONS.md').matchAll(/^\| (WI-\d+) \| [^|]+ \| `([^`]+)` \|$/gm)) {
    assert.equal(approved['wedding.invitations'].items.find(x => x.id === id).text, lead, id);
  }
  for (const host of load('haldi/host-structures/host-structures.json').variations) {
    const row = approved['haldi.hostStructures'].items.find(x => x.id === host.id);
    for (const part of ['hostLine', 'invitationLead', 'nameLine']) assert.equal(row[part], host[part].replace(/^`|`$/g, ''), `${host.id}.${part}`);
  }
});

test('required approved phrases and decisions are present', () => {
  assert.deepEqual(approved['wedding.giftPreference'].items.map(x => x.text), ['No gift boxes please']);
  const titles = approved['wedding.titles'].items;
  assert.deepEqual(titles.map(x => x.id), ['WT-01', 'WT-06', 'WT-10', 'WT-11']);
  assert.deepEqual(titles.map(x => x.text), ['विवाहः', 'विवाहकर्म', 'विवाहयज्ञः', 'Vivah Vidhi']);
  assert.ok(approved['wedding.titles'].unapprovedCandidates.every(x => x.status !== APPROVED));
  const signOff = approved['finale.complimentsSignOff'];
  assert.equal(signOff.items[0].text, 'Best Compliments From:');
  assert.equal(signOff.items[0].fixed, true);
  assert.equal(signOff.familyDisplay.status, 'client-editable-personal-information');
  assert.equal(catalogue.fields['finale.familySignature'].fixedLabel, 'Best Compliments From:');
  assert.equal(approved['finale.presenceLines'].items[0].text, 'Your presence will be highly appreciated.');
  assert.equal(approved['welcome.romanticOpenings'].items[0].text, 'Somehow, every road led them to each other.');
});

test('rejected wording stays rejected and is never offered', () => {
  const symbols = approved['wedding.joiningSymbols'];
  assert.equal(symbols.status, 'rejected');
  assert.equal(symbols.rejectedStudyCount, 5);
  assert.equal(symbols.items.length, 0);
  const rejected = approved['haldi.titles'].rejected;
  assert.deepEqual(rejected.map(x => x.id), ['HT-02', 'HT-04', 'HT-05', 'HT-07', 'HT-12']);
  for (const row of rejected) {
    assert.equal(row.status, 'rejected');
    assert.ok(!approvedTexts.has(row.text), row.id);
  }
  const everythingOffered = JSON.stringify({approved: approvedItems, legacy: legacy.alternatives, families: legacy.families});
  assert.doesNotMatch(everythingOffered, /Haldi Utsav|हल्दी उत्सव/);
  assert.ok(!('giftPreference' in legacy.alternatives), 'legacy gift alternatives are not offered');
  for (const superseded of ['romanticOpening', 'haldiTitle', 'haldiDescription', 'weddingTitle', 'giftPreference']) assert.ok(!(superseded in legacy.alternatives), superseded);
});

test('client facts, sacred language and legacy drafts are not marked universally approved', () => {
  for (const item of approvedItems) {
    if (devanagari.test(item.text) || item.language !== 'en') assert.equal(item.culturalReviewRequired, true, `${item.id} needs cultural review`);
  }
  for (const key of ['haldi.hostStructures', 'wedding.invitations', 'wedding.giftPreference', 'wedding.titles']) {
    assert.ok(approved[key].items.every(x => x.clientFactConfirmationRequired), key);
  }
  for (const key of ['haldi.introductions', 'haldi.welcomeLines']) for (const item of approved[key].items) {
    if (/only if|only when|where appropriate/i.test(item.category)) assert.equal(item.clientFactConfirmationRequired, true, item.id);
  }
  assert.equal(approved['wedding.elderBlessings'].status, 'pending-owner-review');
  assert.ok(approved['wedding.elderBlessings'].items.every(x => x.status === 'pending-owner-review' && x.clientFactConfirmationRequired));
  assert.equal(catalogue.invocations[0].status, 'cultural-review-required');
  assert.equal(legacy.status, 'legacy-editorial-candidate');
  assert.ok(legacy.families.every(x => x.status === 'legacy-editorial-candidate'));
  assert.ok(Object.values(legacy.alternatives).flat().every(x => x.status === 'legacy-editorial-candidate'));
  for (const name of ['brideName', 'groomName', 'brideParents', 'groomParents']) {
    assert.equal(catalogue.fields[`identity.${name}`].contentClass, 'client-editable-personal-information');
  }
  for (const key of ['haldi.date', 'haldi.venue', 'wedding.date', 'wedding.venue', 'wedding.address']) {
    assert.equal(catalogue.fields[key].contentClass, 'client-editable-personal-information', key);
  }
  for (const key of ['welcome.sacredInvocation', 'wedding.sacredHeading', 'wedding.ceremonyTitle', 'haldi.ceremonyTitle']) {
    assert.equal(catalogue.fields[key].culturalReviewStatus, 'cultural-review-required', key);
  }
  for (const [status, text] of Object.entries(catalogue.statusVocabulary)) assert.ok(text.length > 20, status);
});

test('approved and legacy text is safe and fills every placeholder', () => {
  const data = {...substitutions, brideName:'Mihika Rajan', groomName:'Tanish Narayan', brideFamilyName:'Rajan', groomFamilyName:'Narayan', hosts:'Arvind and Meera Rajan', honoureeName:'Mihika Rajan', invitingFamilies:'Rajan and Narayan families', rememberedRelativeName:'Harish Rajan', brideFamilySurname:'Rajan', groomFamilySurname:'Narayan'};
  for (const item of approvedItems) {
    assert.doesNotMatch(item.text, unsafe, item.id);
    assert.ok(!fill(item.text, data).includes('{'), item.id);
    for (const part of ['hostLine', 'nameLine']) if (item[part]) fill(item[part], data);
  }
  assert.equal(fill(approved['finale.complimentsSignOff'].familyDisplay.template, data), 'Rajan & Narayan Family');
});

test('legacy chapters and sizes have stable unique IDs and bounded text', () => {
  assert.equal(legacy.families.length, 10);
  assert.deepEqual(catalogue.frames, {welcome:80,haldi:160,wedding:240,finale:300});
  const ids = new Set(approvedItems.map(x => x.id));
  for (const family of legacy.families) {
    assert.ok(!ids.has(family.id)); ids.add(family.id);
    for (const chapter of chapters) for (const size of variants) {
      const item = family.chapters[chapter][size];
      assert.ok(item.text && item.mobileLines > 0);
      assert.ok(item.text.length <= item.maxRecommendedCharacters, `${family.id}.${chapter}.${size}`);
      assert.doesNotMatch(item.text, unsafe);
      fill(item.text);
    }
  }
  for (const [category, rows] of Object.entries(legacy.alternatives)) for (const row of rows) {
    assert.ok(!ids.has(row.id), `${category}: duplicate ${row.id}`); ids.add(row.id);
    assert.doesNotMatch(row.text, unsafe);
    fill(row.text);
  }
  assert.equal(catalogue.totals.legacyEditorialCandidateStrings, 175);
});

test('required fields and optional omission are explicit', () => {
  assert.equal(catalogue.fields['identity.brideName'].required, true);
  assert.equal(catalogue.fields['wedding.giftPreference'].fallback, 'omit-whole-field');
  assert.equal(catalogue.fields['wedding.giftPreference'].collection, 'wedding.giftPreference');
  assert.equal(catalogue.fields['finale.rsvpHeading'].fallback, 'omit-whole-field');
});

test('long names and multiple hosts remain complete text', () => {
  const expanded = {...substitutions, bride:'Annapoorna Chandrashekhar Ramanathan', groom:'Vishwanathan Krishnamoorthy Narayan', families:'Ramanathan, Narayan, Pillay and Devi families', grandparents:'Mahendra and Kamini Rajan, Shanta Devi and Lalita Pillay'};
  for (const family of legacy.families) for (const chapter of chapters) assert.ok(!fill(family.chapters[chapter].standard.text, expanded).includes('{'));
  for (const row of legacy.alternatives.familyInvitation) assert.ok(!fill(row.text, expanded).includes('{'));
});

test('bilingual and neutral modes and sample data stay distinct', () => {
  assert.ok(legacy.families.filter(x => x.language !== 'en').length >= 3);
  assert.doesNotMatch(JSON.stringify(legacy.families.find(x => x.id === 'neutral-en')), /ॐ|गणेश/);
  assert.equal(catalogue.sample.fictional, true);
  assert.equal(catalogue.sample.rsvpEnabled, false);
  assert.equal(catalogue.sample.events.wedding.time, '1:15 PM');
  assert.equal(catalogue.sample.events.haldi.time, '6:30 PM');
});

test('single invocation is internally consistent and awaits fluent human review', () => {
  assert.equal(catalogue.invocations.length, 1);
  assert.equal(catalogue.invocations[0].devanagari, 'ॐ श्री गणेशाय नमः');
  assert.equal(catalogue.invocations[0].roman, 'Om Shri Ganeshaya Namah');
  assert.equal(catalogue.invocations[0].fluentHumanReviewRequired, true);
});

test('regenerating from build_catalogue.py reproduces catalogue.json exactly', t => {
  const probe = spawnSync('python3', ['--version']);
  if (probe.error) return t.skip('python3 unavailable');
  const before = read('catalogue.json');
  const run = spawnSync('python3', ['build_catalogue.py'], {cwd: __dirname, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(read('catalogue.json'), before);
});
