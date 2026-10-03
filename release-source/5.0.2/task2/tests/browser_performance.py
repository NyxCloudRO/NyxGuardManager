"""Controlled browser response fixtures; never writes test history to the server."""
import argparse,json,time
from datetime import datetime,timedelta,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--auth-file',required=True);parser.add_argument('--output',required=True);parser.add_argument('--asset-dir');args=parser.parse_args();base=args.base.rstrip('/');out={}
now=datetime.now(timezone.utc).isoformat()
def item(ip):return {'ip':ip,'requests':3,'allowed':3,'blocked':0,'lastSeen':now,'hosts':['fixture.invalid'],'country':None}
def ips_data(items,minutes=43200,truncated=False):return {'windowMinutes':minutes,'now':now,'truncated':truncated,'items':items}
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox']);context=browser.new_context(ignore_https_errors=True,viewport={'width':1440,'height':900});auth=json.loads(Path(args.auth_file).read_text());context.add_init_script('localStorage.setItem("authentications",'+json.dumps(json.dumps([{'token':auth['token'],'expires':(datetime.now(timezone.utc)+timedelta(hours=12)).isoformat()}]))+');')
 if args.asset_dir:
  names=['index-BqF3trRq.js','index-B_A1pRP7.js','index-CP-DF6LG.js','getNyxGuardGeoip-BFi2NwFK.js','getNyxGuardAttacksSummary-C48hTUOS.js']
  def assets(route):
   name=route.request.url.split('/')[-1].split('?')[0]
   if name in names:route.fulfill(path=str(Path(args.asset_dir)/name),content_type='application/javascript')
   else:route.continue_()
  context.route('**/assets/**',assets)
 page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)));held=[];failures=[]
 def delayed(route):
  if not held:held.append(route)
  else:route.fulfill(json=ips_data([item('192.0.2.240')]))
 context.route('**/api/nyxguard/ips?*',delayed);page.on('requestfailed',lambda request:failures.append(request.failure) if '/api/nyxguard/ips?' in request.url else None)
 page.goto(base+'/nyxguard/ips',wait_until='domcontentloaded');page.get_by_role('button',name='Last 30d',exact=True).wait_for();page.wait_for_timeout(200);assert held;assert 'Loading' in page.locator('body').inner_text();page.get_by_role('button',name='Last 30d',exact=True).click();page.get_by_text('192.0.2.240',exact=True).wait_for();page.wait_for_timeout(200);assert any('ABORTED' in failure for failure in failures),failures
 try:held[0].fulfill(json=ips_data([],15))
 except Exception:pass
 assert page.get_by_text('192.0.2.240',exact=True).is_visible();out['cancellation']={'aborted':True,'newResultRemained':True};context.unroute('**/api/nyxguard/ips?*',delayed)
 data=ips_data([item(f'198.18.{i//256}.{i%256}') for i in range(10000)],truncated=True)
 def populated(route):route.fulfill(json=data)
 context.route('**/api/nyxguard/ips?*',populated);start=time.monotonic();page.reload(wait_until='domcontentloaded');page.locator('tbody tr').first.wait_for();assert page.locator('tbody tr').count()==100;assert page.get_by_text('Log scan limit reached; this view includes only scanned traffic.',exact=True).is_visible();out['populated']={'readyMs':(time.monotonic()-start)*1000,'renderedRows':100,'loadedRows':10000,'domNodes':page.locator('*').count()}
 page.get_by_role('button',name='Next',exact=True).click();assert 'Showing 101–200 of 10000 matching loaded IPs' in page.locator('body').inner_text();page.get_by_role('button',name='Previous',exact=True).click();assert 'Showing 1–100 of 10000 matching loaded IPs' in page.locator('body').inner_text()
 page.locator('[class*="_filterInput_"]').first.fill('198.18.0.255');assert page.locator('tbody tr').count()==1;assert 'Showing 1–' in page.locator('body').inner_text()
 with page.expect_download() as download_event:page.get_by_role('button',name='Export JSON',exact=True).click()
 downloaded=json.loads(Path(download_event.value.path()).read_text());assert len(downloaded['items'])==10000;out['exportRows']=10000
 context.unroute('**/api/nyxguard/ips?*',populated)
 def failed(route):route.fulfill(status=500,json={'error':{'message':'Controlled acceptance failure'}})
 context.route('**/api/nyxguard/ips?*',failed);page.reload(wait_until='domcontentloaded');page.get_by_text('Unable to load IP data.',exact=True).wait_for(timeout=20000);out['ipsErrorDistinct']=True;context.unroute('**/api/nyxguard/ips?*',failed)
 def empty(route):route.fulfill(json=ips_data([],15))
 context.route('**/api/nyxguard/ips?*',empty);page.reload(wait_until='networkidle');assert not page.get_by_text('Unable to load IP data.',exact=True).is_visible();assert page.locator('tbody tr').count()==0;out['ipsEmptyDistinct']=True;context.unroute('**/api/nyxguard/ips?*',empty)
 context.route('**/api/nyxguard/summary?*',failed);page.goto(base+'/nyxguard/traffic',wait_until='domcontentloaded');page.get_by_text('Unable to load traffic (API error).',exact=True).wait_for(timeout=20000);out['trafficErrorDistinct']=True
 page.goto(base+'/',wait_until='domcontentloaded');page.get_by_text('Unable to load traffic summary.',exact=True).wait_for(timeout=20000);out['dashboardErrorDistinct']=True
 assert not errors,errors;out['pageErrors']=errors;Path(args.output).write_text(json.dumps(out));print(json.dumps(out));browser.close()
