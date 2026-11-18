-- ATLAS LIBRARY — Schema collaboratif (Supabase PostgreSQL)
-- Exécuter avec le SQL Editor du projet Supabase, en tant qu'administrateur.
-- Aucune table n'est lisible par les visiteurs anonymes.

create extension if not exists pgcrypto;

create table if not exists public.atlas_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.atlas_channels (
  country_code text not null check (country_code ~ '^[A-Z]{3}$'),
  record_id text not null check (char_length(record_id) between 1 and 250),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ? 'name'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (country_code, record_id)
);

create index if not exists atlas_channels_updated_at_idx on public.atlas_channels (updated_at desc);
create index if not exists atlas_channels_country_code_idx on public.atlas_channels (country_code);

-- Vérification des droits côté base ; les utilisateurs ne peuvent pas s'attribuer un rôle.
create or replace function public.atlas_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.atlas_team_members m
    where m.user_id = (select auth.uid())
      and m.active = true
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.atlas_has_role(text[]) from public, anon;
grant execute on function public.atlas_has_role(text[]) to authenticated;

-- Conserver l'identité réelle du rédacteur, indépendamment des valeurs proposées côté navigateur.
create or replace function public.atlas_stamp_channel()
returns trigger language plpgsql security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  new.payload := jsonb_set(new.payload, '{id}', to_jsonb(new.record_id), true);
  return new;
end;
$$;

drop trigger if exists atlas_channel_stamped on public.atlas_channels;
create trigger atlas_channel_stamped
before insert or update on public.atlas_channels
for each row execute function public.atlas_stamp_channel();

alter table public.atlas_team_members enable row level security;
alter table public.atlas_channels enable row level security;

revoke all on public.atlas_team_members from anon;
revoke all on public.atlas_channels from anon;
grant select on public.atlas_team_members to authenticated;
grant select, insert, update, delete on public.atlas_channels to authenticated;

drop policy if exists "Members can view own membership" on public.atlas_team_members;
create policy "Members can view own membership"
on public.atlas_team_members for select to authenticated
using (user_id = (select auth.uid()) and active = true);

drop policy if exists "Active team can read channels" on public.atlas_channels;
create policy "Active team can read channels"
on public.atlas_channels for select to authenticated
using ((select public.atlas_has_role(array['admin','editor','viewer'])));

drop policy if exists "Editors can add channels" on public.atlas_channels;
create policy "Editors can add channels"
on public.atlas_channels for insert to authenticated
with check ((select public.atlas_has_role(array['admin','editor'])));

drop policy if exists "Editors can update channels" on public.atlas_channels;
create policy "Editors can update channels"
on public.atlas_channels for update to authenticated
using ((select public.atlas_has_role(array['admin','editor'])))
with check ((select public.atlas_has_role(array['admin','editor'])));

drop policy if exists "Admins can delete channels" on public.atlas_channels;
create policy "Admins can delete channels"
on public.atlas_channels for delete to authenticated
using ((select public.atlas_has_role(array['admin'])));

-- Activer le temps réel après l'installation si la publication Supabase existe.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
     not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename='atlas_channels') then
    alter publication supabase_realtime add table public.atlas_channels;
  end if;
end $$;

-- Étapes suivantes (à faire manuellement une fois le premier utilisateur créé dans Authentication > Users) :
-- 1. Copier son UID dans l'interface Supabase, puis exécuter :
-- insert into public.atlas_team_members(user_id,email,display_name,role)
-- values ('REMPLACER_PAR_UUID','admin@entreprise.fr','Administrateur','admin');
-- 2. Créer/inviter les vendeurs via Authentication > Users, puis les ajouter à atlas_team_members
--    avec leur UID, role='editor' ou 'viewer'.
-- 3. Désactiver l'inscription publique et conserver un processus d'invitation uniquement.
