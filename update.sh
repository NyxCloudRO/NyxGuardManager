#!/usr/bin/env bash
# Root: curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash
# Sudo: curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | sudo bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'ERROR: Run as root or pipe to sudo bash.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'ERROR: python3 is required. Install it with apt-get install python3.' >&2; exit 1; }
runner=$(mktemp)
trap 'rm -f "$runner"' EXIT
chmod 700 "$runner"
cat >"$runner" <<'NYXGUARD_HOST_UPGRADE_PY'
#!/usr/bin/env python3
"""A single host process: verified cold backup, Compose app replacement, recovery."""
import contextlib,fcntl,hashlib,json,os,pathlib,re,shutil,signal,subprocess,sys,tempfile,time,urllib.request
_saved=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path(os.environ.get('INSTALL_DIR',str(_saved.parent) if _saved.name=='.upgrade' else '/opt/nyxguardmanager'))
STATE=ROOT/'.upgrade'

def log(s): print(s,flush=True)
def run(args,*,capture=False,input=None,timeout=900):
 r=subprocess.run(args,input=input,text=True,stdout=subprocess.PIPE if capture else None,stderr=subprocess.PIPE if capture else None,timeout=timeout)
 if r.returncode: raise RuntimeError('Command failed: '+args[0]+' '+args[1]+' (exit '+str(r.returncode)+')')
 return r.stdout if capture else ''
def docker(*args,**kw): return run(['docker',*args],**kw)
def inspect(cid): return json.loads(docker('inspect',cid,capture=True))[0]
def atom(path,value):
 path=pathlib.Path(path);tmp=path.with_name(path.name+'.tmp')
 with open(tmp,'w') as f:
  os.chmod(tmp,0o600);f.write(value);f.flush();os.fsync(f.fileno())
 os.replace(tmp,path)
 fd=os.open(path.parent,os.O_DIRECTORY);os.fsync(fd);os.close(fd)
def save(m): atom(STATE/'pending.json',json.dumps(m))
def semver(v):
 if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',v): raise RuntimeError('Release version is invalid')
 return tuple(map(int,v.split('.')))
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def compose(*args,capture=False):
 files=['-f',str(ROOT/'docker-compose.yml')]
 if (ROOT/'docker-compose.vpn.yml').exists():files+=['-f',str(ROOT/'docker-compose.vpn.yml')]
 return docker('compose','--project-directory',str(ROOT),'--env-file',str(ROOT/'.env'),*files,*args,capture=capture)
def config(): return json.loads(compose('config','--format','json',capture=True))
def cid(service):
 s=compose('ps','-aq',service,capture=True).strip().splitlines()
 if len(s)!=1:raise RuntimeError('Exactly one installed '+service+' container is required')
 return s[0]
def version(c):
 v=docker('exec',c,'node','-e','console.log(require("/app/package.json").version)',capture=True).strip();semver(v);return v

def health(m):
 deadline=time.monotonic()+300
 while time.monotonic()<deadline:
  good=True
  for svc in m['services']:
   c=inspect(cid(svc));status=c['State'].get('Health',{}).get('Status')
   if c['State']['Status']=='restarting' and c.get('RestartCount',0)>=3:raise RuntimeError('Service repeatedly exited during readiness: '+svc)
   if c['State']['Status'] in ('exited','dead'):raise RuntimeError('Service exited during readiness: '+svc)
   if not c['State']['Running'] or (svc!='db' and status!='healthy'):good=False
  if good:
   docker('exec',cid('db'),'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -uroot --silent',capture=True)
   docker('exec',cid('nyxguard-manager'),'nginx','-t',capture=True)
   return
  time.sleep(2)
 raise RuntimeError('Services did not become healthy within five minutes')

