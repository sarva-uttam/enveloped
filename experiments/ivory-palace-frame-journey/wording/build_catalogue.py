"""Aggregate builder for the isolated Ivory Palace wording catalogue; run locally with Python 3.

Owner-approved wording is read directly from the individual collection files under this
directory, which are authoritative. This script never restates approved sentences, so
regenerating catalogue.json cannot erase or drift from them. Older editorial candidates
are kept below only as clearly labelled, unapproved legacy material."""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
families = {
  "formal-en": ("Formal English", "en", ["You are cordially invited to celebrate the wedding of {bride} and {groom}.", "Please join us for the Haldi ceremony as the families offer blessings before the wedding.", "The {brideFamily} and {groomFamily} families request the pleasure of your company at the wedding of {bride} and {groom}.", "We would be honoured by your presence. With warm regards, the {families}."], "formal"),
  "romantic-en": ("Romantic English", "en", ["Two paths meet, and a new story begins. Celebrate {bride} and {groom} with us.", "Golden turmeric, heartfelt blessings and music welcome the next chapter for {bride} and {groom}.", "Come witness {bride} and {groom} begin their married life, surrounded by those they love.", "The story is brighter with you in it. With love, the {families}."], "romantic"),
  "traditional-en": ("Traditional English", "en", ["With the blessings of our elders, we invite you to the wedding celebrations of {bride} and {groom}.", "Join our families for the Haldi ceremony and offer your blessings to the couple.", "With the blessings of their elders, the {families} invite you to the Hindu wedding ceremony of {bride} and {groom}.", "May your blessings accompany the couple. The {families}."], "traditional"),
  "family-en": ("Warm family-centred English", "en", ["Our families are coming together, and we would love to welcome you as {bride} and {groom} celebrate.", "Gather with us for turmeric, music and the warmth of family at Haldi.", "The {families} warmly invite you to share in the wedding of {bride} and {groom}.", "Having you with us will make this celebration more special. Love, the {families}."], "warm"),
  "mobile-en": ("Concise mobile English", "en", ["Celebrate {bride} and {groom}.", "Join us for Haldi and blessings.", "Join us for the wedding of {bride} and {groom}.", "Thank you for celebrating with us. The {families}."], "concise"),
  "modern-hi-en": ("Modern Hindi-English bilingual", "hi-en", ["शुभ विवाह · A new chapter begins for {bride} and {groom}.", "हल्दी समारोह · Join us for blessings, turmeric and joyful music.", "शुभ विवाह · Celebrate the wedding of {bride} and {groom} with our families.", "सादर धन्यवाद · Your presence means so much to the {families}."], "modern bilingual"),
  "traditional-hi-en": ("Traditional Hindi-English bilingual", "hi-en", ["सप्रेम निमंत्रण · With our elders’ blessings, we invite you to celebrate {bride} and {groom}.", "हल्दी समारोह · Please join our families to bless the couple at Haldi.", "शुभ विवाह · The {families} request your presence at the wedding of {bride} and {groom}.", "सादर धन्यवाद · With gratitude, the {families}."], "traditional bilingual"),
  "sanskrit-en": ("Sanskrit invocation plus English", "sa-en", ["ॐ श्री गणेशाय नमः · With blessings, welcome to the wedding celebrations of {bride} and {groom}.", "Join our families for Haldi, turmeric and heartfelt blessings.", "ॐ श्री गणेशाय नमः · With our families’ blessings, please join the wedding of {bride} and {groom}.", "With gratitude for your blessings, the {families}."], "devotional"),
  "neutral-en": ("Sacred-imagery-disabled neutral English", "en", ["Welcome to the celebrations for {bride} and {groom}.", "Join us for the Haldi ceremony and a joyful family gathering.", "The {families} invite you to celebrate the wedding of {bride} and {groom}.", "Thank you for sharing this day with us. The {families}."], "neutral"),
  "international-en": ("International-guest-friendly English", "en", ["Welcome to the wedding celebrations of {bride} and {groom} in Mauritius.", "Haldi is a family ceremony centred on turmeric, blessings and celebration. Please join us.", "Please join {bride} and {groom} for their Hindu wedding ceremony.", "Thank you for joining our families. Directions and response details are below."], "explanatory"),
}
chapters = ["welcome", "haldi", "wedding", "finale"]
lengths = {"micro": (48, 2), "conciseMobile": (100, 3), "standard": (180, 5), "formalExtended": (300, 7)}
fields = {}
groups = {
 "identity": "invitationLanguage brideName groomName brideFamilyName groomFamilyName brideParents groomParents brideGrandparents groomGrandparents rememberedRelatives invitingFamilies guestName sacredImageryPreference sacredInvocationPreference".split(),
 "welcome": "sacredInvocation decorativeHeading romanticOpening formalWelcome coupleNames hostIntroduction transitionLine".split(),
 "haldi": "ceremonyTitle optionalHindiTitle ceremonyDescription hostWording honouree date time venue address attireGuidance colourGuidance guestInstruction closingLine".split(),
 "wedding": "sacredHeading ceremonyTitle grandparentBlessingLine rememberedRelativeLine parentHostLine formalInvitation brideName groomName parentageLine date time venue address dressGuidance giftPreference ceremonyInstruction".split(),
 "finale": "gratitudeLine blessingRequest attendanceSentiment familySignature quotation directionsLabel rsvpHeading rsvpDeadline responseLabel".split(),
}
required = {"identity.invitationLanguage", "identity.brideName", "identity.groomName", "identity.invitingFamilies", "welcome.coupleNames", "haldi.ceremonyTitle", "haldi.date", "haldi.time", "haldi.venue", "wedding.ceremonyTitle", "wedding.date", "wedding.time", "wedding.venue", "finale.familySignature"}
for group, names in groups.items():
 for name in names:
  key = group + "." + name
  maximum = 200 if name in ("address", "formalInvitation", "ceremonyDescription") else 120
  if name in ("date", "time", "rsvpDeadline"): maximum = 80
  fields[key] = {"required": key in required, "maxRecommendedCharacters": maximum, "mobileLines": 3 if maximum > 120 else 2, "longNameBehaviour": "wrap at words; preserve full name; move optional lines to detail view" if "Name" in name or name in ("coupleNames", "invitingFamilies", "familySignature") else "wrap at words; omit entire optional field if absent", "language": "client-selected; sacred invocation remains Sanskrit", "culturalReviewStatus": "human-review-required" if any(t in name.lower() for t in ("sacred", "grandparent", "remembered", "parent", "gift", "ceremony")) else "editorial-candidate", "fallback": None if key in required else "omit-whole-field"}


