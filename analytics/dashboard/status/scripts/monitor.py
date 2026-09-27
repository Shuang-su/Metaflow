#!/usr/bin/env python3
"""Public, secret-free HTTPS and snapshot freshness observations for MF-89."""
import concurrent.futures
import datetime as dt
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

CHECKS = [
    ('main','主网站','https://metaflow.shuang-su.com','GET',None),
    ('dashboard','公开看板','https://dashboard.metaflow.shuang-su.com','GET',None),
    ('analytics7','7 天业务 API','https://dashboard.metaflow.shuang-su.com/api/public/v1/analytics/7d.json','GET',1800),
    ('analytics30','30 天业务 API','https://dashboard.metaflow.shuang-su.com/api/public/v1/analytics/30d.json','GET',1800),
    ('server','服务器采样 API','https://dashboard.metaflow.shuang-su.com/api/public/v1/server.json','GET',180),
    ('collector','数据接收接口','https://bziyumtuzvfmhgghvpcs.functions.supabase.co/analytics-collect','OPTIONS',None)
]


def check(item, active):
    key,name,url,method,max_age=item
    result={'id':key,'name':name,'url':url,'http_ok':False,'fresh':None,'generated_at':None,'response_ms':None,
        'pending':not (active is True or key in (active if isinstance(active,list) else ['main','collector']))}
    start=time.monotonic()
    request=urllib.request.Request(url,method=method,headers={'User-Agent':'Metaflow-status/1','Origin':'https://metaflow.shuang-su.com','Cache-Control':'no-cache'})
    try:
        # Default SSL context validates chain and hostname. No certificate bypass.
        with urllib.request.urlopen(request,timeout=15) as response:
            result['http_ok']=response.status==200
            if max_age:
                raw=response.read(4*1024*1024)
                data=json.loads(raw)
                stamp=data['generated_at']
                generated=dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
                expected='server' if key=='server' else 'analytics'
                correct=data.get('schema_version')==1 and data.get('kind')==expected
                if expected=='analytics':correct=correct and data.get('period',{}).get('days')==(7 if key=='analytics7' else 30)
                age=time.time()-generated.timestamp()
                result['fresh']=bool(correct and -60<=age<=max_age)
                result['generated_at']=stamp
        result['response_ms']=round((time.monotonic()-start)*1000)
    except urllib.error.HTTPError as error:
        result['error']='http_'+str(error.code)
    except (ValueError,KeyError,TypeError):
        result['fresh']=False;result['error']='invalid_snapshot'
    except Exception:
        # Never publish TLS traces, response bodies, IPs or arbitrary upstream errors.
        result['error']='connection_failed'
    return result


def main():
    state=json.loads(Path('deployment-state.json').read_text())
    live=state.get('dashboard_live') is True
    active=True if live else state.get('active_checks',['main','collector'])
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        checks=list(executor.map(lambda item:check(item,active),CHECKS))
    at=dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
    path=Path('history/monitor.json');path.parent.mkdir(exist_ok=True)
    previous=json.loads(path.read_text()) if path.exists() else {'observations':[]}
    cutoff=time.time()-48*3600
    rows=[r for r in previous['observations'] if dt.datetime.fromisoformat(r['at'].replace('Z','+00:00')).timestamp()>=cutoff]
    rows.append({'at':at,'ok':live and all(r['http_ok'] and r['fresh'] is not False for r in checks)})
    report={'schema_version':1,'completed_at':at,'dashboard_live':live,'checks':checks,'observations':rows}
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n');temporary.replace(path)
    print(json.dumps({'completed_at':at,'dashboard_live':live,'checks':[{k:r.get(k) for k in ('id','http_ok','fresh','pending','error')} for r in checks]},ensure_ascii=False))


if __name__=='__main__':main()
