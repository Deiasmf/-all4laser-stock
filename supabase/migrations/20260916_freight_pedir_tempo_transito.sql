-- ───────────────────────────────────────────────────────────────────────────
-- COTAÇÕES — pedir explicitamente o TEMPO DE TRÂNSITO no email ao transitário.
-- Alteração cirúrgica ao corpo do template (só troca a frase, se existir); não
-- sobrepõe personalizações que já não tenham a frase original.
-- ───────────────────────────────────────────────────────────────────────────
update public.freight_email_templates
  set corpo_template = replace(
    corpo_template,
    'a vossa melhor cotação no prazo de 24 a 48 horas',
    'a vossa melhor cotação, com indicação do tempo de trânsito estimado, no prazo de 24 a 48 horas'),
    updated_at = now()
  where idioma = 'pt' and corpo_template like '%a vossa melhor cotação no prazo de 24 a 48 horas%';

update public.freight_email_templates
  set corpo_template = replace(
    corpo_template,
    'your best quotation within 24 to 48 hours',
    'your best quotation, including the estimated transit time, within 24 to 48 hours'),
    updated_at = now()
  where idioma = 'en' and corpo_template like '%your best quotation within 24 to 48 hours%';
