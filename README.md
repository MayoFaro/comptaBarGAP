# Comptes Bar GAP

Application Flutter Web/Android de caisse associative : journal public anonymisé,
cotisations et avoirs privés, gestion des adhérents, dépenses et justificatifs,
contrôles de caisse et passation de gestion.

Le classeur Excel fourni reste une archive de référence non modifiée et n'est pas
inclus dans la WebApp. Son historique 2026 validé a été importé dans Firestore le
29 septembre 2026 par le lot `excel_2026_v1`.

## Prérequis

- Flutter 3.32.8 / Dart 3.8.1 ou version compatible avec `pubspec.lock`.
- Node.js 22 (`.nvmrc`), npm et Java 21 pour les émulateurs Firebase.
- Pour Android : SDK Android, NDK 27.0.12077973. La configuration Kotlin du
  projet est adaptée aux SDK Firebase utilisés.

```sh
flutter pub get
npm ci
npm ci --prefix functions
```

Les versions des outils Firebase et des dépendances sont verrouillées. Utiliser
le CLI local (`npx firebase`), plutôt qu'une ancienne installation globale.

## Démarrage local sans projet cloud

Dans un premier terminal :

```sh
npm run emulators
```

Le projet `demo-comptes-bar-gap` est réservé aux émulateurs. L'interface des
émulateurs est disponible sur `http://127.0.0.1:4000`. Les données locales sont
conservées dans `.emulator-data` à l'arrêt normal des émulateurs. Une première
exécution peut signaler que le dossier d'import n'existe pas encore.

Dans un deuxième terminal, une seule fois pour initialiser le gestionnaire local :

```sh
npm run bootstrap:local
```

Connexion locale : **admin@gap.test** / **Gap-local-2026!**.
Ce compte n'est créé que dans l'émulateur, jamais dans un projet cloud.

Lancer la WebApp :

```sh
flutter run -d chrome --dart-define=USE_EMULATORS=true
```

Lancer sur un émulateur Android :

```sh
flutter run -d <identifiant-android> --dart-define=USE_EMULATORS=true --dart-define=EMULATOR_HOST=10.0.2.2
```

Les émulateurs de services écoutent uniquement sur la machine locale. Pour un
appareil Android physique, utiliser un tunnel `adb reverse` adapté ou configurer
explicitement un environnement de développement accessible à cet appareil.

## Première utilisation

1. Se connecter, ouvrir **Gestion**, puis **Initialiser l'association**.
2. Renseigner la date de bascule, les espèces réellement reprises, le nom du
   gestionnaire et la première échéance qui reste à créer.
3. Ajouter les adhérents dans **Gestion → Adhérents**. Le gestionnaire dispose
   déjà de sa propre fiche, créée lors de l'initialisation.
4. Pour chaque fiche, saisir si nécessaire une dette OU un avoir antérieur.
   Ces reports ne modifient jamais la caisse. Le premier mois à facturer doit
   exclure les périodes déjà couvertes par la reprise.
5. Renseigner l'email pour permettre à l'adhérent d'activer son accès.

Les cotisations sont payables d'avance : au 1er octobre, octobre et novembre
sont dus. Les montants des appels tiennent compte des paiements et avoirs disponibles.
Les appels WhatsApp ne créent pas une exonération : décocher un nom
modifie seulement les destinataires du message. Utiliser une absence pour
exonérer une période.

Un paiement est affecté aux dettes les plus anciennes. Une liste facultative
de mois prioritaires permet de changer cet ordre (`2026-10, 2026-11` ; `opening`
pour le solde antérieur). Le trop-versé reste disponible comme avoir. Un avoir
issu d'une avance personnelle est attribué explicitement lors de la dépense,
puis consommé automatiquement sur les dettes dues.

Pour rembourser un avoir en espèces : menu de l'adhérent → **Rembourser un avoir**.
La caisse et le crédit diminuent ensemble ; le serveur contrôle l'avoir et les
espèces disponibles. Une dépense personnelle n'est jamais une sortie de caisse.

Cliquer une opération dans **Gestion → Historique** pour la corriger ou l'annuler.
Le motif et les valeurs précédentes sont conservés. Un remboursement reçu doit
être annulé avant de pouvoir annuler sa dépense d'origine.

Un contrôle de caisse enregistre le théorique observé, le physique et l'écart.
Il ne corrige pas automatiquement la caisse. Les coupures et notes restent privées.