# ---------------------------------------------------------------- status vocabulary
STATUS = {
 "owner-approved-reusable-wording": "Owner-approved wording alternative that may be reused across invitations. Approval covers the wording choice only; it is not a statement about any client's facts or a substitute for cultural review, and every selection stays editable per invitation.",
 "client-editable-personal-information": "Per-invitation client data (names, relationships, dates, times, venues, surnames). Never a catalogue constant; the fictional sample values are demonstration data only.",
 "client-fact-confirmation-required": "Wording, approved or not, that asserts a fact about the event or family (music, turmeric application, marigolds, yellow attire, blessings, parent/child relationships, living or deceased status). Use only after the client confirms the fact.",
 "cultural-review-required": "Sacred, Sanskrit, Hindi or Hindi/Urdu wording. Owner approval of the wording choice does not replace review by a culturally and linguistically fluent person and, where relevant, the family or officiant.",
 "pending-owner-review": "Recorded but not yet approved by the Owner; do not offer as approved wording.",
 "rejected": "Rejected by the Owner. Kept only as decision history; never selectable.",
 "legacy-editorial-candidate": "Earlier editorial draft that was never Owner-approved. Superseded wherever an approved collection covers the same slot.",
}
APPROVED = "owner-approved-reusable-wording"

def read(rel): return (HERE/rel).read_text(encoding="utf-8")
def load(rel): return json.loads(read(rel))
def need(pattern, text, rel):
 match = re.search(pattern, text, re.M)
 if not match: raise SystemExit(f"{rel}: expected wording not found: {pattern}")
 return match
def md_rows(rel, prefix):
 """Table rows whose first cell starts with prefix, as lists of stripped cells."""
 return [[c.strip() for c in line.strip().strip("|").split("|")] for line in read(rel).splitlines() if re.match(r"\|\s*" + prefix, line)]
def untick(value): return value[1:-1] if len(value) > 1 and value[0] == value[-1] == "`" else value
def slots(text): return sorted(set(re.findall(r"\{(\w+)\}", text)))
FACT_CATEGORY = re.compile(r"only if|only when|where appropriate", re.I)

