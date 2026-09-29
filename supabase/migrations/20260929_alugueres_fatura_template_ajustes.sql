-- Ajustes ao template da fatura de aluguer:
-- corpo passa a "Estimado(a) Cliente," (sem o nome do cliente).
-- (O {n_fatura} passa a mostrar só o número — feito no código, nFaturaDoNome.)

update public.alugueres_email_templates
set corpo_template = $corpo$Estimado(a) Cliente,

Segue em anexo a fatura n.º {n_fatura}, referente aos serviços prestados por ALL4LASER UNIPESSOAL LDA, emitida em {data_fatura}, no valor total de {valor_total} €.

Para qualquer esclarecimento, estamos ao dispor.

Com os melhores cumprimentos,
Dep. Financeiro da All4laser$corpo$,
    updated_at = now()
where chave = 'normal';
