"""Isolated browser regression checks using extracted published CSS and mock audit persistence.
This is a layout/source acceptance fixture, not live application qualification.
Run with browser-env/bin/python; artifacts remain outside the public source tree.
"""
import argparse, json, pathlib
from playwright.sync_api import sync_playwright
ap=argparse.ArgumentParser();ap.add_argument('--published-app',required=True);ap.add_argument('--artifacts',required=True);args=ap.parse_args()
source=pathlib.Path(__file__).resolve().parents[1];app=pathlib.Path(args.published_app);art=pathlib.Path(args.artifacts);art.mkdir(parents=True,exist_ok=True)
css='\n'.join(p.read_text() for p in [app/'frontend/assets/index-DP9jJKnx.css',app/'frontend/assets/professional-support.css',app/'frontend/assets/application-shell.css'])
patch=(source/'frontend/dashboard-alignment.css').read_text()
html='''<html data-app-theme="dark"><head><style>body{margin:0;background:#101c28;color:white;font-family:Arial} .nyx-dashboard-viewport{margin:32px 32px 0 264px!important}.card{padding:24px;border:1px solid #405064}.title{flex:0 0 auto} .pill{border:1px solid #405064;padding:8px;border-radius:12px;white-space:nowrap}h2{margin:0}</style></head><body><div id="root"><main class="nyx-dashboard-viewport"><section class="card"><div class="_heroTitleRow_1rk0u_77"><div class="title"><h2>Dashboard</h2><p>Security and system overview</p></div><div class="_heroPills_1rk0u_85" role="group" aria-label="NyxGuard live stats"><span class="pill">System Uptime 13d</span><span class="pill">Container Uptime 2h</span><span class="pill">Load 0.20 0.30 0.25</span><span class="pill">Pending Updates 4</span></div></div></section></main></div></body></html>'''
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox']); page=browser.new_page()
 for width,height in [(1366,768),(1440,900),(1920,1080),(1280,720)]:
  page.set_viewport_size({'width':width,'height':height});page.set_content(html);page.add_style_tag(content=css)
  before=page.eval_on_selector('[role=group]', '(e)=>e.lastElementChild.getBoundingClientRect().right')
  page.screenshot(path=str(art/f'dashboard-before-{width}x{height}.png'))
  page.add_style_tag(content=patch)
  bounds=page.evaluate('''()=>{const g=document.querySelector('[role=group]'),row=g.parentElement,t=row.firstElementChild;const b=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return {group:b(g),last:b(g.lastElementChild),title:b(t),row:b(row),labels:[...g.children].map(e=>e.textContent)}}''')
  assert abs(bounds['last']['right']-bounds['row']['right'])<1,bounds
  assert bounds['group']['left']>=bounds['title']['right'] or bounds['group']['top']>=bounds['title']['bottom'],bounds
  assert bounds['group']['right']<=width,bounds
  assert bounds['labels']==['System Uptime 13d','Container Uptime 2h','Load 0.20 0.30 0.25','Pending Updates 4']
  page.screenshot(path=str(art/f'dashboard-after-{width}x{height}.png'))
  results.append({'viewport':[width,height],'status':'PASS','beforeRight':before,'afterRight':bounds['last']['right'],'rowRight':bounds['row']['right']})
 middleware=(source/'internal/admin-audit.js').read_text().replace("import auditLog from './audit-log.js';",'').replace("import {express as logger} from '../logger.js';",'').replace('export default function adminAudit','function adminAudit')
 audit=page.evaluate('''async source=>{const logs=[],errors=[];const auditLog={add:async(access,event)=>{logs.push({actor:access.token.getUserId(),...event})}},logger={error:x=>errors.push(x)};const middleware=new Function('auditLog','logger',source+';return adminAudit')(auditLog,logger);
 async function simulate(method,path,status,body,actor=7,childPath='/'){const req={method,path},sent=[];const res={statusCode:status,locals:{access:{token:{getUserId:()=>actor}}},send(x){sent.push(x);return this}};middleware(req,res,()=>{});req.path=childPath;res.send(body);await new Promise(r=>setTimeout(r,0));return sent}
 await simulate('POST','/nyxguard/attacks/ban',200,{ruleId:41},7,'/attacks/ban');
 await simulate('POST','/event-center/clear',200,{deleted:9},7,'/clear');
 await simulate('PUT','/nyxguard/rules/ip/23',204,'No Content');
 await simulate('DELETE','/nginx/proxy-hosts/3',403,{error:'denied'});
 await simulate('POST','/settings/backup/import',200,{ok:true});
 await simulate('PUT','/nyxguard/geoip/config',200,{ok:true});
 const count=logs.length;await simulate('POST','/nginx/proxy-hosts',201,{id:99});if(logs.length!==count)throw Error('duplicate legacy audit');
 await simulate('GET','/nyxguard/rules/ip',200,{});await simulate('PUT','/nyxguard/rules/ip/1',403,{},0);if(logs.length!==count)throw Error('unexpected unauthenticated/read event');
 if(logs[0].action!=='manual_ban'||logs[0].meta.resource!=='/nyxguard/attacks/ban'||logs[0].object_id!==41)throw Error('mounted path lost');
 if(logs[1].action!=='logs_cleared'||logs[2].object_id!==23||logs[3].result!=='denied'||logs.length!==6)throw Error('audit identity/outcome missing');return {status:'PASS',events:logs,errors};}''',middleware)
 browser.close()
(art/'ui-audit-results.json').write_text(json.dumps({'dashboardFixture':results,'auditMiddlewareFixture':audit,'liveDashboard':'NOT TESTED','liveSidebar':'NOT TESTED','eventPersistenceAndAuthorization':'NOT TESTED'},indent=2))
print(json.dumps({'dashboardFixtures':len(results),'auditEvents':len(audit['events']),'status':'PASS','artifacts':str(art)}))
