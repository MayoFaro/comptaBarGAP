# comptesBarGAP — Plan d'implémentation

Statut au 29 septembre 2026 : MVP implémenté et validé localement.
Le site est publié sur `https://ma-compta-bar-gap.web.app`. Les services Firebase
sont déployés et les permissions d’invocation corrigées avec accord explicite.
La signature Android reste à configurer.
Référence : spécification V1 et décisions du 28 septembre 2026, section 27.

## Avancement de réalisation

- [x] Socle Flutter Web/Android et connexion Firebase configurable.
- [x] Moteur métier, transactions serveur et séparation public/privé.
- [x] Gestion des adhérents, soldes de reprise et activation par email vérifié.
- [x] Cotisations, avoirs automatiques, remboursements et corrections tracées.
- [x] Dépenses, justificatifs privés, événements et contrôles physiques.
- [x] Appels, paramètres, passation et consultations publiques/personnelles.
- [x] Guide de démarrage local et de configuration Firebase dans `README.md`.
- [x] Validation finale des parcours navigateur et des dernières modifications.
- [x] Raccordement et déploiement sur le projet Firebase de l’association.
- [ ] Configuration de la signature Android de distribution.

## Raccordement Firebase du 29 septembre 2026

- Projet confirmé : `ma-compta-bar-gap` ; alias local `.firebaserc` créé.
- Applications Web et Android enregistrées ; configurations locales générées.
- Firestore existant en `eur3` ; règles et index déployés avec succès.
- Premier administrateur `groodep@yahoo.fr` créé via le script d’amorçage.
  Aucun mot de passe ni email envoyé ; utiliser le parcours de réinitialisation
  après publication puis vérifier l’adresse.
- Compilation Web avec configuration cloud réussie.
- Blaze actif, bucket `ma-compta-bar-gap.firebasestorage.app` créé en `europe-west1`.
- Email/mot de passe actif, domaines Hosting autorisés. Décision confirmée :
  comptes créés par le gestionnaire. Inscriptions libres désactivées et locale
  des emails réglée sur français dans Firebase.
- Bouton « Créer l’accès » ajouté au menu des adhérents ; fonction serveur
  `createMemberAccess` réservée au gestionnaire vérifié, auditée, réexécutable.
  La vérification d’email précède la liaison et l’accès aux données privées.
- Tests locaux : analyse Flutter sans anomalie, 3 tests Flutter, 15 tests métier,
  5 tests de règles et scénario d’intégration réussis. L’intégration vérifie
  aussi création/réutilisation concurrente, rejet des non-gestionnaires,
  absence d’accès prématuré et conservation de l’accès après modification de fiche.
- Quatre fonctions déployées et actives en `europe-west1` ; règles Firestore
  et Storage publiées. Politique de nettoyage des images de compilation : 7 jours.
- Hosting publié : https://ma-compta-bar-gap.web.app.
- Vérification Chrome sur le site réel : journal avant initialisation, dialogue
  de connexion, absence d’inscription libre, aucune erreur JavaScript.
- Lectures anonymes des adhérents et justificatifs refusées (HTTP 403).
- Permissions d’invocation corrigées avec accord explicite : `roles/run.invoker`
  pour `allUsers` uniquement sur `command` et `activateMyAccount`.
- Vérification réelle après correction : `command` refuse les appels anonymes
  avec `UNAUTHENTICATED` (401), `activateMyAccount` et `createMemberAccess`
  avec `PERMISSION_DENIED` (403). Réponses JSON Firebase et origine Web autorisée.
  Les contrôles applicatifs de connexion, email vérifié et rôle sont inchangés.
- Planificateur activé : actualisation quotidienne à 00:05, Africa/Libreville.
- Aucune donnée comptable réelle initialisée ; aucun email envoyé.

## Validation du 29 septembre 2026

- Analyse Flutter : aucune anomalie.
- Tests Flutter : 3 réussis.
- Tests métier serveur : 15 réussis, dont les appels nets de paiements/avoirs.
- Règles Firestore/Storage : 5 tests réussis.
- Intégration sur émulateurs : activation vérifiée, doubles soumissions,
  remboursements concurrents, contrôle et passation validés.
- Parcours Chrome : création d'adhérent avec reprise d'avoir, encaissement,
  remboursement, contrôle, anonymat public et déconnexion validés ; affichage
  vérifié aux formats ordinateur et petit écran.