def item(id, text, source, language="en", fact=False, cultural=False, **extra):
 return {"id": id, "text": text, "status": APPROVED, "language": language, "clientEditableSlots": slots(text),
  "clientFactConfirmationRequired": fact, "culturalReviewRequired": cultural, **extra, "source": source}

def variations(rel, key, frame):
 data = load(rel); rows = []
 for v in data["variations"]:
  assert v["status"].startswith("owner-approved"), f"{rel}: {v['id']} is not approved"
  fact = "client-confirmation-required" in v.get("flags", []) or bool(FACT_CATEGORY.search(v["category"]))
  rows.append(item(v["id"], v["text"], rel, v["language"], fact, v["language"] != "en", category=v["category"]))
 return {"chapter": key.split(".")[0], "frame": frame, "status": APPROVED, "sourceStatus": data["status"], "source": rel, "selection": "choose one per event, edit freely, or omit", "items": rows}

collections = {}
collections["welcome.romanticOpenings"] = variations("welcome/romantic-openings/openings.json", "welcome.romanticOpenings", 80)

rel = "haldi/titles/titles.json"; titles = load(rel)
rejected_text = dict(re.findall(r"(HT-\d+) ([^;]+?)(?:;|\.\s*$)", need(r"^Rejected IDs remain.*$", read("haldi/titles/TITLES.md"), "haldi/titles/TITLES.md").group(0).split(":", 1)[1]))
assert set(rejected_text) == set(titles["rejectedIds"]), "Haldi rejected titles disagree between TITLES.md and titles.json"
collections["haldi.titles"] = {"chapter": "haldi", "frame": 160, "status": APPROVED, "sourceStatus": titles["status"], "source": rel, "selection": "choose one per Haldi event",
 "items": [item(v["id"], v["text"], rel, "hi" if re.search(r"[ऀ-ॿ]", v["text"]) else ("hi-Latn" if v["fluentHindiReviewRequired"] else "en"), bool(re.search(r"confirm|use when", v["note"], re.I)), v["fluentHindiReviewRequired"], note=v["note"]) for v in titles["variations"]],
 "rejected": [{"id": id, "text": rejected_text[id], "status": "rejected"} for id in titles["rejectedIds"]]}
collections["haldi.introductions"] = variations("haldi/introductions/introductions.json", "haldi.introductions", 160)
collections["haldi.welcomeLines"] = variations("haldi/welcome-lines/welcome-lines.json", "haldi.welcomeLines", 160)

rel = "haldi/host-structures/host-structures.json"; hosts = load(rel)
collections["haldi.hostStructures"] = {"chapter": "haldi", "frame": 160, "status": APPROVED, "sourceStatus": hosts["status"], "source": rel,
 "selection": "choose the structure that matches the client-confirmed hosts and honouree; every name is client data",
 "items": [{**item(v["id"], untick(v["invitationLead"]), rel, fact=True), "when": v["when"], "hostLine": untick(v["hostLine"]), "invitationLead": untick(v["invitationLead"]), "nameLine": untick(v["nameLine"]),
  "clientEditableSlots": slots(v["hostLine"] + v["nameLine"])} for v in hosts["variations"]]}

rel = "wedding/titles/TITLES.md"; text = read(rel)
approved_titles = re.findall(r"WT-\d+", need(r"Owner approved [^.]*\(Vivah Vidhi\)\.", text, rel).group(0))
wedding_titles = []
for id, devanagari, roman, meaning, guidance in md_rows(rel, "WT-"):
 row = {"id": id, "text": roman if id == "WT-11" else devanagari, "devanagari": devanagari, "roman": roman, "meaning": meaning, "note": guidance}
 if id in approved_titles: wedding_titles.append({**item(id, row["text"], rel, "hi-Latn" if id == "WT-11" else "sa", True, True), **row, "status": APPROVED})
 else: row["status"] = "pending-owner-review"; row["culturalReviewRequired"] = True; wedding_titles.append(row)
collections["wedding.titles"] = {"chapter": "wedding", "frame": 240, "status": APPROVED, "source": rel, "selection": "choose one approved title; confirm ceremonial suitability with the family/officiant",
 "items": [t for t in wedding_titles if t["status"] == APPROVED], "unapprovedCandidates": [t for t in wedding_titles if t["status"] != APPROVED]}

