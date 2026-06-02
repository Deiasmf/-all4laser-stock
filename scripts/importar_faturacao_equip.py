# Importa a "Faturação por equipamento" (export monday.com) para a tabela
# faturacao_equipamento, via API REST (chave de serviço em SUPABASE_SERVICE_KEY).
import openpyxl, glob, os, json, urllib.request, urllib.error

URL = 'https://lykfbclxsyazerffcpta.supabase.co'
KEY = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
if not KEY:
    raise SystemExit('Falta SUPABASE_SERVICE_KEY')

ms = glob.glob(r'C:\Users\andre\Documents\Antigravity\Produtividade\Faturacao por equipamento.xlsx')
wb = openpyxl.load_workbook(ms[0], read_only=True, data_only=True)
ws = wb.worksheets[0]
rows = list(ws.iter_rows(values_only=True))

# cabeçalho
hr = None
for i, r in enumerate(rows):
    cells = [str(c).strip().lower() if c is not None else '' for c in r]
    if 'nome' in cells and 'equipamentos' in cells:
        hr = i
        header = [str(c).strip() if c else '' for c in r]
        break
idx = {h.lower(): j for j, h in enumerate(header)}

def cel(r, chave):
    j = idx.get(chave)
    if j is None or j >= len(r) or r[j] is None:
        return None
    return r[j]

def num(v):
    if v in (None, ''):
        return None
    try:
        return float(str(v).replace(',', '.'))
    except Exception:
        return None

vistos = {}
for r in rows[hr + 1:]:
    nome = cel(r, 'nome')
    if not nome or str(nome).strip() == '':
        continue
    if len(r) > 2 and r[2] and 'try it free' in str(r[2]).lower():
        continue  # linha de grupo do monday
    serial = str(nome).split()[0].strip()
    if not serial or not serial[0].isdigit():
        continue
    status = (str(cel(r, 'status')).strip() if cel(r, 'status') else '')
    acc = num(cel(r, 'total acumulado'))
    registo = {
        'serial_number': serial,
        'modelo': (str(cel(r, 'equipamentos')).strip() if cel(r, 'equipamentos') else None),
        'tipo': (str(cel(r, 'tipo')).strip() if cel(r, 'tipo') else None),
        'localizacao': status or None,
        'nacional': ('internacional' not in status.lower()),
        'ano': (str(cel(r, 'ano')).strip() if cel(r, 'ano') else None),
        'valor_mensal': num(cel(r, 'total mensal')),
        'total_acumulado': acc,
        'estado': (str(cel(r, 'status 1')).strip() if cel(r, 'status 1') else None),
        'notas': (str(cel(r, 'texto')).strip() if cel(r, 'texto') else None),
    }
    # Por serial fica a linha com o acumulado MAIS ALTO (a mais recente)
    prev = vistos.get(serial)
    if prev is None or (acc or -1) > (prev['total_acumulado'] or -1):
        vistos[serial] = registo

linhas = list(vistos.values())

def post(lote):
    req = urllib.request.Request(
        f'{URL}/rest/v1/faturacao_equipamento?on_conflict=serial_number',
        data=json.dumps(lote).encode('utf-8'),
        headers={
            'apikey': KEY, 'Authorization': f'Bearer {KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
        }, method='POST',
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ERRO {e.code}: {e.read().decode("utf-8","replace")[:500]}')

total = 0
for i in range(0, len(linhas), 300):
    post(linhas[i:i + 300])
    total += len(linhas[i:i + 300])
    print('Inseridos/atualizados:', total)
print('CONCLUIDO. Equipamentos:', len(linhas))
