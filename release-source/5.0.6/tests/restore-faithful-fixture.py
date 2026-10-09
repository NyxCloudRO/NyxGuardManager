import os
assert os.environ.get("NYXGUARD_DISPOSABLE_CERTIFICATION") == "1", "Explicit disposable-fixture authorization required"
import subprocess,pathlib,sys,yaml,json
H=os.environ['NYXGUARD_TEST_ENGINE'];case=sys.argv[1];P='/opt/nyx506-'+case;prefix='nyx506_'+case;B=os.environ['NYXGUARD_FAITHFUL_BACKUP']
def run(a,inp=None,check=True):
 p=subprocess.run(['docker','exec',*(['-i'] if inp is not None else []),H,*a],input=inp,capture_output=True)
 if check and p.returncode:raise RuntimeError(p.stderr.decode()[-1000:])
 return p
assert run(['test','-e',P],check=False).returncode!=0
run(['mkdir','-p',P]);run(['cp','-a',os.environ['NYXGUARD_FAITHFUL_METADATA']+'/.',P+'/'])
for key in ['data','letsencrypt','db','vpn','vpn_auth']:
 name=prefix+'_'+key;run(['docker','volume','create',name]);run(['docker','run','--rm','--network','none','--entrypoint','sh','-v',name+':/restore','-v',B+':/backup:ro','sha256:a5cfd4eacf2d13e049fc2263d61caa6ecafe95fc4147d24150ee3c024902005f','-c','test -z "$(ls -A /restore)" && tar -xzf /backup/nyxguard_'+key+'.tar.gz -C /restore'])
for file in ['docker-compose.yml','docker-compose.vpn.yml']:
 c=yaml.safe_load(run(['cat',P+'/'+file]).stdout)
 for service,name in [('nyxguard-manager',prefix+'_manager'),('db',prefix+'_db'),('vpn-client-agent',prefix+'_agent')]:
  if service in c['services']:c['services'][service]['container_name']=name;c['services'][service].pop('ports',None)
 for key,v in c.get('volumes',{}).items():v['name']=prefix+'_'+key.removeprefix('nyxguard_')
 run(['sh','-c','cat > '+P+'/'+file],inp=yaml.safe_dump(c,sort_keys=False).encode())
root=pathlib.Path(__file__).resolve().parents[3]
for file,source in [('update506.sh','update.sh'),('bootstrap506.mjs','upgrade/same-major-bootstrap.mjs')]:run(['sh','-c','cat > '+P+'/'+file],inp=(root/source).read_bytes())
cmd=['docker','compose','--env-file',P+'/.env','-f',P+'/docker-compose.yml','-f',P+'/docker-compose.vpn.yml'];run(cmd+['up','-d']);print(json.dumps({'case':case,'installDir':P,'manager':prefix+'_manager','agent':prefix+'_agent','database':prefix+'_db','dataVolume':prefix+'_data','faithfulSource':'5.0.1','schema':42,'volumesRetained':True}))
