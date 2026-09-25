"""Deterministic exports and placement demonstrations; never changes source artwork."""
import json, math, shutil, hashlib
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont, ImageCms

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'design-library/hindu-wedding'
REVIEW = LIB / 'review/sacred-header'
INPUT = json.loads((REVIEW / 'generation-inputs.json').read_text())
COMPONENTS = {c['id']: c for c in json.loads((LIB / 'registry/components.json').read_text())}
BACKGROUNDS = json.loads((LIB / 'registry/background-families.json').read_text())
DATE = '2026-09-18'
PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for d in ['masters', 'delivery', 'option-cards', 'thumbnails', 'detail-crops', 'qa', 'family-comparisons', 'tier-contact-sheets']:
    (REVIEW / d).mkdir(parents=True, exist_ok=True)

def rel(p): return str(p.relative_to(ROOT))
def save_json(p, value): p.write_text(json.dumps(value, indent=2) + '\n')
def font(n): return ImageFont.truetype(FONT, n)
def plain_preview(bg_id, arch_id):
    bg = next(b for b in BACKGROUNDS if b['variantId'] == bg_id)
    assert bg['reviewStatus'] == 'APPROVED'
    a = COMPONENTS[arch_id]
    assert a['approvalStatus'] == 'APPROVED'
    canvas = Image.open(ROOT / bg['sourceFilePath']).convert('RGBA')
    assert bg['parentBackgroundId'] in a['compatibleBackgroundFamilies']
    raw = Image.open(ROOT / a['sourceFilePath']).convert('RGBA')
    frame = raw.resize((700, round(raw.height * 700 / raw.width)), Image.Resampling.LANCZOS)
    # Approved architecture EDGE_FRAME, uniform native-canvas scale; preserve alpha.
    # Its exterior alpha must not enter the sacred clear rectangle (375,80)-(625,330).
    layer = Image.new('RGBA', (1000,1778), (0,0,0,0))
    layer.alpha_composite(frame,(150,1688-frame.height))
    alpha = layer.getchannel('A')
    assert alpha.crop((375, 80, 625, 330)).getextrema()[1] <= 8, 'Frame enters header clear space'
    canvas.alpha_composite(layer)
    return canvas

SURFACES = [
    ('HW-BG-001-SUBTLE', 'HW-ARCH-001', 'Ivory demonstration'),
    ('HW-BG-005-DARK', 'HW-ARCH-002', 'Ruby demonstration'),
]

def place(canvas, im, maximum=170):
    # Trim transparent padding for placement only; masters are complete and unchanged.
    bounds = im.getchannel('A').getbbox()
    art = im.crop(bounds)
    ratio = maximum / max(art.size)
    size = (max(1, round(art.width * ratio)), max(1, round(art.height * ratio)))
    art = art.resize(size, Image.Resampling.LANCZOS)
    x, y = 500 - size[0] // 2, 120
    canvas.alpha_composite(art, (x, y))
    return {'x': x, 'y': y, 'width': size[0], 'height': size[1]}

def label_card(preview, record, surface):
    card = Image.new('RGB', (600, 1160), '#faf8f3')
    d = ImageDraw.Draw(card)
    d.text((30, 20), record['publicName'], font=font(26), fill='#29221a')
    d.text((30, 59), record['id'] + ' | UNDER_REVIEW', font=font(18), fill='#67543b')
    card.paste(preview.convert('RGB').resize((540,960), Image.Resampling.LANCZOS), (30, 100))
    d.text((30, 1074), 'Bronze included | ' + record['style'], font=font(16), fill='#29221a')
    d.text((30, 1102), surface, font=font(16), fill='#67543b')
    d.text((30, 1128), 'Placement demonstration - no invitation copy', font=font(15), fill='#67543b')
    return card

