# Módulo Marketing e Publicações — All4laser App

**Aplicação-alvo:** https://app.all4laser.com  
**Objetivo deste ficheiro:** briefing executável para o Claude Code integrar um módulo de planeamento, aprovação, programação, publicação e análise de conteúdos na aplicação All4laser existente.  
**Data:** 4 de setembro de 2026  
**Responsável funcional:** Andreia Fernandes — Direção Geral/CEO

---

## Instrução principal para o Claude Code

Lê este documento integralmente antes de alterar qualquer ficheiro.

Integra o módulo na aplicação existente. Não cries uma aplicação paralela, um protótipo isolado ou um segundo sistema de autenticação. Reutiliza a arquitetura, a stack, a base de dados, os componentes visuais, as permissões, os padrões de código, os testes e o processo de deployment já existentes.

Antes de programar:

1. Inspeciona o repositório e lê todos os ficheiros de instruções, incluindo `CLAUDE.md`, `README`, manifests, configuração, migrations e documentação técnica.
2. Identifica frontend, backend, base de dados/ORM, autenticação, sistema de permissões, armazenamento de ficheiros, jobs/cron/queues, testes e deployment.
3. Localiza entidades existentes que possam ser reutilizadas: utilizadores, colaboradores, equipamentos, marcas, clientes, países/mercados, ficheiros, notificações e audit logs.
4. Confirma como a navegação e o design system da aplicação estão construídos.
5. Regista as conclusões num ficheiro `docs/marketing-publications-implementation-plan.md`.
6. Implementa por pequenas etapas verificáveis, sem alterar funcionalidades não relacionadas.

Se o projeto já tiver uma solução equivalente para algum requisito, reutiliza-a. Não introduzas frameworks, bases de dados, autenticação, filas ou bibliotecas redundantes. Nunca faças uma migração destrutiva nem apagues dados existentes.

---

## 1. Visão do módulo

Criar um **Marketing Hub All4laser** dentro da aplicação, acessível através de uma nova entrada principal de navegação chamada **Marketing**.

O módulo deve ser a fonte central de verdade para:

- planeamento editorial;
- criação e adaptação de conteúdos por plataforma;
- gestão de imagens, vídeos e ligações Canva;
- revisão e aprovação;
- programação por data, hora e mercado;
- publicação orgânica em Facebook, Instagram e LinkedIn;
- identificação de publicações candidatas a promoção paga;
- controlo separado de aprovação de orçamento;
- recolha de métricas e relatórios;
- histórico e auditoria de todas as ações.

Um conteúdo editorial pode originar várias versões. Exemplo: a mesma campanha sobre o Lumenis M22 pode ter uma versão para Instagram em português, outra para Facebook em português e outra para LinkedIn em inglês, com textos, formatos, imagens, CTA e horários diferentes.

---

## 2. Princípios obrigatórios

### 2.1 Integração na aplicação existente

- Usar o login e os utilizadores atuais.
- Usar a navegação, layout, cores, tipografia e componentes atuais.
- Usar o padrão de API e de acesso à base de dados já adotado.
- Reutilizar as tabelas de equipamentos, marcas, utilizadores e mercados, se existirem.
- Não duplicar informação já existente noutra área da aplicação.
- Implementar tudo de forma responsiva para desktop, tablet e telemóvel.

### 2.2 Segurança operacional

- Nenhuma publicação pode ser enviada para uma rede social sem estar aprovada.
- Nenhuma campanha paga pode ser ativada nem receber orçamento automaticamente.
- Qualquer ação de publicação, alteração de horário, aprovação, cancelamento ou tentativa falhada deve ficar registada.
- Ligações sociais usam OAuth e tokens; nunca guardar palavras-passe das redes sociais.
- Tokens e segredos devem ficar cifrados no servidor e nunca expostos no frontend, logs ou repositório.
- A publicação automática deve poder ser desativada através de feature flag.

### 2.3 Critérios All4laser

A comunicação deve ser premium, técnica, credível, clara, comercial e próxima.

O sistema deve ajudar a impedir:

- alegações clínicas garantidas;
- certificações, especificações, preços, stock ou garantias não confirmados;
- utilização de logótipos não oficiais;
- afirmações de representação ou exclusividade de fabricante sem validação;
- utilização de imagens de pessoas sem direitos ou consentimento;
- publicação num país sem confirmação de adequação da oferta;
- mistura pouco clara entre venda, aluguer, assistência técnica e formação.

---

## 3. Estrutura de navegação

Adicionar a secção **Marketing** com as seguintes páginas:

1. **Dashboard**
2. **Calendário**
3. **Publicações**
4. **Campanhas**
5. **Biblioteca**
6. **Relatórios**
7. **Configurações**

Se a navegação existente não comportar submenus, adaptar estes destinos ao padrão atual sem criar uma experiência visual diferente do resto da aplicação.

---

## 4. Dashboard

Apresentar uma visão operacional simples e útil:

- publicações agendadas para os próximos 7 e 30 dias;
- conteúdos a aguardar revisão;
- conteúdos a aguardar aprovação final;
- publicações programadas, publicadas e falhadas;
- alertas de ligação/token das redes sociais;
- campanhas ativas no calendário;
- publicações candidatas a promoção paga;
- resultados do mês: alcance, impressões, engagement, cliques e leads;
- comparação com o período anterior, quando houver dados suficientes;
- atalhos: **Nova publicação**, **Nova campanha**, **Importar calendário** e **Ligar rede social**.

Não apresentar percentagens de evolução quando não existir uma base de comparação válida. Nesses casos mostrar “Dados insuficientes”.

---

## 5. Calendário editorial

Criar vistas mensal, semanal e em lista.

### Funcionalidades

- Mostrar uma publicação por cartão, com plataforma, horário, mercado, idioma, estado e campanha.
- Permitir filtrar por plataforma, conta, estado, campanha, linha de negócio, equipamento, mercado, idioma e orgânico/pago.
- Usar cores consistentes por plataforma e indicadores adicionais para estado; não depender apenas da cor para comunicar informação.
- Abrir o detalhe da publicação ao clicar no cartão.
- Permitir duplicar uma publicação.
- Permitir mover uma publicação por drag-and-drop.
- Antes de reagendar uma publicação já aprovada ou programada, pedir confirmação e registar a alteração.
- Impedir conflitos ou duplicações acidentais para a mesma conta/data, mostrando um aviso não bloqueante quando for apenas uma possível sobreposição.
- Mostrar horários em `Europe/Lisbon`, mas guardar datas na base de dados em UTC.
- Suportar outros fusos horários por mercado no futuro.

---

## 6. Publicações e versões por plataforma

### 6.1 Entidade editorial principal

Cada publicação deve conter:

- título interno;
- campanha associada, opcional;
- linha de negócio: `Venda`, `Aluguer`, `Assistência Técnica`, `Formação` ou `Institucional`;
- objetivo: `Notoriedade`, `Educação`, `Prova`, `Captação`, `Conversão` ou `Retenção`;
- mercado ou mercados;
- idioma base;
- equipamento ou equipamentos associados;
- público-alvo;
- responsável;
- prioridade;
- notas internas;
- ligação ao design no Canva, opcional;
- anexos e media aprovados;
- estratégia de promoção: `Orgânica`, `Candidata a paga` ou `Paga aprovada`;
- checklist de conformidade;
- estado global.

Os equipamentos devem ser selecionados a partir do catálogo existente da app, identificados por **marca e modelo**. Deve ser possível associar mais do que um equipamento à mesma publicação.

### 6.2 Versão por plataforma

Cada publicação pode ter uma ou mais variantes independentes para:

- Instagram Feed;
- Instagram Story;
- Instagram Reel;
- Facebook;
- LinkedIn.

Cada variante deve permitir:

- conta/página de destino;
- idioma;
- texto/caption;
- título, quando aplicável;
- CTA;
- URL de destino;
- parâmetros UTM;
- hashtags;
- primeiro comentário, quando suportado;
- texto alternativo/acessibilidade;
- formato: imagem, carrossel, vídeo, Reel, Story, documento ou texto;
- media e respetiva ordem;
- data e hora próprias;
- estado próprio;
- pré-visualização aproximada por plataforma;
- validação dos limites técnicos da plataforma antes da aprovação.

Não assumir que o mesmo texto, formato ou horário deve ser usado em todas as redes.