# Restrict comparison to durable user configuration and history. Runtime counters,
# migration bookkeeping, retention and notification dispatch are not corruption.
SNAPSHOT=r'''
const mysql=require('/app/node_modules/mysql2/promise');const crypto=require('crypto');
(async()=>{let c=await mysql.createConnection({host:process.env.DB_MYSQL_HOST,port:process.env.DB_MYSQL_PORT||3306,user:process.env.DB_MYSQL_USER,password:process.env.DB_MYSQL_PASSWORD,database:process.env.DB_MYSQL_NAME});
let [tables]=await c.query('SHOW TABLES');let names=tables.map(t=>Object.values(t)[0]);let result={};
const important=['user','auth','user_permission','setting','proxy_host','certificate','access_list','access_list_auth','access_list_client','nyxguard_settings','nyxguard_country_rule','nyxguard_ip_rule','nyxguard_waf_rule','dead_host','redirection_host','stream','nyxcloud_license_state','audit_log'];
const history={nyxcloud_license_state:['id','installation_id'],audit_log:['id','created_on','action','object_type','object_id']};
let previous=process.env.NYX_BASELINE?JSON.parse(process.env.NYX_BASELINE):null;
for(let t of important.filter(t=>names.includes(t))){
 let [cols]=await c.query('SHOW COLUMNS FROM `'+t+'`');let keys=previous?.[t]?.columns || history[t] || cols.map(x=>x.Field).filter(x=>!['modified_on','last_used_at','last_login','last_login_at'].includes(x));
 if(!keys.every(k=>/^[A-Za-z0-9_]+$/.test(k)))throw Error('Invalid column');
 let clause='';
 if(t==='audit_log'){
  const [settings]=await c.query('SELECT value FROM setting WHERE id=?',['audit-log-retention-days']);
  let days=Number(settings[0]?.value??180);if(!Number.isSafeInteger(days)||days<0||days>36500)days=180;
  // Skip records near the legitimate retention boundary; retention is not corruption.
  if(days>0)clause=' WHERE created_on >= DATE_SUB(NOW(), INTERVAL '+Math.max(0,days-1)+' DAY)';
 }
 let [rows]=await c.query('SELECT '+keys.map(k=>'`'+k+'`').join(',')+' FROM `'+t+'`'+clause);
 result[t]={columns:keys,rows:rows.map(r=>crypto.createHash('sha256').update(JSON.stringify(keys.map(k=>r[k]))).digest('hex')).sort()};
}
let [migrations]=await c.query('SELECT name FROM migrations ORDER BY id');let [lock]=await c.query('SELECT is_locked FROM migrations_lock');
if(lock.some(x=>x.is_locked))throw Error('Database migration is locked');
console.log(JSON.stringify({tables:result,migrations:migrations.map(x=>x.name)}));await c.end();
})().catch(()=>{console.error('Database/configuration acceptance failed');process.exit(1)});
'''
def snapshot(manager,baseline=None):
 args=['exec','-i']
 if baseline:args+=['-e','NYX_BASELINE='+json.dumps(baseline['tables'])]
 return json.loads(docker(*args,manager,'node',input=SNAPSHOT,capture=True))
def preservation(before,after):
 for name,b in before['tables'].items():
  if name not in after['tables']:raise RuntimeError('Persistent table missing: '+name)
  a=list(after['tables'][name]['rows'])
  for row in b['rows']:
   if row not in a:raise RuntimeError('Persistent application record changed: '+name)
   a.remove(row)
 if not set(before['migrations']).issubset(after['migrations']):raise RuntimeError('Migration history regressed')

