#!/usr/bin/env python3
"""Install the fixed maintenance broker from an already accepted running image."""
import json,os,pathlib,re,subprocess,sys
root,manager_id=sys.argv[1:]
manager=json.loads(subprocess.check_output(["docker","inspect",manager_id]))[0]
project=manager["Config"]["Labels"]["com.docker.compose.project"]
env=dict(v.split("=",1)for v in manager["Config"].get("Env",[])if "=" in v)
uid=env.get("PUID","1000");gid=env.get("PGID","1000")
if not re.fullmatch(r'/[A-Za-z0-9_./-]+',root) or '..' in pathlib.Path(root).parts or not re.fullmatch(r'[a-zA-Z0-9_-]+',project) or not uid.isdigit() or not gid.isdigit():raise SystemExit('Unsupported maintenance deployment identity')
p=pathlib.Path(root)/'.maintenance'
if p.is_symlink():raise SystemExit('Untrusted maintenance directory')
p.mkdir(mode=0o700,exist_ok=True);p.chmod(0o700);run=p/'run';
if run.is_symlink():raise SystemExit('Untrusted maintenance socket directory')
run.mkdir(mode=0o755,exist_ok=True)
for name in ['storage-host.py']:
 subprocess.run(['docker','cp',manager_id+':/app/internal/'+name,str(p/name)+'.new'],check=True,stdout=subprocess.DEVNULL)
 os.chmod(str(p/name)+'.new',0o700);os.replace(str(p/name)+'.new',p/name)
mounts=[m for m in manager['Mounts'] if m['Destination']=='/data']
if len(mounts)!=1:raise SystemExit('Manager data mount is ambiguous')
lock=pathlib.Path(mounts[0]['Source'])/'.nyx-update.lock'
f=os.open(lock,os.O_CREAT|os.O_RDONLY|os.O_NOFOLLOW,0o600);os.close(f)
unit=f'''[Unit]
Description=NyxGuard constrained backup and image maintenance ({project})
After=docker.service
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/python3 {p}/storage-host.py {root} {project} {uid} {gid} {run}/storage.sock
Restart=on-failure
RestartSec=5
UMask=0077
MemoryMax=128M
CPUQuota=50%
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={root} /var/lib/docker /run/docker.sock /var/run/docker.sock
PrivateTmp=yes
RestrictAddressFamilies=AF_UNIX
[Install]
WantedBy=multi-user.target
'''
# Broker writes only fixed updater subdirectories and talks to Docker. The Docker
# API is root-capable; the broker constrains operations rather than claiming the
# socket's filesystem read-only mount constrains HTTP verbs.
unit=unit.replace('ReadWritePaths='+root+' /var/lib/docker /run/docker.sock /var/run/docker.sock','ReadWritePaths='+root)
name=project+'-storage.service';dest=pathlib.Path('/etc/systemd/system')/name;dest.write_text(unit);dest.chmod(0o644)
subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now',name],check=True);subprocess.run(['systemctl','restart',name],check=True)
print('Constrained storage maintenance enabled for '+project)
