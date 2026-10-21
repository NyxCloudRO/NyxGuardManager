#!/usr/bin/env python3
"""Narrow, local maintenance broker. Never accepts paths, shell commands or Docker URLs.
The installer supplies the fixed installation root and Manager UID. The application
gets only this Unix socket; no additional Docker socket or host directory access.
"""
import contextlib,fcntl,hashlib,hmac,http.client,http.server,json,os,pathlib,re,secrets,socket,socketserver,stat,struct,sys,time,threading
from urllib.parse import urlencode
MAX_JSON=1024*1024
BACKUP=re.compile(r'backup-[0-9]{8}T[0-9]{6}Z\Z')
IMAGE=re.compile(r'sha256:[0-9a-f]{64}\Z')
REPOS={'nyxmael/nyxguardmanager','nyxmael/nyxguardmanager-vpn-agent'}
IMAGE_LIST='/images/json?'+urlencode({'all':'0','filters':json.dumps({'reference':[r+':*'for r in sorted(REPOS)]})})
class Refused(RuntimeError):pass
class DockerConnection(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX);self.sock.settimeout(10);self.sock.connect('/var/run/docker.sock')
def engine(method,url):
 # Call sites are fixed; resource identifiers must be immutable sha256 IDs.
 c=DockerConnection('localhost',timeout=10)
 try:
  c.request(method,url);r=c.getresponse();data=r.read(8*1024*1024+1)
  if len(data)>8*1024*1024 or r.status>=400:raise Refused('Docker inspection/deletion failed')
  return json.loads(data) if data else None
 finally:c.close()
def identity(s):return [s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def checked_dir(name,dir_fd=None):
 fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=dir_fd);s=os.fstat(fd)
 if s.st_uid!=0 or s.st_mode&0o022:os.close(fd);raise Refused('Untrusted maintenance directory permissions')
 return fd
def read_json(fd,name):
 if '/' in name or name in ('.','..'):raise Refused('Invalid metadata name')
 f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
 try:
  s=os.fstat(f)
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_uid!=0 or s.st_mode&0o022 or s.st_size>MAX_JSON:raise Refused('Untrusted metadata')
  data=os.read(f,MAX_JSON+1)
  if identity(s)!=identity(os.fstat(f)):raise Refused('Metadata changed')
  return json.loads(data)
 finally:os.close(f)
def tree(fd,device,prefix='',out=None):
 out={} if out is None else out
 for name in sorted(os.listdir(fd)):
  s=os.stat(name,dir_fd=fd,follow_symlinks=False);key=prefix+name
  if s.st_dev!=device or s.st_uid!=0 or s.st_mode&0o022:raise Refused('Untrusted backup member')
  out[key]=identity(s)
  if stat.S_ISDIR(s.st_mode):
   child=checked_dir(name,fd)
   try:tree(child,device,key+'/',out)
   finally:os.close(child)
  elif not stat.S_ISREG(s.st_mode) or s.st_nlink!=1:raise Refused('Backup contains links or special files')
  if len(out)>10000:raise Refused('Backup metadata limit exceeded')
 return out
def open_member(fd,name):
 parts=name.split('/')
 if any(p in ('','.','..') for p in parts) or len(parts)>4:raise Refused('Invalid manifest member')
 current=os.dup(fd)
 try:
  for part in parts[:-1]:
   nextfd=checked_dir(part,current);os.close(current);current=nextfd
  return os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=current)
 finally:os.close(current)
def verify(fd,manifest,members):
 hashes=manifest.get('hashes')
 if not isinstance(hashes,dict) or not hashes or 'rollback-compose.json' not in hashes or not any(re.fullmatch(r'[0-9]+\.tar',p)for p in hashes):raise Refused('Missing recovery manifest')
 for name,digest in hashes.items():
  if name not in members or not re.fullmatch(r'[0-9a-f]{64}',str(digest)):raise Refused('Invalid recovery manifest')
  f=open_member(fd,name)
  try:
   before=os.fstat(f)
   if identity(before)!=members[name] or not stat.S_ISREG(before.st_mode) or before.st_nlink!=1:raise Refused('Backup identity changed')
   h=hashlib.sha256()
   while True:
    b=os.read(f,1024*1024)
    if not b:break
    h.update(b)
   if not hmac.compare_digest(h.hexdigest(),digest) or identity(os.fstat(f))!=members[name]:raise Refused('Backup checksum mismatch')
  finally:os.close(f)
 # Only updater metadata plus hashed payloads can be deleted automatically.
 allowed=set(hashes)|{'manifest.json','result.json','files'}
 if set(members)-allowed:raise Refused('Unrecognized backup member requires manual review')
