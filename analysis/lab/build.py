import pathlib,sys
src=pathlib.Path(__file__).resolve().parent; out=pathlib.Path(sys.argv[1]); data=pathlib.Path(sys.argv[2]).read_text().replace('</','<\\/')
html=f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pressure Lab · SupeRR Selector S2</title><style>{(src/'style.css').read_text()}</style></head><body>
{(src/'body.html').read_text()}
<script type="application/json" id="pldata">{data}</script>
<script>{(src/'app.js').read_text()}</script></body></html>'''
out.write_text(html); print(out, round(len(html)/1e6,1),'MB')
