#!/usr/bin/python3
"""Allow only the news service UID to reach its configured IPv4 proxy endpoints."""
import json,subprocess,pwd,ipaddress,fcntl
from pathlib import Path
assert __import__('os').geteuid()==0
root=Path('/run/news-flow-egress');root.mkdir(mode=0o700,exist_ok=True)
with (root/'lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 uid=str(pwd.getpwnam('news-flow').pw_uid)
 proxies=json.loads(Path('/etc/news-flow/proxies.json').read_text())
 assert len(proxies)==11
 destinations=[]
 for p in proxies:
  ip=ipaddress.ip_address(p['host']);assert ip.version==4 and ip.is_global
  port=p['port'];assert isinstance(port,int) and 1<=port<=65535
  destinations.append((str(ip),str(port)))
 def call(*args,check=True):return subprocess.run(['/usr/sbin/iptables','-w','10',*args],check=check,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 chain='NEWS_FLOW_PROXY'
 if call('-S',chain,check=False).returncode:call('-N',chain)
 call('-F',chain)
 for host,port in destinations:call('-A',chain,'-p','tcp','-d',host+'/32','--dport',port,'-j','ACCEPT')
 call('-A',chain,'-j','RETURN')
 rule=['OUTPUT','-m','owner','--uid-owner',uid,'-j',chain]
 if call('-C',*rule,check=False).returncode:call('-I','OUTPUT','1',*rule[1:])
 print('NEWS_FLOW_PROXY_EGRESS_READY endpoints='+str(len(destinations)),flush=True)
