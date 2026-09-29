# comptesBarGAP --- Spécification fonctionnelle V1

## 1. Objet de l'application

`comptesBarGAP` est une application simple de gestion de la caisse d'une
association.

Elle doit permettre :

-   de suivre toutes les entrées et sorties d'espèces ;
-   de gérer les cotisations des adhérents ;
-   de suivre les dépenses de l'association ;
-   de gérer les remboursements reçus liés à certaines dépenses ;
-   de gérer les dépenses avancées par un adhérent et transformées
    notamment en avoir de cotisations ;
-   de contrôler régulièrement la caisse physique ;
-   de rendre les mouvements de caisse transparents et publiquement
    consultables ;
-   de conserver la confidentialité de la situation individuelle des
    adhérents ;
-   de faciliter la transmission de la gestion à un nouvel
    administrateur.

L'application doit rester suffisamment simple pour qu'un nouveau
gestionnaire puisse la prendre en main rapidement, sans connaissance
comptable particulière.

------------------------------------------------------------------------

## 2. Plateformes

L'application sera développée en Flutter.

Elle devra fonctionner au minimum :

-   comme WebApp ;
-   sur Android.

La WebApp constitue l'interface principale de consultation et de
gestion.

------------------------------------------------------------------------

## 3. Principes métier fondamentaux

### 3.1 Caisse espèces

Pour le MVP, toute la trésorerie gérée par l'application est en espèces.

Il n'existe pas de :

-   compte bancaire ;
-   paiement par virement ;
-   Mobile Money ;
-   chèque ;
-   carte bancaire.

Toute entrée de cotisation correspond donc à une entrée réelle d'espèces
dans la caisse.

### 3.2 Transparence de la caisse

Toutes les opérations affectant la caisse sont publiquement consultables
sans authentification.

Exemples :

-   Cotisation : +15 000 FCFA
-   Achat café : -60 000 FCFA
-   Remboursement Intendance : +45 000 FCFA

Les paiements de cotisations sont anonymisés dans la partie publique.

Le public ne peut jamais déterminer à partir des données privées de
l'application quel adhérent a effectué une cotisation donnée.

### 3.3 Confidentialité des adhérents

La situation individuelle d'un adhérent n'est jamais publique.

Un adhérent authentifié peut consulter son propre compte.

Il ne peut pas consulter le compte individuel des autres adhérents.

L'administrateur peut consulter et gérer l'ensemble des comptes.

------------------------------------------------------------------------

## 4. Rôles et authentification

Trois niveaux d'accès existent.

### PUBLIC

Aucune authentification.

Peut consulter :

-   solde de caisse ;
-   journal des opérations ;
-   dépenses ;
-   remboursements ;
-   événements ;
-   synthèses publiques ;
-   résultats des contrôles de caisse.

Ne voit aucune information permettant d'identifier l'auteur d'une
cotisation.

### MEMBER

Adhérent authentifié.

Dispose de tous les droits PUBLIC.

Dispose en plus d'un espace **Mon compte**.

Il peut y consulter :

-   les cotisations dues ;
-   les cotisations réglées ;
-   les paiements effectués ;
-   les mois d'absence/exonération ;
-   les sommes restant dues ;
-   les éventuels avoirs/crédits.

Il ne dispose d'aucun droit d'écriture comptable.

### ADMIN

Un adhérent possédant temporairement les droits de gestion.

Il dispose de tous les droits MEMBER et peut :

-   saisir les opérations ;
-   encaisser les cotisations ;
-   gérer les dépenses ;
-   enregistrer les remboursements ;
-   gérer les événements ;
-   gérer les adhérents ;
-   gérer les périodes d'absence ;
-   gérer les avoirs ;
-   contrôler la caisse ;
-   corriger ou annuler des opérations ;
-   lancer les appels de cotisations ;
-   modifier les paramètres ;
-   transférer le rôle ADMIN.

Il ne doit normalement exister qu'un seul ADMIN actif.

------------------------------------------------------------------------

## 5. Gestion des adhérents

Chaque adhérent possède une fiche permanente.

Son historique n'est pas supprimé lorsqu'il quitte temporairement ou
définitivement l'association.

### Actif

L'adhérent est soumis à la cotisation mensuelle.

### Pause / absence

L'administrateur définit les mois pendant lesquels aucune cotisation
n'est due.

La gestion se fait au mois entier et non à la date ou à l'heure.

Exemple : pause en novembre 2026, décembre 2026 et janvier 2027.

Ces mois génèrent 0 FCFA de cotisation.

À l'issue de la période définie, l'adhérent redevient automatiquement
actif.

Aucun prorata n'est calculé.

