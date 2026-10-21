import importlib.util,pathlib,tempfile,json,hashlib,os,fcntl,unittest
spec=importlib.util.spec_from_file_location('storage',pathlib.Path(__file__).parents[1]/'storage-host.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
A='sha256:'+'1'*64;B='sha256:'+'2'*64;C='sha256:'+'3'*64
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.state=self.root/'.upgrade';self.state.mkdir(mode=0o700);self.data=self.root/'data';self.data.mkdir();(self.data/'.nyx-update.lock').touch();self.removed=[]
  self.containers=[{'Id':'a'*64,'ImageID':A,'State':'running','Names':['/fixture-manager'],'Labels':{'com.docker.compose.project':'fixture','com.docker.compose.service':'nyxguard-manager'}}]
  self.manager={'Id':'a'*64,'Config':{'Labels':{'com.docker.compose.project.working_dir':str(self.root),'org.opencontainers.image.version':'5.0.17'}},'Mounts':[{'Destination':'/data','Source':str(self.data)}]}
  self.service=mod.Storage(str(self.root),'fixture',0,self.api)
 def tearDown(self):self.service.close();self.tmp.cleanup()
 def api(self,method,path):
  if path=='/info':return {'DockerRootDir':str(self.root)}
  if path=='/containers/json?all=1':return self.containers
  if path.startswith('/containers/'):return self.manager
  images=[{'Id':v,'RepoTags':['nyxmael/nyxguardmanager:'+tag],'Size':1000}for v,tag in [(A,'5.0.17'),(B,'5.0.16'),(C,'5.0.14')]]
  if path=='/images/json?all=0':return [i for i in images if i['Id']not in self.removed]
  if path=='/system/df':return {'Images':[dict(i,SharedSize=800)for i in images]}
  if method=='GET' and path.startswith('/images/'):return {'Id':path.split('/')[2]}
  if method=='DELETE':self.removed.append(path.split('/')[2].split('?')[0]);return [{'Deleted':self.removed[-1]}]
  raise AssertionError((method,path))
 def backup(self,name,target='5.0.17',payload=b'archive',result='success'):
  p=self.state/name;p.mkdir(mode=0o700);(p/'files').mkdir();(p/'0.tar').write_bytes(payload);(p/'files/0').write_bytes(b'configuration');rollback={'services':{'nyxguard-manager':{'image':B}}};(p/'rollback-compose.json').write_text(json.dumps(rollback));hashes={n:hashlib.sha256((p/n).read_bytes()).hexdigest()for n in ['0.tar','files/0','rollback-compose.json']}
  (p/'manifest.json').write_text(json.dumps({'backup':str(p),'current':'5.0.16','target':target,'hashes':hashes}));(p/'result.json').write_text(json.dumps({'result':result,'to':target}));return p
 def inventory(self):return self.service.operation({'action':'inventory','actor':1})
 def preview(self,ids):return self.service.operation({'action':'preview','actor':1,'ids':ids})
 def delete(self,plan,actor=1):return self.service.operation({'action':'delete','actor':actor,'plan':plan})
 def prepare(self):
  old=self.backup('backup-20261019T100000Z','5.0.16');latest=self.backup('backup-20261020T100000Z');return old,latest
 def test_fresh_inventory_no_deletion(self):
  i=self.inventory();self.assertEqual(i['backups'],[]);self.assertEqual(len(i['images']),3);self.assertFalse(any(r['eligible']for r in i['images']))
 def test_exact_backup_deletion_and_replay(self):
  old,latest=self.prepare();i=self.inventory();r=next(r for r in i['backups']if r['name']==old.name);plan=self.preview([r['id']]);out=self.delete(plan['plan']);self.assertEqual(out['outcomes'][0]['result'],'deleted');self.assertFalse(old.exists());self.assertTrue(latest.exists());self.assertTrue((self.root/'storage-audit.jsonl').exists())
  with self.assertRaises(mod.Refused):self.delete(plan['plan'])
 def test_active_and_recovery_images_protected(self):
  self.prepare();i=self.inventory();self.assertFalse(next(r for r in i['images']if r['imageId']==A)['eligible']);self.assertFalse(next(r for r in i['images']if r['imageId']==B)['eligible']);r=next(r for r in i['images']if r['imageId']==C);self.assertTrue(r['eligible']);self.assertEqual(r['reclaimableBytes'],200);self.delete(self.preview([r['id']])['plan']);self.assertEqual(self.removed,[C])
 def test_retained_stopped_container_protected(self):
  self.prepare();self.containers.append({'Id':'b'*64,'ImageID':C,'State':'exited','Names':['/retained']});self.assertFalse(next(r for r in self.inventory()['images']if r['imageId']==C)['eligible'])
 def test_protected_backup_cannot_be_selected(self):
  self.prepare();r=self.inventory()['backups'][-1]
  with self.assertRaises(mod.Refused):self.preview([r['id']])
 def test_forged_id_and_paths(self):
  self.prepare()
  for ident in ['../../etc','/etc/passwd',C,'0'*64]:
   with self.assertRaises(mod.Refused):self.preview([ident])
 def test_pending_recovery_and_lock_refuse(self):
  self.prepare();(self.state/'pending.json').write_text('{}')
  with self.assertRaises(mod.Refused):self.inventory()
  (self.state/'pending.json').unlink()
  with open(self.state/'lock','a')as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   with self.assertRaises(mod.Refused):self.inventory()
 def test_data_update_lock_refuse(self):
  self.prepare()
  with open(self.data/'.nyx-update.lock','r')as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   with self.assertRaises(mod.Refused):self.inventory()
 def test_plan_actor_binding(self):
  self.prepare();r=self.inventory()['backups'][0];plan=self.preview([r['id']])
  with self.assertRaises(mod.Refused):self.delete(plan['plan'],2)
  self.assertTrue((self.state/r['name']).exists())
 def test_drift_abort(self):
  old,_=self.prepare();r=self.inventory()['backups'][0];plan=self.preview([r['id']]);(old/'0.tar').write_bytes(b'changed')
  with self.assertRaises(mod.Refused):self.delete(plan['plan'])
  self.assertTrue(old.exists())
 def test_corruption_link_and_legacy_fail_closed(self):
  old,latest=self.prepare();(old/'0.tar').unlink();(old/'0.tar').symlink_to('/etc/passwd');self.assertFalse(self.inventory()['backups'][0]['eligible'])
  with self.assertRaises(mod.Refused):self.preview([self.inventory()['backups'][0]['id']])
 def test_checksum_corruption_refuses_preview(self):
  old,_=self.prepare();(old/'0.tar').write_bytes(b'wrong');r=self.inventory()['backups'][0]
  with self.assertRaises(mod.Refused):self.preview([r['id']])
 def test_hardlinks_refused(self):
  old,_=self.prepare();os.link(old/'0.tar',self.root/'outside');self.assertFalse(self.inventory()['backups'][0]['eligible'])
 def test_size_accounting_unavailable_keeps_inventory(self):
  self.prepare();base=self.service.api
  def unavailable(method,path):
   if path=='/system/df':raise TimeoutError('fixture engine accounting unavailable')
   return base(method,path)
  self.service.api=unavailable;i=self.inventory();self.assertEqual(len(i['backups']),2);self.assertEqual(len(i['images']),3);self.assertTrue(all(r['reclaimableBytes']is None for r in i['images']))
 def test_local_current_image_still_visible_and_protected(self):
  self.prepare();base=self.service.api
  def local(method,path):
   result=base(method,path)
   if path=='/images/json?all=0':
    result[0]['RepoTags']=['local-development:5.0.17']
   return result
  self.service.api=local;i=self.inventory();row=next(r for r in i['images']if r['imageId']==A);self.assertFalse(row['eligible'])
 def test_bounded_audit_rotation(self):
  (self.root/'storage-audit.jsonl').write_bytes(b'x'*(1024*1024+1));self.service.audit({'action':'fixture','result':'success'});self.assertTrue((self.root/'storage-audit.jsonl.1').exists());self.assertLess((self.root/'storage-audit.jsonl').stat().st_size,1000)
 def test_engine_order_does_not_invalidate_plan(self):
  self.prepare();base=self.service.api;counter=[0]
  def reorder(method,path):
   result=base(method,path)
   if path=='/images/json?all=0':
    counter[0]+=1
    if counter[0]%2:result.reverse()
   return result
  self.service.api=reorder;r=self.inventory()['backups'][0];plan=self.preview([r['id']]);self.assertEqual(self.delete(plan['plan'])['outcomes'][0]['result'],'deleted')
 def test_legacy_database_tag_does_not_block_historical_cleanup(self):
  old,_=self.prepare();rollback={'services':{'nyxguard-manager':{'image':B},'db':{'image':'jc21/mariadb-aria:latest'}}};(old/'rollback-compose.json').write_text(json.dumps(rollback));manifest=json.loads((old/'manifest.json').read_text());manifest['hashes']['rollback-compose.json']=hashlib.sha256((old/'rollback-compose.json').read_bytes()).hexdigest();(old/'manifest.json').write_text(json.dumps(manifest));row=self.inventory()['backups'][0];self.assertTrue(row['eligible']);self.assertEqual(row['status'],'legacy_manifest');self.delete(self.preview([row['id']])['plan']);self.assertFalse(old.exists())
 def test_identity_change_install_root(self):
  self.prepare();saved=self.root.with_name(self.root.name+'-replaced');self.root.rename(saved);self.root.mkdir()
  try:
   with self.assertRaises(mod.Refused):self.inventory()
  finally:self.root.rmdir();saved.rename(self.root)
if __name__=='__main__':unittest.main()
