"""Fail closed on unreviewed files, oversized blobs, local paths or raw media."""
import argparse,hashlib,json,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
PERSONAL_PATH=re.compile(rb'(?:[A-Za-z]:[\\/]+Users[\\/]+|/(?:Users|home)/[A-Za-z0-9_.-]+/)')
RAW_SUFFIX={'.pdf','.png','.jpg','.jpeg','.webp','.gif','.zip','.bundle','.mp4'}

def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def check_bytes(name,content,errors,limit=2*1024*1024):
    if len(content)>limit:errors.append(name+': exceeds file size limit')
    if PERSONAL_PATH.search(content):errors.append(name+': contains a personal absolute path')
    if re.search(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)',content):errors.append(name+': potential credential')
    if Path(name).suffix.lower()in RAW_SUFFIX:errors.append(name+': raw media/archive is forbidden')

def audit(staged=False,dist=False,history=False):
    errors=[]
    policy=json.loads((git('show',':publication-policy.json')if staged else (ROOT/'publication-policy.json').read_bytes()))
    allow=set(policy['files'])
    names=git('ls-files','-z').decode().split('\0')if staged else git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\0')
    for name in filter(None,names):
        if not staged and not (ROOT/name).is_file():continue
        if name not in allow:errors.append(name+': not in reviewed publication allowlist');continue
        content=git('show',':'+name)if staged else (ROOT/name).read_bytes()
        check_bytes(name,content,errors)
        if name in policy['runtimeData']:
            if hashlib.sha256(content.replace(b'\r\n',b'\n')).hexdigest()!=policy['runtimeData'][name]:errors.append(name+': runtime mapping changed; explicit rights/data review and policy hash update required')
            value=json.loads(content)
            def walk(v):
                if isinstance(v,dict):
                    if any(k in v for k in ('image','ocrEvidence','bbox','evidence','referenceUrl','current_summary')):errors.append(name+': non-runtime source/evidence metadata found')
                    for x in v.values():walk(x)
                elif isinstance(v,list):
                    for x in v:walk(x)
            walk(value)
    if dist:
        folder=ROOT/'dist';total=0
        vendor_allowed={'pdf.mjs','pdf.worker.mjs','LICENSE','cmaps','standard_fonts','wasm'}
        for p in folder.rglob('*'):
            if not p.is_file():continue
            name=p.relative_to(folder).as_posix();content=p.read_bytes();total+=len(content)
            if name.startswith('vendor/pdfjs/'):
                if name.split('/')[2]not in vendor_allowed:errors.append(name+': unexpected vendor file')
                continue
            permitted={'index.html','boot.js','entry.js','pdf-parser.mjs','roster.html','roster.js','style.css','catalog.json','.nojekyll','assets/legion-icons.ttf','assets/legion-icons-LICENSE.txt','assets/SOURCES.md'}
            if name not in permitted:errors.append(name+': unexpected deployment file')
            check_bytes(name,content,errors)
        if total>40*1024*1024:errors.append('dist exceeds 40MiB limit')
        if not (folder/'catalog.json').is_file():errors.append('runtime catalog missing')
    if history:
        for line in git('rev-list','--objects','HEAD').decode().splitlines():
            parts=line.split(' ',1)
            if len(parts)==2 and Path(parts[1]).suffix.lower()in RAW_SUFFIX:errors.append(parts[1]+': forbidden file remains reachable in history')
    if errors:raise ValueError('\n'.join(sorted(set(errors))))
    print('PASS: reviewed public files; no raw media, personal paths or unexpected runtime-data changes'+('; clean dist'if dist else '')+('; reachable history checked'if history else ''))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--staged',action='store_true');p.add_argument('--dist',action='store_true');p.add_argument('--history',action='store_true');a=p.parse_args()
    try:audit(a.staged,a.dist,a.history)
    except (ValueError,subprocess.CalledProcessError)as e:print(e,file=sys.stderr);sys.exit(1)