### Parti

Aucune nouvelle cotisation n'est générée.

La fiche et tout l'historique sont conservés.

### Réintégré

Un ancien adhérent peut redevenir actif à partir d'un mois choisi.

Son ancien historique est conservé.

### Suppression

La suppression définitive d'un adhérent ne doit être autorisée que si sa
fiche a été créée par erreur et qu'aucune opération ou donnée comptable
ne lui est rattachée.

Dans les autres cas, on utilise l'état « Parti ».

------------------------------------------------------------------------

## 6. Cotisations

### 6.1 Principe

La cotisation est définie mensuellement.

Valeur initiale :

**7 500 FCFA / mois**

Cette valeur n'est pas codée en dur.

Elle est configurable dans les paramètres administrateur.

La fréquence normale d'appel est :

**2 mois**

Soit actuellement :

**15 000 FCFA par appel pour un adhérent actif pendant les deux mois.**

### 6.2 Historisation du tarif

Une modification du tarif ne doit jamais modifier rétroactivement les
cotisations déjà dues.

Exemple :

-   jusqu'à décembre 2026 : 7 500 FCFA/mois ;
-   à partir de janvier 2027 : 8 000 FCFA/mois.

Les périodes antérieures restent calculées à 7 500 FCFA.

------------------------------------------------------------------------

## 7. Appel de cotisations

La fréquence des appels est configurable.

Valeur initiale :

**tous les 2 mois**

Le délai de notification administrateur est également configurable.

Valeur initiale :

**J-5**

À l'ouverture de son compte à partir de J-5, l'administrateur reçoit une
notification :

> L'appel de cotisations pour \[MOIS 1 -- MOIS 2\] approche.\
> Voulez-vous préparer l'appel ?

### Préparation

L'application affiche la liste des adhérents.

Les adhérents normalement concernés sont cochés automatiquement.

Exemple :

-   ☑ DUPONT --- 15 000 FCFA
-   ☑ MARTIN --- 15 000 FCFA
-   [ ] LE CAM --- absent sur la période
-   ☑ DURAND --- 15 000 FCFA

L'administrateur peut modifier manuellement la sélection avant
validation.

### Message WhatsApp

Après validation, l'application génère un message d'appel de
cotisations.

L'administrateur peut le copier puis le coller dans WhatsApp.

Le texte exact du modèle de message sera défini ultérieurement.

------------------------------------------------------------------------

## 8. Paiement des cotisations

Les paiements sont exclusivement effectués en espèces.

L'administrateur choisit :

-   adhérent ;
-   montant reçu ;
-   date ;
-   commentaire facultatif.

Le montant est libre.

Il peut être :

-   égal à la somme due ;
-   supérieur ;
-   inférieur.

### 8.1 Imputation

Par défaut, le paiement est affecté aux cotisations impayées les plus
anciennes.

L'administrateur peut modifier cette imputation si nécessaire.

Exemple : DUPONT doit quatre mois à 7 500 FCFA, soit 30 000 FCFA. Il
verse 20 000 FCFA.

Résultat :

-   septembre : payé ;
-   octobre : payé ;
-   novembre : 5 000 / 7 500 ;
-   décembre : 0 / 7 500.

Reste dû : 10 000 FCFA.

### 8.2 Trop-versé

Si un adhérent verse plus que ce qu'il doit, l'excédent devient un
crédit/avoir.

Exemple :

-   dû : 15 000 FCFA ;
-   versé : 20 000 FCFA ;
-   cotisations soldées : 15 000 FCFA ;
-   avoir : +5 000 FCFA.

Cet avoir pourra être utilisé pour des cotisations futures.

------------------------------------------------------------------------

## 9. Avoirs

Un adhérent peut disposer d'un crédit envers l'association.

Celui-ci peut notamment provenir :

-   d'un trop-versé de cotisation ;
-   d'une dépense réalisée personnellement pour l'association et
    transformée en avoir.

Exemple :

LE CAM achète une machine à café pour 60 000 FCFA avec ses fonds.

L'association décide de lui accorder un avoir correspondant.

Résultat :

**avoir LE CAM : +60 000 FCFA**

Aucun mouvement n'est enregistré dans la caisse physique puisque
l'argent n'est ni entré ni sorti de celle-ci.

L'avoir pourra ensuite être utilisé pour régler les cotisations de LE
CAM.

------------------------------------------------------------------------

## 10. Opérations de caisse du MVP

Une opération de caisse correspond à un mouvement réel d'espèces.

Les types principaux sont :

### Cotisation

Entrée d'espèces.

Exemple : +15 000 FCFA.

L'identité de l'adhérent est privée.