def restore(m):
 log('Restoring the verified previous installation.')
 backup=pathlib.Path(m['backup'])
 if m['phase']!='applying':
  compose('start','db');compose('start','nyxguard-manager')
  if 'vpn-client-agent' in m['services']:compose('start','vpn-client-agent')
  health(m)
  (STATE/'pending.json').unlink();log('Previous services restarted; no data restoration was needed.');return
 for name,digest in m['hashes'].items():
  if sha(backup/name)!=digest:raise RuntimeError('Recovery backup checksum failed; services remain stopped')
 compose('stop','-t','120',*m['services'])
 for i,p in enumerate(m['storage']):
  dest=pathlib.Path(p)
  if not dest.is_dir() or dest.is_symlink():raise RuntimeError('Recovery storage path is invalid')
  for child in dest.iterdir():
   if child.is_dir() and not child.is_symlink():shutil.rmtree(child)
   else:child.unlink()
  run(['tar','--xattrs','--acls','--numeric-owner','-xpf',str(backup/(str(i)+'.tar')),'-C',p])
 for path in m['files']:
  saved=backup/'files'/str(m['files'].index(path))
  shutil.copy2(saved,path)
 # Pin the previous Manager/Agent to the saved local image identities. DB is
 # restarted in place, never recreated by the updater.
 old=json.loads((backup/'rollback-compose.json').read_text())
 atom(ROOT/'docker-compose.yml',json.dumps(old))
 overlay=ROOT/'docker-compose.vpn.yml'
 if overlay.exists():overlay.unlink()
 compose('start','db')
 compose('up','-d','--no-deps','nyxguard-manager')
 if 'vpn-client-agent' in m['services']:compose('up','-d','--no-deps','--force-recreate','vpn-client-agent')
 health(m)
 if version(cid('nyxguard-manager'))!=m['current']:raise RuntimeError('Restored application version mismatch')
 restored=snapshot(cid('nyxguard-manager'),m['baseline'])
 if restored['migrations']!=m['baseline']['migrations']:raise RuntimeError('Restored migration history differs from the recovery point')
 preservation(m['baseline'],restored)
 if cid('db')!=m['database_id']:raise RuntimeError('Database container identity changed')
 atom(ROOT/'.version',m['current']+'\n')
 atom(backup/'result.json',json.dumps({'result':'rolled_back','version':m['current']}))
 (STATE/'pending.json').unlink();log('Rollback verified. Previous application and persistent data are healthy.')

def latest():
 req=urllib.request.Request('https://api.github.com/repos/NyxCloudRO/NyxGuardManager/releases/latest',headers={'User-Agent':'NyxGuard-Host-Updater'})
 with urllib.request.urlopen(req,timeout=30) as r:d=json.load(r)
 if d.get('draft') or d.get('prerelease'):raise RuntimeError('No eligible stable release')
 v=d['tag_name'].removeprefix('v');semver(v);return v

