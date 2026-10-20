import pathlib,subprocess,re,json,hashlib,os
w=pathlib.Path('/work');v=pathlib.Path('/vendor');out=pathlib.Path('/out');out.mkdir(exist_ok=True)
for e in json.load(open(v/'manifest.json')):assert hashlib.sha256((v/e['file']).read_bytes()).hexdigest()==e['sha256']
records=[]
for package,version,path,old,new in [
 ('libstdc++-12-dev','12.2.0-14+deb12u1','usr/include/c++/12/ext/pb_ds/detail/binary_heap_/erase_fn_imps.hpp','      std::copy(m_a_entries, m_a_entries + left, new_entries);\n      s_entry_allocator.deallocate(m_a_entries, m_actual_size);\n      m_actual_size = new_size;','      std::copy(m_a_entries, m_a_entries + left, new_entries);\n      s_entry_allocator.deallocate(m_a_entries, m_actual_size);\n      m_a_entries = new_entries;\n      m_actual_size = new_size;'),
 ('libpython3.11-stdlib','3.11.2-6+deb12u9','usr/lib/python3.11/tarfile.py','            for i in range(blocks):\n                self.read(self.bufsize)\n            self.read(remainder)','            for i in range(blocks):\n                data = self.read(self.bufsize)\n                if not data:\n                    break\n            self.read(remainder)')]:
 subprocess.run(['apt-get','download',package+'='+version],cwd=w,check=True)
 deb=next(w.glob(package+'_*deb'));r=w/package;subprocess.run(['dpkg-deb','-R',str(deb),str(r)],check=True)
 p=r/path;s=p.read_text();assert s.count(old)==1,(package,'unexpected original source');before=hashlib.sha256(p.read_bytes()).hexdigest();p.write_text(s.replace(old,new));after=hashlib.sha256(p.read_bytes()).hexdigest()
 control=r/'DEBIAN/control';s=control.read_text();s=re.sub(r'^Version: .*$', 'Version: '+version,s,flags=re.M);control.write_text(s)
 md5sums=r/'DEBIAN/md5sums';lines=md5sums.read_text().splitlines();lines=[hashlib.md5(p.read_bytes()).hexdigest()+'  '+path if line.split()[-1]==path else line for line in lines];md5sums.write_text('\n'.join(lines)+'\n')
 target=out/(package+'_'+version+'+nyxguard1_amd64.deb');subprocess.run(['dpkg-deb','--build','--root-owner-group',str(r),str(target)],check=True);records.append({'package':package,'originalVersion':version,'patchedVersion':version,'upstreamVersionUnchanged':True,'file':path,'before':before,'after':after,'originalDebSha256':hashlib.sha256(deb.read_bytes()).hexdigest(),'patchedDebSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(out/'leaf-provenance.json').write_text(json.dumps(records,indent=2))
