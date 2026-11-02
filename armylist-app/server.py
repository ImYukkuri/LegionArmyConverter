"""Local PDF → JSON → Chinese HTML service. No remote translation or API keys."""
import argparse
import json
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote,urlparse,parse_qs
from parser import parse_pdf
from catalog import ROOT,UPGRADES,COMMANDS,KEYWORDS
from build_site import build
import mimetypes

APP=Path(__file__).resolve().parent
STATIC=APP/'static'
SITE=ROOT/'dist'
MAX_BODY=25*1024*1024

def validate_army(data):
    if not isinstance(data,dict)or data.get('schema')!='legion-army/v2':raise ValueError('JSON 格式必须为 legion-army/v2，请使用本项目导出的 JSON。')
    units=data.get('units');commands=data.get('commandCards')
    if not isinstance(units,list)or not units or len(units)>200:raise ValueError('单位列表为空或超过200条。')
    if not isinstance(commands,list)or len(commands)>200:raise ValueError('命令卡列表格式错误。')
    for u in units:
        if not isinstance(u,dict)or not all(k in u for k in ('name','stats','weapons','upgrades','keywords','fromUpgrades','zh')):raise ValueError('单位缺少必要字段。')
        if not isinstance(u['stats'],dict)or any(not isinstance(u[k],list)for k in ('weapons','upgrades','keywords','fromUpgrades')):raise ValueError('单位字段类型不正确。')
    return data

def export_html(data):
    validate_army(data)
    serialized=json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    template=(STATIC/'roster.html').read_text(encoding='utf8')
    return template.replace('<link rel="stylesheet" href="style.css">','<style>'+(STATIC/'style.css').read_text(encoding='utf8')+'</style>')\
                   .replace('<!--ARMY_DATA-->','<script>window.ARMY_DATA='+serialized+';</script>')\
                   .replace('<script src="roster.js"></script>','<script>'+(STATIC/'roster.js').read_text(encoding='utf8')+'</script>')

class Handler(BaseHTTPRequestHandler):
    server_version='LegionArmyLocal/1'
    def log_message(self,fmt,*args):print(fmt%args)
    def send(self,code,payload,kind='application/json; charset=utf-8'):
        body=payload if isinstance(payload,bytes)else payload.encode('utf8')if isinstance(payload,str)else json.dumps(payload,ensure_ascii=False).encode('utf8')
        self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        route=urlparse(self.path).path
        try:
            if route=='/api/status':return self.send(200,{'upgrades':len(UPGRADES),'commands':len(COMMANDS),'keywords':len(KEYWORDS),'translation':'local-json'})
            relative=unquote(route).lstrip('/')or 'index.html'
            path=(SITE/relative).resolve()
            if not path.is_relative_to(SITE.resolve())or not path.is_file():return self.send(404,{'error':'页面不存在。'})
            kind='text/javascript'if path.suffix in ('.js','.mjs')else mimetypes.guess_type(path.name)[0]or 'application/octet-stream'
            return self.send(200,path.read_bytes(),kind+('; charset=utf-8'if kind.startswith('text/')or kind=='application/json'else ''))
        except ValueError as error:return self.send(422,{'error':str(error)})
        except Exception:return self.send(500,{'error':'读取或解析失败，请检查 PDF 文件及本地数据文件。'})
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=MAX_BODY:return self.send(413,{'error':'文件为空或超过25MB限制。'})
            content=self.rfile.read(size);url=urlparse(self.path)
            if url.path=='/api/parse':
                filename=Path(parse_qs(url.query).get('filename',['army.pdf'])[0]).name
                return self.send(200,parse_pdf(content,filename))
            if url.path=='/api/export':return self.send(200,export_html(json.loads(content.decode('utf8'))),'text/html; charset=utf-8')
            return self.send(404,{'error':'接口不存在。'})
        except (ValueError,TypeError,KeyError,UnicodeError)as error:return self.send(422,{'error':str(error)})
        except Exception:return self.send(422,{'error':'无法解析此 PDF。请确认包含文本层及 Legion HQ 属性表。'})

if __name__=='__main__':
    args=argparse.ArgumentParser();args.add_argument('--port',type=int,default=8765);opts=args.parse_args()
    build(SITE)
    print(f'本地军表工具：http://127.0.0.1:{opts.port}  （Ctrl+C 退出）',flush=True)
    try:ThreadingHTTPServer(('127.0.0.1',opts.port),Handler).serve_forever()
    except KeyboardInterrupt:pass
