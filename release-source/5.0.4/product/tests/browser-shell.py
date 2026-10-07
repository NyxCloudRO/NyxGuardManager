"""Read-only canonical composition regression using normal sidebar/tab navigation.
Set BASE_URL and BROWSER_STATE to a private authenticated browser session.
"""
import os,json
from playwright.sync_api import sync_playwright
base=os.environ['BASE_URL'].rstrip('/');state=os.environ['BROWSER_STATE'];version=os.environ.get('EXPECTED_VERSION','5.0.4')
style_keys=['padding','backgroundColor','backgroundImage','border','borderRadius','boxShadow','overflowY']
measure='''x=>({rect:x.getBoundingClientRect().toJSON(),clientWidth:x.clientWidth,clientHeight:x.clientHeight,scrollWidth:x.scrollWidth,scrollHeight:x.scrollHeight,css:Object.fromEntries(%s.map(k=>[k,getComputedStyle(x)[k]]))})'''%json.dumps(style_keys)
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox']);c=browser.new_context(ignore_https_errors=True,storage_state=state,viewport={'width':1440,'height':900});page=c.new_page();errors=[];api_errors=[];receipts=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('response',lambda r:api_errors.append({'endpoint':r.url.split('/api/')[-1],'status':r.status}) if '/api/' in r.url and r.status>=400 else None)
 page.goto(base+'/',wait_until='domcontentloaded');page.locator('.nyx-dashboard-viewport').wait_for(state='visible')
 for viewport in [{'width':1440,'height':900},{'width':390,'height':844}]:
  for theme in ['premium-nyx','obsidian-guard','void-black']:
   refs={}
   for name,control in [('settings','Settings'),('events','Event Center'),('license','License'),('overview','Diagnostics & Support'),('diagnostics','@Diagnostics'),('troubleshooting','@Troubleshooting'),('bundle','@Support Bundle')]:
    # Use the application's actual navigation so hidden React routes unmount correctly.
    page.set_viewport_size({'width':1440,'height':900})
    if control.startswith('@'):page.get_by_role('button',name=control[1:],exact=True).click()
    else:page.get_by_role('link',name=control,exact=True).click()
    page.set_viewport_size(viewport);page.evaluate('(t)=>document.documentElement.dataset.appTheme=t',theme);page.wait_for_timeout(900)
    frame=page.locator('.app-page-container-framed:visible');assert frame.count()==1,(name,'one visible outer frame')
    shell=page.locator('.app-page-shell:visible');assert shell.count()==1,(name,'one visible page shell')
    surface=frame.locator(':scope > ._card_1gz5u_1');assert surface.count()==1,(name,'existing canonical inner surface')
    assert surface.locator('._card_1gz5u_1').count()==0,(name,'nested canonical surfaces')
    fg=frame.evaluate(measure);sg=surface.evaluate(measure);footer=page.locator('footer').evaluate(measure);header=surface.locator('h1,h2').first.evaluate(measure)
    assert 'v'+version in page.locator('footer').inner_text(),(name,'version')
    assert fg['scrollWidth']<=fg['clientWidth']+1,(name,'horizontal frame overflow',fg)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(name,'horizontal viewport overflow')
    assert fg['rect']['right']<=viewport['width']+1,(name,'viewport relationship')
    assert fg['rect']['bottom']<=footer['rect']['top']+1,(name,'footer overlap')
    if name in ['settings','events']:refs[name]={'frame':fg,'surface':sg,'header':header,'footer':footer}
    else:
     settings=refs['settings'];event=refs['events']
     assert all(sg['css'][k]==settings['surface']['css'][k] for k in style_keys),(name,'existing Settings surface styles',sg,settings['surface'])
     assert all(abs(fg['rect'][k]-event['frame']['rect'][k])<2 for k in ['x','y','width','height']),(name,'Event Center outer geometry',fg,event)
     assert all(abs(sg['rect'][k]-settings['surface']['rect'][k])<2 for k in ['x','y','width']),(name,'Settings inner surface geometry')
     assert abs(header['rect']['x']-settings['header']['rect']['x'])<2,(name,'header inset')
     assert fg['css']['overflowY']=='auto' and sg['css']['overflowY']=='visible',(name,'single page scroll owner')
     unintended=surface.evaluate('x=>Array.from(x.querySelectorAll("section,div,nav,header")).filter(e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight+1&&["auto","scroll"].includes(getComputedStyle(e).overflowY)).map(e=>e.className)')
     assert not unintended,(name,'nested page scrolling',unintended)
     frame.evaluate('x=>x.scrollTop=0');old=frame.evaluate('x=>x.scrollTop');frame.evaluate('x=>x.scrollTop=100');scrolled=frame.evaluate('x=>x.scrollTop');assert fg['scrollHeight']<=fg['clientHeight']+1 or scrolled>old,(name,'vertical scroll works');frame.evaluate('x=>x.scrollTop=0')
     if name!='license':
      nav=surface.locator('.nyx-support-tabs');assert nav.count()==1 and nav.get_by_role('button').count()==4
      assert nav.locator('.nyx-support-tab-active').count()==1
     page.locator('.nyx-support-page-header').wait_for(state='visible')
    if os.environ.get('SCREENSHOT_DIR'):page.screenshot(path=os.path.join(os.environ['SCREENSHOT_DIR'],name+'-'+theme+'-'+str(viewport['width'])+'.png'))
    receipts.append({'route':name,'theme':theme,'viewport':viewport,'frame':fg,'innerSurface':sg,'header':header,'footer':footer})
 assert not errors,errors;assert not api_errors,api_errors
 print(json.dumps({'status':'PASS','cases':len(receipts),'affectedCases':30,'normalNavigation':True,'runtimeErrors':errors,'apiErrors':api_errors,'receipts':receipts}));browser.close()
