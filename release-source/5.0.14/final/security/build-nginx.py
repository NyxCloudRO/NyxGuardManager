import pathlib,json,hashlib,subprocess,shlex,os
v=pathlib.Path('/vendor');m=json.loads((v/'manifest.json').read_text())
for entry in m:
 if hashlib.sha256((v/entry['file']).read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Vendor source hash mismatch')
b=pathlib.Path('/build');b.mkdir(exist_ok=True);subprocess.run(['tar','-xzf',str(v/m[0]['file']),'-C',str(b)],check=True)
n=b/'openresty-1.27.1.2/bundle/nginx-1.27.1'
for entry in [m[-1]]:subprocess.run(['patch','--batch','--fuzz=0','-p1','-i',str(v/entry['file'])],cwd=n,check=True)
followup=v/'cumulative-manifest.json'
if followup.exists():
 entry=json.loads(followup.read_text());patch=v/entry['file']
 if hashlib.sha256(patch.read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Follow-up patch hash mismatch')
 if entry['baselineSha256']!=m[-1]['sha256']:raise RuntimeError('Follow-up baseline mismatch')
 subprocess.run(['patch','--batch','--fuzz=0','-p1','-i',str(patch)],cwd=n,check=True)
# Reproduce OpenResty's wrapper-generated default Lua search paths.
paths='/etc/nginx/site/lualib/?.ljbc;/etc/nginx/site/lualib/?/init.ljbc;/etc/nginx/lualib/?.ljbc;/etc/nginx/lualib/?/init.ljbc;/etc/nginx/site/lualib/?.lua;/etc/nginx/site/lualib/?/init.lua;/etc/nginx/lualib/?.lua;/etc/nginx/lualib/?/init.lua'
cpaths='/etc/nginx/site/lualib/?.so;/etc/nginx/lualib/?.so'
for folder,header in [('ngx_lua-0.10.28','ngx_http_lua_autoconf.h'),('ngx_stream_lua-0.0.16','ngx_stream_lua_autoconf.h')]:
 cfg=n.parent/folder/'config'
 with cfg.open('a') as f:
  f.write("\necho '\n#ifndef LUA_DEFAULT_PATH\n#define LUA_DEFAULT_PATH \""+paths+"\"\n#endif\n#ifndef LUA_DEFAULT_CPATH\n#define LUA_DEFAULT_CPATH \""+cpaths+"\"\n#endif\n' >> \"$ngx_addon_dir/src/"+header+"\"\n")
s=subprocess.run(['/usr/sbin/nginx','-V'],capture_output=True,text=True,check=True).stderr
args=shlex.split(s.split('configure arguments: ',1)[1].strip());args=[a for a in args if not a.startswith(('--add-dynamic-module=','--build='))];args+=['--build=nyxguard-5.0.14-security-backports-20261019']
(b/'tmp').mkdir(exist_ok=True)
env={**os.environ,'TMPDIR':str(b/'tmp'),'LUAJIT_LIB':'/etc/nginx/luajit/lib','LUAJIT_INC':'/etc/nginx/luajit/include/luajit-2.1'}
subprocess.run(['./configure',*args],cwd=n,env=env,check=True);subprocess.run(['make','-j4'],cwd=n,env=env,check=True)
pathlib.Path('/patched-nginx').write_bytes((n/'objs/nginx').read_bytes());pathlib.Path('/patched-nginx').chmod(0o755)
