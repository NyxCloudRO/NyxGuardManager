"""Authenticated read-only browser gate. Keep session files and output outside source."""
import argparse,json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--auth-file',required=True);parser.add_argument('--output',required=True);parser.add_argument('--asset-dir');parser.add_argument('--css');parser.add_argument('--screenshots');args=parser.parse_args()
viewports=[(1920,1080),(1920,900),(1600,900),(1440,900),(1366,768),(1280,800),(1280,720),(1024,768),(1280,680)]
routes=['/','/nyxguard/traffic','/nyxguard/ips','/nyxguard/rules','/nyxguard/apps','/nyxguard/attacks','/web-controls','/nyxguard/globalgate','/nyxguard/proxy','/access','/certificates','/users','/event-center','/settings','/#nyxguard-diagnostics-support']
nav=['Dashboard','Live Traffic','IPs & Geo','Traffic Rules','Applications','Threat Activity','Web Controls','GlobalGate Shieldwall','NyxGuard Proxy Hosts','Access Lists','Certificates','Users','Event Center','Settings']
changed=['index-Dd_E7hOB.js','index-CP-DF6LG.js','index-BiykMfhJ.js','index-B_A1pRP7.js','index-BqF3trRq.js','index-DHuZiE1T-task2.js','getNyxGuardAttacksSummary-C48hTUOS.js','getNyxGuardGeoip-BFi2NwFK.js','professional-support.js']
out={'routes':[],'sidebar':[],'errors':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox']);context=browser.new_context(ignore_https_errors=True,viewport={'width':1440,'height':900});auth=json.loads(Path(args.auth_file).read_text());context.add_init_script('localStorage.setItem("authentications",'+json.dumps(json.dumps([{'token':auth['token'],'expires':(datetime.now(timezone.utc)+timedelta(hours=12)).isoformat()}]))+');')
 if args.asset_dir:
  def assets(route):
   name=route.request.url.split('/')[-1].split('?')[0]
   if name in changed:route.fulfill(path=str(Path(args.asset_dir)/name),content_type='application/javascript')
   else:route.continue_()
  context.route('**/assets/**',assets)
 page=context.new_page();page.on('pageerror',lambda error:out['errors'].append(str(error)));page.on('response',lambda response:out.setdefault('apiErrors',[]).append({'path':response.url.split('/api/',1)[1],'status':response.status}) if '/api/' in response.url and response.status>=400 else None)
 for route in routes:
  page.goto(args.base.rstrip('/')+route,wait_until='domcontentloaded',timeout=30000)
  try:page.wait_for_load_state('networkidle',timeout=12000)
  except Exception:page.locator('[class*="_main_"]').wait_for();out.setdefault('pollingBusyRoutes',[]).append(route)
  if args.css:page.add_style_tag(path=args.css);page.wait_for_timeout(400)
  observations=[]
  for width,height in viewports:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(80)
   data=page.evaluate('''()=>({width:innerWidth,height:innerHeight,rootOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),mainOverflow:(()=>{let e=document.querySelector('[class*="_main_"]');return e?Math.max(0,e.scrollWidth-e.clientWidth):0})()})''')
   assert data['rootOverflow']==0,(route,data)
   assert data['mainOverflow']==0,(route,data)
   sidebar=page.locator('aside[aria-label="Main navigation"]')
   geometry=sidebar.evaluate('''el=>({regions:[el,...el.querySelectorAll('#navbar-menu,[class*="_sidebarFooter_"]')].map(e=>({scroll:e.scrollHeight,client:e.clientHeight,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})),links:[...el.querySelectorAll('a')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({text:e.textContent.trim(),top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})),profile:!!el.querySelector('[class*="_sidebarFooter_"] button')})''')
   for region in geometry['regions']:assert region['scroll']<=region['client'],(route,width,height,region)
   for item in nav+['License','Diagnostics & Support','Support NyxGuard','Community']:
    link=next((x for x in geometry['links'] if x['text']==item),None);assert link,(route,item)
    assert link['top']>=geometry['regions'][0]['top']-1 and link['bottom']<=geometry['regions'][0]['bottom']+1,(route,width,height,item)
   assert sidebar.locator('[class*="_prefsToggle_"]').is_visible();assert geometry['profile']
   observations.append(data)
   if route=='/event-center':
    density=sidebar.evaluate("""el=>{let links=[...el.querySelectorAll('#navbar-menu .navbar-nav .nav-link')].filter(e=>e.getBoundingClientRect().height>0),last=links.at(-1),footer=el.querySelector('[class*="_sidebarFooter_"]');return {rowHeight:links[0].getBoundingClientRect().height,fontSize:getComputedStyle(links[0]).fontSize,iconSize:getComputedStyle(el.querySelector('.nav-link-icon')).width,settingsToProfileGap:footer.getBoundingClientRect().top-last.getBoundingClientRect().bottom}}""")
    assert float(density['fontSize'].replace('px',''))>=14,(width,height,density)
    if height>=900:assert density['rowHeight']>=35 and density['settingsToProfileGap']<90,(width,height,density)
    out['sidebar'].append({'width':width,'height':height,**geometry,**density})
    if args.screenshots:
     Path(args.screenshots).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(args.screenshots)/f'sidebar-{width}x{height}.png'))
  out['routes'].append({'route':route,'viewports':observations,'headings':page.locator('h1,h2,h3').all_text_contents()});print('PASS route '+route,flush=True)
 page.set_viewport_size({'width':390,'height':844});page.goto(args.base+'/event-center',wait_until='domcontentloaded');page.get_by_role('heading',name='Event History',exact=True).wait_for();toggle=page.get_by_role('button',name='Toggle navigation',exact=True);assert toggle.is_visible();toggle.click();page.locator('#navbar-menu.show').wait_for();assert page.locator('#navbar-menu').get_by_role('link',name='Settings',exact=True).is_visible();toggle.click();page.wait_for_timeout(400);assert 'show' not in page.locator('#navbar-menu').get_attribute('class');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');out['mobile']={'width':390,'height':844,'rootOverflow':0}
 assert not out['errors'],out['errors'];assert not out.get('apiErrors'),out.get('apiErrors');Path(args.output).write_text(json.dumps(out));browser.close()