def main():
 global ROOT, STATE
 if os.geteuid()!=0:raise RuntimeError('Run as root, or use: curl -fsSL <update.sh-url> | sudo bash')
 if not (ROOT/'.env').is_file() or not (ROOT/'docker-compose.yml').is_file():
  # Discover installations from live Compose labels, without guessing paths.
  ids=docker('ps','-q',capture=True).split();found=set()
  for i in ids:
   l=inspect(i)['Config'].get('Labels') or {}
   if l.get('com.docker.compose.service')=='nyxguard-manager':found.add(l.get('com.docker.compose.project.working_dir'))
  if len(found)!=1:raise RuntimeError('Cannot identify one supported installed Manager; use INSTALL_DIR for a custom installation')
  ROOT=pathlib.Path(next(iter(found)));STATE=ROOT/'.upgrade'
 if not re.fullmatch(r'/[A-Za-z0-9_./-]+',str(ROOT)) or '..' in ROOT.parts:raise RuntimeError('Supported installation directory must be an absolute simple host path')
 STATE.mkdir(mode=0o700,exist_ok=True)
 lock=open(STATE/'lock','a')
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:raise RuntimeError('Another host updater or recovery process is already running')
 pending=STATE/'pending.json'
 if '--restore-backup' in sys.argv:
  if pending.exists():raise RuntimeError('An interrupted upgrade must be recovered first')
  at=sys.argv.index('--restore-backup');backup=pathlib.Path(sys.argv[at+1]).resolve()
  if backup.parent!=STATE.resolve():raise RuntimeError('Select a backup belonging to this installation')
  m=json.loads((backup/'manifest.json').read_text())
  if pathlib.Path(m['backup']).resolve()!=backup:raise RuntimeError('Backup identity differs')
  if os.environ.get('NYXGUARD_AUTO_YES')!='1':
   with open('/dev/tty','r') as tty_input, open('/dev/tty','w') as tty:
    tty.write('Restore this pre-upgrade backup? Later application writes will be lost. [y/N] ');tty.flush()
    if tty_input.readline().strip().lower() not in ('y','yes'):log('Recovery cancelled.');return
  m['phase']='applying';save(m);restore(m);return
 if pending.exists():
  m=json.loads(pending.read_text())
  restore(m)
  if '--recover-only' in sys.argv:return
 if '--recover-only' in sys.argv:return
 cfg=config();manager=cid('nyxguard-manager');current=version(manager)
 target=os.environ.get('FORCE_TAG') or latest();target=target.removeprefix('v')
 log('Installed Manager: '+current+'; target release: '+target)
 if semver(current)==semver(target):log('Already current. No application or storage changes required.');return
 if semver(target)<=semver(current) or semver(current)[0]!=semver(target)[0]:raise RuntimeError('Only forward upgrades within the supported major version are supported')
 services=['db','nyxguard-manager']
 agent=compose('ps','-aq','vpn-client-agent',capture=True).strip() if 'vpn-client-agent' in cfg['services'] else ''
 if agent:
  if not pathlib.Path('/dev/net/tun').exists():raise RuntimeError('Installed VPN Agent requires a usable TUN device')
  services.append('vpn-client-agent')
 m={'services':services,'current':current,'target':target,'database_id':cid('db')}
 health(m)
 cs=[inspect(cid(s)) for s in services]
 # Existing image identities and all persistent mount paths are recorded once.
 volume_names=set();storage=[];files=[str(ROOT/'docker-compose.yml'),str(ROOT/'.env')]
 if (ROOT/'.version').exists():files.append(str(ROOT/'.version'))
 if (ROOT/'docker-compose.vpn.yml').exists():files.append(str(ROOT/'docker-compose.vpn.yml'))
 skip={'/var/run/docker.sock','/etc/localtime','/host/proc/net/arp'}
 vault=None
 for c in cs:
  for mt in c['Mounts']:
   if mt['Destination'] in skip:continue
   if mt['Type']=='volume':
    volume_names.add(mt['Name'])
    if mt['Source'] not in storage:storage.append(mt['Source'])
   elif mt['Type']=='bind':
    p=pathlib.Path(mt['Source'])
    if p.is_file():
     if str(p) not in files:files.append(str(p))
     if mt['Destination']=='/run/nyxguard-licensing/vault.key':vault=str(p)
    elif p.is_dir():
     if str(p) not in storage:storage.append(str(p))
    else:raise RuntimeError('Persistent bind mount is unavailable')
 if not vault or not volume_names:raise RuntimeError('Persistent licensing key and named application volumes are required')
 allcs=docker('ps','-aq',capture=True).split()
 owned={c['Id'] for c in cs}
 for c in allcs:
  other=inspect(c)
  if other['Id'] not in owned and any(x.get('Name') in volume_names or x['Source'] in storage for x in other['Mounts']):raise RuntimeError('Persistent storage is shared by another container; stop and review ownership')
 total=0
 for p in storage:total+=int(run(['du','-sb',p],capture=True).split()[0])
 # Backup + verification extraction + recovery headroom + target image download.
 if shutil.disk_usage(STATE).free < total*3+2*1024**3:raise RuntimeError('Insufficient disk space for verified backup and image download; no services changed')
 if os.environ.get('NYXGUARD_AUTO_YES')!='1':
  try:
   with open('/dev/tty','r') as tty_input, open('/dev/tty','w') as tty:
    tty.write('Upgrade '+current+' to '+target+'? Services will pause for backup and migrations. [y/N] ');tty.flush()
    if tty_input.readline().strip().lower() not in ('y','yes'):log('Upgrade cancelled.');return
  except OSError:raise RuntimeError('Confirmation requires a terminal; use NYXGUARD_AUTO_YES=1 only for unattended operation')
 backup=STATE/('backup-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
 backup.mkdir(mode=0o700);(backup/'files').mkdir(mode=0o700)
 m.update(backup=str(backup),storage=storage,files=files,volume_names=sorted(volume_names),phase='stopping',hashes={})
 save(m)
 # Save the single recovery runner and guard systemd startup. A reboot after a
 # hard interruption restores the pre-migration backup before ordinary startup.
 shutil.copy2(__file__,STATE/'runner.py');os.chmod(STATE/'runner.py',0o700)
 unit=next((p for p in pathlib.Path('/etc/systemd/system').glob('*manager.service') if ('WorkingDirectory='+str(ROOT)) in p.read_text()),None)
 if unit:
  override=pathlib.Path(str(unit)+'.d')/'upgrade-recovery.conf';override.parent.mkdir(exist_ok=True)
  base='/usr/bin/docker compose --project-directory '+str(ROOT)+' --env-file '+str(ROOT/'.env')+' -f '+str(ROOT/'docker-compose.yml')
  atom(override,'[Service]\nExecStartPre=/usr/bin/python3 '+str(STATE/'runner.py')+' --recover-only\nExecStart=\nExecStart='+base+' up -d --no-recreate '+' '.join(services)+'\nExecStop=\nExecStop='+base+' stop\n')
  run(['systemctl','daemon-reload'])
 # Baseline after stopping write-producing Manager and Agent, before stopping DB.
 compose('stop','-t','60',*[s for s in services if s!='db'])
 db=inspect(m['database_id']);env={x.split('=',1)[0]:x.split('=',1)[1] for x in db['Config']['Env'] if '=' in x}
 # Capture SQL through an ephemeral read-only process in the old image, sharing
 # only the existing DB network; no replacement stack or cloned database.
 net=next(iter(db['NetworkSettings']['Networks']))
 args=['run','--rm','--network',net,'--entrypoint','node','-i']
 managerenv={x.split('=',1)[0]:x.split('=',1)[1] for x in inspect(manager)['Config']['Env'] if '=' in x}
 for k in ['DB_MYSQL_HOST','DB_MYSQL_PORT','DB_MYSQL_USER','DB_MYSQL_PASSWORD','DB_MYSQL_NAME']:args+=['-e',k+'='+managerenv[k]]
 args+=[inspect(manager)['Image']]
 try:
  m['baseline']=json.loads(docker(*args,input=SNAPSHOT,capture=True))
  compose('stop','-t','120','db')
  if inspect(m['database_id'])['State']['ExitCode']!=0:raise RuntimeError('Database did not shut down cleanly; cold backup refused')
  for c in cs:
   if inspect(c['Id'])['State']['Running']:raise RuntimeError('Services are still writing; backup refused')
  old=json.loads(json.dumps(cfg))
  for svc in services:
   if svc!='db':old['services'][svc]['image']=inspect(cid(svc))['Image']
  atom(backup/'rollback-compose.json',json.dumps(old))
  for i,p in enumerate(files):shutil.copy2(p,backup/'files'/str(i))
  for i,p in enumerate(storage):
   archive=backup/(str(i)+'.tar')
   run(['tar','--xattrs','--acls','--numeric-owner','-cpf',str(archive),'-C',p,'.'])
   # Verify readability, extraction and archive/source agreement while quiescent.
   with tempfile.TemporaryDirectory(dir=STATE) as dest:
    run(['tar','--xattrs','--acls','--numeric-owner','-xpf',str(archive),'-C',dest])
    run(['tar','--compare','--numeric-owner','-f',str(archive),'-C',dest],capture=True)
   run(['tar','--compare','--numeric-owner','-f',str(archive),'-C',p],capture=True)
  for p in backup.rglob('*'):
   if p.is_file():m['hashes'][str(p.relative_to(backup))]=sha(p)
  m['phase']='backed_up';atom(backup/'manifest.json',json.dumps(m));save(m)
 except BaseException:
  compose('start','db');compose('start','nyxguard-manager')
  if agent:compose('start','vpn-client-agent')
  if pending.exists():pending.unlink()
  raise
 try:
  ref=os.environ.get('NYXGUARD_CANDIDATE_IMAGE') or 'nyxmael/nyxguardmanager:'+target
  if not os.environ.get('NYXGUARD_CANDIDATE_IMAGE'):docker('pull',ref)
  image=json.loads(docker('image','inspect',ref,capture=True))[0]
  if image['Config'].get('Labels',{}).get('org.opencontainers.image.version')!=target:raise RuntimeError('Target image version label differs')
  docker('run','--rm','--network','none','--entrypoint','node',image['Id'],'-e','if(require("/app/package.json").version!=='+json.dumps(target)+'||process.env.NPM_BUILD_VERSION!=='+json.dumps(target)+')process.exit(1)',capture=True)
  policy=json.loads(docker('run','--rm','--network','none','--entrypoint','node',image['Id'],'-e','console.log(JSON.stringify(require("/app/internal/release-policy.json")))',capture=True))
  if policy.get('version')!=target or policy.get('sources',{}).get(current)!=len(m['baseline']['migrations']):raise RuntimeError('Target does not support the installed application/schema')
  agent_ref=None
  if agent:
   agent_ref='nyxmael/nyxguardmanager-vpn-agent:'+policy['agent']
   docker('pull',agent_ref)
   ai=json.loads(docker('image','inspect',agent_ref,capture=True))[0]
   # Published Agent tags can alias an unchanged build (5.0.1 labels 4.0.18).
   # Verify the registry digest; the Manager policy selects the compatible tag.
   agent_ref=next((r for r in ai.get('RepoDigests',[]) if r.startswith('nyxmael/nyxguardmanager-vpn-agent@sha256:')),None)
   if not agent_ref:raise RuntimeError('Agent artifact has no official registry digest')
  # Registry digest is authoritative; qualification may use reviewed local image IDs.
  refs=image.get('RepoDigests') or []
  accepted=next((r for r in refs if r.startswith('nyxmael/nyxguardmanager@sha256:')),None)
  if not accepted and not os.environ.get('NYXGUARD_CANDIDATE_IMAGE'):raise RuntimeError('Official image has no verified registry digest')
  accepted=accepted or image['Id']
  new=json.loads(json.dumps(cfg));new['services']['nyxguard-manager']['image']=accepted
  if 'vpn-client-agent' in new['services']:new['services']['vpn-client-agent']['image']=agent_ref or 'nyxmael/nyxguardmanager-vpn-agent:'+policy['agent']
  for k in ('NPM_BUILD_VERSION','NPM_BUILD_COMMIT','NPM_BUILD_DATE'):new['services']['nyxguard-manager'].get('environment',{}).pop(k,None)
  m['phase']='applying';save(m)
  atom(ROOT/'docker-compose.yml',json.dumps(new))
  if (ROOT/'docker-compose.vpn.yml').exists():(ROOT/'docker-compose.vpn.yml').unlink()
  compose('start','db')
  compose('up','-d','--no-deps','nyxguard-manager')
  # The Agent shares Manager's network namespace, so only that attachment is
  # recreated with the SAME Agent image, keys and persistent storage.
  if agent:compose('up','-d','--no-deps','--force-recreate','vpn-client-agent')
  health(m)
  if cid('db')!=m['database_id']:raise RuntimeError('Database container was unnecessarily recreated')
  if version(cid('nyxguard-manager'))!=target:raise RuntimeError('Running application version differs from target')
  if inspect(cid('nyxguard-manager'))['Image']!=image['Id']:raise RuntimeError('Running Manager differs from accepted image')
  after=snapshot(cid('nyxguard-manager'),m['baseline'])
  if len(after['migrations'])!=policy['schema']:raise RuntimeError('Required database migrations are incomplete')
  preservation(m['baseline'],after)
  attached={x['Name'] for svc in services for x in inspect(cid(svc))['Mounts'] if x['Type']=='volume'}
  if attached!=volume_names:raise RuntimeError('Persistent Docker volume identities changed')
  if sha(pathlib.Path(vault))!=m['hashes']['files/'+str(files.index(vault))]:raise RuntimeError('Licensing vault key changed')
  atom(ROOT/'.version',target+'\n')
  atom(backup/'result.json',json.dumps({'result':'success','from':current,'to':target,'image':accepted,'database_container_preserved':True,'volumes_preserved':True}))
  pending.unlink();log('Upgrade successful: '+current+' -> '+target+'. Persistent storage and database container preserved.')
  log('Verified Manager image: '+accepted)
 except BaseException:
  restore(m);raise

if __name__=='__main__':
 def interrupted(sig,frame):raise RuntimeError('Upgrade interrupted')
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:main()
 except BaseException as e:
  log('ERROR: '+str(e) if isinstance(e,RuntimeError) else 'ERROR: Upgrade failed ('+type(e).__name__+'). Review the root-only recovery record.');sys.exit(1)
NYXGUARD_HOST_UPGRADE_PY
python3 "$runner" "$@"
