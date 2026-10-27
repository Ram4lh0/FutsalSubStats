/* ------------------------------------------- aviso de conta nova (ntfy) */
-- Cada conta criada envia um push para o iPhone do dono, através da app ntfy
-- (subscrever o tópico abaixo). O pedido é assíncrono (pg_net) e qualquer erro
-- é engolido: o aviso nunca pode impedir alguém de criar conta.
-- O tópico do ntfy.sh é público para quem souber o nome, por isso não enviamos
-- dados pessoais (nem email nem nome), só o método de registo.

create extension if not exists pg_net;

create or replace function avisar_conta_nova()
returns trigger as $$
begin
  begin
    perform net.http_post(
      url := 'https://ntfy.sh',
      body := jsonb_build_object(
        'topic', 'futsal-substats-contas-778c019b38e4a3ed',
        'title', 'Nova conta na Futsal SubStats',
        'message', 'Registo via ' || coalesce(new.raw_app_meta_data->>'provider', 'email'),
        'tags', jsonb_build_array('soccer', 'tada')
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists on_auth_user_created_avisar on auth.users;
create trigger on_auth_user_created_avisar
  after insert on auth.users
  for each row execute function avisar_conta_nova();