### 6.3 Estados

Implementar uma máquina de estados consistente:

`IDEA` → `DRAFT` → `IN_REVIEW` → `APPROVED` → `SCHEDULED` → `PUBLISHING` → `PUBLISHED`

Estados adicionais:

- `CHANGES_REQUESTED`
- `FAILED`
- `CANCELLED`
- `ARCHIVED`

Regras:

- apenas conteúdos completos podem entrar em revisão;
- apenas utilizadores autorizados podem aprovar;
- apenas variantes aprovadas podem ser programadas;
- editar copy, media, CTA, mercado ou data depois da aprovação invalida a aprovação e devolve a variante a revisão;
- alterações puramente internas, sem impacto no conteúdo publicado, não invalidam a aprovação;
- conteúdos publicados não são reescritos; uma correção deve criar uma revisão ou nova publicação, de acordo com a capacidade da plataforma.

---

## 7. Checklist de conformidade

Antes da aprovação final, mostrar uma checklist adaptada ao conteúdo:

- marca e modelo do equipamento confirmados;
- fotografia corresponde ao equipamento referido;
- direito de utilização da imagem confirmado;
- logótipo oficial All4laser utilizado;
- texto revisto no idioma selecionado;
- mercado e público confirmados;
- stock e disponibilidade confirmados, quando mencionados;
- preço, moeda, impostos e condições confirmados, quando mencionados;
- garantia e formação confirmadas, quando mencionadas;
- especificações e certificações confirmadas, quando mencionadas;
- alegações clínicas revistas;
- CTA e contacto corretos;
- autorização/consentimento para imagens de pessoas confirmado;
- QR code e URL testados, quando aplicável.

Guardar quem marcou cada item e quando. Itens relevantes não confirmados devem bloquear a aprovação; itens não aplicáveis podem ser assinalados como tal com justificação.

---

## 8. Campanhas

Uma campanha agrupa publicações relacionadas e deve conter:

- nome;
- objetivo comercial;
- linha de negócio;
- oferta;
- equipamentos;
- mercados;
- públicos;
- datas de início e fim;
- idiomas;
- canais;
- landing page ou contacto;
- KPI principal e KPIs secundários;
- responsável;
- estado;
- notas e documentação.

Exemplos de tipos de campanha:

- aluguer nacional;
- aluguer internacional;
- venda de equipamento recondicionado com garantia;
- assistência técnica;
- formação;
- institucional/prova de capacidade.

Não preencher automaticamente disponibilidade, garantia, condições comerciais, certificações ou resultados clínicos. Estes elementos dependem sempre de dados confirmados.

---

## 9. Publicidade paga e aprovação de orçamento

Separar claramente “publicação orgânica” de “campanha paga”.

### MVP obrigatório

- permitir marcar uma publicação como **candidata a promoção paga**;
- registar motivo da recomendação;
- definir objetivo sugerido: alcance, tráfego, leads ou conversão;
- indicar mercado, público, período e orçamento proposto;
- exigir aprovação explícita de um utilizador com permissão de orçamento;
- guardar data, aprovador, valor e observações;
- permitir anexar o ID ou URL da campanha criada no gestor de anúncios;
- apresentar resultados pagos separadamente dos orgânicos.

### Limite obrigatório

Nesta primeira implementação, **não criar, ativar, editar ou aumentar campanhas e orçamentos automaticamente** nas plataformas publicitárias. A classificação “Paga aprovada” significa apenas que existe autorização interna; a ativação continua manual no Meta Ads Manager ou LinkedIn Campaign Manager.

Qualquer integração futura com APIs de publicidade deve ser um projeto separado e exigir nova aprovação funcional e técnica.

---

## 10. Biblioteca de conteúdos

Criar uma biblioteca para imagens, vídeos, documentos e ligações Canva.

### Campos e funções

- nome interno;
- tipo de ficheiro;
- thumbnail;
- marca/modelo de equipamento associado;
- campanha associada;
- mercado e idioma;
- origem;
- autor/proprietário;
- direitos de utilização;
- data de validade dos direitos, quando aplicável;
- versão;
- data de upload;
- quem carregou;
- etiquetas;
- pesquisa e filtros;
- deteção de duplicados por hash, se compatível com a stack;
- estado: rascunho, aprovado, expirado ou arquivado.