rel = "wedding/invitations/INVITATIONS.md"
collections["wedding.invitations"] = {"chapter": "wedding", "frame": 240, "status": APPROVED, "source": rel,
 "selection": "bride-side parent hosts only: {brideParents} line, one lead, then {brideName}; other host arrangements need their own wording",
 "items": [{**item(id, untick(lead), rel, fact=True, voice=voice, hostLine="{brideParents}", nameLine="{brideName}"), "clientEditableSlots": ["brideName", "brideParents"]} for id, voice, lead in md_rows(rel, "WI-")]}

rel = "wedding/REVIEW-NOTES.md"
gift = need(r"exactly `([^`]+)`\. Include it only if the client chooses it; do not offer alternatives\.", read(rel), rel).group(1)
collections["wedding.giftPreference"] = {"chapter": "wedding", "frame": 240, "status": APPROVED, "source": rel, "selection": "include exactly this optional sentence or omit it; no alternatives are offered",
 "items": [item("WG-01", gift, rel, fact=True)]}

rel = "wedding/symbols/README.md"
need(r"All five proposed joining-symbol studies were rejected by the Owner", read(rel), rel)
collections["wedding.joiningSymbols"] = {"chapter": "wedding", "frame": 240, "status": "rejected", "source": rel, "items": [], "rejectedStudyCount": 5,
 "note": "All five proposed joining-symbol studies are rejected and must not be offered. The joining mark between the names is undecided pending a future visual review."}

rel = "wedding/elders/ELDERS.md"
collections["wedding.elderBlessings"] = {"chapter": "wedding", "frame": 240, "status": "pending-owner-review", "source": rel,
 "note": "wedding/REVIEW-NOTES.md records elder wording as still under review. Relationships, living status and names are client facts that must be confirmed.",
 "items": [{"id": "WE-%02d" % n, "case": case, "text": (re.search(r"`([^`]+)`", lead) or [None, None])[1], "guidance": re.sub(r"`[^`]+`", "", lead).strip() or None, "status": "pending-owner-review", "clientFactConfirmationRequired": True, "culturalReviewRequired": True}
  for n, (case, lead, names) in enumerate(md_rows(rel, r"(?!Case|---)\S"), 1)]
 + [{"id": "WE-R1", "case": "Confirmed deceased relative", "text": need(r"`(In loving memory of \{rememberedRelativeName\})`", read(rel), rel).group(1), "status": "pending-owner-review", "clientFactConfirmationRequired": True, "culturalReviewRequired": True}]}

rel = "finale/presence-and-compliments/presence-and-compliments.json"; finale = load(rel)
collections["finale.presenceLines"] = {"chapter": "finale", "frame": 300, "status": APPROVED, "sourceStatus": finale["status"], "source": rel, "selection": "choose one per invitation; editable",
 "items": [item(v["id"], v["text"], rel, origin=v["source"]) for v in finale["presenceLines"]]}
collections["finale.complimentsSignOff"] = {"chapter": "finale", "frame": 300, "status": APPROVED, "source": rel,
 "selection": "fixed label followed by the client-confirmed family display line",
 "items": [{**item("FC-01", finale["fixedComplimentsLabel"], rel), "fixed": True, "note": "Label is shown exactly as written and is not edited."}],
 "familyDisplay": {"template": finale["familyDisplayTemplate"], "status": "client-editable-personal-information", "clientFactConfirmationRequired": True, "clientEditableSlots": slots(finale["familyDisplayTemplate"]), "fictionalExample": finale["referenceFamilyDisplay"]}}