### Dépense

Sortie d'espèces.

Exemple : Achat café : -60 000 FCFA.

### Remboursement reçu

Entrée d'espèces correspondant au remboursement total ou partiel d'une
dépense.

Exemple :

-   Achat café : -60 000 FCFA
-   Remboursement Intendance : +45 000 FCFA
-   Coût net association : 15 000 FCFA

Le remboursement est relié à la dépense d'origine.

### Autre entrée

Type prévu pour conserver une certaine souplesse future.

Il n'est pas mis en avant dans l'interface principale du MVP car les
entrées normales de l'association proviennent des cotisations et
remboursements.

------------------------------------------------------------------------

## 11. Dépenses

Une dépense contient :

-   montant ;
-   date ;
-   libellé ;
-   catégorie ;
-   événement facultatif ;
-   payeur ;
-   commentaire facultatif ;
-   justificatif facultatif.

### Payeur : caisse

La dépense provoque immédiatement une sortie de caisse.

### Payeur : adhérent ou tiers

La dépense ne provoque aucun mouvement de caisse.

Elle peut notamment donner lieu à un avoir de cotisations pour
l'adhérent concerné.

------------------------------------------------------------------------

## 12. Catégories

Les dépenses peuvent être classées dans des catégories.

Exemples initiaux :

-   Café ;
-   Alimentation ;
-   Matériel ;
-   Entretien ;
-   Autre.

La liste doit être configurable par l'administrateur.

Les catégories servent principalement aux synthèses et recherches.

------------------------------------------------------------------------

## 13. Justificatifs

Une dépense peut posséder un justificatif.

Le justificatif est toujours facultatif.

L'administrateur doit pouvoir :

-   prendre directement une photo sur Android ;
-   choisir une photo existante ;
-   téléverser un fichier depuis la WebApp.

Formats minimum :

-   JPG/JPEG ;
-   PNG ;
-   WebP ;
-   PDF.

Les justificatifs ne sont pas publics dans le MVP.

Ils sont accessibles à l'administrateur.

------------------------------------------------------------------------

## 14. Événements

Un événement n'est pas une opération comptable.

Il permet de regrouper plusieurs opérations.

Exemples :

-   Repas du 17 août ;
-   Petit-déjeuner crêpes ;
-   Dégustation caviar.

Une opération peut être rattachée facultativement à un événement.

Exemple :

**Repas du 17 août**

-   Courses : -35 000
-   Boissons : -20 000
-   Pain : -5 000
-   Remboursement/participation : +15 000

L'application calcule :

-   dépenses : 60 000 FCFA ;
-   entrées : 15 000 FCFA ;
-   coût net : 45 000 FCFA.

------------------------------------------------------------------------

## 15. Contrôle physique de caisse

Le contrôle de caisse est une photographie de la situation à un instant
donné.

Il ne constitue pas lui-même une opération financière.

L'application affiche le solde théorique.

Exemple :

**Solde théorique : 385 000 FCFA**

Deux modes de comptage sont disponibles.

### Comptage simple

L'administrateur saisit directement le montant réellement présent.

### Comptage par coupures

L'administrateur saisit le nombre de billets/pièces de chaque coupure
activée.

Dans la configuration actuelle, le gestionnaire souhaite normalement
conserver uniquement :

-   billets de 10 000 FCFA ;
-   billets de 5 000 FCFA.

Exemple :

-   10 000 × 32 = 320 000
-   5 000 × 13 = 65 000
-   total physique = 385 000 FCFA

Les coupures sont configurables afin qu'un futur gestionnaire puisse
adopter une autre méthode.

------------------------------------------------------------------------

## 16. Écart de caisse

Après comptage :

-   théorique : 385 000 FCFA ;
-   physique : 380 000 FCFA ;
-   écart : -5 000 FCFA.

Un écart ne modifie jamais automatiquement le solde théorique.

L'administrateur peut :

-   recompter ;
-   enregistrer le contrôle avec son écart ;
-   effectuer ensuite volontairement une correction de caisse.

Une correction financière doit être traçable.

------------------------------------------------------------------------

## 17. Historique des contrôles

Chaque contrôle est conservé.

Exemple :

-   28/09/2026 --- écart 0
-   31/08/2026 --- écart 0
-   31/07/2026 --- écart -5 000

Le résultat des contrôles peut être consulté publiquement.

La ventilation détaillée des billets/pièces reste privée.

------------------------------------------------------------------------

## 18. Corrections et annulations

Les erreurs doivent être faciles à corriger sans permettre de réécrire
silencieusement l'historique.

Une opération financière ne doit pas être physiquement supprimée
lorsqu'elle possède un historique comptable.

