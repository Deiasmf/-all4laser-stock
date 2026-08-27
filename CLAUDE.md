@AGENTS.md

## Utilizadores e permissões
Só DUAS áreas são restritas: o **Financeiro** e a **Gestão de Utilizadores**. Todo o
staff interno pode gerir o resto da app (criar, editar, apagar, Tracking, tarefas…).

3 roles:
- **admin**: só a Andreia (andreia.fernandes@all4laser.com) — acesso total, incluindo Financeiro e Gestão de Utilizadores
- **financeiro**: Vanessa Tavares — Financeiro + resto da app (sem Gestão de Utilizadores)
- **standard**: restantes membros — tudo MENOS o Financeiro e a Gestão de Utilizadores
- (o antigo role "administrativo" foi removido; o antigo "viewer" já era "standard")

Regras técnicas:
- Atribuição de roles: só admin, no ecrã /definicoes/utilizadores (RPC admin_set_role)
- Proteção real na BD por RLS (não apenas esconder menus):
  - Financeiro: `has_financeiro_access()` (= admin ou financeiro)
  - "Pode gerir" o resto: `is_staff()` (qualquer utilizador interno)
  - Gestão de Utilizadores: `is_admin()` (= role 'admin')
- No frontend (src/lib/auth.tsx): `isAdmin` significa "staff (pode gerir)", NÃO o role admin;
  para a Gestão de Utilizadores usar `isGestorUtilizadores` (= role 'admin')
