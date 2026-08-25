-- Revisão manual (Andreia): os 2 estados deixados de fora da normalização
-- automática passam a "Em stock".
update public.equipamentos set status = 'Em stock'
where status in ('cliente devolveu', 'Recolhido');
