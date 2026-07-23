-- ============================================================
-- Saldos de Peças (Fase B) — limpeza de variantes de nome de fornecedor
-- em reparacao_pecas, para os saldos deixarem de aparecer divididos.
-- Só variantes de grafia (maiúsculas/acentos/espaços) + erros confirmados
-- pela utilizadora. "David Casero" foi deixado separado de "David Calero".
-- ============================================================
update public.reparacao_pecas set fornecedor='Meditek'      where btrim(fornecedor) in ('Meditek','MEDITEK','Mediek');
update public.reparacao_pecas set fornecedor='Ivan'         where btrim(fornecedor) in ('Ivan','IVAN','îvan','Îvan');
update public.reparacao_pecas set fornecedor='MR-WEI'       where btrim(fornecedor) in ('MR- WEI','Mr- WEI','MR - WEI','Mr. WEI','Mr- Wei');
update public.reparacao_pecas set fornecedor='Attia'        where btrim(fornecedor) in ('Attia','Infinity Dubai- Attia');
update public.reparacao_pecas set fornecedor='Konstantinos' where btrim(fornecedor)='Konstantinos (copy)';
