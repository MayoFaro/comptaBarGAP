# Reprise comptable 2026 — dossier de contrôle

Dossier préparé le 29 septembre 2026. **Proposition, pas importée.** Aucun code de
l’application, donnée Firebase ou contenu du classeur n’a été modifié.
Les CSV sont des tableaux d’analyse, pas des commandes directement injectables.
Montants en FCFA entiers. Dans les comptes adhérents : positif = avoir,
négatif = dette ; dans la caisse : positif = entrée, négatif = sortie.

## Résultat du rapprochement

La simulation reprend les décisions validées et retrouve **10 000 FCFA en caisse**.
Les comptes de PARE et LE CAM sont corrigés comme convenu. Un écart supplémentaire
est isolé sur DEPERROIS : la fusion du remboursement du 1er septembre produit
**144 210 FCFA d’avoir**, contre 141 210 dans Excel. Cette correction a été
validée par le gestionnaire ; aucune écriture d’équilibrage n’a été inventée.

| Contrôle | Résultat |
|---|---:|
| Caisse d’ouverture au 1er janvier | 454 000 |
| Entrées après reconstitution des remboursements café | 1 334 000 |
| Sorties après reconstitution des achats café | 1 778 000 |
| Caisse finale | **10 000** |
| Avance restant à récupérer auprès du GAP | **30 000** |
| Avoir PARE, correction validée | **17 830** |
| Avoir LE CAM, correction validée | **500** |
| Avoir DEPERROIS, correction validée | **144 210** |

Tous les autres comptes retrouvent le bilan Excel confirmé. Le détail des
21 comptes, de l’ouverture à la clôture de la période, est dans
[03-soldes-adherents.csv](03-soldes-adherents.csv).
Les dettes totalisent 102 300 FCFA, les avoirs 188 040 FCFA dans la proposition
incluant la correction DEPERROIS. Ces comptes ne sont pas des espèces en caisse.

## Sources et périmètre

- Source : `Comptes Bar.xlsx`, feuille « Livre de compte ».
- Empreinte SHA-256 : `cb25f89c6f611f2cb507951727678cc8208e44109e7c7bcf8820aaaf47aa1271`.
- Ouverture : cumul des lignes antérieures au bloc 2026, jusqu’à la ligne 919.
  Certaines anciennes dates sont du texte ou absentes : un filtre strict sur les
  seules dates numériques ne restituerait pas correctement les reports.
- Détail repris : lignes 920 à 1067, soit 147 lignes datées de 2026 et la ligne 924
  dont la date « / » est remplacée par le 10 janvier 2026 sur instruction du gestionnaire.
- Dernière opération source : 22 septembre 2026. Les opérations postérieures ne
  sont pas inventées et devront être rapprochées de la production avant import.
- Les captures de décembre/janvier servent de contrôles historiques, mais ne sont
  pas intégralement réconciliées avec le classeur modifié a posteriori. Les reports
  proposés reproduisent le classeur actuel et le bilan final confirmé ; ils ne
  prouvent pas la situation originale avant les anciennes modifications.
- Les appels décembre 2025–janvier 2026 sont déjà inclus dans les reports individuels.
  **Aucun nouvel appel pour janvier 2026 ne doit être créé.**

## Tableaux fournis

| Fichier | Contenu |
|---|---|
| [01-lignes-excel-2026.csv](01-lignes-excel-2026.csv) | Les 148 lignes source, montants et soldes affichés |
| [02-operations-proposees.csv](02-operations-proposees.csv) | 159 lignes proposées : dates, effets séparés caisse/compte, provenance et liens |
| [03-soldes-adherents.csv](03-soldes-adherents.csv) | Reports, mouvements, corrections, soldes et contrôles par adhérent |
| [04-cafe-par-mois.csv](04-cafe-par-mois.csv) | Achats bruts, participation mensuelle et charge nette |
| [05-correspondance-adherents.csv](05-correspondance-adherents.csv) | Noms Excel et fiches à créer ou rapprocher |

Les 159 lignes comprennent 3 mentions à zéro/sans montant à conserver comme
information seulement : **156 écritures non nulles**, dont 62 appels historiques.
La variation 148 → 159 vient de la fusion des lignes 1060/1061 (−1), de quatre
remboursements déduits à rétablir (+4), et de quatre paires achat/remboursement
supprimées à rétablir (+8). Toutes les lignes source sont référencées une fois
par leur écriture principale ; les écritures complémentaires portent leur lien.

