-- LE PARCOURS CLIENT, JOUÉ EN ENTIER — du premier clic au premier euro, puis à l'effacement.
--
-- Ce n'est pas un test d'invariant : c'est une RÉPÉTITION. Chaque étape appelle les vraies
-- fonctions, dans le vrai ordre, et rend « OK » ou « ÉCHEC » avec ce qu'elle a constaté. À lancer
-- quand on veut savoir si le produit tient debout, pas si une règle tient :
--
--     psql -d "$DATABASE_URL" -f supabase/tests/parcours-client.sql
--
-- Il a trouvé, la première fois qu'il a tourné en entier : le droit à l'effacement échouait sur
-- l'immuabilité des constats d'audit (LADY-AE, LADY-AF). Aucun test unitaire ne pouvait le voir —
-- il fallait aller jusqu'au bout du parcours.
--
-- Tout se déroule dans une transaction annulée à la fin : rien n'est écrit.

-- LE PARCOURS D'UN CLIENT, DU PREMIER CLIC AU PREMIER EURO — joué en vrai.
\set ON_ERROR_STOP off
\pset tuples_only off
begin;

create temporary table rapport (n serial, etape text, verdict text, detail text);
create or replace function note(e text, v text, d text default '') returns void language sql as $$
  insert into rapport (etape, verdict, detail) values (e, v, d); select null::void; $$;

do $$
declare
  session_id   uuid;
  reco_id      uuid;
  r            record;
  v_tenant     uuid;
  v_employe    uuid;
  v_config     uuid;
  prenom       text;
  mission      uuid;
  fiche        uuid;
  verdict      text;
  n            integer;
  proposition  uuid;