# ---------------------------------------------------------------- field classification
personal = {"brideName","groomName","brideFamilyName","groomFamilyName","brideParents","groomParents","brideGrandparents","groomGrandparents","rememberedRelatives","invitingFamilies","guestName","coupleNames","honouree","date","time","venue","address","rsvpDeadline","parentHostLine","familySignature"}
preferences = {"invitationLanguage","sacredImageryPreference","sacredInvocationPreference"}
relationship = {"brideParents","groomParents","brideGrandparents","groomGrandparents","rememberedRelatives","honouree","hostWording","parentHostLine","parentageLine","grandparentBlessingLine","rememberedRelativeLine","formalInvitation","familySignature","attireGuidance","colourGuidance","giftPreference"}
sacred = {"sacredInvocation","sacredHeading","optionalHindiTitle"}
cultural = sacred | {"ceremonyTitle","grandparentBlessingLine","rememberedRelativeLine"}
linked = {"welcome.romanticOpening":"welcome.romanticOpenings","haldi.ceremonyTitle":"haldi.titles","haldi.ceremonyDescription":"haldi.introductions","haldi.closingLine":"haldi.welcomeLines","haldi.hostWording":"haldi.hostStructures",
 "wedding.ceremonyTitle":"wedding.titles","wedding.formalInvitation":"wedding.invitations","wedding.giftPreference":"wedding.giftPreference","wedding.grandparentBlessingLine":"wedding.elderBlessings","wedding.rememberedRelativeLine":"wedding.elderBlessings",
 "finale.attendanceSentiment":"finale.presenceLines","finale.familySignature":"finale.complimentsSignOff","welcome.sacredInvocation":"invocations","wedding.sacredHeading":"invocations"}
for key, field in fields.items():
 name = key.split(".")[1]
 if key in linked: field["collection"] = linked[key]
 field["contentClass"] = ("client-preference" if name in preferences else "client-editable-personal-information" if name in personal
  else "sacred-optional" if name in sacred else collections.get(linked.get(key), {}).get("status", "legacy-editorial-candidate") if key in linked and linked[key] != "invocations" else "legacy-editorial-candidate")
 field["clientFactConfirmationRequired"] = name in relationship
 field["culturalReviewStatus"] = "cultural-review-required" if name in cultural else "required-if-non-english-or-sacred-wording-is-entered"
fields["finale.familySignature"]["fixedLabel"] = collections["finale.complimentsSignOff"]["items"][0]["text"]

# ---------------------------------------------------------------- legacy editorial candidates (never Owner-approved)
catalogue = {"schemaVersion": 2, "edition": "Ivory Palace — Signature Edition",
 "status": "mixed: see statusVocabulary and each collection; only items marked owner-approved-reusable-wording are Owner-approved, and they remain subject to their clientFactConfirmationRequired and culturalReviewRequired flags",
 "statusVocabulary": STATUS, "frames": {"welcome":80,"haldi":160,"wedding":240,"finale":300}, "fields": fields,
 "invocations": [{"id":"ganesha-salutation", "devanagari":"ॐ श्री गणेशाय नमः", "roman":"Om Shri Ganeshaya Namah", "iast":"Oṃ Śrī Gaṇeśāya Namaḥ", "meaning":"Reverent salutations to Lord Ganesha.", "suitability":"Optional opening before welcome or Hindu wedding content; confirm with family and officiant.","culturalUse":"Keep as a complete, legible text line; never repeat as ornament or place in controls.","fluentHumanReviewRequired":True,"status":"cultural-review-required","optional":True,"reviewStatus":"linguistically-checked-editorial-not-culturally-approved"}],
 "approvedCollections": collections,
 "legacyEditorialCandidates": {"status": "legacy-editorial-candidate", "note": "Earlier drafts, never Owner-approved. Do not present as approved wording. Where an approved collection covers a slot it takes precedence; legacy sign-offs never replace the fixed 'Best Compliments From:' label, and legacy gift wording is not offered.",
  "families": [], "alternatives": {}, "supersededCategories": {"romanticOpening":"welcome.romanticOpenings","haldiTitle":"haldi.titles","haldiDescription":"haldi.introductions","weddingTitle":"wedding.titles","giftPreference":"wedding.giftPreference"}},
 "sample": {"fictional":True,"identity":{"bride":"Mihika Rajan","groom":"Tanish Narayan","brideParents":"Arvind and Meera Rajan","groomParents":"Rajesh and Kavita Narayan","grandparents":"Mahendra and Kamini Rajan","rememberedRelative":"Harish Rajan","additionalElder":"Shanta Devi","families":"Rajan and Narayan families"}, "events":{"haldi":{"date":"Saturday, 22 August 2026","time":"6:30 PM","venue":"Magnolia Hall","address":"Greenview Gardens, Harmony Road, Vacoas"},"wedding":{"date":"Sunday, 23 August 2026","time":"1:15 PM","venue":"Magnolia Hall","address":"Greenview Gardens, Harmony Road, Vacoas"}},"giftPreference":"unspecified","rsvpEnabled":False}}
