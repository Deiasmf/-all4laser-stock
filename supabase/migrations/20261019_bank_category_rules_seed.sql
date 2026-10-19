-- Seed das regras de categorização (Parte B), ALINHADAS com a taxonomia da análise
-- manual de 24 meses (folha "Movimentos Classificados"): BANCO, FORNECEDORES,
-- COMPRAS CARTAO, CLIENTES SEPA, CLIENTES INTL, DEBITOS DIRETOS, FINANCIAMENTO,
-- SALARIOS, ESTADO, SOCIO, CARTOES, INTERNO, OUTRO, OUTRAS ENTRADAS.
-- Primeira regra (por ordem) que bate ganha. Validadas contra os 8283 movimentos
-- classificados à mão: ~92,5% de acerto (o resto — sobretudo SOCIO — depende de
-- julgamento humano do comerciante e fica para revisão/manual).
-- NOTA: SOCIO não é regra-ável (o mesmo cartão serve empresa e sócio) → sem regra.

alter table public.bank_category_rules
  add column if not exists sentido text check (sentido in ('credito','debito'));

delete from public.bank_category_rules;
insert into public.bank_category_rules (ordem, campo, operador, sentido, padrao, categoria, rubrica, marcar_interna, nota) values
  (5,   'descritivo','contem', null,     'INTRABANCARIA',                             'INTERNO',          'Transferência entre contas', true,  'Transferência entre contas próprias (EUR↔USD)'),
  (10,  'ambos',     'regex',  null,     'REMUNERA[CÇ][AÃ]O\s+(.+)',                 'SALARIOS',         '$1',                  false, 'Remuneração <nome>'),
  (20,  'descritivo','contem', 'debito', 'COBRANCA TSU',                              'ESTADO',           'Segurança Social (TSU)', false, null),
  (30,  'descritivo','contem', 'debito', 'PAGAMENTO AO ESTADO',                       'ESTADO',           'Autoridade Tributária',  false, null),
  (40,  'descritivo','contem', 'debito', 'AMORTIZACAO DE CAPITAL',                    'FINANCIAMENTO',    'Amortização de capital', false, null),
  (50,  'descritivo','contem', 'debito', 'JUROS DE EMPRESTIMO',                       'FINANCIAMENTO',    'Juros de empréstimo',    false, null),
  (60,  'descritivo','regex',  'debito', '^(\d{8,})',                                'FINANCIAMENTO',    'Leasing/renda BPI $1',   false, 'Descritivo só numérico = contrato'),
  (70,  'descritivo','regex',  'debito', '^DD\s+(.+)',                               'DEBITOS DIRETOS',  '$1',                  false, 'Débito direto da entidade'),
  (80,  'descritivo','regex',  'debito', 'COBR\.?\s*SEPA\s+(.+)',                    'DEBITOS DIRETOS',  '$1',                  false, null),
  (90,  'descritivo','regex',  'debito', 'COMPRA EL-E\s+\S+\s+(.+)',                 'COMPRAS CARTAO',   '$1',                  false, 'Compra com cartão'),
  (95,  'descritivo','contem', 'debito', 'LEV. ATM',                                 'OUTRO',            'Levantamento ATM',       false, null),
  (100, 'descritivo','comeca', 'debito', 'PAGAMENTO A.0546829',                      'CARTOES',          'Andreia',             false, null),
  (110, 'descritivo','comeca', 'debito', 'PAGAMENTO A.0546828',                      'CARTOES',          'Sara',                false, null),
  (120, 'descritivo','contem', 'debito', 'PAG.AUT.CARTAO BPI',                       'CARTOES',          'Cartão BPI',          false, null),
  (130, 'descritivo','contem', 'debito', 'COMISS',                                   'BANCO',            'Comissões',           false, null),
  (140, 'descritivo','contem', 'debito', 'IMPOSTO DO SELO',                          'BANCO',            'Imposto de selo',     false, null),
  (145, 'descritivo','contem', 'debito', 'IMPOSTO SELO',                             'BANCO',            'Imposto de selo',     false, null),
  (148, 'descritivo','contem', 'debito', 'IMPOSTO',                                  'BANCO',            'Impostos',            false, null),
  (150, 'descritivo','contem', 'debito', 'SELO/IVA',                                 'BANCO',            'Imposto de selo',     false, null),
  (160, 'descritivo','contem', 'debito', 'DESPESAS DE PORTES',                       'BANCO',            'Portes',              false, null),
  (170, 'descritivo','contem', 'debito', 'MANUTENCAO',                               'BANCO',            'Manutenção de conta', false, null),
  (180, 'descritivo','contem', 'debito', 'JUROS DEVEDORES',                          'BANCO',            'Juros devedores',     false, null),
  (190, 'descritivo','regex',  'credito','TRF.*\sDE\s+(.+)',                         'CLIENTES SEPA',    '$1',                  false, 'Recebimento de cliente (SEPA)'),
  (200, 'descritivo','regex',  'credito','RECEBIDA\s+\d+\s+(.+)',                    'CLIENTES INTL',    '$1',                  false, 'Recebimento internacional'),
  (205, 'descritivo','regex',  'debito', 'EMITIDA\s+\d+\s+(.+)',                     'FORNECEDORES',     '$OBS',                false, 'Pagamento internacional emitido'),
  (210, 'descritivo','regex',  'debito', 'PAGSERV\s+([A-Za-z][A-Za-z].*?)(?:\s+\d|$)','FORNECEDORES',    '$1',                  false, null),
  (220, 'descritivo','contem', 'debito', 'PAGSERV',                                  'FORNECEDORES',     '$OBS',                false, null),
  (230, 'descritivo','contem', 'debito', 'CHEQUE A COBRANCA',                        'OUTRAS ENTRADAS',  'Cheque a cobrança',   false, null),
  (231, 'descritivo','contem', 'debito', 'CHEQUE',                                   'FORNECEDORES',     '$OBS',                false, null),
  (235, 'descritivo','contem', 'credito','DEPOSITO EM NUMERARIO',                    'OUTRAS ENTRADAS',  'Depósitos em numerário', false, null),
  (236, 'descritivo','contem', 'credito','VENDAS EM TPA',                            'OUTRAS ENTRADAS',  'Vendas TPA',          false, null),
  (237, 'descritivo','contem', 'credito','VENDA DE NOTAS',                           'OUTRAS ENTRADAS',  'Venda de notas estrangeiras', false, null),
  (239, 'descritivo','contem', 'credito','CRE.DIV',                                  'OUTRAS ENTRADAS',  'Crédito diverso',     false, null),
  (240, 'descritivo','contem', 'debito', ' P/ ',                                     'FORNECEDORES',     '$OBS',                false, 'Pagamento emitido (TRF P/ ...)'),
  (245, 'descritivo','contem', null,     'DEV OPE',                                  'OUTRO',            'Devoluções/estornos', false, null);
