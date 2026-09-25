"""Verify review isolation, image bytes and preservation of existing commercial rules."""
import json, hashlib, subprocess
from pathlib import Path
from PIL import Image
from jsonschema import Draft202012Validator

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'design-library/hindu-wedding/review/flora'
manifest=json.loads((OUT/'review-manifest.json').read_text())
schema=json.loads((OUT/'review-manifest.schema.json').read_text())
Draft202012Validator(schema).validate(manifest)
base_commit=manifest['startingCommit']
baseline=json.loads(subprocess.check_output(['git','show',base_commit+':design-library/hindu-wedding/registry/components.json'],cwd=ROOT))
current=json.loads((ROOT/'design-library/hindu-wedding/registry/components.json').read_text())
before={r['id']:r for r in baseline};after={r['id']:r for r in current}
ids=set();keys=set();hashes=set();pixels=0
protected=['tier','pricingClassification','priceAdjustment','currency','supportedTemplates','supportedPalettes','slot','anchor','minimumSize','maximumSize','maximumSelectionCount','singleChoiceGroup']
for r in manifest['entries']:
    id=r['id']; ids.add(id)
    assert id in before and before[id]['category']=='flora'
    assert id not in ['HW-FLORAL-014','HW-FOLIAGE-003','HW-FOLIAGE-004']
    assert r['candidateId'] not in keys;keys.add(r['candidateId'])
    assert r['reviewStatus']=='UNDER_REVIEW' and r['productionSelectable'] is False
    assert r['pricingOrAccessChangesActivated'] is False and r['proposedAddOnClassification'] is None
    c=after[id];assert c['productionEligible'] is False and c['sourceFilePath'] is None and c['deliveryFilePath'] is None
    for field in protected:assert c[field]==before[id][field],(id,field)
    master=ROOT/r['masterPath'];h=hashlib.sha256(master.read_bytes()).hexdigest()
    assert h==r['masterSHA256'] and h not in hashes;hashes.add(h)
    im=Image.open(master);assert im.mode=='RGBA' and list(im.size)==r['nativeDimensions']
    assert im.getchannel('A').getextrema()==(0,255);pixels+=im.width*im.height
    delivery=ROOT/r['productionCandidatePath'];assert delivery.stat().st_size<=750000
    webp=Image.open(delivery);assert webp.mode=='RGBA' and list(webp.size)==r['deliveryDimensions']
    for p in r['previewPaths']:assert Image.open(ROOT/p).size==(540,960)
    assert Image.open(ROOT/r['thumbnailPath']).size==(270,480)
    assert r['safeAreas']['maximumHeaderOverlapAlpha']<=8
    if id!='HW-FLORAL-015':assert r['safeAreas']['maximumTextOverlapAlpha']<=8
assert len(ids)==19 and len(keys)==23
for id in manifest['deferred']+manifest['excluded']:assert after[id]==before[id]
for file in ['pricing.json','placement-rules.json','compatibility-rules.json','survey-mapping.json']:
    old=subprocess.check_output(['git','show',base_commit+':design-library/hindu-wedding/registry/'+file],cwd=ROOT)
    assert old==(ROOT/'design-library/hindu-wedding/registry'/file).read_bytes(),file+' changed'
assert all(r['status']=='REJECTED' and '/rejected/' in r['path'] for r in manifest['rejected'])
print(json.dumps({'schema':'PASS','reviewIsolation':'PASS','preservedTierPricingAndPlacementRules':'PASS','candidates':len(keys),'entries':len(ids),'nativePixelsVerified':pixels,'fullBorderProductionReadiness':'BLOCKED_NATIVE_RESOLUTION_AND_TEXT_GEOMETRY'}))