### Correction

L'administrateur peut corriger une opération.

Exemple :

Achat café : 60 000 → 65 000 FCFA.

L'application conserve :

-   ancienne valeur ;
-   nouvelle valeur ;
-   date de correction.

Une correction ayant un impact financier nécessite un motif.

### Annulation

Une opération créée par erreur peut être annulée.

Elle ne participe alors plus aux calculs mais son existence reste
enregistrée.

Exemple :

**ANNULÉ --- saisie en double**

### Correction d'une cotisation

Une cotisation relie :

-   une entrée de caisse ;
-   un adhérent ;
-   une ou plusieurs périodes de cotisation.

Si l'administrateur sélectionne le mauvais adhérent, il peut corriger
l'attribution.

La caisse n'est pas modifiée si le montant reste identique.

Les imputations de cotisations sont recalculées automatiquement.

La partie publique ne révèle ni l'ancienne ni la nouvelle identité.

------------------------------------------------------------------------

## 19. Journal public

La page publique principale présente :

-   solde actuel ;
-   dernier contrôle de caisse ;
-   journal chronologique des opérations.

Exemple :

  Date    Opération                  Catégorie / événement     Entrée   Sortie
  ------- -------------------------- ----------------------- -------- --------
  28/09   Cotisation                 ---                       15 000
  27/09   Remboursement Intendance   Café                      45 000
  25/09   Achat café                 Café                               60 000
  17/08   Courses                    Repas du 17 août                   35 000

Les cotisations sont systématiquement anonymisées.

------------------------------------------------------------------------

## 20. Consultation et filtres publics

Le journal doit pouvoir être filtré simplement.

Filtres prévus :

-   période ;
-   type d'opération ;
-   catégorie ;
-   événement.

Une recherche texte permet par exemple de rechercher `café`.

------------------------------------------------------------------------

## 21. Synthèse publique

Une synthèse simple peut présenter notamment :

-   total des cotisations encaissées ;
-   remboursements reçus ;
-   dépenses ;
-   solde actuel.

Les dépenses peuvent être regroupées par catégorie.

Lorsque des remboursements sont rattachés aux dépenses, l'application
peut afficher :

-   dépense brute ;
-   remboursements ;
-   coût net pour l'association.

Le MVP ne nécessite pas de tableaux de bord graphiques complexes.

------------------------------------------------------------------------

## 22. Tableau de bord administrateur

La partie Administration est distincte de la consultation publique.

Elle constitue le poste de travail du gestionnaire.

### Opérations

Actions principales :

-   Encaisser une cotisation
-   Nouvelle dépense
-   Ajouter un remboursement
-   Gérer les événements
-   Contrôler la caisse
-   Historique / corrections

### Adhérents

Fonctions :

-   Liste des adhérents
-   Nouvel adhérent
-   Modifier un adhérent
-   Mettre en pause
-   Réactiver
-   Enregistrer un départ
-   Réintégrer un ancien adhérent
-   Consulter la situation individuelle
-   Consulter les avoirs

### Cotisations

Fonctions :

-   Préparer/lancer un appel
-   Voir l'appel en cours
-   Voir les situations payé / partiel / non payé
-   Historique des appels
-   Générer le message WhatsApp

### Paramètres

Au minimum :

#### Cotisations

-   montant mensuel ;
-   date d'effet du tarif ;
-   fréquence des appels ;
-   délai de notification avant appel.

#### Dépenses

-   gestion des catégories.

#### Caisse

-   coupures utilisées pour le comptage.

#### Association

-   nom/titre affiché.

#### Administration

-   transfert du rôle administrateur.

------------------------------------------------------------------------

## 23. Passation de gestion

La transmission de la gestion doit être explicitement prévue.

Avant la passation, un contrôle physique de caisse peut être effectué.

Exemple :

-   solde théorique : 385 000 FCFA ;
-   solde physique : 385 000 FCFA ;
-   écart : 0.

La validation de la passation :

-   retire le rôle ADMIN à l'ancien gestionnaire ;
-   attribue le rôle ADMIN au nouveau ;
-   conserve la trace de la passation ;
-   ne modifie aucun historique comptable.

L'ancien gestionnaire reste MEMBER s'il reste adhérent.

------------------------------------------------------------------------

## 24. Principes UX

L'application doit privilégier la simplicité sur l'exhaustivité
comptable.

Un gestionnaire ne doit pas avoir besoin de comprendre la structure
interne des écritures.

Les actions doivent utiliser le vocabulaire réel de l'association :

-   Encaisser une cotisation
-   Nouvelle dépense
-   Ajouter un remboursement
-   Contrôler la caisse
-   Mettre un adhérent en pause
-   Lancer l'appel de cotisations

