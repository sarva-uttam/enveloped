const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue.json'), 'utf8'));
const chapters = ['welcome', 'haldi', 'wedding', 'finale'];
const variants = ['micro', 'conciseMobile', 'standard', 'formalExtended'];
const substitutions = {bride:'Mihika Rajan',groom:'Tanish Narayan',brideFamily:'Rajan',groomFamily:'Narayan',families:'Rajan and Narayan families',brideParents:'Arvind and Meera Rajan',groomParents:'Rajesh and Kavita Narayan',grandparents:'Mahendra and Kamini Rajan',rememberedRelative:'Harish Rajan',charityName:'a charity chosen by the couple'};
function fill(text, data=substitutions) { return text.replace(/\{(\w+)\}/g, (_, key) => { assert.ok(key in data, `unknown field: ${key}`); return data[key]; }); }

test('all chapters and sizes have stable unique IDs and safe, bounded candidate text', () => {
  assert.equal(catalogue.families.length, 10);
  assert.deepEqual(catalogue.frames, {welcome:80,haldi:160,wedding:240,finale:300});
  const ids = new Set();
  for (const family of catalogue.families) {
    assert.ok(!ids.has(family.id)); ids.add(family.id);
    for (const chapter of chapters) for (const size of variants) {
      const item = family.chapters[chapter][size];
      assert.ok(item.text && item.mobileLines > 0);
      assert.ok(item.text.length <= item.maxRecommendedCharacters, `${family.id}.${chapter}.${size}`);
      assert.doesNotMatch(item.text, /<|>|javascript:|data:text\/html|\bon\w+\s*=/i);
      fill(item.text);
    }
  }
  for (const [category, rows] of Object.entries(catalogue.alternatives)) for (const row of rows) {
    assert.ok(!ids.has(row.id), `${category}: duplicate ${row.id}`); ids.add(row.id);
    assert.doesNotMatch(row.text, /<|>|javascript:|data:text\/html|\bon\w+\s*=/i);
    fill(row.text);
  }
});

test('required fields and optional omission are explicit', () => {
  assert.equal(catalogue.fields['identity.brideName'].required, true);
  assert.equal(catalogue.fields['wedding.giftPreference'].fallback, 'omit-whole-field');
  assert.equal(catalogue.fields['finale.rsvpHeading'].fallback, 'omit-whole-field');
  assert.equal(catalogue.alternatives.giftPreference.find(x => x.id.endsWith('.omit')).text, '');
});

test('long names and multiple hosts remain complete text, and optional clauses stand alone', () => {
  const expanded = {...substitutions, bride:'Annapoorna Chandrashekhar Ramanathan', groom:'Vishwanathan Krishnamoorthy Narayan', families:'Ramanathan, Narayan, Pillay and Devi families', grandparents:'Mahendra and Kamini Rajan, Shanta Devi and Lalita Pillay'};
  for (const family of catalogue.families) for (const chapter of chapters) assert.ok(!fill(family.chapters[chapter].standard.text, expanded).includes('{'));
  for (const row of catalogue.alternatives.familyInvitation) assert.ok(!fill(row.text, expanded).includes('{'));
});

test('bilingual and neutral modes, RSVP presence and gift meanings stay distinct', () => {
  assert.ok(catalogue.families.filter(x => x.language !== 'en').length >= 3);
  assert.doesNotMatch(JSON.stringify(catalogue.families.find(x => x.id === 'neutral-en')), /ॐ|गणेश/);
  const copy = {...catalogue.sample, rsvpEnabled:true};
  assert.equal(copy.rsvpEnabled, true); assert.equal(catalogue.sample.rsvpEnabled, false);
  const gifts = catalogue.alternatives.giftPreference.map(x => x.text);
  assert.equal(new Set(gifts).size, 6);
  assert.equal(catalogue.sample.events.wedding.time, '1:15 PM');
  assert.equal(catalogue.sample.events.haldi.time, '6:30 PM');
});

test('single invocation is internally consistent and awaits fluent human review', () => {
  assert.equal(catalogue.invocations.length, 1);
  assert.equal(catalogue.invocations[0].devanagari, 'ॐ श्री गणेशाय नमः');
  assert.equal(catalogue.invocations[0].roman, 'Om Shri Ganeshaya Namah');
  assert.equal(catalogue.invocations[0].fluentHumanReviewRequired, true);
});
