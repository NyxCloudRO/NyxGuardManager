"""Read-only Traffic Rules rendering test. Requires a private authenticated BROWSER_STATE."""
import os
from playwright.sync_api import sync_playwright
base=os.environ['BASE_URL'].rstrip('/')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);c=b.new_context(ignore_https_errors=True,storage_state=os.environ['BROWSER_STATE']);page=c.new_page()
 for server_expired in [True,False]:
  def rules(r):
   assert r.request.method=='GET','Regression must not write the installation'
   r.fulfill(json={'items':[{'id':987654321,'enabled':not server_expired,'configuredEnabled':True,'expired':server_expired,'ruleOrigin':'verified_crawler','action':'allow','ipCidr':'66.249.66.1','note':'Auto-allow verified crawler: google','expiresOn':'2000-01-01T00:00:00.000Z'}]})
  c.route('**/api/nyxguard/rules/ip',rules)
  page.goto(base+'/nyxguard/rules',wait_until='networkidle');row=page.locator('tr',has_text='66.249.66.1');assert row.count()==1
  checkbox=row.locator('input[type=checkbox]');assert not checkbox.is_checked();assert checkbox.is_disabled();assert 'Expired' in checkbox.get_attribute('title');assert row.get_by_role('button',name='Delete',exact=True).is_enabled()
  assert row.get_by_role('button',name='Edit',exact=True).is_disabled()
  c.unroute('**/api/nyxguard/rules/ip',rules)
 print('PASS: expired and deadline-crossing crawler checkboxes are inactive and disabled; removal remains available')
 b.close()