### Canva

No MVP:

- permitir guardar a URL editável do design Canva;
- permitir carregar o ficheiro final exportado;
- guardar notas de versão;
- não fazer scraping do Canva;
- não assumir que uma alteração no Canva atualiza automaticamente o ficheiro já aprovado.

Deixar uma interface/adaptador preparado para uma futura integração oficial com a API do Canva, sem tornar essa integração obrigatória para concluir o MVP.

---

## 11. Integrações com redes sociais

Criar uma abstração de provider para evitar lógica específica espalhada pelo módulo.

Interface conceptual, adaptada à linguagem e arquitetura existentes:

```text
SocialProvider
  connect()
  handleOAuthCallback()
  refreshOrValidateToken()
  validateContent()
  publish()
  fetchPublicationStatus()
  fetchMetrics()
  disconnect()
```

Providers previstos:

- `MetaInstagramProvider`
- `MetaFacebookProvider`
- `LinkedInProvider`

### Regras

- Usar apenas APIs oficiais e versões suportadas.
- Nunca publicar por scraping, automação de browser ou credenciais de utilizador.
- Guardar IDs externos da conta, página, publicação e media.
- Validar formatos, dimensões, tamanhos e limites antes de programar.
- Tratar capacidades diferentes por plataforma e tipo de publicação.
- Mostrar erros das APIs em linguagem compreensível, mantendo o payload técnico apenas em logs protegidos.
- Implementar reconexão quando um token expirar ou for revogado.
- Não hardcodear versões de API em vários locais; centralizar a configuração.

Documentação oficial de referência:

- Instagram Content Publishing: https://developers.facebook.com/documentation/instagram-platform/content-publishing
- Facebook Pages API — Posts: https://developers.facebook.com/documentation/pages-api/posts
- LinkedIn Posts API: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api

As permissões e versões devem ser confirmadas na documentação oficial no momento da implementação e registadas em `docs/social-integrations.md`.

---

## 12. Motor de programação

Usar o sistema de jobs/queue/cron existente. Se não existir, escolher a opção mais simples e compatível com o deployment atual e justificar a decisão no plano técnico.

### Requisitos

- procurar variantes aprovadas e vencidas para publicação com intervalo máximo de 5 minutos;
- reclamar cada job de forma atómica, impedindo dupla publicação;
- usar uma chave de idempotência por tentativa/publicação;
- respeitar UTC na persistência e timezone na interface;
- validar novamente conta, token, aprovação e media imediatamente antes de publicar;
- registar início, fim, resposta, ID externo e erro;
- até 3 tentativas automáticas para erros transitórios, com backoff;
- não repetir automaticamente erros permanentes de validação ou autorização;
- permitir nova tentativa manual por utilizador autorizado;
- notificar responsáveis quando uma publicação falha;
- permitir pausar globalmente a publicação automática;
- permitir cancelar uma publicação futura sem eliminar o respetivo histórico.

Garantir que reinícios, deploys ou múltiplas instâncias da aplicação não causam publicações duplicadas.

---

## 13. Métricas e relatórios

Guardar métricas normalizadas, mas preservar também a referência aos dados originais da plataforma quando isso for seguro e necessário para diagnóstico.

### Métricas mínimas

- alcance;
- impressões;
- gostos/reações;
- comentários;
- partilhas;
- guardados, quando disponíveis;
- visualizações de vídeo;
- cliques;
- engagement total;
- taxa de engagement;
- leads atribuídos;
- custo, apenas quando inserido/importado e aprovado;
- CPL, quando existirem custo e leads válidos.

### Análises

- por plataforma;
- por conta;
- por publicação;
- por campanha;
- por equipamento;
- por linha de negócio;
- por mercado;
- por idioma;
- por formato;
- por dia da semana e horário;
- orgânico versus pago.

Não declarar automaticamente um “melhor horário” com amostra insuficiente. Definir no código um limiar configurável e mostrar o tamanho da amostra usado. Até existir histórico suficiente, apresentar horários como recomendações editoriais, não como conclusões estatísticas.

Permitir exportação de relatórios em CSV/XLSX usando as bibliotecas e padrões já presentes no projeto. Se o projeto já suportar PDF, permitir também PDF sem introduzir uma nova stack exclusivamente para isso.

