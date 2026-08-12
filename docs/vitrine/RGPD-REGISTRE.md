# Registre des activités de traitement — SENTIA

*Document interne obligatoire au titre de l'article 30 du RGPD.
À tenir à jour et à présenter en cas de contrôle CNIL.*

## Responsable de traitement

- **Structure** : à définir (immatriculation en cours)
- **Contact** : privacy@sentia.com
- **DPO** : non désigné à ce jour — à évaluer selon l'article 37 RGPD dès
  que le volume de traitement le justifiera (traitement à grande échelle
  de données ou catégories particulières).

---

## Traitement 1 — Gestion des comptes clients

| Élément | Contenu |
|---|---|
| **Finalité** | Permettre l'accès au service, la facturation, le support |
| **Base légale** | Exécution du contrat (art. 6.1.b RGPD) |
| **Personnes concernées** | Clients (représentants des entreprises abonnées) |
| **Catégories de données** | Email, nom, entreprise, historique de facturation |
| **Destinataires** | Équipe SENTIA interne, sous-traitants techniques listés ci-dessous |
| **Transferts hors UE** | Aucun pour ces données |
| **Durée de conservation** | Durée du contrat + 30 jours (récupération) — factures : 10 ans (art. L123-22 Code de commerce) |
| **Mesures de sécurité** | Hashage argon2id des mots de passe (via Supabase Auth), chiffrement TLS, cloisonnement RLS |

## Traitement 2 — Données confiées aux employés numériques

| Élément | Contenu |
|---|---|
| **Finalité** | Permettre à l'employé IA d'accomplir ses missions pour le client |
| **Base légale** | Exécution du contrat (art. 6.1.b) — le client est responsable de traitement de SES données ; SENTIA est sous-traitant |
| **Personnes concernées** | Prospects, contacts et interlocuteurs des clients de SENTIA |
| **Catégories de données** | Selon usage : coordonnées professionnelles, notes commerciales, échanges email |
| **Destinataires** | Uniquement le client propriétaire — cloisonnement en base |
| **Transferts hors UE** | Aucun — modèles IA no-train uniquement (Gemini payant EU) |
| **Durée de conservation** | Selon le choix du client, par défaut : durée du contrat |
| **Mesures de sécurité** | RLS Postgres, journal d'audit permanent, contrôle par curseur d'autonomie |

## Traitement 3 — Journal d'exécution (audit)

| Élément | Contenu |
|---|---|
| **Finalité** | Traçabilité des actions des agents, débogage, preuve en cas de litige |
| **Base légale** | Intérêt légitime (art. 6.1.f) — sécurité et responsabilité du service |
| **Personnes concernées** | Clients + personnes visées par les actions des agents |
| **Catégories de données** | Horodatage, type d'action, contenu de l'action, résultat |
| **Destinataires** | Équipe SENTIA interne, client concerné pour ses propres logs |
| **Transferts hors UE** | Aucun |
| **Durée de conservation** | **13 mois** (arbitrage sécurité vs minimisation) |
| **Mesures de sécurité** | Table append-only, non modifiable, chiffrement au repos |

## Traitement 4 — Logs techniques et sécurité

| Élément | Contenu |
|---|---|
| **Finalité** | Détection d'abus, limitation de débit, débogage |
| **Base légale** | Intérêt légitime (art. 6.1.f) — sécurité du service |
| **Personnes concernées** | Visiteurs du site, clients |
| **Catégories de données** | Adresse IP, user-agent, chemin d'accès, code de réponse |
| **Destinataires** | Vercel (hébergeur), équipe SENTIA |
| **Transferts hors UE** | Vercel dispose de serveurs hors UE mais les logs sont conservés en UE (à confirmer avec DPA Vercel) |
| **Durée de conservation** | **90 jours maximum** |
| **Mesures de sécurité** | Accès restreint, pas de croisement avec d'autres bases |

## Traitement 5 — Conseiller IA (chat public de la landing)

| Élément | Contenu |
|---|---|
| **Finalité** | Répondre aux questions des visiteurs sur SENTIA |
| **Base légale** | Intérêt légitime (art. 6.1.f) — support commercial |
| **Personnes concernées** | Visiteurs du site (aucune inscription requise) |
| **Catégories de données** | Contenu des questions posées, IP (limitation de débit) |
| **Destinataires** | Groq Inc. (États-Unis) — dataClass="test", données publiques |
| **Transferts hors UE** | **Oui, vers Groq (US)** — cadre : les données transmises sont publiques (base de connaissances SENTIA), aucune donnée personnelle réelle. Une injection délibérée par un visiteur ne concerne que lui-même. |
| **Durée de conservation** | Aucune conservation applicative (les questions ne sont pas stockées) — Groq peut conserver côté fournisseur selon ses propres CGU |
| **Mesures de sécurité** | Rate limiting, filtre anti-injection, prompt système restrictif |

## Traitement 6 — Demandes RGPD

| Élément | Contenu |
|---|---|
| **Finalité** | Traiter les demandes d'exercice de droits (art. 15-22 RGPD) |
| **Base légale** | Obligation légale (art. 6.1.c) |
| **Catégories de données** | Email, type de droit exercé, détails de la demande |
| **Durée de conservation** | 3 ans à compter de la réponse (preuve de traitement en cas de contrôle CNIL) |
| **Mesures de sécurité** | Table interne, non accessible via l'API cliente |

---

## Sous-traitants (art. 28 RGPD)

Chaque sous-traitant DOIT avoir signé un DPA (Data Processing Agreement)
avant traitement de données personnelles réelles.

| Sous-traitant | Rôle | Localisation données | DPA signé | Certifications |
|---|---|---|---|---|
| Supabase Inc. | DB, auth, storage | UE (eu-north-1) | **À signer** | SOC 2 Type II, HIPAA |
| Vercel Inc. | Hébergement Next.js | UE privilégiée | **À signer** | SOC 2 Type II |
| Google (Gemini API) | Modèle IA prod | UE (tier payant) | **À signer** | ISO 27001, SOC 2 |
| Groq Inc. | Modèle IA conseiller public | US | **À signer** | À vérifier |

---

## Analyse d'impact (AIPD)

À réaliser AVANT ouverture au public si l'un des critères suivants est
rempli (article 35 RGPD) :

- Évaluation systématique et approfondie fondée sur un traitement automatisé (**oui, cas de SENTIA**)
- Traitement à grande échelle
- Surveillance systématique d'une zone accessible au public

**Verdict provisoire : AIPD nécessaire.** À conduire avant les premiers
clients réels ou dès l'atteinte de 100+ clients.

---

## Journal des mises à jour de ce registre

- 2026-07-25 · Création initiale
