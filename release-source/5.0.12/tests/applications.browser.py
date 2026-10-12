"""Rendered Applications acceptance against an explicitly disposable installation.

Credentials and browser artifacts are supplied privately; never commit them.
Requires BASE_URL, FIXTURE_ENV, BROWSER_STATE, ARTIFACT_DIR and CHROMIUM_PATH.
"""
import json, os, pathlib, re
from playwright.sync_api import sync_playwright, expect

assert os.environ.get('NYXGUARD_DISPOSABLE_ACCEPTANCE') == '1', 'Disposable acceptance opt-in required'
base = os.environ['BASE_URL'].rstrip('/')
env = dict(line.split('=', 1) for line in pathlib.Path(os.environ['FIXTURE_ENV']).read_text().splitlines())
assert env['INITIAL_ADMIN_EMAIL'] == 'acceptance@example.test', 'Synthetic admin required'
art = pathlib.Path(os.environ['ARTIFACT_DIR']); art.mkdir(parents=True, exist_ok=True)
receipts = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'], args=['--no-sandbox'])
    context = browser.new_context(ignore_https_errors=True, storage_state=os.environ['BROWSER_STATE'])
    login = context.request.post(base+'/api/tokens', data={'identity':env['INITIAL_ADMIN_EMAIL'], 'secret':env['INITIAL_ADMIN_PASSWORD']})
    assert login.ok, 'Synthetic login failed'
    auth = {'Authorization':'Bearer '+login.json()['token']}
    def api(path, method='get', data=None):
        response = getattr(context.request, method)(base+'/api/'+path, headers=auth, **({'data':data} if data is not None else {}))
        assert response.ok, (path, response.status)
        return response.json() if response.status != 204 else None
    hosts = api('nginx/proxy-hosts')
    assert hosts and all(all(d.endswith('.example.test') for d in h['domain_names']) for h in hosts), 'Fixture-only host guard failed'
    first = hosts[0]['id']
    page = context.new_page(); errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base+'/', wait_until='domcontentloaded')
    page.locator('.nyx-dashboard-viewport').wait_for()
    page.wait_for_timeout(700)
    if page.get_by_role('button', name='Continue', exact=True).is_visible():
        page.get_by_role('button', name='Continue', exact=True).click()
    page.get_by_role('link', name='Applications', exact=True).click()
    page.locator('._row_1q4nt_60').first.wait_for()
    for width, height in [(1366,768),(1440,900),(1920,1080),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(150)
        bounds=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
          rows:[...document.querySelectorAll('._row_1q4nt_60')].map(e=>({height:e.getBoundingClientRect().height,
          clipped:e.scrollWidth>e.clientWidth+1, buttons:[...e.querySelectorAll('button')].map(b=>({
          clipped:b.scrollWidth>b.clientWidth+1, height:b.getBoundingClientRect().height,
          width:b.getBoundingClientRect().width, text:b.textContent, pressed:b.getAttribute('aria-pressed')}))}))})''')
        assert not bounds['overflow'], (width,bounds)
        assert all(not row['clipped'] and len(row['buttons'])==5 and all(not b['clipped'] and b['height']>=32 for b in row['buttons']) for row in bounds['rows']), (width,bounds)
        page.screenshot(path=str(art/f'applications-{width}.png'))
        receipts.append({'viewport':[width,height],'rows':len(bounds['rows']),'maximumRowHeight':max(r['height'] for r in bounds['rows']),'status':'PASS'})
    page.set_viewport_size({'width':1440,'height':900})
    # Exercise a large list using real API persistence and synthetic names only.
    for index in range(20):
        domain=('a'*63+'.' if index==0 else '')+f'fixture-{index:02d}.example.test'
        if any(domain in h['domain_names'] for h in hosts): continue
        api('nginx/proxy-hosts','post',{'domain_names':[domain], 'forward_scheme':'http',
            'forward_host':'127.0.0.1','forward_port':80,'access_list_id':0,'certificate_id':0,
            'meta':{'nyxguardAppName':('Long application acceptance name '*8 if index==0 else f'Acceptance {index:02d}')},
            'advanced_config':'','block_exploits':False,'caching_enabled':False,'allow_websocket_upgrade':False,
            'http2_support':False,'hsts_enabled':False,'hsts_subdomains':False,'ssl_forced':False,'locations':[]})
    page.reload(wait_until='domcontentloaded');page.locator('._row_1q4nt_60').first.wait_for();page.wait_for_timeout(500)
    if page.get_by_role('button',name='Continue',exact=True).is_visible():page.get_by_role('button',name='Continue',exact=True).click()
    assert page.locator('._row_1q4nt_60').count()>=21
    for width,height in [(1366,768),(1440,900),(1920,1080),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert page.locator('.nyx-app-identity').evaluate_all('(es)=>es.every(e=>e.scrollWidth<=e.clientWidth+1)')
        page.screenshot(path=str(art/f'applications-many-{width}.png'))
        receipts.append({'case':'large-list-long-names','viewport':[width,height],'rows':page.locator('._row_1q4nt_60').count(),'status':'PASS'})
    # Select by application identity; ordering is controlled by the real API.
    first_name=next(item for item in api('nyxguard/apps')['items'] if item['id']==first)['appName'] or hosts[0]['domain_names'][0]
    page.set_viewport_size({'width':1440,'height':900})
    api('nyxguard/settings','put',{'botDefenseEnabled':True,'ddosEnabled':True,'sqliEnabled':True,'authBypassEnabled':True})
    api(f'nyxguard/apps/{first}','put',{'wafEnabled':True,'botDefenseEnabled':True,'ddosEnabled':True,'sqliEnabled':True,'authBypassEnabled':False})
    page.reload(wait_until='domcontentloaded')
    page.locator('._row_1q4nt_60').first.wait_for();page.wait_for_timeout(500)
    if page.get_by_role('button',name='Continue',exact=True).is_visible():page.get_by_role('button',name='Continue',exact=True).click()
    row=page.locator('._row_1q4nt_60').filter(has=page.locator('._name_1q4nt_72',has_text=re.compile('^'+re.escape(first_name)+'$')))
    def state(): return next(item for item in api('nyxguard/apps')['items'] if item['id']==first)
    for field, label in [('botDefenseEnabled','Bot Defence'),('ddosEnabled','DDoS'),('sqliEnabled','SQL Shield'),('authBypassEnabled','Auth Bypass'),('wafEnabled','WAF')]:
        before=state()[field]
        button=row.get_by_role('button',name=re.compile(label+'$'))
        page.once('dialog',lambda dialog:dialog.accept())
        with page.expect_response(lambda r: r.request.method=='PUT' and r.url.endswith(f'/nyxguard/apps/{first}')) as response:
            button.click()
        assert response.value.ok, (field,response.value.status)
        expect(button).to_be_enabled(timeout=15000)
        after=state();assert after[field]!=before,(field,'backend state unchanged')
        page.reload(wait_until='domcontentloaded');row=page.locator('._row_1q4nt_60').filter(has=page.locator('._name_1q4nt_72',has_text=re.compile('^'+re.escape(first_name)+'$')));row.wait_for();page.wait_for_timeout(500)
        if page.get_by_role('button',name='Continue',exact=True).is_visible():page.get_by_role('button',name='Continue',exact=True).click()
        assert state()[field]==after[field],(field,'refresh changed backend state')
        receipts.append({'action':field,'persistedAfterRefresh':True,'status':'PASS'})
    original=state()
    page.route(f'**/api/nyxguard/apps/{first}',lambda route:route.fulfill(status=503,json={'error':{'message':'Synthetic update unavailable'}}))
    row.get_by_role('button',name='Enable WAF',exact=True).click()
    page.get_by_role('alert').filter(has_text='Unable to update').wait_for()
    assert state()==original, 'Failed update changed persisted state'
    assert row.get_by_role('button',name='Enable WAF',exact=True).get_attribute('aria-pressed')=='false'
    page.unroute(f'**/api/nyxguard/apps/{first}')
    receipts.append({'case':'failed-update-retains-confirmed-state','status':'PASS'})
    # Empty and failed list responses exercise the actual rendered component.
    for case,payload,status in [('empty',{'items':[]},200),('api-error',{'error':{'message':'Synthetic load unavailable'}},500)]:
        page.route('**/api/nyxguard/apps',lambda route,request,payload=payload,status=status:route.fulfill(status=status,json=payload))
        page.reload(wait_until='domcontentloaded')
        page.get_by_text('No proxy hosts found yet.' if case=='empty' else 'Unable to load proxy hosts.',exact=True).wait_for(timeout=20000)
        page.screenshot(path=str(art/f'applications-{case}.png'))
        receipts.append({'case':case,'status':'PASS'});page.unroute('**/api/nyxguard/apps')
    pending=[];page.route('**/api/nyxguard/apps',lambda route:pending.append(route))
    page.reload(wait_until='domcontentloaded');page.get_by_role('status').filter(has_text='Loading').wait_for()
    assert pending, 'No actual pending list request'
    pending[0].fulfill(json={'items':[]});page.unroute('**/api/nyxguard/apps')
    receipts.append({'case':'loading','status':'PASS'})
    assert not errors,errors
    (art/'applications-results.json').write_text(json.dumps({'status':'PASS','receipts':receipts,'runtimeErrors':errors},indent=2))
    browser.close()
print(json.dumps({'status':'PASS','cases':len(receipts)}))
