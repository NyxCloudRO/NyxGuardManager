"""Read-only acceptance: container health alone cannot prove Manager-to-Agent communication."""
import os,json,subprocess,re,urllib.request,ssl
from pathlib import Path
manager=os.environ.get('MANAGER_CONTAINER','nyxguard-manager');agent=os.environ.get('VPN_AGENT_CONTAINER','nyxguard-vpn-agent')
containers=json.loads(subprocess.check_output(['docker','inspect',manager,agent]));namespaces=[os.readlink('/proc/'+str(x['State']['Pid'])+'/ns/net') for x in containers]
assert namespaces[0]==namespaces[1],'Agent must join the current Manager network namespace'
assert all(x['State']['Health']['Status']=='healthy' for x in containers)
# The supplied private authenticated session stays outside source and receipts.
session=json.loads(Path(os.environ['BROWSER_STATE']).read_text());token=None
for origin in session['origins']:
 for item in origin['localStorage']:
  match=re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',item['value'])
  if match:token=match.group();break
assert token,'Authenticated private session required'
request=urllib.request.Request(os.environ['BASE_URL'].rstrip('/')+'/api/vpn-client/sites',headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(request,context=ssl._create_unverified_context(),timeout=10) as r:body=json.load(r)
assert body['agentAvailable'],'Manager cannot communicate with Agent'
print(json.dumps({'status':'PASS','kernelNamespaceEqual':True,'managerAgentAPI':True,'configuredSites':len(body['sites']),'connectedSites':body['summary']['connected']}))
