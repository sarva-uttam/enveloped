"""Create deterministic review exports; never activates registry options or edits artwork."""
import json, math, hashlib, shutil, io
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont, ImageCms, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'design-library/hindu-wedding'
OUT = LIB / 'review/flora'
DATA = json.loads((OUT / 'generation-inputs.json').read_text())
COMP = {r['id']: r for r in json.loads((LIB / 'registry/components.json').read_text())}
BGS = {r['variantId']: r for r in json.loads((LIB / 'registry/background-families.json').read_text())}
DATE = datetime.now(timezone.utc).date().isoformat()
DATA['date'] = DATE
ICC = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for folder in ['masters','delivery','option-cards','thumbnails','detail-crops','qa','family-comparisons','tier-contact-sheets','rejected']:
    (OUT / folder).mkdir(exist_ok=True)

def rel(p): return str(p.relative_to(ROOT))
def dump(p, data): p.write_text(json.dumps(data, indent=2)+'\n')
def save_webp(im, path, **kwargs):
    buffer=io.BytesIO(); im.save(buffer,'WEBP',**kwargs)
    temp=path.with_suffix('.webp.tmp'); temp.write_bytes(buffer.getvalue()); temp.replace(path)
    with Image.open(path) as check: check.load()

def ft(size): return ImageFont.truetype(FONT, size)
def key(e): return e['id'].lower()+'-v'+str(e['version'])+'-'+e.get('variant','base')
def source(e):
    p = Path(e['path'])
    return p if p.is_absolute() else ROOT / p
def fit(im, w, h):
    scale = min(w / im.width, h / im.height)
    return im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
def surface(bg_id, arch=True):
    b = BGS[bg_id]
    assert b['reviewStatus']=='APPROVED'
    scene = Image.open(ROOT / b['sourceFilePath']).convert('RGBA')
    if arch:
        a=COMP['HW-ARCH-002' if bg_id=='HW-BG-005-DARK' else 'HW-ARCH-001']; assert a['approvalStatus']=='APPROVED'
        assert b['parentBackgroundId'] in a['compatibleBackgroundFamilies']
        frame=fit(Image.open(ROOT / a['sourceFilePath']).convert('RGBA'),700,1470)
        scene.alpha_composite(frame,(150,1688-frame.height))
    return scene

