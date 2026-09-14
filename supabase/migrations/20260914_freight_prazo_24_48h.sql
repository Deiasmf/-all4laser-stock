-- Cotações de Transporte: pedido de resposta com prazo de 24 a 48 horas.
-- Substitui APENAS a linha de prazo antiga ("Agradecemos resposta até
-- {{prazo_resposta}}." / "We would appreciate your reply by {{prazo_resposta}}.")
-- pela nova frase. Cirúrgico: se a linha já foi editada à mão, não há match e
-- o template fica intacto (só afeta os pedidos novos que usam o default).

update public.freight_email_templates
set corpo_template = replace(
      corpo_template,
      'Agradecemos resposta até {{prazo_resposta}}.',
      'Agradecemos o envio da vossa melhor cotação no prazo de 24 a 48 horas.'),
    updated_at = now()
where idioma = 'pt'
  and corpo_template like '%Agradecemos resposta até {{prazo_resposta}}.%';

update public.freight_email_templates
set corpo_template = replace(
      corpo_template,
      'We would appreciate your reply by {{prazo_resposta}}.',
      'We would appreciate receiving your best quotation within 24 to 48 hours.'),
    updated_at = now()
where idioma = 'en'
  and corpo_template like '%We would appreciate your reply by {{prazo_resposta}}.%';