Les mécanismes comptables sous-jacents doivent être automatiques.

Les fonctionnalités rares ne doivent pas encombrer les écrans
principaux.

------------------------------------------------------------------------

## 25. Hors périmètre du MVP

Ne sont pas nécessaires au MVP :

-   comptabilité générale ;
-   compte bancaire ;
-   rapprochement bancaire ;
-   Mobile Money ;
-   carte bancaire ;
-   facturation ;
-   gestion commerciale ;
-   stock du bar ;
-   gestion quotidienne obligatoire de clôture ;
-   graphiques financiers complexes ;
-   multiples administrateurs simultanés ;
-   consultation publique des comptes individuels ;
-   consultation publique des justificatifs.

------------------------------------------------------------------------

## 26. Règle directrice

**La caisse explique publiquement chaque franc qui entre ou sort.**

**Le compte adhérent explique privativement ce que chaque adhérent doit,
a payé ou possède en avoir.**

**Les deux sont reliés lorsque nécessaire, mais ne doivent jamais être
confondus.**


------------------------------------------------------------------------

## 27. Décisions de cadrage validées le 28 septembre 2026

Cette section précise et complète les sections précédentes ; elle prévaut
sur celles-ci en cas de divergence.

### Échéances et consommation des avoirs

- Les cotisations sont payables d'avance au premier jour de chaque mois pair.
- Au 1er octobre, octobre et novembre sont dus ; au 1er décembre, décembre
  et janvier sont dus. Le tarif reste défini par mois, initialement 7 500 FCFA.
- Le calcul respecte le tarif applicable et les absences de chacun des mois.
- Les avoirs disponibles sont automatiquement imputés aux cotisations dues,
  des plus anciennes aux plus récentes, sans mouvement de caisse.
- La sélection des destinataires de l'appel ne constitue pas une exonération.
  Convention d'implémentation : l'échéance crée la dette indépendamment du
  lancement du message d'appel, sans doublon lors d'une nouvelle préparation.

### Démarrage et reprise des données

- Pas d'import de l'historique Excel pour le démarrage.
- Les adhérents seront saisis manuellement par l'administrateur.
- À une date de bascule choisie, reprise du solde de caisse et, si nécessaire,
  des dettes ou avoirs individuels sur les fiches créées manuellement.
- Une dette reprise sans détail des périodes porte le libellé « Solde antérieur » ;
  l'application n'invente pas de ventilation mensuelle historique.
- Les reports individuels ne génèrent aucun mouvement d'espèces.
- Le classeur reste une archive. Une éventuelle reprise de l'historique 2026
  est différée et devra éviter de compter deux fois les reports d'ouverture.
- Le classeur fourni affiche 10 000 FCFA à sa dernière opération du
  22 septembre 2026 ; ce montant n'est pas imposé comme solde de bascule.

### Remboursement d'un avoir

- L'administrateur peut rembourser tout ou partie d'un avoir en espèces,
  notamment lors du départ d'un adhérent.
- Cette action diminue simultanément l'avoir disponible et la caisse.
- Elle ne peut dépasser l'avoir disponible ni être assimilée à une nouvelle
  dépense : elle règle un crédit déjà enregistré.
- Date, montant, bénéficiaire et motif sont conservés. Convention de
  confidentialité : le journal public affiche « Remboursement d'avoir »
  sans identité ni situation individuelle du bénéficiaire.

### Infrastructure et accès

- Application Flutter pour le Web et Android.
- Données dans Cloud Firestore ; WebApp hébergée sur Firebase Hosting.
- Authentification email/mot de passe avec Firebase Authentication.
- L'administrateur renseigne l'email sur une fiche adhérent existante.
  L'adhérent active son accès et choisit son mot de passe.
- La liaison à une fiche doit être contrôlée côté serveur et ne peut pas
  être obtenue en revendiquant simplement un nom ou un identifiant de fiche.

### Décision complémentaire du 29 septembre 2026 — accès créés par le gestionnaire

- Les inscriptions libres sont désactivées dans Firebase Authentication.
- Depuis une fiche munie d’un email, le gestionnaire utilise « Créer l’accès ».
- Le serveur prépare le compte sans mot de passe ; aucun email n’est envoyé automatiquement.
- L’adhérent choisit son mot de passe via « Mot de passe oublié », puis vérifie
  son adresse depuis « Mon compte » avant d’activer la liaison à sa fiche.
- La création est réservée au gestionnaire et supporte les tentatives répétées.
- Cette décision remplace le parcours antérieur d’inscription par l’adhérent.