---

## 14. Modelo lógico de dados

Adaptar os nomes e relações às convenções existentes. O modelo mínimo deve representar:

| Entidade | Finalidade |
|---|---|
| `marketing_campaigns` | Campanhas editoriais/comerciais |
| `social_posts` | Conteúdo editorial principal |
| `social_post_variants` | Versão por plataforma, conta e idioma |
| `social_accounts` | Ligações OAuth às contas/páginas |
| `media_assets` | Biblioteca de imagens, vídeos e documentos |
| `social_post_media` | Ordem e associação de media a variantes |
| `publication_schedules` | Data/hora e controlo do agendamento |
| `publication_attempts` | Tentativas, respostas e erros de publicação |
| `publication_metrics` | Snapshots de métricas por data |
| `post_approvals` | Revisões e aprovações |
| `compliance_checks` | Checklist e evidência de validação |
| `paid_promotion_proposals` | Recomendação, orçamento e aprovação interna |
| `post_equipment` | Relação com um ou vários equipamentos |

Reutilizar entidades existentes para utilizadores, equipamentos, marcas, países, notificações e auditoria.

### Requisitos transversais

- IDs e timestamps conforme convenções do projeto;
- soft delete quando o projeto já o utilizar;
- created/updated by;
- índices para estado, data programada, plataforma, campanha e conta;
- constraints para evitar publicações duplicadas;
- migrations reversíveis;
- dados históricos preservados;
- relações e cascades conservadoras: nunca apagar publicações ou métricas ao remover uma campanha ou ligação social.

---

## 15. Papéis e permissões

Integrar com RBAC/permissões existentes. Capacidades necessárias:

| Papel funcional | Capacidades |
|---|---|
| Leitor | Consultar calendário, publicações e relatórios |
| Editor de Marketing | Criar e editar rascunhos, carregar media |
| Revisor | Comentar, pedir alterações e validar checklist |
| Aprovador | Aprovar conteúdo para publicação |
| Publicador | Programar, cancelar e repetir tentativas |
| Aprovador de Orçamento | Aprovar propostas de promoção paga |
| Administrador | Ligar contas, gerir permissões e configurações |

Um utilizador pode acumular capacidades. Não criar um sistema de utilizadores separado.

Por defeito, permissões de publicação e orçamento devem ser restritas. O sistema deve registar utilizador, data/hora e alteração realizada.

---

## 16. Notificações

Usar o sistema de notificações já existente. Eventos mínimos:

- conteúdo enviado para revisão;
- alterações pedidas;
- conteúdo aprovado;
- publicação agendada;
- publicação concluída;
- publicação falhada;
- token prestes a expirar ou ligação perdida;
- proposta de promoção paga a aguardar aprovação;
- calendário dos próximos 7 dias com lacunas, opcional e configurável.

Evitar notificações duplicadas ou excessivas. Permitir preferências por utilizador se já existir um mecanismo equivalente.

---

## 17. Importação do plano setembro–dezembro

Criar um importador CSV/XLSX, ou reutilizar o importador existente, para carregar o calendário editorial já preparado.

### Colunas suportadas

- data;
- hora;
- plataforma;
- título interno;
- tema;
- linha de negócio;
- objetivo;
- marca;
- modelo;
- mercado;
- idioma;
- formato;
- copy;
- CTA;
- URL;
- hashtags;
- link Canva;
- orgânico/pago;
- orçamento proposto;
- notas.

Antes de gravar:

- apresentar pré-visualização;
- validar datas, plataformas, equipamentos e campos obrigatórios;
- assinalar linhas inválidas com motivo;
- permitir importar apenas linhas válidas;
- evitar duplicações através de uma chave de importação;
- produzir um resumo final de criados, atualizados, ignorados e falhados.

Não publicar nem aprovar automaticamente conteúdos importados. Devem entrar como `DRAFT` ou `IN_REVIEW`, conforme configuração explícita.

---

## 18. Interface e experiência visual

