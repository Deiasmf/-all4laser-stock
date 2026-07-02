-- Permitir apagar movimentos do livro central (Encomendas) — só admins.
drop policy if exists recepcao_movimentos_delete on public.recepcao_movimentos;
create policy recepcao_movimentos_delete
  on public.recepcao_movimentos for delete to authenticated using (public.is_admin());

drop policy if exists recepcao_match_delete on public.recepcao_match;
create policy recepcao_match_delete
  on public.recepcao_match for delete to authenticated using (public.is_admin());