## Corrections et classements appliqués

- Ligne 924 : paiement BUREL de 20 000 le 10 janvier, date précisée par le gestionnaire.
- Appels datés de juin : première occurrence affectée à juin–juillet au 1er juin ;
  deuxième occurrence affectée à août–septembre au 1er août. Aucune suppression
  de cotisation ; dates source conservées.
- Appels absents/à zéro : absences, stages, pauses, arrivée ou départ confirmés.
  Ne pas compléter automatiquement les périodes historiques manquantes.
- Crédits PARE (lignes 954, 962, 968, 1002, 1052) : achats personnels pour l’association,
  dépenses avec avoir de même montant, sans mouvement de caisse.
- DEPERROIS, ligne 1056 : complément personnel de 30 000 au repas du 17 août.
  Repas principal : 310 000 depuis la caisse + 30 000 personnels = 340 000.
  Les vins constituent une dépense distincte.
- DEPERROIS, ligne 1063 : événement dégustation de vins payé personnellement, 112 000.
- Ligne 1058 : participation GAP de 70 000 au repas du 17 août, liée à l’achat
  de vins de 70 000 du 14 août (ligne 1054), intégralement couvert.
- Ligne 1059 : vente de boissons à PARE, recette de 3 000, sans crédit de cotisation.
  Avoir corrigé : 20 830 − 3 000 = **17 830**.
- Ligne 1066 : « Avance profit GAP », 30 000 depuis la caisse, entièrement à récupérer.
  Ni dépense définitive ni débit de cotisation LE CAM/LE DOUX.
  LE CAM : −29 500 + 30 000 = **500 d’avoir**.
- Noms, mentions privées et libellés d’origine doivent rester dans la trace privée ;
  ils ne sont pas automatiquement des libellés à publier dans le journal public.

## Remboursements d’avoir DEPERROIS : correction validée

Le bilan Excel calcule chaque compte par somme des colonnes crédit et débit sous
le nom de l’adhérent, **sans exclure le type cash**. Par conséquent :

| Source | Effet caisse | Effet compte dans Excel | Effet compte proposé |
|---|---:|---:|---:|
| 1060 : cash « vidage compte » | −3 000 | −3 000 | −3 000 |
| 1061 : coti « équilibrage vidage » | 0 | −3 000 | 0, fusion avec 1060 |
| Total du remboursement unique | **−3 000** | **−6 000** | **−3 000** |

Le gestionnaire a confirmé qu’il s’agit d’un seul remboursement. Le classement
correct retire donc un débit de compte en trop et fait passer l’avoir final de
141 210 à **144 210**. L’annonce précédente selon laquelle cette fusion conserverait
le solde était incorrecte. La proposition expose la différence au lieu de la masquer.
**Nouveau solde de 144 210 FCFA validé par le gestionnaire.**

Pour la ligne 1065 « monnaie », 2 000 le 16 septembre, Excel compte déjà −2 000 en
caisse et −2 000 au compte. La proposition conserve ces deux effets dans un seul
remboursement ; elle n’ajoute aucune seconde écriture de débit. Le gestionnaire
signale une ancienne modification compensatoire dans une autre ligne non
identifiable. Cette modification reste dans la source et ne peut être localisée,
annulée ou corrigée de façon fiable. Le solde proposé est donc celui des écritures
conservées, et non une certification de l’historique antérieur à cette modification.

## Café : reconstitution validée

| Mois 2026 | Achats bruts | Remboursement intendance | Charge nette |
|---|---:|---:|---:|
| Janvier | 79 500 | 42 000 | 37 500 |
| Février | 42 000 | 42 000 | 0 |
| Mars | 84 000 | 42 000 | 42 000 |
| Avril | 42 000 | 42 000 | 0 |
| Mai | 60 000 | 45 000 | 15 000 |
| Juin | 45 000 | 45 000 | 0 |
| Juillet | 90 000 | 45 000 | 45 000 |
| Août | 120 000 | 45 000 | 75 000 |
| Septembre | 123 000 | 45 000 | 78 000 |
| **Total** | **685 500** | **393 000** | **292 500** |

- Janvier : achat du 6 et remboursement du 9 déjà séparés ; achat supplémentaire
  de 37 500 le 23 sans autre participation.
- Février, avril, juin : achat entièrement remboursé supprimé du fichier, paire
  reconstituée au 1er du mois, date conventionnelle.
