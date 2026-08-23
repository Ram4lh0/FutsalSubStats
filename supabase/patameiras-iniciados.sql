-- patameiras-iniciados.sql
--
-- Deixa a conta com **um** clube, Patameiras, e **um** escalão, Iniciados, com
-- os 28 jogadores da folha «Iniciados 2026-2027» (Folha1).
--
-- ## ATENÇÃO: isto apaga
--
-- Tudo o que a conta tiver antes — clubes, escalões, plantéis, competições,
-- jogos e a linha de eventos de cada jogo — é **apagado sem volta**. Não é o
-- "apagar" da app, que arquiva e é reversível: é um `delete` a sério.
--
-- É o que foi pedido, e faz sentido para preparar uma conta do zero. Não corras
-- isto numa conta que já tenha jogos a sério sem uma cópia de segurança —
-- Definições → Guardar cópia, na app, antes de começar.
--
-- Para o desligar e voltar a acrescentar sem apagar, põe `limpar := false`.
--
-- ## Como se usa
--
-- 1. A conta tem de existir (painel: `npm run painel`).
-- 2. Confirma o email na linha marcada com ← e corre no Supabase → SQL Editor.
--
-- ## Depois de correr
--
-- Quem tiver a app aberta nessa conta continua com a cópia antiga no aparelho, e
-- a descarga não apaga o que já lá está. Peça-se-lhe para ir a
-- **Definições → Limpar dispositivo**, ou sair da conta e voltar a entrar.
--
-- ## O que foi decidido, e onde podes discordar
--
-- **Números de camisola.** A folha não os tem. Vão de 1 a 28 pela ordem da
-- folha, e mudam-se na app.
--
-- **"Ala" sem lado.** A folha diz só «Ala» em quinze jogadores. Aqui o lado sai
-- do pé: pé direito vira ala direito, pé esquerdo vira ala esquerdo. É capaz de
-- estar trocado em vários — muitos treinadores põem o canhoto à direita para
-- cortar para dentro. É só a posição preferida no cartão; a de cada jogo
-- escolhe-se na convocatória.
--
-- **Posições compostas.** «Fixo/Ala» ficou Fixo e «Ala/Pivot» ficou ala: manda a
-- primeira, que é como se costuma escrever a principal.
--
-- **Tempo corrido** (30 min por parte), que é o habitual em Iniciados. Se este
-- escalão for cronometrado, troca `UNTIMED` por `TIMED`.

do $$
declare
  o_email     text := 'nunomerodrigues@gmail.com';   -- ← confirma o email
  limpar      boolean := true;                       -- ← false para não apagar
  nome_clube  text := 'Patameiras';
  nome_equipa text := 'Iniciados';

  o_dono   uuid;
  o_clube  uuid;
  a_equipa uuid;
  antes    record;