REFERENCES = [
    {'id': 'REF-GANESHA-ICONOGRAPHY', 'url': 'https://en.wikipedia.org/wiki/Ganesha#Iconography',
     'kind': 'SECONDARY_TEXTUAL_ICONOGRAPHY', 'accessDate': DATE,
     'basis': 'Common four-armed form, goad/noose, sweets, abhaya, single intact tusk; anatomical-left trunk. No assurance of universal family suitability.',
     'licence': 'Text CC BY-SA; no text or pixels reproduced in generated artwork.'},
    {'id': 'REF-BASOHLI-PD', 'url': 'https://commons.wikimedia.org/wiki/File:Ganesha_Basohli_miniature_circa_1730_Dubost_p73.jpg',
     'kind': 'PUBLIC_DOMAIN_HISTORICAL_REFERENCE', 'accessDate': DATE,
     'basis': 'Historical red skin, saffron/orange cloth and gold ornamentation only; its specific held-object arrangement and composition were not copied.',
     'licence': 'Commons identifies painting/reproduction as public domain; no source pixels incorporated.',
     'limitations': 'Catalogue page and written description checked; local image download unavailable. Historical reference is not proof of Mauritian practice.'},
    {'id': 'REF-AUCKLAND-BRASS', 'url': 'https://commons.wikimedia.org/wiki/File:Figure_(AM_251-2).jpg',
     'kind': 'MUSEUM_SUPPLIED_MATERIAL_REFERENCE', 'accessDate': DATE,
     'basis': 'Museum-supplied brass Ganesha record supports metallic medium, not a required iconographic form.',
     'credit': 'Auckland Museum', 'licence': 'CC BY 4.0, https://creativecommons.org/licenses/by/4.0/',
     'limitations': 'Catalogue/licence reviewed; no image pixels incorporated or copied. Local photo download unavailable.'},
    {'id': 'REF-OM-SCRIPT', 'url': 'https://en.wikipedia.org/wiki/Om#Written_representations',
     'kind': 'SECONDARY_SCRIPT_REFERENCE', 'accessDate': DATE,
     'basis': 'Devanagari-style Om and Tamil Om are distinct written forms. This batch depicts only the registered conventional Devanagari-style symbol.',
     'licence': 'Text CC BY-SA; no text reproduced in generated artwork.'},
]
records, cards = [], []
actual_styles = {3: 'floral illustration', 7: 'botanical illustration', 9: 'ornamental illustration', 12: 'ornamented Om relief'}
for idx, e in enumerate(INPUT['entries']):
    stem = e['id'].lower() + '-v' + str(e['version'])
    master = REVIEW / 'masters' / (stem + '-master.png')
    source = Path(e['sourcePath'])
    if source.exists(): shutil.copy2(source, master)
    original = Image.open(master).convert('RGBA')
    im = original.copy()
    # Technical alpha export: remove sub-3% invisible background noise only.
    # Retain every alpha value >=8, including genuine anti-aliased artwork edges.
    im.putalpha(im.getchannel('A').point(lambda a: 0 if a < 8 else a))
    assert im.size[0] >= 440 and im.size[1] >= 440
    alpha = im.getchannel('A'); bbox = alpha.getbbox()
    assert alpha.getextrema() == (0,255), 'Missing genuine alpha'
    assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < im.width and bbox[3] < im.height, 'Artwork reaches edge'
    im.save(master, icc_profile=PROFILE)
    delivery = REVIEW / 'delivery' / (stem + '-delivery.webp')
    small = im.resize((640,640), Image.Resampling.LANCZOS)
    small.save(delivery, 'WEBP', quality=90, method=6, exact=True, icc_profile=PROFILE)
    assert delivery.stat().st_size <= 750 * 1024
    decoded = Image.open(delivery).convert('RGBA')
    assert decoded.getchannel('A').getextrema() == (0,255)
    kind = 'GANESHA' if e['id'].startswith('HW-GANESHA') else 'OM' if idx in [10,11,12] else 'LOTUS_ORNAMENT' if idx == 13 else 'NEUTRAL_ORNAMENT'
    r = {'id': e['id'], 'publicName': e['name'], 'family': e['id'], 'variant': 'ORIGINAL_FINISH',
         'minimumTier': 'BRONZE', 'pricingClassification': 'INCLUDED', 'priceAdjustment': 0,
         'style': actual_styles.get(idx,e['style']), 'finish': e['finish'], 'representation': kind,
         'approvalStatus': 'UNDER_REVIEW', 'productionEligible': False, 'generationStatus': 'VISUAL_QA',
         'sourceFilePath': None, 'deliveryFilePath': None,
         'reviewMasterFilePath': rel(master), 'reviewDeliveryFilePath': rel(delivery),
         'sourceReferenceIds': [x['id'] for x in REFERENCES[:3]] if kind == 'GANESHA' else ['REF-OM-SCRIPT'] if kind == 'OM' else [],
         'sourceReferenceBasis': 'Original synthesis from documented common iconography; no external artwork pixels copied.' if kind=='GANESHA' else 'Registered Devanagari-style Om; not a Tamil-script equivalent.' if kind=='OM' else 'Original decorative design; no spiritual claim or tradition-specific geometry.',
         'exactGenerationPrompt': e['prompt'], 'generationTool': 'ChatGPT built-in image generation',
         'generationModel': None, 'modelDisclosure': 'Underlying model identifier was not returned by the tool.',
         'generationDate': DATE, 'version': str(e['version']) + '.0.0',
         'provenance': 'Generated specifically for Enveloped with ChatGPT built-in image generation; deterministic sizing/export only; no automatic mirroring, recolouring or third-party pixels.',
         'licenceReview': 'Original generated candidate; reference provenance recorded; Owner approval pending. No exclusivity or copyright guarantee asserted.',
         'traditionCompatibility': {
             'MAURITIAN_HINDU': 'CANDIDATE_REQUIRES_FAMILY_AND_CULTURAL_REVIEW' if kind in ['GANESHA','OM','LOTUS_ORNAMENT'] else 'NEUTRAL_DECORATIVE_CANDIDATE',
             'MAURITIAN_TAMIL_HINDU': 'DO_NOT_ASSUME_SCRIPT_OR_FORM_EQUIVALENCE; HUMAN_REVIEW_REQUIRED' if kind in ['GANESHA','OM','LOTUS_ORNAMENT'] else 'NEUTRAL_DECORATIVE_CANDIDATE',
             'MIXED_HINDU_TRADITIONS': 'HUMAN_REVIEW_REQUIRED', 'NOT_SURE': 'HUMAN_REVIEW_REQUIRED',
             'LET_ENVELOPED_ADVISE': 'HUMAN_REVIEW_REQUIRED',
             'NO_SACRED_IMAGERY': 'ALLOWED_AFTER_DECORATIVE_APPROVAL' if kind=='NEUTRAL_ORNAMENT' else 'EXCLUDED'},
         'technical': {'masterFormat': 'PNG', 'masterDimensions': list(im.size), 'deliveryFormat': 'WEBP',
                       'deliveryDimensions': [640,640], 'deliveryBytes': delivery.stat().st_size,
                       'colourSpace': 'sRGB', 'alphaPreserved': True, 'alphaBoundingBox': list(bbox),
                       'alphaExportCleanup': 'Source alpha values 1-7/255 set to zero to remove invisible generated background noise; alpha >=8 unchanged; no RGB edits.',
                       'originalSourceSha256': hashlib.sha256(source.read_bytes()).hexdigest() if source.exists() else None,
                       'boundingBoxConvention': 'left, top, right-exclusive, bottom-exclusive; all nonzero alpha',
                       'deliveryAlphaBoundingBox': list(decoded.getchannel('A').getbbox()),
                       'masterSha256': hashlib.sha256(master.read_bytes()).hexdigest(),
                       'deliverySha256': hashlib.sha256(delivery.read_bytes()).hexdigest()},
         'placement': {'slot': 'sacred-header', 'anchor': 'TOP_CENTER', 'logicalCanvas': [1000,1778],
                       'visibleArtworkTop': 120, 'visibleArtworkCentreX': 500,
                       'maximumVisibleDimensions': [170,170], 'minimumVisibleDimensions': [140,140],
                       'defaultVisibleDimensions': [170,170], 'clearSpace': 40,
                       'maximumClearSpaceBottom': 330, 'centralTextSafeAreaStartsAt': 330,
                       'cropPermitted': False, 'mirrorPermitted': False, 'animationPermitted': False,
                       'opacity': 1, 'blendMode': 'NORMAL', 'automaticColourFiltersPermitted': False},
         'permittedFinishes': [e['finish']], 'recommendedContrast': 'Ivory/parchment or deep ruby with clear separation; inspect fine gold strokes at mobile size. No filter recolouring.',
         'incompatibleCombinations': ['Another active principal header', 'Busy/low-contrast gold-on-gold background',
             'Architecture intruding into the 40-unit clear space', 'Any crop, mirror, fade, animation or footer placement'],
         'compatibleBackgroundFrameDemonstrations': [{'backgroundVariantId':s[0], 'frameId':s[1]} for s in SURFACES],
         'compatibilityScope': 'Only listed demonstrations verified; other background/frame pairings require separate visual and clear-space checks.',
         'demonstrationFramePlacement': {'width':700,'bottomAnchor':[500,1688],'scale':1,'cropping':False,
             'note':'Approved default-width frame placed at its bottom anchor; this is a component demonstration, not an assembled template or approved final text layout.'},
         'altText': (e['name'] + ': seated four-armed Ganesha with a left-curving trunk, goad, noose, raised palm and sweets bowl, in ' + e['finish'] + '.') if kind=='GANESHA' else (e['name'] + ': a ' + ('Devanagari-style Om symbol' if kind=='OM' else 'lotus-petal rosette' if kind=='LOTUS_ORNAMENT' else 'non-religious decorative scrollwork flourish') + ' in ' + e['finish'] + '.'),
         'technicalQaFindings': {'integrity': 'PASS', 'alpha': 'PASS', 'dimensions': 'PASS', 'compressionBudget': 'PASS', 'visualInspection': 'PENDING_FINAL_INSPECTION'},
         'culturalReviewNotes': ['Technical QA is not cultural approval.', 'Family/temple preference and held-object/mudra/trunk/tusk interpretation require competent human review.' if kind=='GANESHA' else 'Devanagari-style Om is not presented as Tamil-script Om; verify family preference.' if kind=='OM' else 'No blessing claim. Verify decorative interpretation and preference.',
                               'Foreshortening hides parts of some hands/feet; inspect detail crops rather than require five visible digits in every pose.']}
    if idx == 12:
        r['resolutionOfAmbiguity'] = 'Undefined Gold Sacred Motif resolved as registered Om in ornamental relief under Owner creative delegation; no new sacred symbol introduced.'
        r['finish'] = 'champagne gold and ivory'; r['permittedFinishes'] = [r['finish']]
        r['culturalReviewNotes'].append('Generated ornamentation includes lotus surround and pearl-like drops beyond the minimal prompt; actual appearance documented.')
    if idx == 13:
        r['resolutionOfAmbiguity'] = 'Public blessing wording removed. Original lotus rosette only; never claim blessings or ritual status.'
    labelled = []
    for surface_index, (bg, arch, caption) in enumerate(SURFACES):
        canvas = plain_preview(bg, arch)
        placement = place(canvas, im)
        preview = canvas.resize((540,960), Image.Resampling.LANCZOS)
        pp = REVIEW / 'option-cards' / (stem + '-' + str(surface_index+1) + '-option-card.webp')
        preview.save(pp, 'WEBP', quality=92, method=6)
        if surface_index == 0:
            r['reviewPreviewFilePath'] = rel(pp); r['actualVisiblePlacement'] = placement
            tp = REVIEW / 'thumbnails' / (stem + '-thumbnail.webp')
            preview.resize((270,480),Image.Resampling.LANCZOS).save(tp,'WEBP',quality=90,method=6)
            r['reviewThumbnailFilePath'] = rel(tp)
        labelled.append(label_card(preview, r, caption))
    comparison = Image.new('RGB',(1200,1160),'#faf8f3')
    comparison.paste(labelled[0],(0,0));comparison.paste(labelled[1],(600,0))
    cp = REVIEW / 'family-comparisons' / (stem + '-comparison.png');comparison.save(cp)
    r['familyComparisonFilePath'] = rel(cp)
    cards.append(labelled[0])
    # Full-size artwork against neutral matte for source-resolution QA.
    qa = Image.new('RGBA',im.size,'#f6f0e5');qa.alpha_composite(im)
    qa.convert('RGB').save(REVIEW/'qa'/(stem+'-full-resolution.jpg'),quality=96)
    dark = Image.new('RGBA',im.size,'#243531');dark.alpha_composite(im)
    dark.convert('RGB').save(REVIEW/'qa'/(stem+'-dark-resolution.jpg'),quality=96)
    # Explicit iconography detail tiles, with crop coordinates recorded.
    crops = {'head': (int(im.width*.25),0,int(im.width*.75),int(im.height*.59)),
             'hands-and-trunk': (0,int(im.height*.22),im.width,int(im.height*.72)),
             'posture': (0,int(im.height*.62),im.width,im.height)} if kind=='GANESHA' else {'symbol': bbox}
    r['detailCrops'] = []
    for label, box in crops.items():
        p = REVIEW/'detail-crops'/(stem+'-'+label+'.png');qa.crop(box).convert('RGB').save(p)
        r['detailCrops'].append({'label':label,'path':rel(p),'sourceCropBox':list(box)})
    records.append(r)

