"""Authenticated deployed UI checks with browser-only response fixtures."""
import argparse,json,re
from pathlib import Path
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--base',required=True);p.add_argument('--auth-file',required=True);p.add_argument('--output',required=True);p.add_argument('--asset-dir');p.add_argument('--css');p.add_argument('--screenshots');args=p.parse_args();out={'failures':[],'partial':[]};auth=json.loads(Path(args.auth_file).read_text());viewports=[(1920,1080),(1920,900),(1600,900),(1440,900),(1366,768),(1280,800),(1280,720),(1024,768),(1280,680)]
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox'])
 def context():
  c=browser.new_context(ignore_https_errors=True,viewport={'width':1440,'height':900});c.add_init_script('localStorage.setItem("authentications",'+json.dumps(json.dumps([{'token':auth['token'],'expires':(datetime.now(timezone.utc)+timedelta(hours=12)).isoformat()}]))+');')
  if args.asset_dir:
   def assets(r):
    name=r.request.url.split('/')[-1].split('?')[0];f=Path(args.asset_dir)/name
    if f.exists():r.fulfill(path=str(f),content_type='application/javascript')
    else:r.continue_()
   c.route('**/assets/*.js',assets)
  return c
 cases=[('/nyxguard/globalgate','**/api/nyxguard/settings','Unable to load GlobalGate settings.','Retry'),('/web-controls','**/api/web-threat/effective*','Unable to load Web Controls policy.','Retry'),('/web-controls','**/api/web-threat/analytics/overview*','Unable to load Web Controls analytics.','Retry analytics'),('/web-controls','**/api/web-threat/events*','Unable to load Web Controls events.','Retry events')]
 for route,target,message,retry in cases:
  c=context();c.route(target,lambda r:r.fulfill(status=500,json={'error':{'message':'Controlled acceptance failure'}}));page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(args.base.rstrip('/')+route,wait_until='domcontentloaded');page.get_by_role('alert').filter(has_text=message).wait_for(timeout=20000);assert not page.get_by_text(re.compile('^No events in the last')).is_visible();assert not page.get_by_text('Loading GlobalGate Security Layer...',exact=True).is_visible();c.unroute(target);page.get_by_role('button',name=retry,exact=True).click();expect(page.get_by_role('alert').filter(has_text=message)).to_have_count(0,timeout=20000);assert not errors;out['failures'].append({'route':route,'path':target,'visibleFailure':True,'retryRecovered':True,'pageErrors':errors});c.close()
 c=context();held=[];c.route('**/api/web-threat/effective*',lambda r:held.append(r));page=c.new_page();page.goto(args.base.rstrip('/')+'/web-controls',wait_until='domcontentloaded');page.get_by_role('status').get_by_text('Loading Web Controls policy…',exact=True).wait_for();assert not page.get_by_role('button',name='Create and activate',exact=True).is_visible();out['policyLoadingTruthful']=True
 for held_route in held:held_route.abort()
 c.unroute('**/api/web-threat/effective*');page.wait_for_timeout(100);c.close()
 c=context();c.route('**/api/nyxguard/apps/summary*',lambda r:r.fulfill(json={'totalApps':2,'protectedCount':1,'authBypassProtectedCount':0}));page=c.new_page()
 for route in ['/','/nyxguard/globalgate']:
  page.goto(args.base.rstrip('/')+route,wait_until='networkidle')
  if args.css:page.add_style_tag(path=args.css)
  pill=page.locator('.nyx-waf-partial');assert pill.count()==1
  for w,h in viewports:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(100)
   data=pill.evaluate('''e=>{let s=getComputedStyle(e),b=e.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);let t=r.getBoundingClientRect();return{width:b.width,height:b.height,text:e.textContent.trim(),fontSize:s.fontSize,color:s.color,background:s.backgroundColor,border:s.borderColor,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,whiteSpace:s.whiteSpace,textWidth:t.width,textHeight:t.height,horizontalCenterOffset:Math.abs((b.left+b.right-t.left-t.right)/2),verticalCenterOffset:Math.abs((b.top+b.bottom-t.top-t.bottom)/2),rootOverflow:document.documentElement.scrollWidth-innerWidth}}''')
   assert data['color']=='rgb(255, 213, 128)' and data['background']=='rgb(59, 45, 22)';assert data['text'].upper()=='PARTIAL' and data['whiteSpace']=='nowrap';assert data['textWidth']<=data['width'] and data['horizontalCenterOffset']<=2 and data['verticalCenterOffset']<=3,data;assert float(data['fontSize'].replace('px',''))>=10.5;assert data['paddingLeft']==data['paddingRight']=='8px';assert data['rootOverflow']==0
   if route=='/':assert data['width']<80,data
   out['partial'].append({'route':route,'viewport':[w,h],**data})
   if args.screenshots:
    Path(args.screenshots).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(args.screenshots)/f'{"dashboard" if route=="/" else "globalgate"}-{w}x{h}.png'))
  page.set_viewport_size({'width':1440,'height':900})
 assert len({(x['color'],x['background'],x['border']) for x in out['partial']})==1;c.close();Path(args.output).write_text(json.dumps(out));browser.close();print('PASS failure/retry/loading states and 18 WAF PARTIAL viewport checks')