begin
  select id into o_dono from profiles where lower(email) = lower(o_email);
  if o_dono is null then
    raise exception 'Não há conta com o email %. Cria-a primeiro no painel.', o_email;
  end if;

  /* --------------------------------------------------------- limpeza */

  if limpar then
    -- O que se vai perder, para ficar no registo do SQL Editor. Se estes
    -- números te assustarem, é porque não devias estar a correr isto.
    select
      (select count(*) from clubs c where c.owner_id = o_dono) as clubes,
      (select count(*) from teams t join clubs c on c.id = t.club_id
        where c.owner_id = o_dono) as escaloes,
      (select count(*) from players p join clubs c on c.id = p.club_id
        where c.owner_id = o_dono) as jogadores,
      (select count(*) from matches m join clubs c on c.id = m.club_id
        where c.owner_id = o_dono) as jogos
      into antes;

    raise notice 'A apagar: % clube(s), % escalão(ões), % jogador(es), % jogo(s).',
      antes.clubes, antes.escaloes, antes.jogadores, antes.jogos;

    -- De baixo para cima, e não com um `delete from clubs` a confiar no
    -- cascade: o `match_squad` aponta para `players` com `on delete restrict`,
    -- e um cascade que apague os jogadores antes das convocatórias esbarra
    -- nessa restrição. Por ordem, não há como falhar.
    delete from match_events e using matches m, clubs c
      where e.match_id = m.id and m.club_id = c.id and c.owner_id = o_dono;
    delete from match_squad s using matches m, clubs c
      where s.match_id = m.id and m.club_id = c.id and c.owner_id = o_dono;
    delete from matches m using clubs c
      where m.club_id = c.id and c.owner_id = o_dono;
    delete from players p using clubs c
      where p.club_id = c.id and c.owner_id = o_dono;
    delete from competitions k using teams t, clubs c
      where k.team_id = t.id and t.club_id = c.id and c.owner_id = o_dono;
    delete from team_access a using teams t, clubs c
      where a.team_id = t.id and t.club_id = c.id and c.owner_id = o_dono;
    delete from teams t using clubs c
      where t.club_id = c.id and c.owner_id = o_dono;
    delete from club_members mb using clubs c
      where mb.club_id = c.id and c.owner_id = o_dono;
    delete from clubs c where c.owner_id = o_dono;
  end if;

  /* ------------------------------------------------- clube e escalão */

  select id into o_clube from clubs where owner_id = o_dono and name = nome_clube;
  if o_clube is null then
    insert into clubs (owner_id, name, short_name, current_season)
    values (o_dono, nome_clube, 'PAT', '2026/27')
    returning id into o_clube;
  end if;

  select id into a_equipa from teams where club_id = o_clube and name = nome_equipa;
  if a_equipa is null then
    insert into teams (club_id, name, short_name, timing)
    values (o_clube, nome_equipa, 'INI', 'UNTIMED')
    returning id into a_equipa;
  end if;

  /* ------------------------------------------------------- competições */

  insert into competitions (team_id, name, short_name)
  select a_equipa, v.nome, v.curto
  from (values ('Campeonato', 'Camp.'), ('Taça', 'Taça')) as v(nome, curto)
  where not exists (
    select 1 from competitions c where c.team_id = a_equipa and c.name = v.nome
  );

  /* ---------------------------------------------------------- plantel */

  insert into players (club_id, team_id, name, shirt_number, preferred_position, strong_foot)
  select o_clube, a_equipa, v.nome, v.numero, v.pos::player_position, v.pe::strong_foot
  from (values
    -- nascidos em 2013
    ('Adam Mahomed Riad',                  1, 'PIVOT',        'LEFT'),
    ('Santiago Galhanas',                  2, 'RIGHT_WINGER', 'RIGHT'),
    ('Afonso de Jesus Ferreira',           3, 'PIVOT',        'BOTH'),
    ('Afonso Vilela Saraiva',              4, 'PIVOT',        'RIGHT'),
    ('Guilherme de Jesus Ferreira',        5, 'FIXO',         'RIGHT'),
    ('Guilherme Tomás Monteiro',           6, 'FIXO',         'RIGHT'),
    ('Henrique Ferreira Cotrim',           7, 'RIGHT_WINGER', 'RIGHT'),
    ('Pedro Miguel Gonçalves dos Santos',  8, 'GOALKEEPER',   'RIGHT'),
    ('Rafael Andre Paulo Rocha',           9, 'UNIVERSAL',    'RIGHT'),
    ('Santiago Guerreiro Sacramento',     10, 'GOALKEEPER',   'RIGHT'),
    ('Simão Martins Rodrigues',           11, 'GOALKEEPER',   'RIGHT'),
    ('Vicente Cabral Pereira',            12, 'RIGHT_WINGER', 'RIGHT'),
    ('Valentim de Azevedo Soares Freire', 13, 'RIGHT_WINGER', 'RIGHT'),
    ('Salvador Barreiros Henriques',      14, 'RIGHT_WINGER', 'RIGHT'),
    ('Henrique Mateus',                   15, 'LEFT_WINGER',  'LEFT'),
    ('Yussuf Suli',                       16, 'RIGHT_WINGER', 'RIGHT'),
    -- nascidos em 2012
    ('André Ricardo Marques Lopes',       17, 'GOALKEEPER',   'RIGHT'),
    ('David Alexandre Rodrigues da Costa', 18, 'GOALKEEPER',  'RIGHT'),
    ('Diogo Miguel Gaiola Antunes',       19, 'LEFT_WINGER',  'LEFT'),
    ('Fabio Miguel Teixeira Fernandes',   20, 'RIGHT_WINGER', 'RIGHT'),
    ('Gonçalo Brazinha Bandeira',         21, 'LEFT_WINGER',  'LEFT'),
    ('Guilherme dos Santos Nunes',        22, 'RIGHT_WINGER', 'RIGHT'),
    ('Miguel de Jesus Leandro',           23, 'GOALKEEPER',   'RIGHT'),
    ('Ricardo Alexandre Duarte Aboim',    24, 'PIVOT',        'RIGHT'),
    ('Salvador Duarte Tavares',           25, 'RIGHT_WINGER', 'RIGHT'),
    ('Salvador Moreno Quinta',            26, 'UNIVERSAL',    'RIGHT'),
    ('Tiago Aparicio',                    27, 'FIXO',         'RIGHT'),
    ('Enzo Lourenço',                     28, 'RIGHT_WINGER', 'RIGHT')
  ) as v(nome, numero, pos, pe)
  where not exists (
    select 1 from players p
    where p.team_id = a_equipa and p.shirt_number = v.numero and p.is_active
  );

  raise notice 'Pronto: clube %, escalão %, % jogadores, para %',
    o_clube, a_equipa,
    (select count(*) from players where team_id = a_equipa and is_active),
    o_email;
end $$;
