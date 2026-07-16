# -*- coding: utf-8 -*-
"""
Deteta candidatos a cliente duplicado (SÓ LEITURA — não altera nada).
Lê os clientes via REST (service key do .env.local), agrupa por:
  - NIF igual, email igual, telefone igual (exatos, alta confiança)
  - nomes semelhantes (difuso "equilibrado": normaliza acentos/maiúsculas/espaços,
    semelhança >= 0.85, ou um nome contido no outro partilhando a 1ª palavra)
Escreve um CSV de candidatos para revisão + um JSON dos grupos (para a fusão).
Uso: python scripts/detetar_duplicados_clientes.py
"""
import json, os, sys, csv, re, unicodedata, urllib.request
from difflib import SequenceMatcher
from collections import defaultdict

SAIDA_CSV = os.environ.get('DUP_CSV', 'Duplicados Clientes - Candidatos.csv')
SAIDA_JSON = os.environ.get('DUP_JSON', 'duplicados_grupos.json')

def carregar_env(path='.env.local'):
    env = {}
    if os.path.exists(path):
        for l in open(path, encoding='utf-8'):
            l = l.strip()
            if l and not l.startswith('#') and '=' in l:
                k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def fetch_clientes(url, key):
    campos = 'id,nome,nif,email,telefone,cidade,pais'
    out, off, passo = [], 0, 1000
    while True:
        u = f"{url}/rest/v1/clientes?select={campos}&order=nome.asc&limit={passo}&offset={off}"
        r = urllib.request.Request(u); r.add_header('apikey', key); r.add_header('Authorization', 'Bearer ' + key)
        with urllib.request.urlopen(r, timeout=60) as resp:
            lote = json.loads(resp.read().decode('utf-8'))
        out += lote
        if len(lote) < passo: break
        off += passo
    return out

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode('ascii')
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def norm_tel(s):
    return re.sub(r'\D', '', s or '')

# Tabelas de negócio que referenciam clientes(id) via cliente_id
TABELAS_FK = ['alugueres', 'reservas', 'folhas_obra', 'notas_encomenda', 'envios_pecas',
              'clientes_portal', 'reparacao_pecas', 'rececoes_pecas', 'processos_pecas']

def contar_ligacoes(url, key, ids):
    """Nº de referências por cliente_id nas tabelas de negócio (para escolher qual manter)."""
    contagem = defaultdict(int)
    ids = list(ids)
    for i in range(0, len(ids), 150):
        lote = ids[i:i+150]
        emlista = ','.join(lote)
        for t in TABELAS_FK:
            u = f"{url}/rest/v1/{t}?select=cliente_id&cliente_id=in.({emlista})"
            r = urllib.request.Request(u); r.add_header('apikey', key); r.add_header('Authorization', 'Bearer ' + key)
            try:
                with urllib.request.urlopen(r, timeout=60) as resp:
                    for row in json.loads(resp.read().decode('utf-8')):
                        if row.get('cliente_id'): contagem[row['cliente_id']] += 1
            except Exception:
                pass  # tabela pode não ter a coluna nalgum caso — ignora
    return contagem

# União-busca (union-find) para juntar grupos
class UF:
    def __init__(s): s.p = {}
    def find(s, x):
        s.p.setdefault(x, x)
        while s.p[x] != x: s.p[x] = s.p[s.p[x]]; x = s.p[x]
        return x
    def union(s, a, b):
        s.p[s.find(a)] = s.find(b)

