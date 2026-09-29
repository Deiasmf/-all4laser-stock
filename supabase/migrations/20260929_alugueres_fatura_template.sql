-- Template único do email de envio de fatura de aluguer (PT).
-- Substitui o texto atual, passa a placeholders de chaveta simples e desliga a
-- assinatura do Gmail neste template (já fecha com a assinatura de departamento).
-- Remove o template "curto" (passa a existir só um).

alter table public.alugueres_email_templates
  add column if not exists incluir_assinatura boolean not null default true;

update public.alugueres_email_templates
set assunto_template = 'Fatura All4laser – {n_fatura} – {data_fatura}',
    corpo_template = $corpo$Estimado(a) Cliente, {nome_cliente}

Segue em anexo a fatura n.º {n_fatura}, referente aos serviços prestados por ALL4LASER UNIPESSOAL LDA, emitida em {data_fatura}, no valor total de {valor_total} €.

Para qualquer esclarecimento, estamos ao dispor.

Com os melhores cumprimentos,
Dep. Financeiro da All4laser$corpo$,
    incluir_assinatura = false,
    updated_at = now()
where chave = 'normal';

delete from public.alugueres_email_templates where chave = 'curto';
