"""Build a self-contained GitHub Pages site; no server-side API at runtime."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from catalog import ROOT, KEYWORDS, SUPPLEMENT, UPGRADES, COMMANDS, DISPLAY, ALIASES

APP=Path(__file__).resolve().parent
STATIC_FILES=('index.html','boot.js','entry.js','pdf-parser.mjs','roster.html','roster.js','style.css')
ASSET_FILES=('legion-icons.ttf','legion-icons-LICENSE.txt','SOURCES.md')

def build(output):
    output=output.resolve()
    if output!=ROOT/'dist':
        raise SystemExit('Only the project dist directory may be rebuilt.')
    pdfjs=ROOT/'node_modules/pdfjs-dist'
    if not (pdfjs/'build/pdf.mjs').is_file():
        raise SystemExit('PDF.js dependency missing. Run npm ci first.')
    # Clear stale output: removed source assets must not survive a later deployment.
    if output.exists():shutil.rmtree(output)
    output.mkdir(parents=True,exist_ok=True)
    for name in STATIC_FILES:
        if name!='index.html':shutil.copy2(APP/'static'/name,output/name)
    (output/'assets').mkdir()
    for name in ASSET_FILES:shutil.copy2(APP/'static/assets'/name,output/'assets'/name)
    vendor=output/'vendor/pdfjs';vendor.mkdir(parents=True,exist_ok=True)
    for name in ('pdf.mjs','pdf.worker.mjs'):
        shutil.copy2(pdfjs/'build'/name,vendor/name)
    for folder in ('cmaps','standard_fonts','wasm'):
        shutil.copytree(pdfjs/folder,vendor/folder,dirs_exist_ok=True)
    shutil.copy2(pdfjs/'LICENSE',vendor/'LICENSE')
    paths=['keyword/legion_keyword_dictionary_summary_reviewed.json','keyword/legion_keyword_dictionary_supplement_zh.json',
           'upgradecards/upgrades-slim.json','tacticalcards/tactical-cards.bilingual.json','keyword/tactical_keyword_supplement_zh.json']
    catalog={'keywords':KEYWORDS,'supplement':SUPPLEMENT,'upgrades':UPGRADES,'commands':COMMANDS,'display':DISPLAY,'aliases':ALIASES,
             'versions':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()for p in paths}}
    (output/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    (output/'.nojekyll').touch()
    # Mark the deployable entry only after its dependencies have been prepared.
    template=(APP/'static/index.html').read_text(encoding='utf8')
    (output/'index.html').write_text(template.replace('<meta name="legion-site" content="source">','<meta name="legion-site" content="built-v1">'),encoding='utf8')
    print(f'Static site ready: {output} (503 upgrades, {len(COMMANDS)} command cards)')

if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('--output',type=Path,default=ROOT/'dist')
    build(cli.parse_args().output)
