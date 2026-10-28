-- Template do email de fatura de aluguer: remover o valor e a data do corpo e
-- do assunto. O valor sem IVA (valor_a_faturar) gerava confusão (o total com IVA
-- está na fatura) e o {data_fatura} usava o created_at da linha (data da projeção
-- do mês), não a data real de emissão. Passa a remeter para a fatura em anexo.

update public.alugueres_email_templates
set assunto_template = 'Fatura All4laser – {n_fatura}',
    corpo_template = $corpo$Estimado(a) Cliente,

Segue em anexo a fatura n.º {n_fatura}, referente aos serviços prestados por ALL4LASER UNIPESSOAL LDA, cujo valor total se encontra indicado no documento.

Para qualquer esclarecimento, estamos ao dispor.

Com os melhores cumprimentos,
Dep. Financeiro da All4laser$corpo$,
    updated_at = now()
where chave = 'normal';
