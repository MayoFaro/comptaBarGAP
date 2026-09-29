# Migration 2026

**Migration appliquée en production le 29 septembre 2026.**

Le dossier approuvé a été transformé en état comptable avec le même moteur que le
backend, puis chargé atomiquement dans Firestore par le lot `excel_2026_v1`.

## Résultat appliqué

- Ouverture remplacée dans le plan : 1er janvier 2026, **454 000 FCFA**.
- Caisse après reprise : **10 000 FCFA**.
- 21 fiches : DEPERROIS conserve `administrator`, son UID, son email et son accès ;
  les 20 autres fiches sont préparées avec des identifiants stables et sans compte Auth.
- Avoirs : DEPERROIS **144 210**, PARE **17 830**, LE CAM **500**. Les 21 comptes
  concordent avec le tableau des soldes validé.
- 94 opérations, 62 appels bimestriels ventilés en 124 cotisations mensuelles
  historiques de 7 500 FCFA et 3 mentions source sans montant conservées à part.
- Deux événements : repas du 17 août et dégustation de vins.
- Avance GAP à récupérer : **30 000 FCFA**, hors dépenses définitives.
- 249 documents proposés, dont projections anonymisées et fiche du lot de migration.

Les cinq pauses confirmées pour octobre sont enregistrées sans date de fin :
**PESTOU, PROVOT, RAMAHOLISON, BERANTO, BOLLIET**. Les 16 autres fiches ont un appel
brut d’octobre–novembre de 15 000 FCFA, soit **240 000 FCFA au total avant avoirs**.
Une pause ne supprime pas une dette antérieure : BOLLIET conserve notamment ses
30 000 FCFA dus. Le formulaire de reprise des cotisations permet de terminer une
pause au mois choisi en conservant la période exonérée passée.

## Exécution reproductible

Node 22 et les dépendances existantes sont requis.

```sh
npm run migration:simulate
npm run migration:prepare
npm run migration:apply
```

- `migration:simulate` utilise une initialisation fictive locale.
- `migration:prepare` utilise la session Firebase CLI pour une **transaction de
  lecture seule** sur `ma-compta-bar-gap`, puis travaille exclusivement sur disque.
- `migration:apply` exige le nom explicite du lot, relit la production, vérifie les
  empreintes et applique le plan dans une transaction unique. Le marqueur achevé
  empêche toute seconde application.
- Toute modification du classeur ou des deux CSV comptables par rapport aux
  empreintes validées bloque la préparation.
- Toute opération, contrôle, événement, appel, solde individuel ou cotisation déjà
  présent dans la base bloque le scénario actuel plutôt que d’écraser les données.
- Un marqueur du même lot bloque une nouvelle préparation sur une base déjà migrée.
- Les fiches supplémentaires ou noms ambigus nécessitent un rapprochement explicite.

Les sorties privées sont dans `.migration-previews/`, exclu de Git et du Web :
`snapshot-before.json`, `prepared-plan.json`, `CONTROLE.md`. Elles contiennent les
données privées de la base, sont créées avec des permissions restrictives et ne
doivent pas être publiées. Le snapshot est une copie des collections de l’application,
pas une sauvegarde des utilisateurs Auth ni des fichiers Storage.

Préparation réelle du 29 septembre 2026, 06:11 UTC :
`2026-09-29T06-11-14-955Z`, empreinte
`2a6ce492542da8852539eef98d66eb9d6e2e5f6e3b64b6450dd93cb2818175f5`.
Ce plan est lié à l’état observé à cet instant. Il n’autorise aucune application
ultérieure sans nouvelle comparaison avec l’état réel.

## Adaptations déployées

- Cotisations historiques figées : ni pause, ni modification de fiche, ni recalcul
  quotidien ne les régénère. Le moteur automatique commence en octobre.
- Opérations importées verrouillées contre correction/annulation ordinaire ; leur
  provenance complète reste privée. Une rectification ultérieure doit suivre une
  procédure de reprise contrôlée, non encore implémentée.
- Avances à un tiers et remboursements d’avance : effet sur la caisse et la créance,
  sans gonfler les dépenses ou les recettes de cotisations ; plafond du remboursement.
- Affichage des avances à récupérer et formulaires correspondants dans la gestion.
- Pauses sans date de fin et reprise au mois choisi.

## Vérifications

- 20 tests métier et de migration réussis : valeurs du dossier complet, contrôle
  des effets caisse/compte, passage en octobre et en 2027, refus de données
  incohérentes, conservation des appels historiques, anonymisation et remboursement GAP.
- 5 tests des règles Firebase réussis.
- Scénario d’intégration existant réussi (activation, droits, concurrence et passation).
- Chargement transactionnel du plan dans les émulateurs réussi, suivi de commandes
  serveur réelles : refresh, refus d’annulation d’un import, remboursement GAP.
- Analyse Flutter sans anomalie ; 3 tests Flutter réussis ; compilation Web réussie.

## Application en production

Le lot a été appliqué à 06:22 UTC avec l’empreinte
`2a6ce492542da8852539eef98d66eb9d6e2e5f6e3b64b6450dd93cb2818175f5`.
Le snapshot avant/après et le plan privé sont conservés dans
`.migration-previews/apply-2026-09-29T06-22-56-894Z/`.

Le contrôle indépendant après écriture confirme les 21 fiches, les 94 opérations,
les 21 soldes individuels, les **10 000 FCFA** de caisse, les **30 000 FCFA**
d’avance GAP et le rattachement Auth existant de DEPERROIS. Le site public répond,
et les lectures anonymes des adhérents et opérations restent refusées par Firestore.

À partir d’octobre, le plan doit être recalculé à la date d’application : les
échéances courantes sont à émettre dans le lot ou immédiatement après, sans doublon.
Les soldes de septembre restent les contrôles de l’historique ; ceux d’octobre
sont distincts et présentés dans la projection. Ne pas réutiliser aveuglément un
plan de septembre après le changement de mois.
