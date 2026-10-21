from pathlib import Path
import hashlib,json,os,re,subprocess
root=Path('/app');revision=os.environ['BUILD_REVISION'];context=Path('/tmp/nyx517')
def patch(p,old,new,count=1):
 s=p.read_text();assert s.count(old)==count,(str(p),old[:70],s.count(old));p.write_text(s.replace(old,new))
p=root/'routes/settings.js';s=p.read_text();s="import {registerStorage} from '../internal/storage-api.mjs';\nimport storageAudit from '../internal/audit-log.js';\nimport storageUser from '../models/user.js';\nimport storageErrors from '../lib/error.js';\n"+s;s=s.replace('export default router;',"registerStorage(router,{jwtdecode,audit:storageAudit,userModel:storageUser,PermissionError:storageErrors.PermissionError});\nexport default router;");p.write_text(s)
# Existing sanitized audit context remains authoritative. Add bounded storage accounting.
p=root/'internal/audit-policy.mjs';patch(p,"'count']);","'count','reclaimed_bytes']);")
for name in ['package.json','package-lock.json']:
 p=root/name;d=json.loads(p.read_text());d['version']='5.0.17'
 if name=='package-lock.json':d['packages']['']['version']='5.0.17'
 p.write_text(json.dumps(d,indent=2)+'\n')
p=root/'internal/release-policy.json';d=json.loads(p.read_text());d['version']='5.0.17';d['sources']['5.0.16']=49;p.write_text(json.dumps(d,indent=2)+'\n')
f=root/'frontend';assets=f/'assets';settings=assets/'asset-516-51813bc65f6b1453.js';main=assets/'asset-516-11b20a5b9bc407e6.js'
patch(settings,'import {NyxInterfacePreferences,',"import {StorageManagement} from './storage.js';\nimport {storageText} from './storage-i18n.js';\nimport {NyxInterfacePreferences,")
patch(settings,'})]})]})]}),d==="notifications"', '})]})]}),e.jsx(StorageManagement,{})]}),d==="notifications"')
# Preserve the wizard and existing integration registry. Never put a masked preview
# into a scrape config, and keep an entered one-time token in component memory only.
patch(settings,'function It(){const[a,c]=y.useState(null),d=', 'function It(){const[monitoringToken,setMonitoringToken]=y.useState(""),[a,c]=y.useState(null),d=')
patch(settings,'f=(d.data??[]).find(h=>h.enabled)?.token??"<your-integration-token>"','f=/^[a-f0-9]{64}$/i.test(monitoringToken)?monitoringToken:"<your-integration-token>"')
needle='e.jsx("span",{children:e.jsx(s,{id:"settings.grafana.step1"})}),'
patch(settings,needle,needle+'e.jsxs("label",{style:{display:"block",marginTop:8},children:[storageText("tokenLabel"),e.jsx("input",{className:"form-control",type:"password",autoComplete:"off",value:monitoringToken,onChange:event=>setMonitoringToken(event.target.value.trim()),placeholder:"<your-integration-token>","aria-label":storageText("tokenLabel")}),e.jsx("small",{children:storageText("tokenHelp")})]}),')
needle='e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:8},children:[e.jsxs("a",{href:"/api/grafana/dashboard.json"'
patch(settings,needle,'e.jsx("p",{style:{fontSize:12,lineHeight:1.5},children:storageText("upgradeNote")}),'+needle)
needle='e.jsx("span",{children:e.jsx(s,{id:"settings.grafana.step6"})}),'
patch(settings,needle,needle+'e.jsx("p",{style:{fontSize:12,lineHeight:1.5},children:storageText("historyNote")}),')
# Preserve integration discovery and prefill the detected name without exposing its token.
patch(settings,'l=(h,m)=>{navigator.clipboard.writeText(h)', 'activeIntegration=(d.data??[]).find(item=>item.enabled),l=(h,m)=>{navigator.clipboard.writeText(h)')
needle='e.jsx("small",{children:storageText("tokenHelp")})'
patch(settings,needle,'e.jsx("small",{children:(activeIntegration?.name?activeIntegration.name+" · ":"")+storageText("tokenHelp")})')
settings.write_text(settings.read_text().replace('node_exporter_prod','node_exporter'))
main.write_text(main.read_text().replace('node_exporter_prod','node_exporter'))
# The shipped dashboard has 58 entries: 8 rows, 49 data panels and 1 coverage guide.
s=main.read_text();pattern=re.compile(r'("settings.grafana.overview-body":)"(?:[^"\\]|\\.)*"');texts=json.loads((context/'wizard-messages.json').read_text());langs=['de','en','es','fr','it','ro','en'];index=iter(langs);s,n=pattern.subn(lambda m:m[1]+json.dumps(texts[next(index)]['overview'],ensure_ascii=False),s);assert n==7,n;main.write_text(s)
# Generated historical acceptance summaries have no runtime references.
# Keep private acceptance evidence outside the publicly served frontend.
for name in ['task3-validation.json','task4-validation.json','task5-validation.json','task6-validation.json']:
 p=f/name
 if p.exists():p.unlink()
# Rename the entire frontend dependency graph atomically for this release.
mapping={p.name:'asset-517-'+hashlib.sha256(p.name.encode()).hexdigest()[:16]+p.suffix for p in assets.iterdir() if p.suffix in ['.js','.css']};pattern=re.compile('|'.join(re.escape(n) for n in sorted(mapping,key=len,reverse=True)))
for p in list(f.rglob('*')):
 if not p.is_file() or p.suffix not in ['.js','.css','.html']:continue
 p.write_text(pattern.sub(lambda m:mapping[m[0]],p.read_text()).replace('5.0.16','5.0.17'))
for old,new in mapping.items():(assets/old).rename(assets/new)
p=f/'index.html';s=p.read_text().replace('</head>','<link rel="stylesheet" href="/assets/'+mapping['storage.css']+'">\n</head>');p.write_text(s)
p=f/'nyxguard-build.json';d=json.loads(p.read_text());d.update(version='5.0.17',sourceRevision=revision,task='historical-analytics-storage',assets={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(assets.iterdir())if p.is_file()});p.write_text(json.dumps(d,indent=2)+'\n')
p=root/'CHANGELOG_PUBLIC.md';p.write_text((context/'RELEASE-NOTES.md').read_text()+'\n'+p.read_text())

# Parse every shipped module under the actual /app ESM package contract.
for module in assets.glob("*.js"):
 subprocess.run(["node","--check",str(module)],check=True,stdout=subprocess.DEVNULL)