## Connexion au projet Firebase réel

Projet raccordé : `ma-compta-bar-gap` (alias par défaut dans `.firebaserc`).
Applications Web/Android enregistrées, configurations locales générées et règles
Firestore déployées. Premier administrateur : `groodep@yahoo.fr`.
Blaze est actif. Fonctions, règles Firestore/Storage et Hosting sont déployés.
Site : https://ma-compta-bar-gap.web.app.
Les permissions d’invocation Cloud Run ont été corrigées avec accord explicite.
Les appels anonymes sont refusés par les contrôles Firebase côté serveur.
Pour démarrer : **Connexion → Mot de passe oublié** avec `groodep@yahoo.fr`,
puis connexion et vérification de l’email depuis **Mon compte**. Initialiser
ensuite l’association dans **Gestion**, avant de saisir les adhérents.
La création de comptes est réservée au gestionnaire ; les inscriptions libres sont désactivées.
Les étapes ci-dessous servent de référence pour reproduire le déploiement.

1. Dans Firebase, activer **Authentication → Email/Password**, créer **Firestore**
   et un bucket **Storage**, puis configurer **Hosting**. Prévoir le forfait et
   les API nécessaires à Cloud Functions, Cloud Scheduler et Storage.
2. Enregistrer les applications Web et Android (`ga.gap.comptes_bar_gap`).
3. Copier `firebase-config.example.json` vers `firebase-config.json`, puis
   renseigner les valeurs publiques de configuration de l'application Web.
   Pour Android, utiliser un fichier équivalent avec l'App ID Android.
   Ne jamais y placer une clé de compte de service.
4. Compiler et déployer les règles, fonctions et fichiers Web :

```sh
flutter build web --dart-define-from-file=firebase-config.json
npx firebase deploy --project <projet-cible> --only firestore,storage,functions,hosting
```

Les fonctions utilisent `europe-west1`. Choisir les emplacements Firestore et
Storage lors de la création du projet en tenant compte de cette région.
Autoriser le domaine Hosting dans les paramètres d'Authentication et configurer
les modèles d'emails de vérification et de réinitialisation.

Amorcer le premier administrateur depuis un environnement disposant des droits
Firebase Admin :

```sh
GCLOUD_PROJECT=<projet-cible> ADMIN_EMAIL=<email> GOOGLE_APPLICATION_CREDENTIALS=<fichier-prive-hors-du-depot> node scripts/bootstrap.mjs
```

Avec un CLI Firebase déjà connecté, l’option `--firebase-cli` permet d’utiliser
ses identifiants en mémoire sans exporter de clé de compte de service :

```sh
GCLOUD_PROJECT=ma-compta-bar-gap ADMIN_EMAIL=groodep@yahoo.fr node scripts/bootstrap.mjs --firebase-cli
```

Le premier administrateur est déjà créé sur ce projet : ne pas relancer l’amorçage.
Pour Android, la configuration générée est `firebase-config.android.json`.

Ce script refuse de remplacer un administrateur existant. Il ne génère aucun mot
de passe de production. Utiliser **Connexion → Mot de passe oublié**, choisir
un mot de passe, puis se connecter et vérifier l'email depuis **Mon compte**.
L'initialisation de l'association devient possible après vérification.
Les passations suivantes se font dans l'application.

Le gestionnaire ouvre **Gestion → Adhérents → menu de la fiche → Créer l’accès**.
La fiche doit avoir un email. Le serveur crée un compte sans mot de passe, ou
réutilise celui de cette adresse ; répéter l’action ne crée pas de doublon.
Aucun email n’est envoyé par cette action. Le gestionnaire indique à l’adhérent
qu’il peut utiliser **Connexion → Mot de passe oublié** pour choisir son mot
de passe. L’adhérent se connecte, demande le lien de vérification depuis
**Mon compte**, puis clique **J’ai vérifié mon email · Activer mon compte**.
La liaison est réservée à l’accès préparé par le gestionnaire et à l’email vérifié.
Un compte Auth créé seul ne donne aucun accès aux données privées de la fiche.
Les inscriptions libres restent désactivées dans Firebase Authentication.
Après création de l’accès, une correction d’email nécessite une intervention
Firebase ; les autres informations de la fiche restent modifiables.
Dans l’émulateur, les liens des emails apparaissent dans les journaux Auth.

