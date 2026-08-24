-- 0022_equipa_tecnica_remocao.sql
--
-- Guarda como um treinador entrou na equipa técnica. Isto permite remover só a
-- associação de quem já tinha conta própria, mas apagar a conta inteira quando
-- ela foi criada automaticamente por convite da equipa técnica.

alter table public.club_members
  add column if not exists criado_por uuid references public.profiles(id) on delete set null,
  add column if not exists criado_por_convite boolean not null default false,
  add column if not exists apagar_conta_ao_remover boolean not null default false;

create index if not exists club_members_criado_por_idx
  on public.club_members (criado_por);

comment on column public.club_members.criado_por is
  'Admin que associou este treinador ao clube.';

comment on column public.club_members.criado_por_convite is
  'Verdadeiro quando a associação nasceu no cartão Equipa Técnica.';

comment on column public.club_members.apagar_conta_ao_remover is
  'Verdadeiro só para contas criadas pelo convite da equipa técnica e sem licença própria anterior.';