def remove_tree(fd,device,members,prefix=''):
 for name in sorted(os.listdir(fd)):
  key=prefix+name;s=os.stat(name,dir_fd=fd,follow_symlinks=False)
  # Directory timestamps change as children are unlinked; compare stable identity.
  expected=members.get(key)
  if not expected or identity(s)[:6]!=expected[:6] or s.st_dev!=device:raise Refused('Backup changed during deletion')
  if stat.S_ISDIR(s.st_mode):
   child=checked_dir(name,fd)
   try:remove_tree(child,device,members,key+'/')
   finally:os.close(child)
   os.rmdir(name,dir_fd=fd)
  else:
   if identity(s)!=expected:raise Refused('Backup file changed during deletion')
   os.unlink(name,dir_fd=fd)
class Storage:
 def __init__(self,root,project,uid,api=engine):
  self.root=str(pathlib.Path(root).absolute());self.project=project;self.uid=uid;self.api=api;self.key=secrets.token_bytes(32);self.plans={};self.size_cache={};self.size_cache_at=0;self.size_graph=None;self.size_lock=threading.Lock();self.size_busy=False
  self.rootfd=checked_dir(self.root);self.statefd=None
 def close(self):os.close(self.rootfd)
 def token(self,kind,raw):return hmac.new(self.key,(kind+':'+raw).encode(),hashlib.sha256).hexdigest()
 def accounting(self,graph):
  # Optional layer accounting must never hold the maintenance/updater locks or
  # delay the authoritative resource list. One bounded worker, at most once
  # per five minutes, asks only for images (never volume/container scans).
  with self.size_lock:
   sizes=dict(self.size_cache) if self.size_graph==graph else {}
   if not self.size_busy and time.monotonic()-self.size_cache_at>300:
    self.size_busy=True;self.size_cache_at=time.monotonic()
    def update():
     try:
      disk=self.api('GET','/system/df?type=image')
      value={i['Id']:{'Size':i.get('Size'),'SharedSize':i.get('SharedSize')}for i in disk.get('Images',[])}
      with self.size_lock:self.size_cache=value;self.size_graph=graph
     except (OSError,ValueError,Refused):pass
     finally:
      with self.size_lock:self.size_busy=False
    threading.Thread(target=update,name='storage-image-accounting',daemon=True).start()
   return sizes
 def deployment(self):
  containers=self.api('GET','/containers/json?all=1')
  managers=[c for c in containers if c.get('Labels',{}).get('com.docker.compose.project')==self.project and c.get('Labels',{}).get('com.docker.compose.service')=='nyxguard-manager']
  if len(managers)!=1 or managers[0].get('State')!='running':raise Refused('One running Manager is required')
  m=self.api('GET','/containers/'+managers[0]['Id']+'/json');labels=m['Config'].get('Labels',{})
  if labels.get('com.docker.compose.project.working_dir')!=self.root:raise Refused('Deployment ownership differs')
  data=[x for x in m['Mounts'] if x['Destination']=='/data']
  if len(data)!=1:raise Refused('Manager storage is ambiguous')
  return containers,m,data[0]['Source']
 @contextlib.contextmanager
 def locked(self):
  # Pin the installation root, and refuse replacements and mount boundaries.
  if identity(os.stat(self.root,follow_symlinks=False))[:2]!=identity(os.fstat(self.rootfd))[:2]:raise Refused('Installation directory replaced')
  containers,manager,data=self.deployment();locks=[];state=None
  try:
   try:state=checked_dir('.upgrade',self.rootfd)
   except FileNotFoundError:
    os.mkdir('.upgrade',0o700,dir_fd=self.rootfd);state=checked_dir('.upgrade',self.rootfd)
   self.statefd=state
   for base,name in [(state,'lock')]:
    f=os.open(name,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600,dir_fd=base);locks.append(f)
    if not stat.S_ISREG(os.fstat(f).st_mode) or os.fstat(f).st_nlink!=1:raise Refused('Invalid updater lock')
    try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise Refused('An upgrade or cleanup is active')
   # In-app recovery uses this same persistent flock, including retained data.
   d=os.open(data,os.O_DIRECTORY|os.O_RDONLY|os.O_NOFOLLOW)
   try:f=os.open('.nyx-update.lock',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=d)
   finally:os.close(d)
   locks.append(f)
   if not stat.S_ISREG(os.fstat(f).st_mode) or os.fstat(f).st_nlink!=1:raise Refused('Invalid application updater lock')
   try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   except BlockingIOError:raise Refused('Application updater is active')
   if 'pending.json' in os.listdir(state):raise Refused('An updater recovery transaction is pending')
   # Active handover containers are protected even before their lock is acquired.
   if any(c.get('State') not in ('exited','dead') and any('nyxguard-update-handover' in n for n in c.get('Names',[])) for c in containers):raise Refused('A handover transaction is active')
   yield containers,manager,data
  finally:
   self.statefd=None
   if state is not None:os.close(state)
   for f in locks:os.close(f)
 def inventory_locked(self,containers,manager,data,verify_hashes=False):
  backups=[];protected_images=set(c['ImageID']for c in containers);recovery_images=set();records={};state=self.statefd;member_count=0
  deployment_images={c['ImageID']for c in containers if c.get('Labels',{}).get('com.docker.compose.project')==self.project and c.get('Labels',{}).get('com.docker.compose.service')in ('nyxguard-manager','vpn-client-agent')}
  names=sorted(n for n in os.listdir(state) if BACKUP.fullmatch(n))
  if len(names)>500:raise Refused('Backup inventory limit exceeded; manual review required')
  # Do not cross even a same-device bind mount under updater storage.
  mount_text=pathlib.Path('/proc/self/mountinfo').read_text()
  base=self.root+'/.upgrade/'
  if any(line.split()[4].replace('\\040',' ').startswith(base)for line in mount_text.splitlines()):raise Refused('Mounted updater content requires manual review')
  for name in names:
   row={'type':'backup','name':name,'id':self.token('backup',name),'eligible':False,'status':'unverifiable','reason':'manual_review','allocatedBytes':None,'sourceVersion':None,'targetVersion':None,'result':None,'date':name[7:]}
   try:
    fd=checked_dir(name,state)
    try:
     members=tree(fd,os.fstat(state).st_dev);member_count+=len(members)
     if member_count>20000:raise Refused('Combined backup member limit exceeded')
     manifest=read_json(fd,'manifest.json');result=read_json(fd,'result.json')
     if manifest.get('backup')!=base+name:raise Refused('Backup storage identity differs')
     for v in ('current','target'):
      if not re.fullmatch(r'\d+\.\d+\.\d+',manifest.get(v,'')):raise Refused('Invalid backup version')
     rollback=read_json(fd,'rollback-compose.json')
     services=rollback.get('services',{});images=set();legacy=False
     if not services:raise Refused('Missing recovery image references')
     for service,definition in services.items():
      reference=definition.get('image')
      if IMAGE.fullmatch(reference or ''):images.add(reference)
      elif service=='db' and reference=='jc21/mariadb-aria:latest':
       # Older official updaters pinned Manager/Agent but retained this database
       # tag. It cannot qualify as the immediate immutable recovery set. Its
       # known Manager/Agent dependencies still remain protected while retained.
       legacy=True
      else:raise Refused('Recovery image identity is unverified')
     protected_images.update(images);recovery_images.update(images)
     if verify_hashes:verify(fd,manifest,members)
     row.update(sourceVersion=manifest['current'],targetVersion=manifest['target'],result=result.get('result'),status='legacy_manifest' if legacy else ('verified' if verify_hashes else 'manifest'),reason='protected_recovery',allocatedBytes=sum(os.stat(p,dir_fd=fd,follow_symlinks=False).st_blocks*512 for p in os.listdir(fd) if not stat.S_ISDIR(os.stat(p,dir_fd=fd,follow_symlinks=False).st_mode)))
     # Include nested payload allocation without trusting client paths.
     row['allocatedBytes']=sum(self.member_blocks(fd,p)for p in members)
     manifest={key:manifest.get(key)for key in ['current','target','backup','hashes']}
     records[row['id']]={'name':name,'members':members,'manifest':manifest,'result':result,'images':images,'legacy':legacy,'row':row}
    finally:os.close(fd)
   except (OSError,ValueError,KeyError,TypeError,Refused):pass
   backups.append(row)
  version=manager['Config'].get('Labels',{}).get('org.opencontainers.image.version')
  # DEV/RC builds use the same recovery schema as their stable version family.
  if isinstance(version,str):version=re.sub(r'-(?:dev|rc)\.[0-9]+$','',version)
  candidates=[r for r in records.values() if r['result'].get('result')=='success' and r['result'].get('to')==version and r['manifest']['target']==version and not r['legacy']]
  protected=max(candidates,key=lambda r:r['name']) if candidates else None
  recovery_ok=protected is not None
  # Validate the recovery path before authorizing any deletion.
  if verify_hashes and protected:
   if not all(self.image_exists(i)for i in protected['images']):recovery_ok=False
  for r in records.values():
   eligible=recovery_ok and r is not protected and r['result'].get('result') in ('success','rolled_back')
   r['row'].update(eligible=eligible,reason='eligible' if eligible else ('protected_recovery' if r is protected else 'recovery_unverified'))
  image_cleanup_safe=recovery_ok and len(records)==len(backups)
  images=[]
  # Listing every unrelated local image is costly on the containerd image store.
  # Ask for the supported repositories, then inspect immutable local deployment
  # and recovery identities directly so untagged/local builds remain visible.
  all_images=self.api('GET',IMAGE_LIST)
  listed={i['Id']for i in all_images}
  for ident in sorted((deployment_images|recovery_images)-listed):
   try:all_images.append(self.api('GET','/images/'+ident+'/json'))
   except (OSError,ValueError,Refused):pass
  sizes=self.accounting(tuple(sorted(i['Id']for i in all_images)))
  for image in all_images:
   tags=sorted(image.get('RepoTags')or[]);ident=image['Id']
   if not IMAGE.fullmatch(ident) or not (any(t.rsplit(':',1)[0] in REPOS for t in tags) or ident in deployment_images or ident in recovery_images):continue
   # Any unrelated alias makes deletion of this shared identity ineligible.
   owned=all(t.rsplit(':',1)[0] in REPOS for t in tags)
   ref=sorted(sorted(c.get('Names',[]))for c in containers if c['ImageID']==ident)
   row={'type':'image','id':self.token('image',ident),'name':', '.join(tags),'imageId':ident,'sizeBytes':image.get('Size'),'reclaimableBytes':None,'references':ref,'eligible':image_cleanup_safe and owned and ident not in protected_images,'reason':'referenced' if ref else ('protected_recovery' if ident in protected_images else ('eligible' if image_cleanup_safe and owned else 'recovery_unverified'))}
   size=sizes.get(ident,{})
   if isinstance(size.get('SharedSize'),int) and size['SharedSize']>=0:row['reclaimableBytes']=max(0,size.get('Size',0)-size['SharedSize'])
   images.append(row);records[row['id']]={'image':ident,'row':row}
  images.sort(key=lambda row:row['imageId'])
  if len(images)>500:raise Refused('Image inventory limit exceeded; manual review required')
  # Optional display estimates changing cannot invalidate a safe reviewed plan.
  revision_images=[{k:v for k,v in row.items()if k!='reclaimableBytes'}for row in images]
  revision=hashlib.sha256(json.dumps({'backups':backups,'images':revision_images,'members':{k:r.get('members')for k,r in records.items()},'manager':manager['Id'],'containers':sorted((c['Id'],c['ImageID'],c.get('State'))for c in containers)},sort_keys=True).encode()).hexdigest()
  return {'backups':backups,'images':images,'recoveryVerified':recovery_ok and verify_hashes,'recoveryIdentified':recovery_ok,'revision':revision},records
 def member_blocks(self,fd,name):
  f=open_member(fd,name)
  try:return os.fstat(f).st_blocks*512
  finally:os.close(f)
 def image_exists(self,ident):
  try:return self.api('GET','/images/'+ident+'/json')['Id']==ident
  except (Refused,KeyError):return False
 def audit(self,event):
  event={'time':time.time(),**event};f=os.open('storage-audit.jsonl',os.O_WRONLY|os.O_APPEND|os.O_CREAT|os.O_NOFOLLOW,0o600,dir_fd=self.rootfd)
  try:
   st=os.fstat(f)
   if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_uid!=0:raise Refused('Audit destination is untrusted')
   if st.st_size>1024*1024:
    os.close(f);f=None
    for index in range(5,0,-1):
     source='storage-audit.jsonl'+('.'+str(index-1)if index>1 else '')
     try:os.rename(source,'storage-audit.jsonl.'+str(index),src_dir_fd=self.rootfd,dst_dir_fd=self.rootfd)
     except FileNotFoundError:pass
    f=os.open('storage-audit.jsonl',os.O_WRONLY|os.O_APPEND|os.O_CREAT|os.O_NOFOLLOW,0o600,dir_fd=self.rootfd)
   os.write(f,(json.dumps(event,separators=(',',':'))+'\n').encode());os.fsync(f)
  finally:
   if f is not None:os.close(f)
 def operation(self,body):
  action=body.get('action');actor=body.get('actor')
  if action not in ('inventory','preview','delete') or not isinstance(actor,int) or actor<=0:raise Refused('Invalid maintenance request')
  with self.locked() as (containers,manager,data):
   inventory,records=self.inventory_locked(containers,manager,data,verify_hashes=action!='inventory')
   if action=='inventory':return inventory
   if action=='preview':
    ids=body.get('ids')
    if not isinstance(ids,list) or not 0<len(ids)<=100 or len(set(ids))!=len(ids) or any(i not in records or not records[i]['row']['eligible']for i in ids):raise Refused('Selection is ineligible or unknown')
    plan=secrets.token_hex(32);self.plans={k:v for k,v in self.plans.items() if v['expires']>time.monotonic() and v['actor']!=actor}
    if len(self.plans)>=32:raise Refused('Too many pending cleanup plans')
    self.plans[plan]={'actor':actor,'ids':ids,'revision':inventory['revision'],'expires':time.monotonic()+120}
    return {'plan':plan,'resources':[records[i]['row']for i in ids],'expiresIn':120,'recoveryVerified':True}
   plan=self.plans.pop(body.get('plan',''),None)
   if not plan or plan['actor']!=actor or plan['expires']<time.monotonic() or plan['revision']!=inventory['revision']:raise Refused('Cleanup plan expired or inventory changed')
   outcomes=[]
   for ident in plan['ids']:
    r=records[ident];row=r['row'];out={'actor':actor,'resource':ident,'type':row['type'],'action':'delete','result':'started'}
    self.audit(out) # No destruction if the durable intent cannot be recorded.
    accounting_path=self.root
    if row['type']=='image':
     try:accounting_path=self.api('GET','/info')['DockerRootDir']
     except (OSError,ValueError,KeyError,Refused):accounting_path=None
    before=os.statvfs(accounting_path)if accounting_path else None;before_free=before.f_bavail*before.f_frsize if before else None
    try:
     if not row['eligible']:raise Refused('Resource became protected')
     if row['type']=='backup':
      fd=checked_dir(r['name'],self.statefd)
      try:
       if tree(fd,os.fstat(self.statefd).st_dev)!=r['members']:raise Refused('Backup identity changed')
       verify(fd,r['manifest'],r['members']);remove_tree(fd,os.fstat(self.statefd).st_dev,r['members'])
      finally:os.close(fd)
      os.rmdir(r['name'],dir_fd=self.statefd);os.fsync(self.statefd)
     else:
      # Engine rejects running AND stopped container dependencies; never force.
      current=self.api('GET','/containers/json?all=1')
      if any(c['ImageID']==r['image']for c in current):raise Refused('Image gained a container reference')
      self.api('DELETE','/images/'+r['image']+'?force=0&noprune=1')
     after=os.statvfs(accounting_path)if accounting_path else None;out.update(result='deleted',filesystemFreeDeltaBytes=after.f_bavail*after.f_frsize-before_free if after else None)
    except (OSError,ValueError,Refused) as error:out.update(result='failed',error=type(error).__name__,reason=str(error)if isinstance(error,Refused)else 'filesystem_or_engine_error')
    self.audit(out);outcomes.append(out)
   return {'outcomes':outcomes,'accounting':'Observed filesystem free-space delta; concurrent writes and Docker data-root filesystem may differ. Logical image size is not freed space.'}
