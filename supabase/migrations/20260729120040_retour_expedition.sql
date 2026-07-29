-- METIER-21 — rattacher un rebond ou une plainte au message qui l'a provoqué.
--
-- ⚠️ POURQUOI CETTE COLONNE MANQUAIT, ET CE QU'ELLE DÉBLOQUE.
--
-- La table des messages sortants portait la clé d'idempotence — la nôtre — mais pas l'identifiant
-- rendu par le service d'expédition. Or c'est cet identifiant-là, et lui seul, que le service
-- renvoie quand un message rebondit ou qu'un destinataire le signale. Sans lui, un retour arrive
-- sans qu'on puisse dire de quel message il parle : ni fermer l'adresse, ni compter le taux, ni
-- suspendre le domaine.
--
-- Autrement dit, la condition « aucune suspension en cours » de `peut_envoyer()` n'aurait jamais
-- pu se déclencher, et la promesse de `docs/adr/0017` serait restée décorative.

alter table public.outbound_message add column provider_message_id text;

-- Un identifiant du service désigne un message et un seul. L'unicité protège d'un retour
-- rattaché deux fois — ce qui doublerait un taux de rebond et suspendrait un domaine sain.
create unique index outbound_message_provider_id_idx
  on public.outbound_message (tenant_id, provider_message_id)
  where provider_message_id is not null;

do $$
begin
  raise notice 'OK  retour d''expédition — un rebond peut être rattaché à son message.';
end;
$$;
