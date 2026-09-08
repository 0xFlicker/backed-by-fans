from pathlib import Path
import tempfile,shutil,os,json,hashlib,subprocess
root=Path('/Users/user/Development/backed-by-fans')
source=root/'specs/003-protocol-buyback-burn/evidence/protocol-verify-20260907-r4'
cases=[('missing-stock','browser/scenarios/asset-burn-refund-AMD.json','remove','asset-burn-refund-AMD.json'),('missing-graduation','browser/scenarios/graduation-pool-compensation.json','remove','graduation-pool-compensation.json'),('missing-browser','browser/report.json','remove','report.json'),('false-supply','browser/scenarios/asset-burn-refund-AMD.json','supply','no supply destruction'),('false-inventory','browser/scenarios/asset-burn-refund-WETH.json','inventory','does not conserve raw units')]
protected=['manifest.json','artifacts.json']+[row[1] for row in cases]
before={name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in protected}
results=[]
for name,path,mutation,expected in cases:
 with tempfile.TemporaryDirectory(prefix='bbf-evidence-rejection-') as temporary:
  copy=Path(temporary)/'run'
  shutil.copytree(source,copy,copy_function=os.link)
  target=copy/path
  data=json.loads(target.read_text())
  target.unlink()
  index=json.loads((copy/'artifacts.json').read_text())
  if mutation=='remove':index=[row for row in index if row['path']!=path]
  else:
   if mutation=='supply': data['supplyAfter']=data['supplyBefore']
   else:data['spent']['available']=str(int(data['spent']['available'])+1)
   target.write_text(json.dumps(data,indent=2)+'\n')
   for row in index:
    if row['path']==path:row.update(bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest())
  (copy/'artifacts.json').unlink()
  (copy/'artifacts.json').write_text(json.dumps(index))
  env={**os.environ,'BBF_NEGATIVE_DIR':str(copy)}
  code="import {verifyEvidence} from './scripts/protocol-fork/verify-evidence.ts'; try { await verifyEvidence(process.env.BBF_NEGATIVE_DIR, undefined, false); console.log('ACCEPTED'); process.exitCode=9; } catch(e) { console.log('REJECTED '+String(e)); }"
  run=subprocess.run(['bun','-e',code],cwd=root,env=env,text=True,capture_output=True)
  assert run.returncode==0 and run.stdout.startswith('REJECTED ') and expected in run.stdout,(name,run.returncode,run.stdout,run.stderr)
  results.append({'case':name,'mutation':mutation,'artifact':path,'expectedFailure':expected,'passed':True})
  print(name+': rejected as required',flush=True)
assert before=={name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in protected}
output={'sourceRun':source.name,'verifierSha256':hashlib.sha256((root/'scripts/protocol-fork/verify-evidence.ts').read_bytes()).hexdigest(),'scope':'Offline diagnostic copies; their artifact indexes were updated deliberately while original pass labels were retained. Original artifacts remain unchanged.','checks':results}
(root/'specs/003-protocol-buyback-burn/evidence/verifier-negative-checks-20260907.json').write_text(json.dumps(output,indent=2)+'\n')