- Respeitar integralmente o design system da app All4laser.
- Aspeto clean, claro, sofisticado e profissional.
- Usar fundo branco/cinzento-claro e apontamentos das cores oficiais já configuradas na aplicação.
- Não inventar novas cores ou fontes de marca.
- Hierarquia visual simples e legível.
- Estados, erros e ações críticas claramente identificados.
- Confirmação explícita para cancelar, reagendar ou publicar imediatamente.
- Tabelas com paginação, pesquisa, filtros persistentes e estados vazios úteis.
- Formulários divididos em passos ou secções, evitando páginas excessivamente longas.
- Garantir navegação por teclado, labels, contraste e texto alternativo.

---

## 19. Segurança, privacidade e conformidade

- Não recolher dados clínicos nem dados de pacientes neste módulo.
- Aplicar princípio de menor privilégio.
- Cifrar tokens OAuth e segredos em repouso.
- Nunca enviar segredos para o browser.
- Sanitizar copy, URLs, nomes de ficheiro e uploads.
- Validar MIME type e tamanho real dos ficheiros.
- Utilizar armazenamento privado e URLs temporárias, de acordo com o padrão existente.
- Proteger callbacks OAuth contra CSRF/state mismatch.
- Implementar rate limiting nas ações sensíveis.
- Não incluir payloads com tokens nos logs.
- Definir política de retenção para logs técnicos e métricas.
- Registar consentimento/direitos de utilização de imagens de pessoas.
- Manter audit trail de aprovações e alterações.

---

## 20. API interna e separação de responsabilidades

Seguir a arquitetura existente, mantendo separação entre:

- regras de negócio;
- persistência;
- providers externos;
- scheduler/jobs;
- interface/API;
- apresentação.

Evitar que componentes do frontend chamem diretamente as redes sociais. Todas as operações externas devem ocorrer no servidor.

Operações conceptuais necessárias:

- CRUD de campanhas;
- CRUD de publicações e variantes;
- upload/associação de media;
- submissão, pedido de alterações e aprovação;
- programação, reagendamento e cancelamento;
- ligação/desligação de contas;
- publicação imediata apenas para variantes aprovadas e com confirmação adicional;
- repetição manual de tentativa falhada;
- sincronização de métricas;
- importação e exportação;
- consulta do audit trail.

Aplicar validação e autorização no backend, mesmo quando o frontend já esconde ou desativa uma ação.

---

## 21. Testes obrigatórios

### Unitários

- transições de estado;
- invalidação de aprovação após alteração material;
- permissões;
- cálculo de engagement e CPL;
- conversão timezone/UTC;
- validações de conteúdo e media;
- idempotência;
- regras de aprovação paga.

### Integração

- criar publicação com várias variantes;
- submeter, rever, aprovar e programar;
- scheduler reclama um job uma única vez;
- sucesso e erro de cada provider através de mocks/fakes;
- retries apenas para erros transitórios;
- expiração/revogação de token;
- recolha de métricas;
- importação com linhas válidas, inválidas e duplicadas;
- audit log completo.

### End-to-end

- fluxo Editor → Revisor → Aprovador → Publicador;
- publicação multicanal com horários diferentes;
- reagendamento que invalida a aprovação quando aplicável;
- falha de publicação e nova tentativa manual;
- proposta paga sem possibilidade de ativar orçamento automaticamente;
- acessos negados para utilizadores sem permissão.

Nunca usar contas sociais de produção em testes automáticos.

---

## 22. Entrega por fases

### Fase 1 — Organização e aprovação

- navegação Marketing;
- Dashboard;
- Calendário;
- Publicações e variantes;
- Campanhas;
- Biblioteca e ligação Canva;
- checklist;
- workflow de aprovação;
- classificação orgânica/paga;
- importação CSV/XLSX;
- permissões e auditoria.

### Fase 2 — Publicação automática

- social accounts;
- OAuth Meta e LinkedIn;
- providers;
- scheduler;
- publicação e retries;
- notificações;
- feature flag e modo de teste.

### Fase 3 — Analytics

- sincronização de métricas;
- Dashboard de resultados;
- relatórios e exportação;
- análise por plataforma, equipamento, mercado e horário.

Cada fase deve incluir migrations, testes, documentação e validação visual. Não iniciar publicação em produção apenas porque a integração técnica está concluída.

---

## 23. Critérios de aceitação

O módulo está funcional quando:

