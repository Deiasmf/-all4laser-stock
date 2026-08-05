-- =====================================================================
-- Cotações de Transporte — Partes C/D/E: pedidos, envios, cotações
-- =====================================================================

-- Numeração COT-AAAA-NNNN -------------------------------------------
create table if not exists public.freight_numero_seq (
  ano  int  primary key,
  seq  int  not null default 0
);

create or replace function public.freight_next_numero()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_ano int := extract(year from now())::int; v_seq int;
begin
  insert into public.freight_numero_seq(ano, seq) values (v_ano, 1)
    on conflict (ano) do update set seq = public.freight_numero_seq.seq + 1
    returning seq into v_seq;
  return 'COT-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
end $$;

-- Pedido -------------------------------------------------------------
create table if not exists public.freight_quote_requests (
  id               uuid primary key default gen_random_uuid(),
  numero           text unique,
  estado           text not null default 'rascunho'
                     check (estado in ('rascunho','enviado','em_rececao','fechado','cancelado')),
  tipo_transporte  text not null
                     check (tipo_transporte in ('terrestre','aereo','maritimo','expresso')),
  -- Origem (pré-preenchida com a morada All4laser, editável)
  origem_nome      text default 'All4laser',
  origem_morada    text default 'Rua dos Caniços 31/33',
  origem_cp        text default '2625-253',
  origem_localidade text default 'Vialonga',
  origem_pais      text default 'Portugal',
  -- Destino
  destino_pais     text,
  destino_cidade_cp text,
  destino_morada   text,          -- opcional nesta fase
  -- Datas
  data_recolha     date,
  flexibilidade    text,
  -- Extras
  extra_paletizar  boolean not null default false,
  extra_seguro     boolean not null default false,
  extra_plataforma boolean not null default false,
  extra_urgente    boolean not null default false,
  observacoes      text,
  -- Email
  idioma           text not null default 'pt' check (idioma in ('pt','en')),
  assunto_email    text,          -- gerado, editável antes de enviar
  -- Fecho
  group_id         uuid references public.forwarder_groups(id) on delete set null,
  vencedor_forwarder_id uuid references public.freight_forwarders(id) on delete set null,
  fechado_em       timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Linhas de carga (snapshot das dimensões exteriores) ----------------
create table if not exists public.freight_quote_cargo_lines (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.freight_quote_requests(id) on delete cascade,
  box_id       uuid references public.standard_boxes(id) on delete set null, -- null = medidas manuais
  descricao    text,                 -- nome da caixa ou descrição livre
  ext_c        numeric not null, ext_l numeric not null, ext_a numeric not null, -- cm
  quantidade   int not null default 1 check (quantidade > 0),
  peso_volume  numeric,              -- kg por volume
  ordem        int not null default 0
);
create index if not exists idx_cargo_request on public.freight_quote_cargo_lines(request_id);

-- Destinatários / registo de envio ----------------------------------
create table if not exists public.freight_quote_recipients (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.freight_quote_requests(id) on delete cascade,
  forwarder_id   uuid references public.freight_forwarders(id) on delete set null,
  nome_empresa   text,               -- snapshot p/ histórico
  emails         text[] not null default '{}',  -- snapshot
  saudacao       text,               -- personalização
  estado         text not null default 'pendente'
                   check (estado in ('pendente','enviado','falhou')),
  tentativas     int not null default 0,
  erro           text,
  enviado_em     timestamptz,
  gmail_message_id text,
  gmail_thread_id  text,             -- Fase 2: associar respostas
  created_at     timestamptz not null default now()
);
create index if not exists idx_recip_request on public.freight_quote_recipients(request_id);

-- Cotações recebidas (registo manual) -------------------------------
create table if not exists public.freight_quotes (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.freight_quote_requests(id) on delete cascade,
  forwarder_id   uuid references public.freight_forwarders(id) on delete set null,
  recipient_id   uuid references public.freight_quote_recipients(id) on delete set null,
  valor          numeric,
  moeda          text not null default 'EUR',
  prazo_transito text,
  validade       date,
  notas          text,
  pdf_path       text,               -- Storage bucket freight-quotes
  escolhido      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists idx_quotes_request on public.freight_quotes(request_id);

-- Templates de email (editáveis na administração) --------------------
create table if not exists public.freight_email_templates (
  idioma           text primary key check (idioma in ('pt','en')),
  assunto_template text not null,
  corpo_template   text not null,     -- com placeholders {{...}}
  updated_at       timestamptz not null default now()
);

-- Configuração -------------------------------------------------------
create table if not exists public.freight_settings (
  id                integer primary key default 1 check (id = 1),
  dias_uteis_alerta int not null default 3,
  updated_at        timestamptz not null default now()
);
insert into public.freight_settings (id) values (1) on conflict do nothing;

-- RLS: admin + administrativo ---------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'freight_quote_requests','freight_quote_cargo_lines','freight_quote_recipients',
    'freight_quotes','freight_email_templates','freight_settings','freight_numero_seq'
  ] loop
    execute format('alter table public.%s enable row level security;', t);
    execute format(
      'create policy %1$s_rw on public.%1$s for all to authenticated
         using (public.has_administrativo_access())
         with check (public.has_administrativo_access());', t);
    execute format('grant select, insert, update, delete on public.%s to authenticated;', t);
  end loop;
end $$;

-- Seed dos templates (placeholders: {{saudacao}}, {{origem}}, {{destino}},
-- {{tabela_volumes}}, {{datas}}, {{extras}}, {{prazo_resposta}}) ------
insert into public.freight_email_templates (idioma, assunto_template, corpo_template) values
('pt',
 'All4laser - Pedido de cotação {{tipo}} - {{destino}}',
$corpo$Exmos. Senhores {{saudacao}},

Vimos por este meio solicitar cotação de transporte {{tipo}} para o seguinte:

Origem: {{origem}}
Destino: {{destino}}
Datas: {{datas}}

Volumes (dimensões exteriores em cm):
{{tabela_volumes}}

Extras: {{extras}}

Agradecemos resposta até {{prazo_resposta}}.

Com os melhores cumprimentos,
All4laser$corpo$),
('en',
 'All4laser - Freight quote request {{tipo}} - {{destino}}',
$corpo$Dear {{saudacao}},

We kindly request a {{tipo}} freight quotation for the following:

Origin: {{origem}}
Destination: {{destino}}
Dates: {{datas}}

Packages (outer dimensions in cm):
{{tabela_volumes}}

Extras: {{extras}}

We would appreciate your reply by {{prazo_resposta}}.

Best regards,
All4laser$corpo$)
on conflict (idioma) do nothing;

-- Bucket privado para PDFs das cotações ------------------------------
insert into storage.buckets (id, name, public)
values ('freight-quotes','freight-quotes', false)
on conflict (id) do nothing;

create policy freight_quotes_read on storage.objects for select to authenticated
  using (bucket_id = 'freight-quotes' and public.has_administrativo_access());
create policy freight_quotes_write on storage.objects for insert to authenticated
  with check (bucket_id = 'freight-quotes' and public.has_administrativo_access());
create policy freight_quotes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'freight-quotes' and public.has_administrativo_access());