class Server(socketserver.UnixStreamServer):pass
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  try:
   pid,uid,gid=struct.unpack('3i',self.connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
   if uid not in (0,self.server.storage.uid) or self.path!='/storage':raise Refused('Local peer is unauthorized')
   n=int(self.headers.get('Content-Length','0'))
   if n<=0 or n>16384:raise Refused('Request exceeds maintenance limit')
   self.connection.settimeout(10);body=json.loads(self.rfile.read(n));out=self.server.storage.operation(body);status=200
  except Exception as error:out={'error':'Maintenance unavailable or request refused','code':type(error).__name__};status=409
  raw=json.dumps(out).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
def main():
 if len(sys.argv)!=6:raise SystemExit('usage: storage-host.py INSTALL_ROOT COMPOSE_PROJECT MANAGER_UID MANAGER_GID SOCKET')
 root,project,uid,gid,sock=sys.argv[1:];storage=Storage(root,project,int(uid))
 parent=pathlib.Path(sock).parent;parent.mkdir(mode=0o755,parents=True,exist_ok=True)
 fd=checked_dir(str(parent));os.close(fd)
 if os.path.lexists(sock):
  st=os.lstat(sock)
  if not stat.S_ISSOCK(st.st_mode) or st.st_uid!=0:raise Refused('Untrusted socket path')
  os.unlink(sock)
 with Server(sock,Handler) as server:
  os.chown(sock,0,int(gid));os.chmod(sock,0o660);server.storage=storage
  try:server.serve_forever()
  finally:storage.close()
if __name__=='__main__':main()
