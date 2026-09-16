-- ───────────────────────────────────────────────────────────────────────────
-- COTAÇÕES — o assunto do email de agradecimento passa a ser o assunto ORIGINAL
-- da cotação + este sufixo (para o transitário identificar o pedido). Por isso
-- o campo agrad_assunto passa a guardar SÓ o sufixo. Só troca os defaults
-- antigos, para não sobrepor personalizações.
-- ───────────────────────────────────────────────────────────────────────────
update public.freight_email_templates
  set agrad_assunto = 'Obrigado pela vossa cotação'
  where idioma = 'pt' and agrad_assunto = 'Pedido {{referencia}} — obrigado pela vossa cotação';

update public.freight_email_templates
  set agrad_assunto = 'Thank you for your quote'
  where idioma = 'en' and agrad_assunto = 'Request {{referencia}} — thank you for your quote';
