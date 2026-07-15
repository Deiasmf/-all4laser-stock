# -*- coding: utf-8 -*-
"""
Importa clientes para a tabela public.clientes via API REST do Supabase.
- Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local
- Lê os registos já mapeados de um JSON (--dados)
- Estratégia: 'fill' (preenche só o que está em falta nos existentes; recomendado),
  'update' (sobrepõe com os novos onde houver valor) ou 'insert' (só cria novos).
Uso:
  python scripts/importar_clientes.py --dados caminho/clientes_import.json --modo fill [--dry-run]
"""
import json, os, sys, argparse, urllib.request, urllib.parse, urllib.error

FIELDS = ['nome','email','telefone','contacto_nome','nif','morada','cidade','codigo_postal','pais','nacional']
FILLABLE = ['email','telefone','contacto_nome','nif','morada','cidade','codigo_postal']  # nome/pais/nacional não se mexem em existentes

def carregar_env(path):
    env = {}
    if os.path.exists(path):
        for linha in open(path, encoding='utf-8'):
            linha = linha.strip()
            if not linha or linha.startswith('#') or '=' not in linha:
                continue
            k, v = linha.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def req(method, url, key, body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header('apikey', key)
    r.add_header('Authorization', 'Bearer ' + key)
    r.add_header('Content-Type', 'application/json')
    r.add_header('Prefer', 'return=minimal')
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

def get_existentes(url, key):
    campos = ','.join(['id'] + FIELDS)
    existentes = {}
    passo = 1000
    off = 0
    while True:
        u = f"{url}/rest/v1/clientes?select={campos}&order=nome.asc&limit={passo}&offset={off}"
        r = urllib.request.Request(u)
        r.add_header('apikey', key); r.add_header('Authorization', 'Bearer ' + key)
        with urllib.request.urlopen(r, timeout=60) as resp:
            lote = json.loads(resp.read().decode('utf-8'))
        for row in lote:
            existentes[(row['nome'] or '').strip().lower()] = row
        if len(lote) < passo:
            break
        off += passo
    return existentes

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dados', required=True)
    ap.add_argument('--modo', choices=['fill','update','insert'], default='fill')
    ap.add_argument('--env', default='.env.local')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    env = carregar_env(args.env)
    url = env.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        sys.exit("FALTA NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local")
    if not (key.startswith('sb_secret_') or key.startswith('eyJ')):
        print("AVISO: a chave nao parece ser service_role/secret. Continua na mesma...")

    registos = json.load(open(args.dados, encoding='utf-8'))
    existentes = get_existentes(url, key)
    print(f"Clientes ja existentes na BD: {len(existentes)}")
    print(f"Registos a importar: {len(registos)}")

    novos, patches, sem_alteracao = [], [], 0
    for x in registos:
        chave = (x['nome'] or '').strip().lower()
        ex = existentes.get(chave)
        if ex is None:
            novos.append({k: x.get(k) for k in FIELDS})
        else:
            if args.modo == 'insert':
                sem_alteracao += 1; continue
            patch = {}
            for f in FILLABLE:
                novo = x.get(f)
                if not novo:
                    continue
                atual = ex.get(f)
                if args.modo == 'fill':
                    if not atual:  # só preenche o que está vazio
                        patch[f] = novo
                else:  # update
                    if novo != atual:
                        patch[f] = novo
            if patch:
                patches.append((ex['id'], patch))
            else:
                sem_alteracao += 1

    print(f"-> A criar (novos): {len(novos)}")
    print(f"-> A atualizar (existentes): {len(patches)}")
    print(f"-> Sem alteracao: {sem_alteracao}")
    if args.dry_run:
        print("\n[DRY-RUN] nada foi escrito. Exemplos:")
        for n in novos[:3]: print("  NOVO:", n['nome'], '|', n.get('email'), '|', n.get('telefone'))
        for pid, p in patches[:3]: print("  PATCH:", pid, p)
        return

    # inserir novos em lotes
    criados = 0
    for i in range(0, len(novos), 500):
        lote = novos[i:i+500]
        st, err = req('POST', f"{url}/rest/v1/clientes", key, lote)
        if st not in (200,201,204):
            sys.exit(f"ERRO no POST (lote {i//500+1}): {st} {err}")
        criados += len(lote)
        print(f"  inseridos {criados}/{len(novos)}")

    # atualizar existentes (fill/update)
    atualizados = 0
    for pid, patch in patches:
        u = f"{url}/rest/v1/clientes?id=eq.{pid}"
        st, err = req('PATCH', u, key, patch)
        if st not in (200,204):
            print(f"  AVISO patch {pid} falhou: {st} {err}")
        else:
            atualizados += 1
    print(f"\nCONCLUIDO: {criados} criados, {atualizados} atualizados, {sem_alteracao} sem alteracao.")

if __name__ == '__main__':
    main()
