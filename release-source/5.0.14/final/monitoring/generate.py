#!/usr/bin/env python3
"""Prepare optional provisioning files; never accesses external services or copies credentials."""
import argparse,json,pathlib,urllib.parse,os
p=argparse.ArgumentParser();p.add_argument('--target',required=True,help='DNS name:port of the mTLS adapter');p.add_argument('--prometheus-url',required=True);p.add_argument('--output',required=True);p.add_argument('--instance',default='manager');p.add_argument('--datasource-uid',default='nyxguard-prometheus');a=p.parse_args()
if any(c in a.target for c in '/@?#') or not a.target or ':' not in a.target: p.error('target must be DNS name:port')
u=urllib.parse.urlsplit(a.prometheus_url)
if u.scheme not in ['http','https'] or not u.hostname or u.username or u.password or u.query or u.fragment: p.error('use a credential-free Prometheus URL')
for value in [a.instance,a.datasource_uid]:
 if not value or not all(c.isalnum() or c in '-_.' for c in value):p.error('invalid identity')
o=pathlib.Path(a.output);o.mkdir(mode=0o700,parents=True,exist_ok=False)
# JSON is valid YAML, eliminating quoting ambiguities for supplied URLs/targets.
files={'prometheus.yml':{'global':{'scrape_interval':'30s'},'scrape_configs':[{'job_name':'nyxguard','scheme':'https','metrics_path':'/metrics','static_configs':[{'targets':[a.target],'labels':{'instance':a.instance}}],'tls_config':{'ca_file':'/etc/prometheus/nyxguard/ca.crt','cert_file':'/etc/prometheus/nyxguard/client.crt','key_file':'/etc/prometheus/nyxguard/client.key'}}]},'datasource.yml':{'apiVersion':1,'datasources':[{'name':'NyxGuard Prometheus','uid':a.datasource_uid,'type':'prometheus','access':'proxy','url':a.prometheus_url,'editable':True}]},'provider.yml':{'apiVersion':1,'providers':[{'name':'NyxGuard','folder':'NyxGuard','type':'file','disableDeletion':True,'options':{'path':'/etc/grafana/nyxguard-dashboards'}}]}}
d=json.loads((pathlib.Path(__file__).parent/'dashboard.json').read_text());d['templating']['list'][0]['current']={'text':'NyxGuard Prometheus','value':a.datasource_uid};files['dashboard.json']=d
for name,value in files.items():
 path=o/name;path.write_text(json.dumps(value,indent=2)+'\n');path.chmod(0o600)
print('Prepared scrape config, datasource, provider and dashboard in '+str(o))