state = {'id':'NO_SACRED_IMAGERY','publicName':'No sacred imagery','style':'selection state',
         'approvalStatus':'UNDER_REVIEW','productionEligible':False,'isSelectionState':True,
         'imageFilePath':None,'sourceFilePath':None,'deliveryFilePath':None,'minimumTier':'BRONZE',
         'behavior':'Clear principal-sacred-header selection; render no sacred image. Neutral decorative header is optional and separately selected.',
         'traditionCompatibility':'All profiles; respectful complete design path.'}
state_preview = plain_preview(*SURFACES[0][:2]).resize((540,960),Image.Resampling.LANCZOS)
sp=REVIEW/'option-cards/no-sacred-imagery-option-card.webp';state_preview.save(sp,'WEBP',quality=92,method=6)
state['reviewPreviewFilePath']=rel(sp)
cards.append(label_card(state_preview,state,'No image rendered in header'))

def contact(title):
    sheet=Image.new('RGB',(1280,2500),'#ece7dc');d=ImageDraw.Draw(sheet)
    d.text((30,20),title,font=font(32),fill='#29221a')
    d.text((30,65),'15 original finishes + image-free state | all UNDER_REVIEW',font=font(21),fill='#67543b')
    for i,c in enumerate(cards):sheet.paste(c.resize((300,580),Image.Resampling.LANCZOS),(20+(i%4)*315,115+(i//4)*595))
    return sheet
contact('Enveloped | Sacred-header review').save(REVIEW/'complete-contact-sheet.png')
for tier in ['bronze','silver','gold','platinum']:
    contact(tier.title()+' | included sacred-header options').save(REVIEW/'tier-contact-sheets'/(tier+'-contact-sheet.png'))

rejected=[]
for e in INPUT['rejected']:
    rejected.append({'id':e['id'],'version':e['version'],'approvalStatus':'REJECTED',
                     'reason':e['reason'],'exactGenerationPrompt':e['prompt'],
                     'generationDate':DATE,'productionSelectable':False,
                     'filePolicy':'Rejected source pixels excluded from review/production package; audit metadata retained.'})
manifest={'batchId':'HW-SACRED-HEADER-2026-09-18','startingCommit':INPUT['startingCommit'],
          'baseline':{'testFilesPassed':70,'testsPassed':831},'approvalStatus':'UNDER_REVIEW',
          'entries':records,'selectionStates':[state],'references':REFERENCES,'rejectedCandidates':rejected,
          'ownerDecisionsRequired':['Approve/reject each retained candidate, public name and single finish.',
              'Confirm Ganesha iconography/family suitability with competent cultural review.',
              'Confirm Devanagari-style Om preference; Tamil form not generated.',
              'Approve neutral-header registry addition, image-free state, and 170-unit sacred placement cap.',
              'Confirm Gold Sacred Motif interpretation as Om relief and lotus naming without blessing claim.']}
save_json(REVIEW/'review-manifest.json',manifest)
print('Exported',len(records),'artworks;',len(cards),'review cards; masters, alpha WebP, comparisons and tier sheets.')
