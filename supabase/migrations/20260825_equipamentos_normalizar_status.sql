-- Normaliza os status inconsistentes dos equipamentos para o conjunto canónico.
-- Corrige duplicados/erros; mantém intactos os estados próprios pedidos pela
-- Andreia (Olicargo, Carfatrans, A verificar, Consignação) e os que ela quer
-- rever à mão ("cliente devolveu", "Recolhido"). Não colapsa
-- "Enviado - cliente nao encontrado" (mantém a nuance).
update public.equipamentos set status = case
  when status = 'Envio' then 'Enviado'
  when status = 'Stock/Inventário' then 'Em stock'
  when status = 'Aluguer' then 'Aluguer nacional'
  when status in ('Em reparação ', 'Em reparação- Alugueres') then 'Em reparação'
  when status = 'Em tratamento- TEC' then 'Prep-Técnico'
  when status in ('Em preparação', 'Aguarda envio', 'Aguarda Envio') then 'Prep-Logística'
  else status end
where status in ('Envio', 'Stock/Inventário', 'Aluguer', 'Em reparação ',
  'Em reparação- Alugueres', 'Em tratamento- TEC', 'Em preparação', 'Aguarda envio', 'Aguarda Envio');