- Initialisation du premier gestionnaire local : vérifiée sur une base vide.
- Compilation Web : réussie, sortie `build/web`.
- Compilation Android debug : réussie, sortie
  `build/app/outputs/flutter-apk/app-debug.apk` (configuration émulateurs).
- Dépendances serveur de production : aucune vulnérabilité signalée par l'audit npm.

Les tests n'ont écrit que dans le projet d'émulation `demo-comptes-bar-gap`.
Les services de test ont été arrêtés après validation. Aucun déploiement cloud
ni essai sur appareil Android physique n'a été réalisé. L'identifiant du projet
Firebase cible et l'email du premier administrateur restent à fournir pour
préparer la mise en service. Les commandes sont documentées dans `README.md`.

## 1. Périmètre et conventions

Flutter Web et Android, interface française, montants entiers en FCFA,
calendrier métier Africa/Libreville. Application centrée sur une association
et un administrateur actif. Consultation publique sans authentification.

Cotisations à terme à échoir : octobre et novembre dus au 1er octobre,
décembre et janvier au 1er décembre. Le montant est calculé mois par mois,
en tenant compte des tarifs datés et des exonérations. Un changement de
fréquence des appels prendra effet à une prochaine période explicitement
choisie et ne modifiera pas les périodes déjà émises.

Les dettes sont indépendantes de la diffusion d'un appel. Les avoirs sont
consommés automatiquement sur les dettes les plus anciennes. Un paiement
supplémentaire est conservé comme avoir. L'administrateur peut rembourser
un avoir disponible en espèces, totalement ou partiellement.

Les absences rétroactives provoquent une correction tracée des sommes dues ;
les imputations concernées sont recalculées et un éventuel excédent devient
un avoir. L'annulation d'un crédit déjà consommé rouvre les dettes affectées.
Ces conventions seront rendues explicites dans les écrans de confirmation.

## 2. Socle technique et sécurité

- Flutter : navigation adaptée aux rôles, vues réactives Web et Android,
  couches séparées pour présentation, règles métier et accès aux données.
- Firebase : Firestore, Authentication et Hosting.
- Proposition technique : Cloud Functions pour les commandes financières,
  l'activation des accès et le transfert du rôle administrateur ; Cloud
  Storage pour les justificatifs privés.
- Émulateurs Firebase pour développer et vérifier les droits avant déploiement.
- Collections publiques distinctes des données privées : masquer un champ
  dans Flutter ne constitue pas une protection.
- Les écritures financières passent par des commandes serveur contrôlées,
  atomiques et résistantes aux doubles soumissions. Les clients ne modifient
  pas directement les soldes ou les rôles.
- Une action conserve son auteur, sa date, son motif lorsqu'il est requis,
  les valeurs précédentes et les liens nécessaires à sa correction.
- Les montants, commentaires, justificatifs et identités privés ne sont pas
  copiés implicitement dans le journal public. Les champs publics sont définis
  explicitement, en particulier pour les cotisations et remboursements d'avoirs.

## 3. Modèle de données et moteur métier

Entités principales : paramètres, tarifs datés, adhérents, périodes de statut,
exonérations, échéances mensuelles, appels, paiements, imputations, crédits,
remboursements d'avoirs, dépenses, remboursements reçus, événements,
mouvements de caisse, contrôles, passations et journal d'audit.

Les soldes sont dérivables des écritures conservées ; les agrégats éventuels
restent vérifiables. Un contrôle conserve le théorique observé lors de sa
validation, même si une opération ancienne est corrigée ensuite.

Ordre de réalisation :

1. Calcul des échéances, tarifs et absences, y compris décembre/janvier.
2. Imputation des paiements partiels et utilisation automatique des avoirs.
3. Dépenses payées par caisse ou avancées personnellement ; attribution
   explicite d'un avoir pour une avance acceptée.
4. Remboursements reçus liés aux dépenses et remboursements d'avoirs.
5. Corrections et annulations avec recalcul cohérent des objets liés.
6. Contrôles physiques et corrections volontaires d'écart.

Les dépenses personnelles sont comptabilisées dans les dépenses et événements,
mais exclues des sorties de caisse. Les synthèses distinguent ces deux mesures.

## 4. Initialisation et accès

- Configurer l'association, le premier administrateur et la date de bascule.
- Enregistrer une seule ouverture de caisse, traçable et identifiable publiquement.
- Permettre la création manuelle des adhérents, avec mois de début, statut,
  email facultatif tant que l'accès personnel n'est pas activé, et solde antérieur.
