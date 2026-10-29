-- Run ONLY on wvdmhohijzyymadsfiaz. Fixtures and helpers roll back.
begin;
create temp table audit_results (label text primary key);
grant all on audit_results to anon, authenticated;
create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %', label; end if;
  insert into audit_results values(label);
end $$;
create function pg_temp.denied(stmt text, expected text, label text) returns void language plpgsql as $$
declare actual text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
  end;
  perform pg_temp.ok(actual = expected, label || ' [' || coalesce(actual,'NO ERROR') || ']');
end $$;

insert into auth.users(id,email) values
 ('a4000000-0000-4000-8000-000000000001','audit-admin@example.invalid'),
 ('a4000000-0000-4000-8000-000000000002','audit-standard@example.invalid'),
 ('a4000000-0000-4000-8000-000000000003','audit-finance@example.invalid'),
 ('a4000000-0000-4000-8000-000000000004','audit-no-profile@example.invalid');
insert into public.profiles(id,email,nome,role) values
 ('a4000000-0000-4000-8000-000000000001','audit-admin@example.invalid','Audit Admin','admin'),
 ('a4000000-0000-4000-8000-000000000002','audit-standard@example.invalid','Audit Standard','standard'),
 ('a4000000-0000-4000-8000-000000000003','audit-finance@example.invalid','Audit Finance','financeiro');
insert into public.pecas(id,nome,quantidade) values
 ('a4000000-0000-4000-8000-000000000010','AUDIT synthetic part',10);
insert into public.envios_pecas(id,numero,estado,motivo) values
 ('a4000000-0000-4000-8000-000000000020','AUDIT-SALE','aberto','venda'),
 ('a4000000-0000-4000-8000-000000000021','AUDIT-REPAIR','aberto','reparacao'),
 ('a4000000-0000-4000-8000-000000000022','AUDIT-NO-STOCK','aberto','venda');
insert into public.envios_pecas_itens(envio_id,peca_id,quantidade) values
 ('a4000000-0000-4000-8000-000000000020','a4000000-0000-4000-8000-000000000010',3),
 ('a4000000-0000-4000-8000-000000000021','a4000000-0000-4000-8000-000000000010',2),
 ('a4000000-0000-4000-8000-000000000022','a4000000-0000-4000-8000-000000000010',999);
update public.envios_pecas set destinatario_tipo='fornecedor' where numero='AUDIT-REPAIR';

-- Exercise actual database roles, not postgres with fake claims alone.
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.denied('select public.descontar_stock_peca(null,1)','42501','anon decrement');
select pg_temp.denied('select public.incrementar_stock_peca(null,1)','42501','anon increment');
select pg_temp.denied('select public.anular_envio_pecas(null)','42501','anon cancel');
select pg_temp.denied('select public.expedir_envio_pecas(null)','42501','anon dispatch');
select pg_temp.denied('select public.recalcular_reparacao_peca(null)','42501','anon recalculate');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select pg_temp.denied('select public.incrementar_stock_peca(null,1)','42501','authenticated without uid');
select set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000004","role":"authenticated","user_metadata":{"role":"admin"}}',true);
select pg_temp.denied('select public.descontar_stock_peca(null,1)','42501','unprovisioned decrement');
select pg_temp.denied('select public.incrementar_stock_peca(null,1)','42501','unprovisioned increment');
select pg_temp.denied('select public.anular_envio_pecas(null)','42501','unprovisioned cancel');
select pg_temp.denied('select public.expedir_envio_pecas(null)','42501','unprovisioned dispatch');
select pg_temp.denied('select public.recalcular_reparacao_peca(null)','42501','unprovisioned recalculate');

