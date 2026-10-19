#!/usr/bin/env python3
# Parte C — seeds do cashflow a partir do ficheiro de análise:
#  - cashflow_recurring_expenses (Custos Fixos, Ativo=SIM; mediana, EXCETO Estado=média)
#  - cashflow_payment_plans (Entradas Recorrentes, Ativo=SIM e >=10 meses; mediana)
# Tudo por_confirmar=true (revisão manual na UI). Liga clientes por nome normalizado.
import os, csv, re, json, sys, unicodedata, urllib.request

SCR = sys.argv[1]
DRY = len(sys.argv) > 2 and sys.argv[2] == "dry"
ENV = {}
with open(".env.local", encoding="utf-8") as f:
    for line in f:
        m = re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
        if m: ENV[m.group(1)] = m.group(2).strip().strip('"')
URL = ENV["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def req(method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + "/rest/v1/" + path, data=data, method=method, headers={**H, **(headers or {})})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read(); return json.loads(raw) if raw else None

def norm(s):
    s = "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").upper()
    s = re.sub(r"[.,/'\-]", " ", s)
    s = re.sub(r"\b(LDA|LTD|L\s*DA|UNIPESSOAL|UNIP|SA|SL|AB|S\s*L|S\s*A|CENTRO DE ESTET\w*)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()
def num(v):
    if not v: return None
    t = str(v).strip().replace("€", "").replace(" ", "")
    if "," in t and "." in t: t = t.replace(".", "").replace(",", ".")
    elif "," in t: t = t.replace(",", ".")
    try: return round(float(t), 2)
    except: return None

def rd(n):
    with open(SCR + "/" + n, encoding="utf-8") as f: return list(csv.reader(f))

# guarda: não duplicar
rec_n = req("GET", "cashflow_recurring_expenses?select=id&limit=1")
plan_n = req("GET", "cashflow_payment_plans?select=id&limit=1")
if (rec_n or plan_n) and not DRY:
    print("Já existem seeds de cashflow — abortar para não duplicar. (apaga-os primeiro se quiseres re-semear)"); sys.exit(1)

# categorias de despesa
cats = {c["nome"]: c["id"] for c in req("GET", "cashflow_expense_categories?select=id,nome")}
BLOCOS = ["Salários", "Estado", "Financiamentos", "Débitos diretos", "Cartões crédito", "Banca", "Compras cartão"]
for i, nome in enumerate(BLOCOS):
    if nome not in cats and not DRY:
        r = req("POST", "cashflow_expense_categories", {"nome": nome, "ordem": 10 + i}, headers={"Prefer": "return=representation"})
        cats[nome] = r[0]["id"]

# ── Custos Fixos → recurring_expenses ────────────────────────────────────────
cf = rd("custos_fixos.csv")[3:]
DATA_INI = "2024-10-01"
rec_rows = []
for r in cf:
    if len(r) < 9 or r[3].strip().upper() != "SIM": continue
    bloco, rubrica = r[0].strip(), r[1].strip()
    mediana, media = num(r[5]), num(r[6])
    valor = media if bloco == "Estado" else mediana
    if valor is None: continue
    rec_rows.append({
        "descricao": rubrica or bloco, "categoria_id": cats.get(bloco),
        "valor": valor, "moeda": "EUR", "periodicidade": "mensal", "data_inicio": DATA_INI,
        "ativo": True, "por_confirmar": True,
        "notas": f"{bloco} · {'média' if bloco=='Estado' else 'mediana'} 24m · {(r[8] or '').strip()[:120]}",
        "criado_por_nome": "Análise inicial (24 meses)",
    })
print(f"recurring_expenses a criar: {len(rec_rows)}")

# ── Entradas Recorrentes → payment_plans ────────────────────────────────────
clientes = req("GET", "clientes?select=id,nome")
idx = {}
for c in clientes: idx.setdefault(norm(c["nome"]), c["id"])
er = rd("entradas_recorrentes.csv")[3:]
plan_rows, ligados, por_ligar, intl = [], 0, [], []
for r in er:
    if len(r) < 6 or r[3].strip().upper() != "SIM": continue
    if not r[2].strip().isdigit() or int(r[2]) < 10: continue
    tipo, nome = r[0].strip(), r[1].strip()
    if tipo.upper() == "OUTRAS": continue  # não é cliente (ex.: depósitos em numerário)
    valor = num(r[5])
    n = norm(nome)
    cid = idx.get(n)
    if not cid:  # tenta por sobreposição de tokens
        for k, v in idx.items():
            if k and (k in n or n in k) and len(k) > 6: cid = v; break
    if cid: ligados += 1
    else: por_ligar.append(nome)
    if tipo.upper() == "INTL": intl.append(f"{nome} ({valor}€/mês, {r[2]}m)")
    plan_rows.append({
        "cliente_id": cid, "cliente_nome": nome, "descricao": f"Aluguer mensal (recorrente, {tipo})",
        "periodicidade": "mensal", "valor_prestacao": valor, "moeda": "EUR",
        "data_inicio": DATA_INI, "estado": "ativo", "por_confirmar": True,
        "notas": f"{r[2]} meses c/ recebimento em 24m · mediana {valor}€ · último {r[4] if len(r)>4 else ''}",
        "criado_por_nome": "Análise inicial (24 meses)",
    })
print(f"payment_plans a criar: {len(plan_rows)}  (ligados a cliente: {ligados}, por ligar: {len(por_ligar)})")
print("  por ligar:", "; ".join(por_ligar) or "—")
print("  INTERNACIONAIS (confirmar):", "; ".join(intl) or "—")

if DRY:
    print("DRY-RUN — nada escrito."); sys.exit(0)

if rec_rows: req("POST", "cashflow_recurring_expenses", rec_rows, headers={"Prefer": "return=minimal"})
if plan_rows: req("POST", "cashflow_payment_plans", plan_rows, headers={"Prefer": "return=minimal"})
print("OK — seeds inseridos (por_confirmar=true).")
