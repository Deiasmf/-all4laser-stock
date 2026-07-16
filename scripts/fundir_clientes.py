# -*- coding: utf-8 -*-
"""
Funde clientes duplicados em segurança.
Entrada: JSON (env GROUPS_JSON) = lista de grupos; cada grupo = lista de ids de cliente.
Para cada grupo escolhe o cliente a MANTER (mais ligações; desempate por mais campos
preenchidos e nome mais longo), transfere as ligações das 11 tabelas dos duplicados
para o que fica, preenche campos em falta e apaga os duplicados.
Dry-run por omissão; usar --apply para gravar.
Uso: GROUPS_JSON=... python scripts/fundir_clientes.py [--apply]
"""
import json, os, sys, urllib.request, urllib.parse

FK = ['alugueres', 'reservas', 'folhas_obra', 'notas_encomenda', 'envios_pecas',
      'clientes_portal', 'reparacao_pecas', 'rececoes_pecas', 'processos_pecas',
      'registos_cliente', 'cliente_moradas_entrega']
CAMPOS_MERGE = ['email', 'telefone', 'contacto_nome', 'nif', 'morada', 'cidade', 'codigo_postal', 'observacoes']
APPLY = '--apply' in sys.argv

def env(path='.env.local'):
    e = {}
    for l in open(path, encoding='utf-8'):
        l = l.strip()
        if l and not l.startswith('#') and '=' in l:
            k, v = l.split('=', 1); e[k.strip()] = v.strip().strip('"').strip("'")
    return e

E = env(); URL = E['NEXT_PUBLIC_SUPABASE_URL']; KEY = E['SUPABASE_SERVICE_ROLE_KEY']

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, method=method)
    r.add_header('apikey', KEY); r.add_header('Authorization', 'Bearer ' + KEY)
    r.add_header('Content-Type', 'application/json'); r.add_header('Prefer', 'return=representation')
    with urllib.request.urlopen(r, timeout=60) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else None

def get_clientes(ids):
    lista = ','.join(ids)
    return req('GET', f"/rest/v1/clientes?select=*&id=in.({lista})")

def contar(tabela, ids):
    lista = ','.join(ids)
    rows = req('GET', f"/rest/v1/{tabela}?select=cliente_id&cliente_id=in.({lista})")
    return len(rows or [])

def escolher_survivor(cli):
    def score(c):
        ligs = sum(contar(t, [c['id']]) for t in FK)
        preenchidos = sum(1 for f in CAMPOS_MERGE if c.get(f))
        nome = c.get('nome') or ''
        acentos = sum(1 for ch in nome if ord(ch) > 127)   # prefere nome com acentos
        tem_maiuscula = any(ch.isupper() for ch in nome) and not nome.isupper()  # Title case, não TUDO MAIÚSCULAS
        # Nome bem-formatado pesa MAIS que nº de campos (os campos transferem-se na mesma)
        return (ligs, int(tem_maiuscula), acentos, preenchidos, len(nome))
    return max(cli, key=score)

def main():
    grupos = json.load(open(os.environ['GROUPS_JSON'], encoding='utf-8'))
    print(f"{'=== APLICAR ===' if APPLY else '=== DRY-RUN (nada gravado) ==='}  {len(grupos)} operações\n")
    total_del = 0; total_reatrib = 0
    for gi, item in enumerate(grupos, 1):
        # item pode ser lista de ids (survivor automático) OU
        # objeto {"keep": id, "merge": [ids], "rename": "nome"}
        rename = None
        if isinstance(item, dict):
            ids = [item['keep']] + item['merge']
            cli = get_clientes(ids)
            s = next(c for c in cli if c['id'] == item['keep'])
            rename = item.get('rename')
        else:
            ids = item
            cli = get_clientes(ids)
            if len(cli) < 2:
                print(f"[op {gi}] ignorado (menos de 2 clientes existentes)"); continue
            s = escolher_survivor(cli)
        dupes = [c for c in cli if c['id'] != s['id']]
        dupe_ids = [c['id'] for c in dupes]
        if not dupe_ids:
            print(f"[op {gi}] ignorado (sem duplicados)"); continue
        # contar ligações a reatribuir por tabela
        reatrib = {t: contar(t, dupe_ids) for t in FK}
        reatrib = {t: n for t, n in reatrib.items() if n}
        print(f"[op {gi}] MANTER: {s['nome']}" + (f"  ->renomear para: {rename}" if rename and rename != s['nome'] else ""))
        for d in dupes:
            print(f"            fundir+apagar: {d['nome']}")
        print(f"            ligacoes a transferir: {reatrib or 'nenhuma'}")
        # campos que seriam preenchidos no survivor
        preenche = {}
        for f in CAMPOS_MERGE:
            if not s.get(f):
                for d in dupes:
                    if d.get(f): preenche[f] = d[f]; break
        if preenche:
            print(f"            preencher no que fica: {preenche}")
        print()
        total_del += len(dupes); total_reatrib += sum(reatrib.values())

        if APPLY:
            lista = ','.join(dupe_ids)
            for t in FK:
                if reatrib.get(t):
                    req('PATCH', f"/rest/v1/{t}?cliente_id=in.({lista})", {'cliente_id': s['id']})
            if preenche:
                req('PATCH', f"/rest/v1/clientes?id=eq.{s['id']}", preenche)
            req('DELETE', f"/rest/v1/clientes?id=in.({lista})")
            # renomear o survivor DEPOIS de apagar (evita conflito com nome único)
            if rename and rename != s['nome']:
                req('PATCH', f"/rest/v1/clientes?id=eq.{s['id']}", {'nome': rename})

    print(f"{'APLICADO' if APPLY else 'PREVISTO'}: {total_del} clientes apagados, {total_reatrib} ligacoes transferidas.")

if __name__ == '__main__':
    main()