select set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',true);
select pg_temp.denied('select public.incrementar_stock_peca(null,1)','42501','anonymous sign-in with profile');
select set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.denied('select public.descontar_stock_peca(null,1)','22023','null part');
select pg_temp.denied('select public.incrementar_stock_peca(''a4000000-0000-4000-8000-000000000010'',null)','22023','null quantity');
select pg_temp.denied('select public.incrementar_stock_peca(''a4000000-0000-4000-8000-000000000010'',-1)','22023','negative increment');
select pg_temp.denied('select public.descontar_stock_peca(''a4000000-0000-4000-8000-000000000010'',0)','22023','zero decrement');
select pg_temp.denied('select public.descontar_stock_peca(''a4000000-0000-4000-8000-000000000010'',999)','22003','stock underflow');
select pg_temp.denied('select public.incrementar_stock_peca(''a4000000-0000-4000-8000-000000000099'',1)','P0002','missing part');
select public.incrementar_stock_peca('a4000000-0000-4000-8000-000000000010',2);
select public.descontar_stock_peca('a4000000-0000-4000-8000-000000000010',2);
select pg_temp.ok((select quantidade=10 from public.pecas where id='a4000000-0000-4000-8000-000000000010'),'standard valid stock operations');
select pg_temp.denied('select public.anular_envio_pecas(''a4000000-0000-4000-8000-000000000020'',''a4000000-0000-4000-8000-000000000001'')','42501','forged cancel actor');
select pg_temp.denied('select public.expedir_envio_pecas(''a4000000-0000-4000-8000-000000000020'',''a4000000-0000-4000-8000-000000000001'')','42501','forged dispatch actor');
select public.expedir_envio_pecas('a4000000-0000-4000-8000-000000000020',null,'FORGED NAME');
select pg_temp.ok((select quantidade=7 from public.pecas where id='a4000000-0000-4000-8000-000000000010'),'dispatch decrements once');
select pg_temp.ok((select user_id=auth.uid() and criado_por_nome='Audit Standard' from public.stock_movements where referencia_id='a4000000-0000-4000-8000-000000000020' and tipo='saida_ep'),'dispatch actor from profile');
select pg_temp.denied('select public.expedir_envio_pecas(''a4000000-0000-4000-8000-000000000020'')','P0001','duplicate dispatch rejected');
select public.anular_envio_pecas('a4000000-0000-4000-8000-000000000020',null,'FORGED NAME','audit');
select pg_temp.ok((select quantidade=10 from public.pecas where id='a4000000-0000-4000-8000-000000000010'),'cancel restores stock');
select pg_temp.ok((select count(*)=1 and bool_and(user_id=auth.uid() and criado_por_nome='Audit Standard') from public.stock_movements where referencia_id='a4000000-0000-4000-8000-000000000020' and tipo='reversao'),'single reversal with verified actor');
select pg_temp.denied('select public.anular_envio_pecas(''a4000000-0000-4000-8000-000000000020'')','P0001','duplicate cancel rejected');
select pg_temp.denied('select public.expedir_envio_pecas(''a4000000-0000-4000-8000-000000000020'')','P0001','cancelled dispatch rejected');
select pg_temp.denied('select public.expedir_envio_pecas(''a4000000-0000-4000-8000-000000000022'')','22003','insufficient dispatch rejected');
select pg_temp.ok((select estado='aberto' from public.envios_pecas where id='a4000000-0000-4000-8000-000000000022') and not exists(select 1 from public.stock_movements where referencia_id='a4000000-0000-4000-8000-000000000022'),'failed dispatch is atomic');
select public.expedir_envio_pecas('a4000000-0000-4000-8000-000000000021');
select pg_temp.ok((select quantidade=10 and quantidade_reparacao=2 from public.pecas where id='a4000000-0000-4000-8000-000000000010'),'repair preserves stock and counts repair');
select public.anular_envio_pecas('a4000000-0000-4000-8000-000000000021');
select pg_temp.ok((select quantidade=10 and quantidade_reparacao=0 from public.pecas where id='a4000000-0000-4000-8000-000000000010'),'repair cancel recalculates');

select set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.incrementar_stock_peca('a4000000-0000-4000-8000-000000000010',1);
select pg_temp.ok(public.is_staff(),'admin authorized');
select set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.incrementar_stock_peca('a4000000-0000-4000-8000-000000000010',1);
select pg_temp.ok((select quantidade=12 from public.pecas where id='a4000000-0000-4000-8000-000000000010'),'financeiro authorized');
reset role;
do $$ begin
  if (select count(*) from audit_results) <> 34 then raise exception 'Unexpected assertion count: %',(select count(*) from audit_results); end if;
end $$;
rollback;
select 'PASS: 34 security and regression assertions; all fixtures rolled back' as result;