- Séparer les reports des opérations nouvelles ; ne pas appeler automatiquement
  de cotisations pour toute la période précédant la bascule.
- Présenter les périodes couvertes par le report pour éviter un double appel.
- Prévoir l'activation par email, le choix/rétablissement du mot de passe,
  la liaison contrôlée à la fiche et la révocation des droits de gestion.
- Transférer le rôle administrateur dans une opération atomique et auditée.

Aucun import automatique d'adhérents. Aucun import historique pour cette version.
Le classeur reste inchangé et ne doit pas être embarqué dans les fichiers publics.

## 5. Parcours administrateur

1. Paramètres et gestion des adhérents : création, pause, départ, réintégration.
2. Encaisser une cotisation : montant libre, imputation proposée, aperçu du reste dû.
3. Dépenses, justificatifs privés, remboursements reçus et événements.
4. Compte adhérent : dettes, paiements, avoirs et remboursement en espèces.
5. Appels : rappel J-5, préparation, sélection, statut et message WhatsApp copiable.
6. Contrôle simple ou par coupures, historique des contrôles et écarts.
7. Corrections, annulations et passation de gestion.

Le modèle WhatsApp initial sera sobre et modifiable ; aucune diffusion automatique.
La saisie financière nécessite une connexion et confirme le résultat du serveur.

## 6. Consultation publique et espace adhérent

- Public : solde, dernier contrôle, journal filtrable, recherche texte,
  dépenses, remboursements, événements et synthèses simples.
- Adhérent : uniquement son compte individuel, en lecture seule.
- Justificatifs et détail des coupures : administrateur uniquement.
- Présentation adaptée aux petits écrans et utilisation au clavier sur Web.

## 7. Validation et livraison

Tests ciblés sur les risques métier :

- 20 000 reçus pour 30 000 dus : 20 000 entrent en caisse, reste dû 10 000.
- 20 000 reçus pour 15 000 dus : avoir 5 000, caisse augmentée de 20 000.
- Dépense personnelle de 60 000 convertie en avoir : aucun mouvement de caisse.
- Avoir 20 000 et échéance 15 000 : dette soldée, avoir restant 5 000.
- Remboursement d'avoir : même diminution du crédit et de la caisse,
  double soumission sans double débit, dépassement du crédit refusé.
- Absence sur un seul mois, tarif changeant au passage de l'année,
  appel répété sans duplication, reports sans double comptabilisation.
- Correction du bénéficiaire d'un paiement sans changer la caisse ;
  correction ou annulation d'un crédit déjà imputé.
- Écart constaté sans ajustement automatique ; contrôle historique conservé.
- Accès public sans donnée privée, impossibilité de lire le compte d'autrui,
  justificatifs protégés et ancien administrateur privé des droits d'écriture.

Vérifier ensuite compilation Web/Android, parcours complets sur émulateurs,
puis préparation du déploiement Firebase et d'un guide court de prise en main.
La configuration du projet Firebase cible et le premier compte administrateur
seront nécessaires pour la mise en service, pas pour commencer le développement.

## 8. Évolution différée : historique 2026

Prévoir une migration distincte avec prévisualisation, rapprochement des noms,
contrôle des totaux, identifiants d'import uniques et traitement explicite des
reports remplacés. Ne pas ajouter l'historique aux soldes d'ouverture sans
neutraliser les montants déjà repris. Aucune fusion de noms ou suppression
de lignes supposées en double sans rapprochement préalable.

## Préparation de la migration Excel 2026 — 29 septembre 2026

- [x] Dossier et corrections de soldes validés, rapprochement DPS/DEPERROIS confirmé.
- [x] Statuts octobre confirmés : cinq pauses sans date de reprise, seize cotisants.
- [x] Compilation locale du dossier en état comptable et projections publiques.
- [x] Lecture seule cohérente de production, snapshot privé et plan avec empreinte.
- [x] Adaptations locales : appels historiques figés, avances à récupérer, pauses ouvertes.
- [x] Tests unitaires, règles, intégration et chargement transactionnel sur émulateurs.
- [x] Déploiement des adaptations et exécuteur transactionnel de production.
- [x] Injection réelle atomique, rapprochement final et contrôle des accès.

Détails et commandes : `docs/reprise-2026/PREPARATION_MIGRATION.md`.
Lot `excel_2026_v1` injecté le 29 septembre 2026 : 21 fiches, 94 opérations,
10 000 FCFA en caisse et 30 000 FCFA d’avance GAP. Aucun compte Auth supplémentaire créé.