visual_ledger=json.loads((OUT/'visual-qa-ledger.json').read_text()) if (OUT/'visual-qa-ledger.json').exists() else {}
records=[]; cards=[]; hashes=set()
for e in DATA['entries']:
    k=key(e); c=COMP[e['id']]; src=source(e); im=Image.open(src).convert('RGBA')
    assert im.getchannel('A').getextrema()==(0,255), k+' lacks genuine alpha'
    master=OUT/'masters'/f'{k}-master.png'
    if src.resolve()!=master.resolve(): shutil.copy2(src,master)
    e['path']=rel(master)
    native=im.size; alpha=im.getchannel('A'); raw_bbox=alpha.getbbox()
    visible_bbox=alpha.point(lambda v:255 if v>32 else 0).getbbox()
    assert visible_bbox
    visible_margin=min(visible_bbox[0],visible_bbox[1],im.width-visible_bbox[2],im.height-visible_bbox[3])
    art=im.crop(visible_bbox)
    border=e['id']=='HW-FLORAL-015'
    foliage=e['id'].startswith('HW-FOLIAGE')
    corner=e['id']=='HW-FLORAL-011'
    top=e['id']=='HW-FLORAL-012'
    role='foliage-accent' if foliage else 'floral-corner' if corner else 'top-edge-cluster' if top else 'floral-border' if border else 'lower-floral-garden' if e['id']=='HW-FLORAL-013' else 'floral-spray'
    # 2x native-detail limits are derived from visible authored pixels, never from upscaling.
    limit=[min(880,art.width//2),min(330,art.height//2)]
    if foliage or top: box=[60,40,240,150]
    elif corner: box=[640 if e.get('variant')=='right' else 20,1400,340,300]
    elif border: box=[0,0,1000,1778]
    else: box=[60,1390,880,300]
    rendered=fit(art,box[2],box[3]) if border else fit(art,min(box[2],limit[0]),min(box[3],limit[1]))
    x=box[0] if (foliage or top or corner or border) else 500-rendered.width//2
    y=box[1] if foliage or top or border else 1690-rendered.height
    layer=Image.new('RGBA',(1000,1778),(0,0,0,0));layer.alpha_composite(rendered,(x,y))
    header_rect=[350,80,650,380]
    text_rects=[[170,330,830,450],[120,450,880,640],[170,650,830,930]]
    header_overlap=layer.getchannel('A').crop(tuple(header_rect)).getextrema()[1]
    text_overlap=max(layer.getchannel('A').crop(tuple(r)).getextrema()[1] for r in text_rects)
    blocked=[]
    if border:
        blocked.append('Native border resolution is below 2x full-page rendering; re-author at >=2000x3556 before full-page production.')
    if header_overlap>8: blocked.append('Demonstrated placement overlaps sacred-header clear area; do not combine with a header at this placement.')
    if text_overlap>8: blocked.append('Demonstrated border overlaps registered text rectangles; full-border slot/text geometry must be reviewed before production.')
    if top or corner or border: blocked.append('Role-specific slot proposal differs from current foreground registry record; inactive pending Owner review.')
    # Lossy colour with preserved alpha. Full native masters remain byte-identical.
    delivery=OUT/'delivery'/f'{k}-delivery.webp'
    export=im.copy(); export.thumbnail((1200,2160),Image.Resampling.LANCZOS)
    save_webp(export,delivery,quality=92,method=6,icc_profile=ICC)
    if delivery.stat().st_size>750000: save_webp(export,delivery,quality=85,method=6,icc_profile=ICC)
    assert delivery.stat().st_size<=750000
    reopened=Image.open(delivery).convert('RGBA')
    assert ImageChops.difference(export.getchannel('A'),reopened.getchannel('A')).getbbox() is None
    diff=ImageChops.difference(export.convert('RGB'),reopened.convert('RGB'))
    rms=ImageStat.Stat(diff,export.getchannel('A')).rms
    fullqa=[]
    for col,name in [('#fff5e7','pale'),('#211719','dark')]:
        bg=Image.new('RGBA',im.size,col);bg.alpha_composite(im)
        q=OUT/'qa'/f'{k}-{name}-full-resolution.jpg';bg.convert('RGB').save(q,quality=96);fullqa.append(rel(q))
    crop=OUT/'detail-crops'/f'{k}-detail.png'
    cx=(visible_bbox[0]+visible_bbox[2])//2;cy=(visible_bbox[1]+visible_bbox[3])//2
    if border:cx=visible_bbox[0]+80
    detail=im.crop((max(0,cx-280),max(0,cy-220),min(im.width,cx+280),min(im.height,cy+220)))
    detail.save(crop,icc_profile=ICC)
    previews=[]
    for bg_id,label in [('HW-BG-001-SUBTLE','Ivory'),('HW-BG-005-DARK','Ruby')]:
        scene=surface(bg_id,not border);scene.alpha_composite(layer)
        card=scene.resize((540,960),Image.Resampling.LANCZOS).convert('RGB')
        # All labels are in separate reserved strips outside the demonstration artwork.
        labelled=Image.new('RGB',(540,960),'#faf7ef')
        labelled.paste(card.resize((450,800),Image.Resampling.LANCZOS),(45,80))
        d=ImageDraw.Draw(labelled); d.text((18,12),e['name'],font=ft(22),fill='#30291f')
        d.text((18,42),e['id']+' | UNDER_REVIEW',font=ft(15),fill='#60523b')
        d.text((18,898),e['tier']+' proposal | '+e.get('variant','base')+' | '+label,font=ft(16),fill='#30291f')
        d.text((18,927),'Component demonstration - no invitation copy',font=ft(14),fill='#60523b')
        p=OUT/'option-cards'/f'{k}-{label.lower()}-option-card.webp';save_webp(labelled,p,quality=94,method=6)
        previews.append(rel(p))
        if label=='Ivory':cards.append((e,labelled.copy()))
        mobile=OUT/'qa'/f'{k}-{label.lower()}-mobile-360.png';scene.resize((360,640),Image.Resampling.LANCZOS).save(mobile)
    thumb=OUT/'thumbnails'/f'{k}-thumbnail.webp';save_webp(labelled.resize((270,480),Image.Resampling.LANCZOS),thumb,quality=90)
    sha=hashlib.sha256(master.read_bytes()).hexdigest(); assert sha not in hashes; hashes.add(sha)
    records.append({
        'candidateId':k.upper(),'id':e['id'],'variant':e.get('variant','base'),'version':e['version'],
        'publicName':e['name'],'family':c['designFamily'],'componentRole':role,'botanicalDescription':e['botanical'],
        'styleDescription':e['subject'],'colourMaterialVariant':e['botanical'],
        'registeredMinimumTier':c['tier'],'registeredAddOnClassification':c['pricingClassification'],
        'proposedMinimumTier':e['tier'],'proposedAddOnClassification':None,'pricingOrAccessChangesActivated':False,
        'generationPrompt':e['prompt'],'generationMethod':'ChatGPT built-in image generation','model':None,
        'modelAvailabilityNote':'Tool did not expose a model identifier.','generationDateUTC':DATE,
        'provenance':'Original AI-generated artwork commissioned in this conversation; exact prompt retained; no downloaded botanical reference pixels.',
        'referenceBasis':['Owner botanical decisions in this conversation','Approved architecture contact sheet inspected for artistic language'],
        'licensingEvidence':'No third-party source imagery used. Model identifier and contractual rights evidence were not supplied by the generation tool; do not invent them.',
        'masterPath':rel(master),'productionCandidatePath':rel(delivery),'previewPaths':previews,'thumbnailPath':rel(thumb),
        'detailCropPath':rel(crop),'fullResolutionQAPaths':fullqa,'nativeDimensions':list(native),
        'deliveryDimensions':list(export.size),'formats':['PNG','WEBP'],'colourSpace':'sRGB','masterSHA256':sha,
        'transparency':{'alpha':True,'alphaRange':list(alpha.getextrema()),'deliveryAlphaExact':True,'rawAlphaBoundingBox':list(raw_bbox),'visibleBoundingBoxAlphaAbove32':list(visible_bbox),'visiblePaddingMinimumPixels':visible_margin},
        'registeredSlot':c['slot'],'registeredAnchor':c['anchor'],'registeredDefaultDimensions':[c['defaultWidth'],c['defaultHeight']],
        'proposedPlacement':{'canvas':[1000,1778],'x':x,'y':y,'width':rendered.width,'height':rendered.height,'role':role,'activated':False},
        'native2xMaximumVisibleSize':limit,'safeAreas':{'sacredHeaderClearRectangle':header_rect,'textRectangles':text_rects,'maximumHeaderOverlapAlpha':header_overlap,'maximumTextOverlapAlpha':text_overlap},
        'compatibleBackgrounds':{'demonstrated':['HW-BG-001-SUBTLE','HW-BG-005-DARK'],'otherApprovedBackgrounds':'Not exhaustively visually verified.'},
        'compatibleFrames':{'demonstrated':[] if border else ['HW-ARCH-001','HW-ARCH-002'],'otherFrames':'Pending individual placement review.'},
        'compatibleHeaders':'Clear-space geometry checked; individual artwork combinations pending review.',
        'incompatibleCombinations':['Any placement covering text or sacred-header clear space','Any undeclared template slot','Combining border with architecture without dedicated edge-slot review']+blocked,
        'altText':e['name']+': '+e['subject']+'. Decorative illustration on transparent background.',
        'technicalQA':{'fileIntegrity':'PASS','genuineTransparency':'PASS','deliveryAlpha':'PASS','deliveryBytes':delivery.stat().st_size,'compressionWeightedRGBRMS':rms,'visiblePadding':'PASS' if visible_margin>=10 else 'REVIEW','duplicateHash':'PASS','nativeResolution':'BLOCKED_FOR_FULL_PAGE_BORDER' if border else 'PASS_WITH_RECORDED_SCALE_LIMITS','placementIssues':blocked,'visualInspection':visual_ledger.get(k.upper(), {}).get('result','PENDING_EXPORT_VISUAL_REVIEW')},
        'culturalQA':{'classification':'DECORATIVE','traditionCompatibility':'PENDING_CULTURAL_REVIEW','notes':'Owner approved botanical scope; no universal Mauritian Hindu ceremonial suitability or religious meanings claimed.'},
        'reviewStatus':'UNDER_REVIEW','productionSelectable':False,'ownerApproval':None
    })

def sheet(items,path,cols=4):
    w,h=270,480; rows=math.ceil(len(items)/cols)
    page=Image.new('RGB',(cols*w,rows*h),'#e5dfd4')
    for n,(e,card) in enumerate(items):page.paste(card.resize((w,h),Image.Resampling.LANCZOS),((n%cols)*w,(n//cols)*h))
    page.save(path)
sheet(cards,OUT/'complete-contact-sheet.png')
for tier in ['BRONZE','SILVER','GOLD','PLATINUM']:
    sheet([x for x in cards if x[0]['tier']==tier],OUT/'tier-contact-sheets'/f'{tier.lower()}-contact-sheet.png')
for id in sorted(set(e['id'] for e,_ in cards)):
    sheet([x for x in cards if x[0]['id']==id],OUT/'family-comparisons'/f'{id.lower()}-comparison.png',2)
for n in range(0,len(records),6):
    items=records[n:n+6];page=Image.new('RGB',(1080,660),'#e6dfd3');d=ImageDraw.Draw(page)
    for i,r in enumerate(items):
        im=Image.open(ROOT/r['masterPath']).convert('RGBA');im=fit(im,500,170)
        bg=Image.new('RGBA',(520,190),'#211719' if i%2 else '#fff5e7');bg.alpha_composite(im,((520-im.width)//2,(190-im.height)//2))
        x=(i%2)*540;y=(i//2)*220;page.paste(bg.convert('RGB'),(x,y));d.text((x+8,y+193),r['candidateId'],font=ft(13),fill='#30291f')
    page.save(OUT/'qa'/f'artwork-page-{n//6+1}.png')
rejected=[]
for e in DATA['rejected']:
    p=OUT/'rejected'/f'{key(e)}-rejected.png';src=source(e)
    if src.resolve()!=p.resolve():shutil.copy2(src,p)
    e['path']=rel(p);rejected.append(e)
dump(OUT/'generation-inputs.json',DATA)
dump(OUT/'review-manifest.json',{'startingCommit':DATA['startingCommit'],'dateUTC':DATE,'reviewStatus':'UNDER_REVIEW','productionSelectable':False,'entries':records,'rejected':rejected,'deferred':DATA['ownerDecisions']['deferred'],'excluded':DATA['ownerDecisions']['excluded']})
schema={'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','required':['startingCommit','entries','reviewStatus','productionSelectable'],'properties':{'reviewStatus':{'const':'UNDER_REVIEW'},'productionSelectable':{'const':False},'entries':{'type':'array','minItems':23,'maxItems':23,'items':{'type':'object','required':['candidateId','id','publicName','generationPrompt','nativeDimensions','transparency','technicalQA','culturalQA','reviewStatus','productionSelectable'],'properties':{'id':{'enum':sorted(set(r['id'] for r in records))},'reviewStatus':{'const':'UNDER_REVIEW'},'productionSelectable':{'const':False},'masterPath':{'type':'string'},'productionCandidatePath':{'type':'string'}}}}}}
dump(OUT/'review-manifest.schema.json',schema)
print(json.dumps({'candidates':len(records),'entries':len(set(r['id'] for r in records)),'rejected':len(rejected),'deliveryTotalBytes':sum(r['technicalQA']['deliveryBytes'] for r in records),'nativeResolutionLimits':[r['id'] for r in records if r['id']=='HW-FLORAL-015']}))