1. Um utilizador autorizado cria uma campanha.
2. Cria uma publicação e associa um ou vários equipamentos existentes.
3. Cria variantes para Instagram, Facebook e LinkedIn com textos e horários diferentes.
4. Liga o respetivo design Canva ou carrega os ficheiros finais.
5. Completa a checklist e envia para revisão.
6. Um revisor pede alterações ou valida o conteúdo.
7. Um aprovador autoriza a publicação.
8. Um publicador programa cada variante.
9. O sistema publica uma única vez através do provider ou, sem credenciais, executa o fluxo integral em modo de teste.
10. O resultado e o ID externo ficam registados.
11. Uma falha gera log, notificação e opção de nova tentativa controlada.
12. As métricas podem ser sincronizadas e consultadas.
13. Uma publicação candidata a paga exige aprovação de orçamento e não ativa campanhas automaticamente.
14. Todas as ações sensíveis constam do audit trail.
15. Nenhuma funcionalidade anterior da aplicação é afetada.

---

## 24. Definition of Done

Antes de considerar o trabalho concluído:

- todas as migrations foram revistas e testadas;
- lint, typecheck, testes e build passam;
- não existem segredos no código ou logs;
- não existem erros no browser console nas páginas do módulo;
- páginas foram verificadas em desktop e telemóvel;
- permissões foram testadas com pelo menos dois níveis de acesso;
- scheduler foi testado para concorrência e idempotência;
- providers têm mocks e modo de teste;
- documentação de configuração foi criada;
- variáveis de ambiente necessárias foram adicionadas ao `.env.example`, sem valores reais;
- foi criado um guia de ativação controlada em produção;
- foi criado um plano de rollback;
- foi apresentado um resumo final dos ficheiros alterados, migrations, testes executados, riscos e passos manuais ainda necessários.

---

## 25. Ficheiros de documentação esperados

Criar ou atualizar:

- `docs/marketing-publications-implementation-plan.md`
- `docs/marketing-publications-user-guide.md`
- `docs/social-integrations.md`
- `docs/marketing-publications-release-checklist.md`
- `.env.example`

Não colocar tokens, IDs secretos ou credenciais reais nestes ficheiros.

---

## 26. Decisões que o Claude Code não deve inventar

Se não estiverem no repositório ou nas variáveis de ambiente, deixar configuráveis e documentar como pendentes:

- credenciais Meta;
- credenciais LinkedIn;
- IDs reais de páginas e contas;
- responsáveis e aprovadores definitivos;
- limites de orçamento;
- cores/fontes oficiais que não estejam já no design system;
- condições comerciais;
- informação de stock;
- garantias, formação e assistência incluídas;
- certificações e especificações de equipamentos;
- mercados em que cada oferta pode ser publicitada;
- regras finais de retenção de dados.

Não bloquear a construção do módulo por falta de credenciais externas. Implementar interfaces, mocks, feature flags, documentação e ecrãs de configuração, mantendo a publicação real desativada até à validação.

---

## 27. Ordem de execução recomendada ao Claude Code

1. Inspecionar e documentar a arquitetura existente.
2. Apresentar o plano de implementação e a lista de migrations.
3. Criar o modelo de dados e permissões.
4. Implementar Fase 1 com testes.
5. Validar visualmente e corrigir regressões.
6. Implementar providers e scheduler em modo de teste.
7. Implementar analytics com dados simulados e depois reais quando houver credenciais.
8. Executar todos os testes e build.
9. Documentar configuração, ativação e rollback.
10. Parar antes de ligar publicação real ou qualquer campanha paga e pedir autorização explícita à Andreia.

---

## Comando inicial sugerido para o Claude Code

```text
Lê integralmente o ficheiro CLAUDE_MODULO_MARKETING_PUBLICACOES_ALL4LASER.md.
Este módulo deve ser integrado na aplicação All4laser existente, sem criar uma
aplicação paralela. Começa por inspecionar o repositório e produzir o plano
técnico pedido no documento. Em seguida, implementa a Fase 1 por etapas, com
migrations reversíveis, testes e validação visual. Prepara as Fases 2 e 3 de
forma compatível com a arquitetura existente, mas não atives publicação real,
ligações de produção ou campanhas pagas sem autorização explícita.
```