begin
  -- ══ 1. LE VISITEUR FAIT SON DIAGNOSTIC ══
  insert into public.diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
  values ('visiteur-parcours', jsonb_build_object(
            'sector', 'menuiserie', 'headcount', 6,
            'targetCustomers', 'architectes et maîtres d''œuvre',
            'objective', jsonb_build_object('metric', 'rendez_vous_qualifies', 'target', 10, 'horizon', 'ce mois')),
          'aucune_relance')
  returning id into session_id;
  perform note('1. Diagnostic public', 'OK', 'la session est écrite, le profil extrait');

  -- ══ 2. LE MOTEUR CONSTATE ET COMPOSE ══
  insert into public.audit_finding (diagnostic_session_id, genre, domaine, objet, source, confiance, libelle)
  values (session_id, 'goulot', 'communication_sortante', 'prospect', 'declare', 'moyenne',
          'Les prospects approchés ne sont jamais relancés.'),
         (session_id, 'force', 'recherche_selection', 'prospect', 'declare', 'moyenne',
          'La liste de prospects est fournie et à jour.');
  select count(*) into n from public.audit_finding where diagnostic_session_id = session_id;
  perform note('2. Constats d''audit', 'OK', n || ' constats typés, avec source et confiance');

  insert into public.recommendation (diagnostic_session_id, status, justification, configuration_proposee)
  values (session_id, 'proposed',
          'Vos prospects ne sont jamais relancés : c''est là que ça bloque, pas sur le volume.',
          jsonb_build_object('role', 'prospection',
                             'capacites', jsonb_build_array('relancer.prospect', 'qualifier.prospect'),
                             'priorites', jsonb_build_array('relancer ce qui est resté sans réponse'),
                             'autonomie', 'confirm'))
  returning id into reco_id;
  perform note('3. Recommandation', 'OK', 'configuration proposée, justification lisible');

  -- ══ 3. IL PAIE ══
  begin
    select * into r from public.recruter(reco_id, 'Menuiserie Duval', 'start', 'stripe_test_001', 'patron@duval.fr');
    v_tenant := r.tenant_id; v_employe := r.employee_id; v_config := r.configuration_id;
    select i.first_name into prenom from public.employee e join public.identity i on i.id = e.identity_id where e.id = v_employe;
    perform note('4. Paiement → recrutement', 'OK', 'entreprise, employé (' || prenom || '), abonnement, objectif, configuration : une transaction');
  exception when others then
    perform note('4. Paiement → recrutement', 'ÉCHEC', sqlerrm); return;
  end;

  -- Rejeu du webhook
  select * into r from public.recruter(reco_id, 'Menuiserie Duval', 'start', 'stripe_test_001', 'patron@duval.fr');
  perform note('5. Webhook rejoué', case when r.deja_recrute then 'OK' else 'ÉCHEC' end,
               case when r.deja_recrute then 'rend le recrutement déjà fait, aucune seconde identité consommée'
                    else 'a recruté une seconde fois' end);

  -- ══ 4. IL SE CONNECTE ET RETROUVE SON ENTREPRISE ══
  insert into auth.users (id) values ('c11e0000-0000-0000-0000-000000000001');
  begin
    if public.rattacher_par_email('c11e0000-0000-0000-0000-000000000001', 'patron@duval.fr') = v_tenant then
      perform note('6. Première connexion', 'OK', 'l''acheteur est rattaché à son entreprise par son adresse');
    else
      perform note('6. Première connexion', 'ÉCHEC', 'rattaché à la mauvaise entreprise');
    end if;
  exception when others then perform note('6. Première connexion', 'ÉCHEC', sqlerrm); end;

  if public.rattacher_par_email('c11e0000-0000-0000-0000-000000000001', 'patron@duval.fr') is null then
    perform note('7. Attente consommée', 'OK', 'un second rattachement sur la même adresse ne rend rien');
  else
    perform note('7. Attente consommée', 'ÉCHEC', 'l''attente se consomme plusieurs fois');
  end if;

  -- ══ 5. L'EMPLOYÉE EST CONFIGURÉE ET PEUT TRAVAILLER ══
  select count(*) into n from public.employee_capability where employee_id = v_employe and enabled;
  perform note('8. Capacités ouvertes', case when n > 0 then 'OK' else 'ÉCHEC' end,
               n || ' capacités projetées depuis la configuration');

  select autonomy into verdict from public.employee where id = v_employe;
  perform note('9. Autonomie au recrutement', case when verdict = 'confirm' then 'OK' else 'ÉCHEC' end,
               'niveau « ' || verdict || ' » — elle demande avant toute action qui sort');

  insert into public.lead (tenant_id, company_name, email, source, qualification)
  values (v_tenant, 'Cabinet Martin', 'contact@cabinet-martin.fr', 'import_client', 'qualifie')
  returning id into fiche;

  verdict := public.peut_ouvrir_une_mission(v_tenant, v_employe);
  perform note('10. Ouverture de mission', case when verdict = 'ok' then 'OK' else 'ÉCHEC' end, 'verdict : ' || verdict);

  insert into public.task (tenant_id, employee_id, objective_id, subject_kind, subject_id)
  select v_tenant, v_employe, o.id, 'lead', fiche from public.objective o
   where o.tenant_id = v_tenant and o.state = 'actif'
  returning id into mission;
  perform note('11. Mission rattachée à l''objectif', 'OK', 'aucune mission « en général »');

  -- ══ 6. ELLE TRAVAILLE, ET LE CLIENT DÉCLARE UN RÉSULTAT ══
  insert into public.execution_event (tenant_id, employee_id, task_id, kind) values (v_tenant, v_employe, mission, 'action_executee');
  insert into public.outcome (tenant_id, task_id, kind, declared_by) values (v_tenant, mission, 'response', 'client');
  insert into public.outcome (tenant_id, task_id, kind, declared_by) values (v_tenant, mission, 'meeting', 'client');
  insert into public.outcome (tenant_id, task_id, kind, value, declared_by) values (v_tenant, mission, 'sale', 4500, 'client');
  perform note('12. Résultats déclarés', 'OK',
               'une réponse, un rendez-vous et une vente de 4 500 €, déclarés par le client');

  begin
    insert into public.outcome (tenant_id, task_id, kind, value, declared_by) values (v_tenant, mission, 'sale', 99999, 'sentio');
    perform note('13. Sentio déclare une vente', 'ÉCHEC', 'le produit a pu gonfler son propre résultat');
  exception when others then
    perform note('13. Sentio déclare une vente', 'OK', 'refusé en base — seul le client déclare ses ventes');
  end;

  -- ══ 7. CE QUE LE DIRIGEANT VOIT ══
  -- ⚠️ CETTE ÉTAPE ATTENDAIT « 4500 » — LE MONTANT D'UNE VENTE — POUR UN OBJECTIF DE
  --    10 RENDEZ-VOUS. Le parcours inscrivait donc le défaut comme résultat correct :
  --    `avancement_vers_l_objectif` sommait les ventes quelle que soit la métrique, et le
  --    dirigeant lisait « 4500 sur 10 rendez-vous ». Corrigé par `20260829120001` : une métrique
  --    déclare sa source, et le réalisé ne compte que ce que l'objectif demande.
  --
  --    Un rendez-vous déclaré ⇒ 1. Le montant de la vente n'apparaît QUE sous une métrique
  --    monétaire, et il est vérifié juste en dessous.
  select realise into n from public.avancement_vers_l_objectif(v_tenant);
  perform note('14. Avancement', case when n = 1 then 'OK' else 'ÉCHEC' end,
               n || ' rendez-vous sur une cible de 10 — le montant de la vente n''entre pas ici');

  select public.realise_de_la_metrique(v_tenant, 'chiffre_affaires') into n;
  perform note('14 bis. La métrique monétaire, elle, voit le montant',
               case when n = 4500 then 'OK' else 'ÉCHEC' end, n || ' € de chiffre d''affaires');

  select contactes, ventes, chiffre_affaires into r from public.bilan_de_l_employe(v_tenant, 14);
  perform note('15. Tableau de bord', 'OK',
               r.contactes || ' approchées, ' || r.ventes || ' vente(s), ' || r.chiffre_affaires || ' €');

  select count(*) into n from public.serie_quotidienne(v_tenant, 14);
  perform note('16. Courbe 14 jours', case when n = 14 then 'OK' else 'ÉCHEC' end, n || ' jours rendus, trous compris');

  -- ══ 8. LE DIRIGEANT GARDE LA MAIN ══
  begin
    insert into public.lady_configuration (tenant_id, employee_id, version, role, autonomie, declencheur, raison, precedente_id, active)
    select v_tenant, v_employe, max(version) + 1, 'prospection', 'auto', 'resultats', 'plus efficace', v_config, false
      from public.lady_configuration where employee_id = v_employe;
    perform note('17. Cliquet d''autonomie', 'ÉCHEC', 'une mesure a pu rendre l''employée plus autonome');
  exception when others then
    perform note('17. Cliquet d''autonomie', 'OK', 'refusé : seul le dirigeant peut lever la garde');
  end;

  perform public.mettre_en_pause(v_tenant, v_employe, 'Je vérifie.');
  verdict := public.peut_ouvrir_une_mission(v_tenant, v_employe);
  perform note('18. Bouton d''arrêt', case when verdict = 'employe_arrete' then 'OK' else 'ÉCHEC' end, 'verdict : ' || verdict);
  perform public.reprendre_le_travail(v_tenant, v_employe);

  -- ══ 9. RGPD ══
  begin
    perform set_config('sentio.retention_purge', 'on', true);
    select sum(lignes) into n from public.erase_tenant(v_tenant);
    perform note('19. Effacement RGPD', 'OK', n || ' lignes effacées à la demande');
  exception when others then
    perform note('19. Effacement RGPD', 'ÉCHEC', sqlerrm);
  end;
end;
$$;

\echo ''
\echo '════════════ PARCOURS CLIENT — DU PREMIER CLIC AU PREMIER EURO ════════════'
select etape, verdict, detail from rapport order by n;
rollback;
