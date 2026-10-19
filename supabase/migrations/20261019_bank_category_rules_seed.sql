-- Seed das regras de categorização (Parte B, ponto 6), derivadas do vocabulário
-- REAL do extrato BPI. Primeira regra (por ordem) que bate ganha. As regras de
-- cliente têm guarda de sentido=credito (o mesmo "TRF CR SEPA+" serve recebimentos
-- "… DE <nome>" e pagamentos "… P/ <iban>"). Heurística: o import classificado
-- ("Movimentos Classificados") é a autoridade e corrige/aumenta isto.

alter table public.bank_category_rules
  add column if not exists sentido text check (sentido in ('credito','debito'));

insert into public.bank_category_rules (ordem, campo, operador, sentido, padrao, categoria, rubrica, marcar_interna, nota)
select * from (values
  (10,  'ambos',      'regex', null,       'REMUNERA[CÇ][AÃ]O\s+(.+)',       'Salários',        '$1',                  false, 'Remuneração <nome> (Observações ou descritivo)'),
  (20,  'descritivo', 'contem','debito',   'COBRANCA TSU',                             'Estado',           'Segurança Social (TSU)',  false, null),
  (30,  'descritivo', 'contem','debito',   'PAGAMENTO AO ESTADO',                      'Estado',           'Autoridade Tributária',    false, null),
  (40,  'descritivo', 'contem','debito',   'AMORTIZACAO DE CAPITAL',                   'Financiamentos',   'Amortização de capital',    false, null),
  (50,  'descritivo', 'contem','debito',   'JUROS DE EMPRESTIMO',                      'Financiamentos',   'Juros de empréstimo',      false, null),
  (60,  'descritivo', 'regex', 'debito',   '^(\d{8,})',                               'Financiamentos',   'Leasing/renda BPI $1',false, 'Descritivo só numérico = n.º de contrato (opc. matrícula)'),
  (70,  'descritivo', 'regex', 'debito',   '^DD\s+(.+)',                              'Débitos diretos', '$1',                  false, 'Débito direto da entidade'),
  (80,  'descritivo', 'regex', 'debito',   'COBR\.?\s*SEPA\s+(.+)',                   'Débitos diretos', '$1',                  false, null),
  (90,  'descritivo', 'regex', 'debito',   'COMPRA EL-E\s+\S+\s+(.+)',                'Compras cartão',  '$1',                  false, 'Compra com cartão (comerciante)'),
  (100, 'descritivo', 'comeca','debito',   'PAGAMENTO A.0546829',                      'Cartão de crédito','Andreia',           false, null),
  (110, 'descritivo', 'comeca','debito',   'PAGAMENTO A.0546828',                      'Cartão de crédito','Sara',              false, null),
  (120, 'descritivo', 'contem','debito',   'PAG.AUT.CARTAO BPI',                       'Cartão de crédito','Cartão BPI',        false, null),
  (130, 'descritivo', 'contem','debito',   'COMISS',                                   'Banca',            'Comissões',            false, null),
  (140, 'descritivo', 'contem','debito',   'IMPOSTO DO SELO',                          'Banca',            'Imposto de selo',     false, null),
  (145, 'descritivo', 'contem','debito',   'IMPOSTO SELO',                             'Banca',            'Imposto de selo',     false, null),
  (150, 'descritivo', 'contem','debito',   'SELO/IVA',                                 'Banca',            'Imposto de selo',     false, null),
  (160, 'descritivo', 'contem','debito',   'DESPESAS DE PORTES',                       'Banca',            'Portes',              false, null),
  (170, 'descritivo', 'contem','debito',   'MANUTENCAO',                               'Banca',            'Manutenção de conta',    false, null),
  (180, 'descritivo', 'contem','debito',   'JUROS DEVEDORES',                          'Banca',            'Juros devedores',     false, null),
  (190, 'descritivo', 'regex', 'credito',  'TRF.*\sDE\s+(.+)',                        'Clientes',         '$1',                  false, 'Recebimento de cliente (SEPA)'),
  (200, 'descritivo', 'regex', 'credito',  'RECEBIDA\s+\d+\s+(.+)',                   'Clientes',         '$1',                  false, 'Recebimento internacional (não-SEPA)'),
  (210, 'descritivo', 'regex', 'debito',   'PAGSERV\s+([A-Za-z][A-Za-z].*?)(?:\s+\d|$)','Fornecedores',   '$1',                  false, null),
  (220, 'descritivo', 'contem','debito',   'PAGSERV',                                  'Fornecedores',     '$OBS',                false, 'PAGSERV sem nome no descritivo → nome nas Observações'),
  (230, 'descritivo', 'contem','debito',   'CHEQUE',                                   'Fornecedores',     '$OBS',                false, 'Fornecedor pela 1.ª palavra das Observações'),
  (240, 'descritivo', 'contem','debito',   ' P/ ',                                     'Fornecedores',     '$OBS',                false, 'Pagamento emitido (TRF P/ ...)'),
  (148, 'descritivo', 'contem','debito',   'IMPOSTO',                                  'Banca',            'Impostos',            false, 'Impostos diversos (selo, etc.)'),
  (205, 'descritivo', 'regex', 'debito',   'EMITIDA\s+\d+\s+(.+)',                    'Fornecedores',     '$OBS',                false, 'Pagamento internacional emitido (fornecedor nas Observações)')
) as v(ordem, campo, operador, sentido, padrao, categoria, rubrica, marcar_interna, nota)
where not exists (select 1 from public.bank_category_rules);
