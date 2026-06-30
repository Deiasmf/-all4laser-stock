# Importa o histórico de "Stock Reparação de Peças" (export do monday.com)
# diretamente para o Supabase via API REST, usando a chave de serviço.
#
# A chave é lida de SUPABASE_SERVICE_KEY (ambiente) ou da linha
# SUPABASE_SERVICE_KEY=... no ficheiro .env.local (que não vai para o git).
#
# Uso:
#   python scripts/importar_reparacao_pecas_rest.py
#
# É seguro correr várias vezes: faz upsert pelo Item ID do monday
# (monday_item_id), por isso não cria duplicados.

import openpyxl, os, json, datetime, urllib.request, urllib.error

URL = 'https://lykfbclxsyazerffcpta.supabase.co'
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(BASE, 'scripts', 'Stock Reparação Peças - All4laser.xlsx')


def ler_chave():
    k = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
    if k:
        return k
    env = os.path.join(BASE, '.env.local')
    if os.path.exists(env):
        with open(env, 'r', encoding='utf-8') as fh:
            for linha in fh:
                if linha.strip().startswith('SUPABASE_SERVICE_KEY='):
                    return linha.split('=', 1)[1].strip().strip('"').strip("'")
    return ''


KEY = ler_chave()
if not KEY:
    raise SystemExit(
        'Falta a chave de serviço. Acrescenta uma linha\n'
        '  SUPABASE_SERVICE_KEY=...a tua service_role key...\n'
        'ao ficheiro .env.local (Supabase > Project Settings > API > service_role).'
    )

# Colunas no Excel (cabeçalho na linha 2; dados a partir da 3)
COL = {'fornecedor': 0, 'peca': 1, 'serial_number': 2, 'avaria': 3, 'garantia': 4,
       'data_saida': 5, 'data_entrada': 6, 'status': 7, 'pago': 8,
       'observacoes': 9, 'monday_item_id': 10}

STATUS_NORM = {'em reparação': 'Em Reparação', 'em reparacao': 'Em Reparação'}


def cell(row, i):
    v = row[i] if i < len(row) and row[i] is not None else None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def to_date(v):
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    if not s:
        return None
    if ' to ' in s:                 # intervalo do monday → 1ª data
        s = s.split(' to ')[0].strip()
    s = s[:10]
    try:
        datetime.datetime.strptime(s, '%Y-%m-%d')
        return s
    except ValueError:
        return None


def post(tabela, linhas, prefer, params=''):
    if not linhas:
        return
    req = urllib.request.Request(
        f'{URL}/rest/v1/{tabela}{params}',
        data=json.dumps(linhas).encode('utf-8'),
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}',
                 'Content-Type': 'application/json', 'Prefer': prefer},
        method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        corpo = e.read().decode('utf-8', 'replace')
        raise SystemExit(f'ERRO {e.code} em {tabela}: {corpo[:500]}')


wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb.worksheets[0]
rows = list(ws.iter_rows(values_only=True))[3:]

registos = []
ignoradas = 0
for r in rows:
    forn = cell(r, COL['fornecedor'])
    monday_id = cell(r, COL['monday_item_id'])
    if forn is not None and str(forn).lower() in ('name', 'criar elemento', 'criar elementos'):
        ignoradas += 1
        continue
    if monday_id is None:
        ignoradas += 1
        continue
    status = cell(r, COL['status'])
    if status:
        status = STATUS_NORM.get(str(status).lower(), str(status))
    registos.append({
        'fornecedor': cell(r, COL['fornecedor']),
        'peca': cell(r, COL['peca']),
        'serial_number': cell(r, COL['serial_number']),
        'avaria': cell(r, COL['avaria']),
        'garantia': cell(r, COL['garantia']),
        'data_saida': to_date(cell(r, COL['data_saida'])),
        'data_entrada': to_date(cell(r, COL['data_entrada'])),
        'status': status,
        'pago': cell(r, COL['pago']),
        'observacoes': cell(r, COL['observacoes']),
        'monday_item_id': str(monday_id).strip(),
    })

total = 0
for i in range(0, len(registos), 300):
    lote = registos[i:i + 300]
    post('reparacao_pecas', lote,
         'resolution=merge-duplicates,return=minimal', '?on_conflict=monday_item_id')
    total += len(lote)
    print('Inseridos/atualizados:', total)

print('CONCLUÍDO. Registos:', len(registos), '| ignorados:', ignoradas)