Pour distribuer Android, configurer une clé de signature de production avant
la compilation de livraison. L'APK de développement est signé avec la clé debug.
Le fichier de configuration Android doit être passé via `--dart-define-from-file`.

## Tests

```sh
flutter analyze
flutter test
npm run test:server
npm run test:emulators
```

`test:emulators` utilise uniquement le projet de démonstration, vide sa base pour
les scénarios de test, puis arrête les émulateurs. Lancer cette commande avec les
émulateurs de développement arrêtés ; elle ne charge pas `.emulator-data`.

Si les émulateurs de test sont déjà lancés dans un environnement jetable :

```sh
npm --prefix functions run test:rules
npm --prefix functions run test:integration
```

Les tests métier couvrent les dettes mensuelles, changements de tarif, absences,
avances, imputations, remboursements, annulations et séparation public/privé.
Les tests d'intégration vérifient les transactions, les doubles soumissions,
les remboursements concurrents, les accès vérifiés et la passation.
Les règles Firestore et Storage sont testées avec des clients anonymes,
adhérents et administrateur.

Pour le parcours navigateur automatisé, utiliser des émulateurs jetables déjà
lancés, compiler le Web local, puis le servir dans un autre terminal :

```sh
flutter build web --dart-define=USE_EMULATORS=true
python3 -m http.server 8088 --bind 127.0.0.1 --directory build/web
```

```sh
npm run test:browser
```

Ce scénario réinitialise la base de démonstration, crée ses comptes de test,
puis vérifie dans Chrome la création d'un adhérent, un encaissement, un
remboursement d'avoir, un contrôle physique et l'anonymat du journal.
`CHROME_EXECUTABLE` permet de choisir le binaire Chrome. Les captures de
contrôle sont enregistrées dans `/tmp/gap-ui-desktop.png` et
`/tmp/gap-ui-mobile.png`.

## Structure et choix techniques

- `lib/data/store.dart` : connexion Firebase et données selon le rôle.
- `lib/ui/` : journal public, espace adhérent, formulaires de gestion.
- `functions/src/domain.js` : règles métier pures, sans accès réseau.
- `functions/src/index.js` : commandes transactionnelles, audit, activation,
  publication des projections anonymisées et actualisation quotidienne.
- `firestore.rules` / `storage.rules` : contrôle des lectures et justificatifs.
- `scripts/bootstrap.mjs` : amorçage contrôlé du premier administrateur.

Les clients ne peuvent écrire ni les opérations, ni les soldes, ni les rôles
Firestore. Une commande serveur valide et enregistre ensemble les données
privées, les soldes dérivés, l'audit et leurs projections publiques. Un identifiant
de commande stable évite les doubles encaissements lors d'une nouvelle tentative.
Le rôle administrateur est contrôlé depuis Firestore, y compris après passation.

Le traitement est conçu pour une petite association : chaque commande recharge
l'état métier puis ne réécrit que les documents modifiés. Un volume de plusieurs
années devra être suivi pour éviter de grossir indéfiniment les projections de
comptes. La reprise détaillée de 2026 remplace les anciens soldes de reprise ; elle ne les
additionne pas à l'historique importé.

Les justificatifs sont lus avec l'authentification Storage ; l'application ne
publie pas de lien de téléchargement permanent. Les écritures financières
nécessitent une connexion. La persistance Firestore hors ligne est désactivée.
Les échéances sont actualisées chaque jour à 00:05, heure de Libreville, et à
l'ouverture de la gestion. Le planificateur n'est pas exécuté automatiquement
par les émulateurs ; la commande d'actualisation à l'ouverture assure le test local.

Références : [Flutter et Firebase](https://firebase.google.com/docs/flutter/setup),
[transactions Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions),
[tests des règles](https://firebase.google.com/docs/rules/unit-tests).

## Reprise Excel 2026

Le dossier validé et la procédure figurent dans
[Préparation de migration](docs/reprise-2026/PREPARATION_MIGRATION.md).
`npm run migration:simulate` simule sur une base fictive ;
`npm run migration:prepare` lit la production puis génère un plan local privé.
Le lot `excel_2026_v1` a été importé en production le 29 septembre 2026 avec
contrôle des soldes, de la caisse, de l’avance GAP et de l’accès administrateur.