- Mars : 42 000 nets de café deviennent 84 000 bruts ; les thés de 15 000 du 19
  restent une dépense supplémentaire, hors tableau café.
- Mai : 15 000 nets deviennent 60 000 bruts.
- Juillet : paire achat/remboursement de 45 000 reconstituée au 1er ; achat du 24
  de 45 000 entièrement à charge, sans deuxième remboursement.
- Août : achat mixte café/bières, 120 000 bruts, ventilation non connue.
- Septembre : 63 000 bruts et 45 000 remboursés le 1er ; 60 000 le 22 sans remboursement.
- Remboursements inclus dans les montants nets : date conventionnelle de l’achat.
- Reconstitution : **+351 000 d’entrées et +351 000 de sorties**, aucune variation
  du solde final par rapport à Excel.

## Situation actuelle de la WebApp et prérequis techniques

Lecture seule de production effectuée le 29 septembre à 05:48 UTC : initialisation
au 29 septembre, caisse d’ouverture 10 000, première échéance octobre 2026 ; une
fiche « DPS » (`administrator`), sans dette/avoir repris ; zéro opération et zéro
contrôle de caisse. Ce constat doit être refait juste avant une migration.

La correspondance **DPS → DEPERROIS est validée**. Une nouvelle lecture seule
confirme que la fiche `administrator` affiche désormais **DEPERROIS** ; cet
identifiant doit être conservé pour maintenir le lien avec le compte existant. Les 20 autres
fiches du bilan sont absentes lors de cette lecture. CHARENTON, parti, n’a aucune
écriture 2026 à importer et son report est nul ; une fiche d’archive peut être
créée si l’on souhaite conserver son historique antérieur.

La préparation n’est pas un import utilisable tel quel par le backend actuel :

1. Adapter la reprise à une ouverture au 1er janvier de 454 000, en remplaçant
   l’ouverture actuelle, sans cumuler les deux montants ni réinitialiser les accès.
2. Représenter les appels historiques séparément des nouvelles échéances automatiques,
   afin qu’aucun recalcul ne refacture janvier ou les périodes exonérées. Les montants
   approuvés et reports doivent participer au calcul des comptes, pas seulement à l’affichage.
3. Prévoir une avance à un tiers récupérable, distincte des dépenses définitives,
   et le suivi de son remboursement futur. Le GAP doit encore 30 000.
4. Reprendre les opérations dans un lot identifié, avec provenance, protection contre
   le réimport, simulation identique et sauvegarde avant toute écriture réelle.
5. Relire et préserver toutes les données ajoutées depuis le constat ci-dessus ;
   créer/associer les fiches après validation et définir les statuts applicables à
   octobre sans déduire automatiquement la fin d’un stage ou d’une pause.

## Vérifications réalisées

- Recalcul depuis les montants source : tous les soldes de caisse intermédiaires
  concordent avec Excel dans son ordre de saisie.
- Caisse finale avant/après transformation : 10 000.
- Après classement par date, le minimum de caisse en fin de journée est 0 le
  16 août. L’ordre intrajournalier des écritures reconstituées n’est pas une preuve
  de l’ordre réel des encaissements et dépenses.
- Bilan original : 21 comptes sur 21 reproduits avant corrections.
- Après corrections : les 21 soldes attendus sont reproduits, y compris la correction
  DEPERROIS +3 000 validée, sans compensation artificielle.
- Un seul remboursement intendance par mois, 9 mois, total 393 000.
- Les 148 lignes sont couvertes sans omission ni réemploi comme opération principale.
- Les appels historiques totalisent 930 000 en 2026 (62 × 15 000) ; le débit
  non-cotisation de 3 000 de la ligne 1061 est fusionné avec le remboursement.

**Les soldes de reprise et le rapprochement DEPERROIS sont validés. Prochaine
étape : préparer le mécanisme de migration, les fiches manquantes et les statuts
applicables aux prochaines échéances, puis simuler avant tout import. Aucun import
n’a été exécuté. Le renommage de la fiche a été effectué par le gestionnaire.**

## Suite de la préparation

La préparation technique et les simulations sont réalisées, sans injection.
Voir [PREPARATION_MIGRATION.md](PREPARATION_MIGRATION.md) pour les adaptations,
les tests et les statuts octobre confirmés. Le paragraphe des prérequis ci-dessus
reste la description des contraintes à respecter pour l’application réelle.