families_out = catalogue["legacyEditorialCandidates"]["families"]
for fid,(label,lang,lines,tone) in families.items():
 entry={"id":fid,"label":label,"language":lang,"tone":tone,"culturalReviewStatus":"cultural-review-required" if lang!="en" or fid=="traditional-en" else "not-applicable-unless-non-english", "chapters":{}}
 for chapter,line in zip(chapters,lines):
  # Each size is independently worded to avoid mechanical truncation or broken placeholders.
  short={"welcome":"Welcome, {bride} and {groom}.","haldi":"Haldi · Blessings and joy.","wedding":"Wedding · {bride} and {groom}.","finale":"With thanks, the {families}."}[chapter]
  concise={"welcome":"Join {bride} and {groom} as their families celebrate.","haldi":"Join our families for Haldi, turmeric and blessings.","wedding":"Celebrate the wedding of {bride} and {groom}.","finale":"Thank you for joining us. The {families}."}[chapter]
  extended=line + (" We look forward to welcoming you and sharing this occasion together." if chapter != "finale" else " We hope to see you there and share a memorable day together.")
  entry["chapters"][chapter]={"micro":{"text":short,"maxRecommendedCharacters":48,"mobileLines":2},"conciseMobile":{"text":concise,"maxRecommendedCharacters":100,"mobileLines":3},"standard":{"text":line,"maxRecommendedCharacters":180,"mobileLines":5},"formalExtended":{"text":extended,"maxRecommendedCharacters":300,"mobileLines":7}}
 entry["status"]="legacy-editorial-candidate"
 families_out.append(entry)


legacy={
 "familyInvitation":[("brideParents","{brideParents} invite you to celebrate the wedding of their daughter {bride} and {groom}."),("groomParents","{groomParents} invite you to celebrate the wedding of their son {groom} and {bride}."),("bothFamilies","The {families} invite you to celebrate the wedding of {bride} and {groom}."),("grandparents","With the blessings of {grandparents}, the {families} invite you to celebrate {bride} and {groom}."),("remembrance","Remembering {rememberedRelative} with love, the {families} invite you to celebrate {bride} and {groom}."),("couple","{bride} and {groom} invite you to celebrate their wedding."),("noParentage","Join us as {bride} and {groom} celebrate their wedding."),("genderNeutralHosts","Together with their loved ones, {bride} and {groom} invite you to celebrate.")],
 "closing":[("formal","We would be honoured by your presence. With warm regards, the {families}."),("warm","We cannot wait to celebrate with you. Love, the {families}."),("spiritual","Please join us in blessing the couple as they begin married life."),("romantic","A beautiful beginning is sweeter when shared with you."),("concise","With love and thanks, the {families}."),("familyCentred","Your presence will mean so much to both our families."),("bilingual","सादर धन्यवाद · With gratitude, the {families}.")],
}
for category, rows in legacy.items():
 catalogue["legacyEditorialCandidates"]["alternatives"][category]=[{"id":"legacy."+category+"."+key,"text":value,"language":"hi-en" if re.search(r"[ऀ-ॿ]", value) else "en","status":"legacy-editorial-candidate","clientFactConfirmationRequired":category=="familyInvitation","culturalReviewRequired":bool(re.search(r"[ऀ-ॿ]", value))} for key,value in rows]

approved_items = [x for c in collections.values() for x in c["items"] if x["status"] == APPROVED]
catalogue["totals"] = {
 "ownerApprovedReusableWording": len(approved_items),
 "byCollection": {k: sum(x["status"] == APPROVED for x in c["items"]) for k, c in collections.items() if c["status"] == APPROVED},
 "approvedRequiringClientFactConfirmation": sum(x["clientFactConfirmationRequired"] for x in approved_items),
 "approvedRequiringCulturalReview": sum(x["culturalReviewRequired"] for x in approved_items),
 "pendingOwnerReview": len(collections["wedding.titles"]["unapprovedCandidates"]) + len(collections["wedding.elderBlessings"]["items"]),
 "rejected": len(collections["haldi.titles"]["rejected"]) + collections["wedding.joiningSymbols"]["rejectedStudyCount"],
 "legacyEditorialCandidateStrings": sum(len(f["chapters"])*4 for f in families_out) + sum(map(len, catalogue["legacyEditorialCandidates"]["alternatives"].values())),
}
(HERE/"catalogue.json").write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(catalogue["totals"], indent=1))
