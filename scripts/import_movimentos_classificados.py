#!/usr/bin/env python3
# A5 — Importa a folha "Movimentos Classificados" (24 meses já categorizados) para
# bank_movements, origem 'analise_inicial'. WIPE + reimport (decisão da Andreia).
# Hash replica o do importador TS (conciliacaoBancaria.ts) para a sincronização
# mensal futura ser idempotente contra este histórico.
import os, csv, re, json, sys, unicodedata, urllib.request, urllib.parse

SCR = sys.argv[1]
ENV = {}
with open(".env.local", encoding="utf-8") as f:
    for line in f:
        m = re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
        if m: ENV[m.group(1)] = m.group(2).strip().strip('"')
URL = ENV["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

ACCT = {"EUR": "f50cba59-714e-4649-b9fe-209f02db0d4c", "USD": "21d0d3a2-d2a4-4168-82f1-71d23763055c"}

def req(method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + "/rest/v1/" + path, data=data, method=method, headers={**H, **(headers or {})})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None

def sem_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()
def norm_desc(s):
    return re.sub(r"\s+", " ", sem_acentos(s).upper()).strip()
def parse_valor(v):
    if v is None or v == "": return None
    t = str(v).strip().replace("€", "").replace("$", "").replace(" ", "")
    neg = t.startswith("-") or (t.startswith("(") and t.endswith(")"))
    t = re.sub(r"[()\-]", "", t)
    if "," in t and "." in t: t = t.replace(".", "").replace(",", ".")
    elif "," in t: t = t.replace(",", ".")
    try: n = float(t)
    except: return None
    return -n if neg else n

# mapa categoria (folha, UPPER) -> ignorar_categoria (enum da fila)
IGN = {"BANCO": "comissoes_bancarias", "SALARIOS": "salarios", "FORNECEDORES": "fornecedores",
       "INTERNO": "transferencias_internas"}
CLIENTES = {"CLIENTES SEPA", "CLIENTES INTL"}

rows = []
with open(SCR + "/movimentos_classificados.csv", encoding="utf-8") as f:
    rd = csv.reader(f); hdr = next(rd)
    ci = {h: i for i, h in enumerate(hdr)}
    def g(r, k): return r[ci[k]].strip() if len(r) > ci[k] else ""
    contador = {}
    skipped = 0
    for r in rd:
        conta_nome = g(r, "Conta").upper()
        conta_id = ACCT.get(conta_nome)
        data = g(r, "Data")[:10]
        valor_b = parse_valor(g(r, "Valor"))
        desc = g(r, "Descrição")
        if not conta_id or not re.match(r"\d{4}-\d{2}-\d{2}", data) or valor_b is None or not desc:
            skipped += 1; continue
        sentido = "debito" if valor_b < 0 else "credito"
        valor = abs(valor_b)
        cat = g(r, "Categoria").upper()
        base = "§".join([conta_id, data, f"{valor:.2f}", sentido, norm_desc(desc)])
        occ = contador.get(base, 0) + 1; contador[base] = occ
        h = f"{base}§#{occ}"
        interna = cat == "INTERNO"
        if interna: estado, ign = "ignorado", "transferencias_internas"
        elif sentido == "credito" and cat in CLIENTES: estado, ign = "por_conciliar", None
        elif sentido == "credito": estado, ign = "ignorado", "outros"
        else: estado, ign = "ignorado", IGN.get(cat, "outros")
        rows.append({
            "conta_id": conta_id, "data": data, "descritivo": desc, "valor": round(valor, 2),
            "sentido": sentido, "flag_fr": g(r, "F/R") or None, "observacoes": g(r, "Observações") or None,
            "ocorrencia": occ, "hash": h, "estado": estado, "ignorar_categoria": ign,
            "categoria": cat or None, "rubrica": g(r, "Rubrica") or None,
            "categoria_origem": "analise_inicial", "interna": interna,
            "criado_por_nome": "Análise inicial (24 meses)",
        })

print(f"linhas válidas: {len(rows)}  (ignoradas: {skipped})")
dup = len(rows) - len({r['hash'] for r in rows})
print(f"colisões de hash restantes: {dup}  (deve ser 0)")
import collections
cc = collections.Counter(r["categoria"] for r in rows)
print("por categoria:", dict(cc.most_common()))
print("interna:", sum(1 for r in rows if r["interna"]), "| por_conciliar:", sum(1 for r in rows if r["estado"]=="por_conciliar"))
# exemplo de 2 iguais no mesmo dia (ocorrência > 1)
rep = [r for r in rows if r["ocorrencia"] > 1][:2]
for r in rep: print("  rep:", r["data"], r["valor"], r["ocorrencia"], r["descritivo"][:30])

if len(sys.argv) > 2 and sys.argv[2] == "dry":
    print("DRY-RUN — nada escrito."); sys.exit(0)

# WIPE + lote
req("DELETE", "bank_movements?id=not.is.null")
req("DELETE", "bank_import_lotes?id=not.is.null")
for conta_nome, conta_id in ACCT.items():
    sub = [r for r in rows if r["conta_id"] == conta_id]
    if not sub: continue
    datas = sorted(r["data"] for r in sub)
    lote = req("POST", "bank_import_lotes", {
        "conta_id": conta_id, "ficheiro_nome": "All4laser_Custos_Fixos_e_Entradas_Recorrentes.xlsx (Movimentos Classificados)",
        "periodo_inicio": datas[0], "periodo_fim": datas[-1], "total_linhas": len(sub),
        "novos": len(sub), "repetidos": 0, "criado_por_nome": "Análise inicial (24 meses)",
    }, headers={"Prefer": "return=representation"})
    lote_id = lote[0]["id"]
    for r in sub: r["import_lote_id"] = lote_id
    # insert em lotes de 500
    for i in range(0, len(sub), 500):
        batch = sub[i:i+500]
        req("POST", "bank_movements", batch, headers={"Prefer": "return=minimal"})
    print(f"  {conta_nome}: {len(sub)} inseridos  ({datas[0]} → {datas[-1]})")
print("OK")
