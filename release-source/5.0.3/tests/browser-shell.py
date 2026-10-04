"""Live authenticated shell acceptance. Requires Playwright and a private saved
browser state supplied through NYX_BROWSER_STATE; never embeds credentials.
Run against the exact rebuilt DEV image, not a CSS prototype.
"""
import json, os, pathlib
from playwright.sync_api import sync_playwright
URL = os.environ['NYX_DEV_URL'].rstrip('/')
STATE = os.environ['NYX_BROWSER_STATE']
OUT = pathlib.Path(os.environ['NYX_ACCEPTANCE_DIR']); OUT.mkdir(mode=0o700, parents=True, exist_ok=True)
ROUTES = ['/', '/nyxguard/traffic', '/nyxguard/ips', '/nyxguard/rules', '/nyxguard/apps', '/nyxguard/attacks', '/web-controls', '/nyxguard/globalgate', '/nyxguard/proxy', '/access', '/certificates', '/users', '/event-center', '/settings', '/nyxguard/redirection', '/nyxguard/404', '/nyxguard/stream', '/#nyxguard-license', '/#nyxguard-diagnostics-support', '/#nyxguard-diagnostics-support/diagnostics', '/#nyxguard-diagnostics-support/troubleshooting', '/#nyxguard-diagnostics-support/support-bundle', '/nyxguard', '/dashboard', '/nyxguard/ddos', '/nyxguard/bot', '/audit-log', '/changelog', '/nginx/proxy', '/nginx/redirection', '/nginx/404', '/nginx/stream', '/not-a-real-route']
VIEWPORTS = [(2560,1440),(1920,1080),(1920,900),(1600,900),(1536,864),(1440,900),(1366,768),(1280,800),(1280,720),(1024,768),(1280,680),(390,844),(360,740)]
GEOMETRY = '''()=>{const main=document.querySelector('.nyx-dashboard-viewport'),support=main.querySelector(':scope > .nyx-support-page'),frame=support||main.querySelector('.nyx-route-content .container-xl');if(!frame)return null;const rect=e=>e.getBoundingClientRect().toJSON(),s=getComputedStyle(frame);return {frame:rect(frame),main:rect(main),footer:rect(document.querySelector('footer')),sidebar:rect(document.querySelector('[class*="_sidebarWrap_"]')),className:frame.className,maxWidth:s.maxWidth,overflow:s.overflowY,clientHeight:frame.clientHeight,scrollHeight:frame.scrollHeight,scrollTop:frame.scrollTop,mainOverflow:getComputedStyle(main).overflowY,mainTop:main.scrollTop,window:scrollY,rootTop:document.querySelector('#root').scrollTop,documentTop:document.documentElement.scrollTop,bodyTop:document.body.scrollTop,documentHeight:document.documentElement.scrollHeight,rootX:document.documentElement.scrollWidth-innerWidth,frameX:frame.scrollWidth-frame.clientWidth,nested:[...frame.querySelectorAll('*')].filter(e=>e.clientHeight&&e.scrollHeight>e.clientHeight+2&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>({className:e.className,rect:rect(e),clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop}))}}'''
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox'])
    for width,height in VIEWPORTS:
        context=browser.new_context(ignore_https_errors=True,storage_state=STATE,viewport={'width':width,'height':height},is_mobile=width<768,has_touch=width<768)
        page=context.new_page(); page.goto(URL+'/',wait_until='domcontentloaded')
        for index,route in enumerate(ROUTES):
            page.evaluate("r=>{history.pushState(null,'',r);dispatchEvent(new PopStateEvent('popstate'));dispatchEvent(new HashChangeEvent('hashchange'))}",route)
            page.locator('.nyx-central-scroll-frame').wait_for(); page.wait_for_timeout(1200)
            if page.get_by_role('button',name='Continue',exact=True).count(): page.get_by_role('button',name='Continue',exact=True).click()
            before=page.evaluate(GEOMETRY); assert before, (route,'missing bounded route frame')
            assert before['mainOverflow']=='hidden' and before['mainTop']==0, (route,'full-width shell must not scroll')
            assert before['window']==before['rootTop']==before['documentTop']==before['bodyTop']==0
            assert before['documentHeight']<=height+1 and before['rootX']<=1 and before['frameX']<=1
            assert 'nyx-central-scroll-frame' in before['className']
            assert before['frame']['right']<=width-11, (route,'scrollbar at viewport edge')
            assert abs((before['frame']['left']-before['main']['left'])-(before['main']['right']-before['frame']['right']))<=1, (route,'page centering changed')
            if width>=1920:
                assert before['frame']['width']<=1440 and before['frame']['right']<width-100, (route,'full-width scrolling wrapper is forbidden')
            frame=page.locator('.nyx-central-scroll-frame:visible').first
            if before['scrollHeight']>before['clientHeight']+2 and before['overflow'] in ['auto','scroll']:
                frame.focus(); page.keyboard.press('PageDown'); rect=frame.bounding_box();page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2);page.mouse.wheel(0,500);page.wait_for_timeout(200)
                after=page.evaluate(GEOMETRY); assert after['scrollTop']>0, (route,'central frame does not scroll')
                assert after['window']==after['rootTop']==after['documentTop']==after['bodyTop']==after['mainTop']==0
                assert after['footer']==before['footer'] and after['sidebar']==before['sidebar']
            else: after=before
            for nested in before['nested']:
                assert nested['rect']['right']<=before['frame']['right']+1, (route,'nested scrollbar outside page frame')
            frame.evaluate('e=>{e.scrollTop=e.scrollHeight;for(const n of e.querySelectorAll("*"))if(n.scrollHeight>n.clientHeight&&["auto","scroll"].includes(getComputedStyle(n).overflowY))n.scrollTop=n.scrollHeight}')
            controls=frame.locator('button:visible,input:visible,select:visible,textarea:visible')
            if controls.count():
                controls.last.scroll_into_view_if_needed();r=controls.last.bounding_box();assert r and r['y']>=0 and r['y']+r['height']<=before['footer']['top']+1, (route,'last action clipped')
            page.screenshot(path=str(OUT/f'shell-{width}-{height}-{index:02}.png'))
            results.append({'route':route,'width':width,'height':height,'before':before,'afterScroll':after,'lastActionReachable':True})
            print('PASS',width,height,route,flush=True)
        context.close()
    browser.close()
(OUT/'shell-geometry.json').write_text(json.dumps(results,indent=2))
print('PASS',len(results),'live bounded-frame route/viewport cases; visual screenshot review remains required')