def main():
    env = carregar_env()
    url = env.get('NEXT_PUBLIC_SUPABASE_URL'); key = env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key: sys.exit('Falta URL/SERVICE_ROLE_KEY no .env.local')

    cli = fetch_clientes(url, key)
    print(f'Clientes carregados: {len(cli)}')
    for c in cli:
        c['_n'] = norm(c['nome'])
        c['_tel'] = norm_tel(c.get('telefone'))
        c['_email'] = (c.get('email') or '').strip().lower()
        c['_nif'] = (c.get('nif') or '').strip()

    uf = UF()
    motivos = defaultdict(set)  # (id_a,id_b) -> motivos

    def liga(a, b, motivo):
        uf.union(a['id'], b['id'])
        motivos[a['id']].add(motivo); motivos[b['id']].add(motivo)

    # 1) Exatos: NIF, email, telefone
    for chave, campo in [('_nif', 'NIF'), ('_email', 'email'), ('_tel', 'telefone')]:
        grupos = defaultdict(list)
        for c in cli:
            v = c[chave]
            if v and (campo != 'telefone' or len(v) >= 6):
                grupos[v].append(c)
        for v, membros in grupos.items():
            for i in range(1, len(membros)):
                liga(membros[0], membros[i], campo + ' igual')

    # 2) Nomes semelhantes — blocos pela 1ª letra normalizada (rápido)
    blocos = defaultdict(list)
    for c in cli:
        if c['_n']: blocos[c['_n'][0]].append(c)
    for _, membros in blocos.items():
        for i in range(len(membros)):
            a = membros[i]; wa = set(a['_n'].split())
            for j in range(i + 1, len(membros)):
                b = membros[j]; wb = set(b['_n'].split())
                if a['_n'] == b['_n']:
                    liga(a, b, 'nome igual (acentos/espacos)'); continue
                ratio = SequenceMatcher(None, a['_n'], b['_n']).ratio()
                primeira = a['_n'].split()[0] == b['_n'].split()[0]
                contido = (wa <= wb or wb <= wa) and primeira and min(len(wa), len(wb)) >= 1
                if ratio >= 0.85 or contido:
                    liga(a, b, f'nome parecido ({int(ratio*100)}%)')

    # Montar grupos com >= 2 membros
    grupos = defaultdict(list)
    for c in cli:
        if c['id'] in uf.p:
            grupos[uf.find(c['id'])].append(c)
    grupos = {g: m for g, m in grupos.items() if len(m) >= 2}

    # Nº de ligações por cliente (para escolher qual manter)
    ids_candidatos = [c['id'] for m in grupos.values() for c in m]
    ligacoes = contar_ligacoes(url, key, ids_candidatos)

    # Ordenar grupos pelo nome; dentro do grupo, mais ligações primeiro (candidato a manter)
    ordenados = sorted(grupos.values(), key=lambda m: m[0]['_n'])
    for m in ordenados:
        m.sort(key=lambda c: ligacoes.get(c['id'], 0), reverse=True)

    with open(SAIDA_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['grupo', 'manter?', 'ligacoes', 'motivos', 'nome', 'nif', 'email', 'telefone', 'cidade', 'pais', 'id'])
        for gi, membros in enumerate(ordenados, 1):
            for k, c in enumerate(membros):
                # sugestão: pré-marca o 1º (mais ligações) como "manter"
                sugestao = 'X' if k == 0 else ''
                w.writerow([gi, sugestao, ligacoes.get(c['id'], 0), ' + '.join(sorted(motivos[c['id']])), c['nome'],
                            c.get('nif'), c.get('email'), c.get('telefone'), c.get('cidade'), c.get('pais'), c['id']])
            w.writerow([])

    with open(SAIDA_JSON, 'w', encoding='utf-8') as f:
        json.dump([[{k: c[k] for k in ('id', 'nome', 'nif', 'email', 'telefone', 'cidade', 'pais')} for c in m] for m in ordenados], f, ensure_ascii=False)

    n_clientes = sum(len(m) for m in ordenados)
    print(f'Grupos de candidatos a duplicado: {len(ordenados)}')
    print(f'Clientes envolvidos: {n_clientes}')
    print(f'CSV: {SAIDA_CSV}')
    print(f'JSON: {SAIDA_JSON}')

if __name__ == '__main__':
    main()
