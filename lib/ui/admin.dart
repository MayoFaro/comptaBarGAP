import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import '../data/store.dart';
import 'app.dart';
import 'components.dart';

num memberBalance(Json member) {
  final account = object(member['account']);
  return (account['credit'] as num? ?? 0) - (account['due'] as num? ?? 0);
}

class AdminPage extends StatefulWidget {
  final GapStore store;
  const AdminPage({super.key, required this.store});
  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage> {
  String section = 'Opérations', search = '';
  bool hidePausedOrDeparted = false, showHiddenMembers = false;
  GapStore get s => widget.store;
  @override
  Widget build(BuildContext context) {
    if (s.settings.isEmpty) {
      return PageBody(
        title: 'Bienvenue dans votre espace de gestion',
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Commencez par définir la date de bascule et le montant réellement repris en caisse. Vous pourrez ensuite saisir les adhérents et leurs soldes antérieurs.',
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: () => setup(context, s),
                  icon: const Icon(Icons.flag_outlined),
                  label: const Text('Initialiser l’association'),
                ),
              ],
            ),
          ),
        ],
      );
    }
    final upcoming = suggestedCallMonth(s.settings, s.rows('calls'), today());
    final notice = DateTime.parse(
      '$upcoming-01',
    ).difference(DateTime.parse(today())).inDays;
    final operations = [...s.rows('operations')]
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageBody(
      title: 'Espace de gestion',
      subtitle: 'Les outils du gestionnaire.',
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final name in [
              'Opérations',
              'Adhérents',
              'Appels',
              'Paramètres',
              'Historique',
            ])
              ChoiceChip(
                label: Text(name),
                selected: name == section,
                onSelected: (_) => setState(() => section = name),
              ),
          ],
        ),
        const SizedBox(height: 24),
        if (notice <= (s.settings['noticeDays'] as int) &&
            !s.rows('calls').any((c) => c['start'] == upcoming)) ...[
          Panel(
            child: Wrap(
              spacing: 16,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  notice < 0
                      ? 'L’appel de ${monthLabel(upcoming)} est à préparer.'
                      : 'L’appel de ${monthLabel(upcoming)} approche (dans $notice jours).',
                ),
                TextButton(
                  onPressed: () => setState(() => section = 'Appels'),
                  child: const Text('Préparer l’appel'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
        if (section == 'Opérations') ...[
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [
              Metric(
                'Disponible en caisse',
                s.summary['balance'],
                prominent: true,
              ),
              Metric(
                'Avoirs adhérents',
                s.members.fold<num>(
                  0,
                  (sum, m) =>
                      sum + (object(m['account'])['credit'] as num? ?? 0),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              FilledButton.icon(
                onPressed: () => operationForm(context, s, 'payment'),
                icon: const Icon(Icons.add),
                label: const Text('Encaisser une cotisation'),
              ),
              OutlinedButton.icon(
                onPressed: () => operationForm(context, s, 'expense'),
                icon: const Icon(Icons.shopping_bag_outlined),
                label: const Text('Nouvelle dépense'),
              ),
              OutlinedButton.icon(
                onPressed: () => operationForm(context, s, 'reimbursement'),
                icon: const Icon(Icons.south_west),
                label: const Text('Ajouter un remboursement'),
              ),
              OutlinedButton.icon(
                onPressed: () => controlForm(context, s),
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('Contrôler la caisse'),
              ),
              PopupMenuButton<String>(
                tooltip: 'Autres actions',
                onSelected: (v) {
                  if (v == 'event') {
                    eventForm(context, s);
                  } else {
                    operationForm(context, s, v);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'refund',
                    child: Text('Rembourser un avoir'),
                  ),
                  const PopupMenuItem(
                    value: 'advance',
                    child: Text('Avance à un tiers'),
                  ),
                  const PopupMenuItem(
                    value: 'advanceReturn',
                    child: Text('Remboursement d’une avance'),
                  ),
                  const PopupMenuItem(
                    value: 'event',
                    child: Text('Nouvel événement'),
                  ),
                  const PopupMenuItem(
                    value: 'income',
                    child: Text('Autre entrée'),
                  ),
                  const PopupMenuItem(
                    value: 'adjustment',
                    child: Text('Corriger un écart de caisse'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            'Dernières opérations',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          if (operations.isEmpty)
            const EmptyState('Enregistrez votre première opération.')
          else
            Panel(
              child: Column(
                children: [
                  for (final o in operations.take(25))
                    OperationTile(
                      operation: o,
                      onTap: () => operationDetails(context, s, o),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          Text('Événements', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          for (final e in s.rows('events'))
            ListTile(
              title: Text(e['name']),
              subtitle: Text(dayLabel(e['date'])),
              trailing: IconButton(
                tooltip: 'Modifier',
                icon: const Icon(Icons.edit_outlined),
                onPressed: () => eventForm(context, s, existing: e),
              ),
            ),
        ],
        if (section == 'Adhérents') ...[
          Wrap(
            spacing: 16,
            runSpacing: 12,
            children: [
              FilledButton.icon(
                onPressed: () => memberForm(context, s),
                icon: const Icon(Icons.person_add_outlined),
                label: const Text('Nouvel adhérent'),
              ),
              SizedBox(
                width: 280,
                child: TextField(
                  decoration: const InputDecoration(
                    labelText: 'Rechercher un adhérent',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (v) => setState(() => search = v),
                ),
              ),
              SizedBox(
                width: 310,
                child: CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: const Text('Masquer les membres en pause ou partis'),
                  value: hidePausedOrDeparted,
                  onChanged: (value) =>
                      setState(() => hidePausedOrDeparted = value ?? false),
                ),
              ),
              SizedBox(
                width: 260,
                child: CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: const Text('Afficher les adhérents masqués'),
                  value: showHiddenMembers,
                  onChanged: (value) =>
                      setState(() => showHiddenMembers = value ?? false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (s.members.isEmpty)
            const EmptyState('Ajoutez les adhérents manuellement.')
          else
            Panel(
              child: Column(
                children: [
                  for (final m in s.members.where((m) {
                    final matchesSearch = '${m['name']}'.toLowerCase().contains(
                      search.toLowerCase(),
                    );
                    final visible = showHiddenMembers || m['hidden'] != true;
                    final matchesStatus =
                        !hidePausedOrDeparted ||
                        !['En pause', 'Parti'].contains(m['status']);
                    return matchesSearch && visible && matchesStatus;
                  }))
                    Container(
                      margin: const EdgeInsets.symmetric(vertical: 2),
                      decoration: BoxDecoration(
                        color: memberBalance(m) < 0
                            ? Theme.of(context).colorScheme.errorContainer
                                  .withValues(alpha: 0.55)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        leading: CircleAvatar(
                          child: Text('${m['name']}'.substring(0, 1)),
                        ),
                        title: Text(m['name']),
                        subtitle: Text(
                          '${m['status']} · Dû ${fcfa(object(m['account'])['due'])} · Avoir ${fcfa(object(m['account'])['credit'])}',
                        ),
                        onTap: () => viewMember(context, s, m),
                        trailing: PopupMenuButton<String>(
                          onSelected: (v) => memberAction(context, s, m, v),
                          itemBuilder: (_) => [
                            for (final entry in {
                              'account': 'Consulter le compte',
                              'edit': 'Modifier / solde antérieur',
                              'access': 'Créer l’accès',
                              'payment': 'Encaisser une cotisation',
                              'refund': 'Rembourser un avoir',
                              'pause': 'Définir une absence',
                              'resume': 'Supprimer une absence',
                              'depart': 'Enregistrer un départ',
                              'rejoin': 'Réintégrer',
                              'visibility': m['hidden'] == true
                                  ? 'Rendre visible dans la liste'
                                  : 'Masquer de la liste',
                              'delete': 'Supprimer une fiche créée par erreur',
                            }.entries)
                              PopupMenuItem(
                                value: entry.key,
                                child: Text(entry.value),
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
        if (section == 'Appels') CallsPanel(store: s),
        if (section == 'Paramètres') ...[
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.settings['name'],
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  'Bascule : ${dayLabel(s.settings['openingDate'])} · Solde repris : ${fcfa(s.settings['openingBalance'])}',
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    OutlinedButton(
                      onPressed: () => settingsForm(context, s),
                      child: const Text('Paramètres généraux'),
                    ),
                    OutlinedButton(
                      onPressed: () => rateForm(context, s),
                      child: const Text('Nouveau tarif'),
                    ),
                    OutlinedButton(
                      onPressed: () => scheduleForm(context, s),
                      child: const Text('Fréquence des appels'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text(
                  'Historique des tarifs',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                for (final r in objects(s.settings['rates']))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('${fcfa(r['amount'])} / mois'),
                    subtitle: Text('À partir de ${monthLabel(r['from'])}'),
                  ),
                for (final r in objects(s.settings['schedules']))
                  Text(
                    'Appel tous les ${r['frequency']} mois à compter de ${monthLabel(r['from'])}',
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Passation de gestion',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Le nouveau gestionnaire doit avoir activé son accès. Un contrôle de caisse peut être effectué avant la passation.',
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => transferForm(context, s),
                  icon: const Icon(Icons.swap_horiz),
                  label: const Text('Transférer le rôle administrateur'),
                ),
              ],
            ),
          ),
        ],
        if (section == 'Historique') ...[
          Text(
            'Corrections et annulations',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Panel(
            child: Column(
              children: [
                for (final o in operations)
                  OperationTile(
                    operation: o,
                    onTap: () => operationDetails(context, s, o),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Contrôles détaillés',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          for (final c in [
            ...s.rows('controls'),
          ]..sort((a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}')))
            ExpansionTile(
              title: Text(
                '${dayLabel(c['date'])} · Écart ${fcfa(c['difference'])}',
              ),
              children: [
                Text(
                  'Théorique ${fcfa(c['theoretical'])} · Compté ${fcfa(c['physical'])}',
                ),
                for (final e in object(c['counts']).entries)
                  Text('${e.key} FCFA × ${e.value}'),
                Text(c['note'] ?? ''),
              ],
            ),
          const SizedBox(height: 24),
          Text(
            'Journal des modifications',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          for (final a in ([
            ...s.rows('audit'),
          ]..sort((a, b) => '${b['at']}'.compareTo('${a['at']}'))).take(100))
            ExpansionTile(
              title: Text('${auditLabel(a['action'])} · ${dayLabel(a['at'])}'),
              subtitle: Text('${a['reason'] ?? ''}'),
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: SelectableText(
                    'Auteur : ${auditActor(a['actor'], s)}\n${auditSummary(a, s)}',
                  ),
                ),
              ],
            ),
        ],
      ],
    );
  }
}

String auditLabel(dynamic action) =>
    const {
      'setup': 'Initialisation',
      'memberSave': 'Fiche adhérent',
      'createMemberAccess': 'Création d’accès',
      'memberPeriods': 'Statut / absence',
      'memberVisibility': 'Visibilité dans la liste',
      'memberDelete': 'Suppression de fiche',
      'operationSave': 'Opération enregistrée',
      'operationCancel': 'Annulation',
      'control': 'Contrôle de caisse',
      'settings': 'Paramètres',
      'call': 'Appel de cotisations',
      'eventSave': 'Événement',
      'transfer': 'Passation',
      'refresh': 'Actualisation des cotisations',
    }[action] ??
    '$action';
String auditActor(dynamic uid, GapStore store) {
  if (uid == 'system') return 'Application';
  return store.members.where((m) => m['uid'] == uid).firstOrNull?['name'] ??
      'Gestionnaire';
}

String auditSummary(Json a, GapStore store) {
  if (a['action'] == 'createMemberAccess') {
    return 'Accès créé par le gestionnaire ; vérification de l’email requise avant activation.';
  }
  if (a['action'] == 'transfer') {
    return 'Ancien gestionnaire : ${auditActor(a['previousAdmin'], store)}\nNouveau gestionnaire : ${auditActor(a['nextAdmin'], store)}';
  }
  const fields = {
    'name': 'Nom',
    'email': 'Email',
    'label': 'Libellé',
    'amount': 'Montant',
    'date': 'Date',
    'memberId': 'Adhérent',
    'category': 'Catégorie',
    'payer': 'Payeur',
    'awardCredit': 'Avoir accordé',
    'cancelled': 'Annulée',
    'comment': 'Commentaire privé',
    'reason': 'Motif',
    'priority': 'Mois prioritaires',
    'openingDebt': 'Dette antérieure',
    'openingCredit': 'Avoir antérieur',
    'firstDueMonth': 'Première cotisation',
    'terms': 'Périodes d’adhésion',
    'absences': 'Absences',
    'openingBalance': 'Espèces reprises',
    'openingDate': 'Date de bascule',
    'noticeDays': 'Délai de rappel (jours)',
    'rates': 'Tarifs mensuels',
    'schedules': 'Fréquence des appels',
    'categories': 'Catégories',
    'denominations': 'Coupures',
    'theoretical': 'Solde théorique',
    'physical': 'Montant compté',
    'difference': 'Écart',
    'description': 'Description',
    'message': 'Message d’appel',
    'receiptPath': 'Justificatif',
    'direction': 'Sens de correction',
  };
  String value(String key, dynamic v) {
    if (v == null || v == '') return '—';
    if ([
      'amount',
      'openingDebt',
      'openingCredit',
      'openingBalance',
      'theoretical',
      'physical',
      'difference',
    ].contains(key)) {
      return fcfa(v);
    }
    if (v is bool) return v ? 'Oui' : 'Non';
    if (key == 'memberId') {
      return store.members.where((m) => m['id'] == v).firstOrNull?['name'] ??
          'Adhérent archivé';
    }
    if (key == 'payer') {
      return const {
            'cash': 'Caisse',
            'member': 'Adhérent',
            'thirdParty': 'Tiers',
          }[v] ??
          '—';
    }
    if (key == 'direction') return v == 'in' ? 'Entrée' : 'Sortie';
    if (key == 'receiptPath') return 'Joint';
    if (key == 'firstDueMonth') return monthLabel(v);
    if (['date', 'openingDate'].contains(key)) return dayLabel(v);
    if (['terms', 'absences'].contains(key)) {
      return objects(v)
          .map(
            (p) =>
                '${monthLabel(p['from'])} → ${p['to'] == null ? 'en cours' : monthLabel(p['to'])}',
          )
          .join('; ');
    }
    if (key == 'rates') {
      return objects(v)
          .map((p) => '${monthLabel(p['from'])} : ${fcfa(p['amount'])}')
          .join('; ');
    }
    if (key == 'schedules') {
      return objects(v)
          .map(
            (p) => '${monthLabel(p['from'])} : tous les ${p['frequency']} mois',
          )
          .join('; ');
    }
    if (v is List) {
      return v.map((x) => key == 'priority' ? monthLabel(x) : '$x').join(', ');
    }
    return '$v';
  }

  final changes = objects(a['changes']).map((c) {
    final before = object(c['before']), after = object(c['after']);
    final title =
        after['name'] ??
        after['label'] ??
        before['name'] ??
        before['label'] ??
        const {
          'config': 'Paramètres',
          'controls': 'Contrôle de caisse',
          'calls': 'Appel de cotisations',
        }[c['collection']] ??
        'Modification';
    if (c['after'] == null) return '$title : fiche supprimée.';
    final lines = fields.entries
        .where((f) => '${before[f.key]}' != '${after[f.key]}')
        .map(
          (f) =>
              '${f.value} : ${value(f.key, before[f.key])} → ${value(f.key, after[f.key])}',
        );
    return '$title\n${lines.join('\n')}';
  }).toList();
  return changes.isEmpty
      ? 'Cotisations actualisées à la date du traitement.'
      : changes.join('\n\n');
}

Future<void> setup(BuildContext context, GapStore s) async {
  final id = newId();
  await showGapForm(
    context,
    title: 'Initialiser l’association',
    explanation:
        'Le solde d’ouverture représente uniquement les espèces reprises. Les dettes et avoirs des adhérents seront saisis séparément. La première échéance doit exclure les périodes déjà reprises dans leurs soldes.',
    fields: [
      const FormFieldSpec(
        'name',
        'Nom de l’association',
        initial: 'Amicale GAP',
      ),
      const FormFieldSpec('adminName', 'Votre nom d’adhérent'),
      FormFieldSpec(
        'openingDate',
        'Date de bascule (AAAA-MM-JJ)',
        initial: today(),
      ),
      const FormFieldSpec(
        'openingBalance',
        'Espèces en caisse (FCFA)',
        initial: '0',
        number: true,
      ),
      FormFieldSpec(
        'firstDueMonth',
        'Première échéance à créer (AAAA-MM)',
        initial: nextEvenMonth(),
        hint: 'Un mois pair. Exemple : 2026-10 pour octobre et novembre.',
      ),
      const FormFieldSpec(
        'monthlyRate',
        'Cotisation mensuelle (FCFA)',
        initial: '7500',
        number: true,
      ),
    ],
    submit: (v) => s.execute('setup', v, commandId: id),
  );
}

Future<void> memberForm(
  BuildContext context,
  GapStore s, {
  Json? existing,
}) async {
  final id = newId();
  final m = existing ?? {};
  await showGapForm(
    context,
    title: existing == null ? 'Nouvel adhérent' : 'Modifier ${m['name']}',
    explanation:
        'Un solde antérieur reprend uniquement ce qui reste dû ou disponible à la bascule. Il ne modifie pas la caisse. Renseignez une dette OU un avoir.',
    fields: [
      FormFieldSpec('name', 'Nom', initial: m['name'] ?? ''),
      FormFieldSpec(
        'email',
        'Email pour activer l’accès',
        initial: m['email'] ?? '',
        required: false,
      ),
      if (existing == null)
        FormFieldSpec(
          'joinMonth',
          'Mois de début d’adhésion (AAAA-MM)',
          initial: today().substring(0, 7),
        ),
      if (existing == null)
        FormFieldSpec(
          'firstDueMonth',
          'Premier mois à facturer (AAAA-MM)',
          initial: s.settings['firstDueMonth'],
          hint: 'Les mois précédents sont couverts par le solde antérieur.',
        ),
      FormFieldSpec(
        'openingDebt',
        'Dette antérieure (FCFA)',
        initial: m['openingDebt'] ?? 0,
        number: true,
      ),
      FormFieldSpec(
        'openingCredit',
        'Avoir antérieur (FCFA)',
        initial: m['openingCredit'] ?? 0,
        number: true,
      ),
      if (existing != null)
        const FormFieldSpec('reason', 'Motif de modification'),
    ],
    submit: (v) =>
        s.execute('memberSave', {'id': m['id'] ?? id, ...v}, commandId: id),
  );
}

void viewMember(BuildContext context, GapStore s, Json m) => showDialog<void>(
  context: context,
  builder: (_) => Dialog(
    child: SizedBox(
      width: 900,
      height: 700,
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close),
              tooltip: 'Fermer',
            ),
          ),
          Expanded(
            child: AccountPage(store: s, member: m),
          ),
        ],
      ),
    ),
  ),
);
Future<void> memberAction(
  BuildContext context,
  GapStore s,
  Json m,
  String action,
) async {
  if (action == 'account') {
    viewMember(context, s, m);
    return;
  }
  if (action == 'access') {
    await runAction(
      context,
      () => s.createMemberAccess(m['id']),
      'Accès prêt. L’adhérent peut choisir son mot de passe via « Mot de passe oublié », puis vérifier son email dans « Mon compte ».',
    );
    return;
  }
  if (action == 'edit') {
    await memberForm(context, s, existing: m);
    return;
  }
  if (action == 'visibility') {
    await runAction(
      context,
      () => s.execute('memberVisibility', {
        'memberId': m['id'],
        'hidden': m['hidden'] != true,
      }),
      m['hidden'] == true
          ? 'Adhérent de nouveau visible dans la liste.'
          : 'Adhérent masqué. Utilisez « Afficher les adhérents masqués » pour le retrouver.',
    );
    return;
  }
  if (action == 'payment' || action == 'refund') {
    await operationForm(context, s, action, memberId: m['id']);
    return;
  }
  final id = newId();
  if (action == 'delete') {
    await showGapForm(
      context,
      title: 'Supprimer la fiche créée par erreur',
      explanation:
          'La suppression sera refusée si un historique comptable ou un accès existe. Pour un ancien adhérent, utilisez « Enregistrer un départ ».',
      fields: const [FormFieldSpec('reason', 'Motif')],
      submit: (v) =>
          s.execute('memberDelete', {'memberId': m['id'], ...v}, commandId: id),
    );
    return;
  }
  if (action == 'resume') {
    final absences = objects(m['absences']);
    if (absences.isEmpty) {
      toast(context, 'Aucune absence enregistrée.');
      return;
    }
    final indefinite = absences.indexWhere((a) => a['to'] == null);
    if (indefinite >= 0) {
      final pause = absences[indefinite];
      await showGapForm(
        context,
        title: 'Reprendre les cotisations',
        explanation:
            'La pause passée est conservée. Les cotisations reprennent au mois indiqué.',
        fields: [
          FormFieldSpec(
            'month',
            'Mois de reprise (AAAA-MM)',
            initial: nextEvenMonth(),
          ),
          const FormFieldSpec('reason', 'Motif'),
        ],
        submit: (v) async {
          final month = v['month'] as String;
          if (!RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(month) ||
              month.compareTo(pause['from']) < 0) {
            throw Exception(
              'Choisissez un mois à partir du début de la pause.',
            );
          }
          await s.execute('memberPeriods', {
            'memberId': m['id'],
            'reason': v['reason'],
            'absences': [
              for (var i = 0; i < absences.length; i++)
                if (i != indefinite)
                  absences[i]
                else if (month != pause['from'])
                  {...pause, 'to': nextMonth(month, -1)},
            ],
          }, commandId: id);
        },
      );
      return;
    }
    await showGapForm(
      context,
      title: 'Supprimer une absence',
      explanation:
          'Les cotisations de la période redeviennent dues. Les avoirs disponibles seront utilisés automatiquement.',
      fields: [
        FormFieldSpec(
          'index',
          'Période',
          choices: {
            for (var i = 0; i < absences.length; i++)
              '$i':
                  '${monthLabel(absences[i]['from'])} – ${monthLabel(absences[i]['to'])}',
          },
        ),
        const FormFieldSpec('reason', 'Motif'),
      ],
      submit: (v) => s.execute('memberPeriods', {
        'memberId': m['id'],
        'absences': [
          for (var i = 0; i < absences.length; i++)
            if (i != int.parse(v['index'])) absences[i],
        ],
        'reason': v['reason'],
      }, commandId: id),
    );
    return;
  }
  await showGapForm(
    context,
    title: action == 'pause'
        ? 'Définir une absence'
        : action == 'depart'
        ? 'Enregistrer un départ'
        : 'Réintégrer un adhérent',
    explanation: action == 'depart'
        ? 'Le mois indiqué est le premier mois sans cotisation. L’historique et les avoirs sont conservés.'
        : 'Les périodes sont définies par mois entier, sans prorata.',
    fields: [
      FormFieldSpec(
        'from',
        action == 'depart'
            ? 'Premier mois non dû (AAAA-MM)'
            : 'À partir du mois (AAAA-MM)',
        initial: today().substring(0, 7),
      ),
      if (action == 'pause')
        FormFieldSpec(
          'to',
          'Dernier mois exonéré (AAAA-MM)',
          initial: today().substring(0, 7),
        ),
      const FormFieldSpec('reason', 'Motif'),
    ],
    submit: (v) async {
      final payload = <String, dynamic>{
        'memberId': m['id'],
        'reason': v['reason'],
      };
      if (action == 'pause') {
        payload['absences'] = [
          ...objects(m['absences']),
          {'from': v['from'], 'to': v['to']},
        ];
      } else {
        final terms = objects(m['terms']);
        if (action == 'depart') {
          final open = terms.lastIndexWhere((t) => t['to'] == null);
          if (open < 0) throw Exception('Cet adhérent est déjà parti.');
          terms[open] = {...terms[open], 'to': nextMonth(v['from'], -1)};
        } else {
          if (terms.any((t) => t['to'] == null)) {
            throw Exception('Cet adhérent possède déjà une période active.');
          }
          if (terms.any((t) => '${t['to']}'.compareTo(v['from']) >= 0)) {
            throw Exception('Choisissez un mois après le dernier départ.');
          }
          terms.add({'from': v['from'], 'to': null});
        }
        payload['terms'] = terms;
      }
      await s.execute('memberPeriods', payload, commandId: id);
    },
  );
}

Future<void> operationForm(
  BuildContext context,
  GapStore s,
  String type, {
  Json? existing,
  String? memberId,
}) async {
  final id = existing?['id'] ?? newId(), commandId = newId();
  final o = existing ?? {};
  final members = {
    '': 'Aucun',
    for (final m in s.members)
      '${m['id']}':
          '${m['name']} · Avoir ${fcfa(object(m['account'])['credit'])}',
  };
  final events = {
    '': 'Aucun',
    for (final e in s.rows('events')) '${e['id']}': '${e['name']}',
  };
  final expenses = {
    for (final e
        in s
            .rows('operations')
            .where((e) => e['type'] == 'expense' && e['cancelled'] != true))
      '${e['id']}': '${e['label']} · ${fcfa(e['amount'])}',
  };
  String receiptPath = o['receiptPath'] ?? '';
  bool receiptBusy = false;
  final fields = <FormFieldSpec>[
    if (['payment', 'refund', 'expense'].contains(type))
      FormFieldSpec(
        'memberId',
        type == 'expense' ? 'Adhérent payeur (si avance)' : 'Adhérent',
        initial: memberId ?? o['memberId'] ?? '',
        required: type != 'expense',
        choices: members,
      ),
    FormFieldSpec(
      'amount',
      'Montant (FCFA)',
      initial: o['amount'] ?? '',
      number: true,
    ),
    FormFieldSpec('date', 'Date (AAAA-MM-JJ)', initial: o['date'] ?? today()),
    if (!['payment', 'refund'].contains(type))
      FormFieldSpec('label', 'Libellé public', initial: o['label'] ?? ''),
    if (type == 'expense') ...[
      FormFieldSpec(
        'payer',
        'Payé par',
        initial: o['payer'] ?? 'cash',
        choices: const {
          'cash': 'La caisse',
          'member': 'Un adhérent',
          'thirdParty': 'Un tiers',
        },
      ),
      FormFieldSpec(
        'category',
        'Catégorie',
        initial: o['category'] ?? (s.settings['categories'] as List).first,
        choices: {for (final c in s.settings['categories']) '$c': '$c'},
      ),
      FormFieldSpec(
        'awardCredit',
        'Accorder un avoir à l’adhérent payeur',
        initial: o['awardCredit'] ?? false,
        check: true,
      ),
    ],
    if (type == 'advanceReturn')
      FormFieldSpec(
        'advanceId',
        'Avance d’origine',
        initial: o['advanceId'] ?? '',
        choices: {
          for (final a
              in s
                  .rows('operations')
                  .where(
                    (a) => a['type'] == 'advance' && a['cancelled'] != true,
                  ))
            '${a['id']}': '${a['label']} · ${fcfa(a['amount'])}',
        },
      ),
    if (type == 'reimbursement')
      FormFieldSpec(
        'expenseId',
        'Dépense d’origine',
        initial: o['expenseId'] ?? '',
        choices: expenses,
      ),
    if (['expense', 'income'].contains(type))
      FormFieldSpec(
        'eventId',
        'Événement',
        initial: o['eventId'] ?? '',
        choices: events,
        required: false,
      ),
    if (type == 'adjustment')
      FormFieldSpec(
        'direction',
        'Sens de la correction',
        initial: o['direction'] ?? 'in',
        choices: const {
          'in': 'Ajouter des espèces',
          'out': 'Retirer des espèces',
        },
      ),
    if (type == 'payment')
      FormFieldSpec(
        'priority',
        'Mois prioritaires (facultatif)',
        initial: (o['priority'] as List? ?? []).join(', '),
        required: false,
        hint: 'Par défaut : les plus anciens. Sinon : 2026-10, 2026-11.',
      ),
    FormFieldSpec(
      'comment',
      'Commentaire privé (facultatif)',
      initial: o['comment'] ?? '',
      required: false,
      lines: 2,
    ),
    if (existing != null || ['refund', 'adjustment'].contains(type))
      const FormFieldSpec('reason', 'Motif'),
  ];
  await showGapForm(
    context,
    title: existing == null ? (labels[type] ?? type) : 'Corriger l’opération',
    explanation: type == 'refund'
        ? 'Le remboursement diminue l’avoir disponible et sort réellement les espèces de la caisse.'
        : type == 'expense'
        ? 'Une dépense payée par un adhérent ou un tiers ne sort pas de la caisse. Le libellé est public ; ne saisissez pas de données privées.'
        : type == 'payment'
        ? 'Les espèces entrent en caisse. Le paiement solde les dettes les plus anciennes ; le trop-versé devient un avoir.'
        : null,
    fields: fields,
    extra: type == 'expense'
        ? ReceiptPicker(
            store: s,
            operationId: id,
            initialPath: receiptPath,
            onChanged: (p) => receiptPath = p,
            onBusy: (v) => receiptBusy = v,
          )
        : null,
    submit: (v) async {
      if (receiptBusy) {
        throw Exception('Attendez la fin du téléversement du justificatif.');
      }
      if (type == 'payment') {
        v['priority'] = '${v['priority']}'
            .split(',')
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList();
      }
      await s.execute('operationSave', {
        'id': id,
        'type': type,
        ...v,
        'receiptPath': receiptPath,
        if (existing != null) 'revision': existing['revision'],
      }, commandId: commandId);
    },
  );
}

class ReceiptPicker extends StatefulWidget {
  final GapStore store;
  final String operationId, initialPath;
  final ValueChanged<String> onChanged;
  final ValueChanged<bool> onBusy;
  const ReceiptPicker({
    super.key,
    required this.store,
    required this.operationId,
    required this.initialPath,
    required this.onChanged,
    required this.onBusy,
  });
  @override
  State<ReceiptPicker> createState() => _ReceiptPickerState();
}

class _ReceiptPickerState extends State<ReceiptPicker> {
  bool busy = false;
  String? label, error;
  Future<void> pick(bool camera) async {
    widget.onBusy(true);
    setState(() {
      busy = true;
      error = null;
    });
    try {
      Uint8List? bytes;
      String ext = 'jpg', name = 'Photo';
      if (camera) {
        final file = await ImagePicker().pickImage(
          source: ImageSource.camera,
          imageQuality: 85,
        );
        if (file != null) {
          bytes = await file.readAsBytes();
          name = file.name;
          ext = name.split('.').last;
        }
      } else {
        final result = await FilePicker.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
          withData: true,
        );
        if (result != null) {
          bytes = result.files.single.bytes;
          name = result.files.single.name;
          ext = result.files.single.extension ?? '';
        }
      }
      if (bytes != null) {
        final path = await widget.store.uploadReceipt(
          widget.operationId,
          bytes,
          ext,
        );
        widget.onChanged(path);
        if (mounted) setState(() => label = name);
      }
    } catch (e) {
      if (mounted) setState(() => error = friendlyError(e));
    } finally {
      widget.onBusy(false);
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Justificatif privé · Facultatif · 10 Mo maximum'),
      if (label != null || widget.initialPath.isNotEmpty)
        Text(label ?? 'Justificatif joint'),
      Wrap(
        spacing: 8,
        children: [
          TextButton.icon(
            onPressed: busy ? null : () => pick(false),
            icon: const Icon(Icons.attach_file),
            label: Text(busy ? 'Téléversement…' : 'Choisir un fichier'),
          ),
          if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android)
            TextButton.icon(
              onPressed: busy ? null : () => pick(true),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Prendre une photo'),
            ),
        ],
      ),
      if (error != null)
        Text(
          error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
    ],
  );
}

Future<void> operationDetails(BuildContext context, GapStore s, Json o) async {
  final m = s.members.where((m) => m['id'] == o['memberId']).firstOrNull;
  final action = await showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(o['label']),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${fcfa(o['amount'])} · ${dayLabel(o['date'])}'),
            if (m != null) Text('Adhérent : ${m['name']}'),
            Text(o['comment'] ?? ''),
            if (o['migration'] != null)
              const Text(
                'Historique repris depuis Excel. Une correction nécessite une reprise contrôlée.',
              ),
            if (o['cancelled'] == true) Text('ANNULÉ · ${o['reason']}'),
            if ('${o['receiptPath'] ?? ''}'.isNotEmpty)
              TextButton.icon(
                onPressed: () => openReceipt(c, s, o['receiptPath']),
                icon: const Icon(Icons.attachment),
                label: const Text('Ouvrir le justificatif'),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(c),
          child: const Text('Fermer'),
        ),
        if (o['cancelled'] != true && o['migration'] == null) ...[
          TextButton(
            onPressed: () => Navigator.pop(c, 'cancel'),
            child: const Text('Annuler l’opération'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, 'edit'),
            child: const Text('Corriger'),
          ),
        ],
      ],
    ),
  );
  if (!context.mounted) return;
  if (action == 'edit') {
    await operationForm(context, s, o['type'], existing: o);
    return;
  }
  if (action == 'cancel') {
    final id = newId();
    await showGapForm(
      context,
      title: 'Annuler cette opération',
      explanation:
          'L’opération restera visible dans l’historique mais sera retirée des calculs. Les comptes liés seront recalculés.',
      fields: const [FormFieldSpec('reason', 'Motif d’annulation')],
      submit: (v) => s.execute('operationCancel', {
        'operationId': o['id'],
        ...v,
      }, commandId: id),
    );
  }
}

Future<void> openReceipt(BuildContext context, GapStore s, String path) async {
  await runAction(context, () async {
    final bytes = await s.storage.ref(path).getData(10 * 1024 * 1024);
    if (bytes == null) throw Exception('Justificatif introuvable.');
    if (!context.mounted) return;
    if (path.toLowerCase().endsWith('.pdf')) {
      await FilePicker.saveFile(
        dialogTitle: 'Enregistrer le justificatif',
        fileName: 'justificatif.pdf',
        bytes: bytes,
      );
    } else {
      await showDialog<void>(
        context: context,
        builder: (c) => Dialog(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  onPressed: () => Navigator.pop(c),
                  icon: const Icon(Icons.close),
                ),
              ),
              Flexible(child: InteractiveViewer(child: Image.memory(bytes))),
            ],
          ),
        ),
      );
    }
  }, 'Justificatif consulté.');
}

Future<void> eventForm(
  BuildContext context,
  GapStore s, {
  Json? existing,
}) async {
  final id = newId(), e = existing ?? {};
  await showGapForm(
    context,
    title: existing == null ? 'Nouvel événement' : 'Modifier l’événement',
    fields: [
      FormFieldSpec('name', 'Nom public', initial: e['name'] ?? ''),
      FormFieldSpec('date', 'Date (AAAA-MM-JJ)', initial: e['date'] ?? today()),
      FormFieldSpec(
        'description',
        'Description publique',
        initial: e['description'] ?? '',
        required: false,
        lines: 2,
      ),
    ],
    submit: (v) =>
        s.execute('eventSave', {'id': e['id'] ?? id, ...v}, commandId: id),
  );
}

Future<void> controlForm(BuildContext context, GapStore s) async {
  final mode = await showDialog<String>(
    context: context,
    builder: (c) => SimpleDialog(
      title: const Text('Contrôler la caisse'),
      children: [
        SimpleDialogOption(
          onPressed: () => Navigator.pop(c, 'simple'),
          child: const Padding(
            padding: EdgeInsets.all(12),
            child: Text('Saisir le montant total'),
          ),
        ),
        SimpleDialogOption(
          onPressed: () => Navigator.pop(c, 'denominations'),
          child: const Padding(
            padding: EdgeInsets.all(12),
            child: Text('Compter par coupures'),
          ),
        ),
      ],
    ),
  );
  if (mode == null || !context.mounted) return;
  final id = newId();
  await showGapForm(
    context,
    title: 'Contrôle physique',
    explanation:
        'Solde théorique actuel : ${fcfa(s.summary['balance'])}. Un écart sera conservé sans modifier la caisse.',
    fields: [
      if (mode == 'simple')
        const FormFieldSpec('physical', 'Montant compté (FCFA)', number: true)
      else
        for (final d in s.settings['denominations'])
          FormFieldSpec(
            '$d',
            'Nombre de coupures de ${fcfa(d)}',
            initial: 0,
            number: true,
          ),
      const FormFieldSpec('note', 'Note privée', required: false, lines: 2),
    ],
    submit: (v) => s.execute('control', {
      'mode': mode,
      'note': v['note'],
      if (mode == 'simple')
        'physical': v['physical']
      else
        'counts': {for (final d in s.settings['denominations']) '$d': v['$d']},
    }, commandId: id),
  );
}

Future<void> settingsForm(BuildContext context, GapStore s) async {
  final id = newId(), p = s.settings;
  await showGapForm(
    context,
    title: 'Paramètres généraux',
    fields: [
      FormFieldSpec('name', 'Nom affiché', initial: p['name']),
      FormFieldSpec(
        'noticeDays',
        'Rappel avant appel (jours)',
        initial: p['noticeDays'],
        number: true,
      ),
      FormFieldSpec(
        'categories',
        'Catégories, séparées par des virgules',
        initial: (p['categories'] as List).join(', '),
        lines: 2,
      ),
      FormFieldSpec(
        'denominations',
        'Coupures en FCFA, séparées par des virgules',
        initial: (p['denominations'] as List).join(', '),
      ),
      const FormFieldSpec('reason', 'Motif'),
    ],
    submit: (v) {
      v['categories'] = '${v['categories']}'
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
      v['denominations'] = '${v['denominations']}'
          .split(',')
          .map((e) => int.tryParse(e.trim()) ?? 0)
          .toList();
      return s.execute('settings', v, commandId: id);
    },
  );
}

Future<void> rateForm(BuildContext context, GapStore s) async {
  final id = newId();
  await showGapForm(
    context,
    title: 'Nouveau tarif mensuel',
    explanation:
        'Les périodes déjà dues conservent leur tarif. Le changement prend effet un mois futur non encore émis.',
    fields: [
      const FormFieldSpec('amount', 'Montant mensuel (FCFA)', number: true),
      FormFieldSpec(
        'from',
        'À partir du mois (AAAA-MM)',
        initial: nextEvenMonth(),
      ),
      const FormFieldSpec('reason', 'Motif'),
    ],
    submit: (v) => s.execute('settings', {
      'rate': {'from': v['from'], 'amount': v['amount']},
      'reason': v['reason'],
    }, commandId: id),
  );
}

Future<void> scheduleForm(BuildContext context, GapStore s) async {
  final id = newId();
  await showGapForm(
    context,
    title: 'Fréquence des appels',
    explanation:
        'La nouvelle fréquence commence au début d’un prochain appel. Les périodes passées sont conservées.',
    fields: [
      const FormFieldSpec(
        'frequency',
        'Fréquence',
        initial: '2',
        choices: {
          '1': 'Chaque mois',
          '2': 'Tous les 2 mois',
          '3': 'Tous les 3 mois',
          '6': 'Tous les 6 mois',
          '12': 'Tous les 12 mois',
        },
      ),
      FormFieldSpec(
        'from',
        'Prochain début de période (AAAA-MM)',
        initial: nextEvenMonth(),
      ),
      const FormFieldSpec('reason', 'Motif'),
    ],
    submit: (v) => s.execute('settings', {
      'schedule': {'from': v['from'], 'frequency': int.parse(v['frequency'])},
      'reason': v['reason'],
    }, commandId: id),
  );
}

Future<void> transferForm(BuildContext context, GapStore s) async {
  final id = newId();
  await showGapForm(
    context,
    title: 'Transférer la gestion',
    explanation:
        'Vous perdrez immédiatement les droits administrateur. Votre compte adhérent et tout l’historique seront conservés.',
    submitLabel: 'Confirmer la passation',
    fields: [
      FormFieldSpec(
        'memberId',
        'Nouveau gestionnaire',
        choices: {
          for (final m in s.members.where(
            (m) =>
                '${m['uid']}'.isNotEmpty &&
                m['uid'] != s.user?.uid &&
                ['Actif', 'En pause'].contains(m['status']),
          ))
            '${m['id']}': '${m['name']}',
        },
      ),
      const FormFieldSpec('reason', 'Note de passation'),
    ],
    submit: (v) => s.execute('transfer', v, commandId: id),
  );
}

class CallsPanel extends StatefulWidget {
  final GapStore store;
  const CallsPanel({super.key, required this.store});
  @override
  State<CallsPanel> createState() => _CallsPanelState();
}

class _CallsPanelState extends State<CallsPanel> {
  GapStore get s => widget.store;
  bool busy = false;
  final startController = TextEditingController(text: nextEvenMonth());
  final Set<String> selected = {};
  bool initialized = false;
  @override
  void dispose() {
    startController.dispose();
    super.dispose();
  }

  List<String> period(String start) {
    final schedules = objects(
      s.settings['schedules'],
    ).where((r) => '${r['from']}'.compareTo(start) <= 0).toList();
    final n = schedules.isEmpty ? 2 : schedules.last['frequency'] as int;
    return [for (var i = 0; i < n; i++) nextMonth(start, i)];
  }

  int amount(Json m, String start) {
    if (!RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(start) ||
        start.compareTo('2000-01') < 0 ||
        start.compareTo('2100-12') > 0) {
      return 0;
    }
    var total = 0, paid = 0, earlierUnbilled = 0;
    final end = period(start).last;
    final account = object(m['account']);
    for (
      var p = m['firstDueMonth'] as String;
      p.compareTo(end) <= 0;
      p = nextMonth(p)
    ) {
      final active = objects(m['terms']).any(
        (t) =>
            '${t['from']}'.compareTo(p) <= 0 &&
            (t['to'] == null || '${t['to']}'.compareTo(p) >= 0),
      );
      final absent = objects(m['absences']).any(
        (t) =>
            '${t['from']}'.compareTo(p) <= 0 &&
            (t['to'] == null || '${t['to']}'.compareTo(p) >= 0),
      );
      if (!active || absent) continue;
      final rates = objects(
        s.settings['rates'],
      ).where((r) => '${r['from']}'.compareTo(p) <= 0).toList();
      final charge = object(object(m['charges'])[p]);
      final monthly =
          charge['amount'] as int? ??
          (rates.isEmpty ? 0 : rates.last['amount'] as int);
      if (p.compareTo(start) < 0) {
        if (charge.isEmpty) earlierUnbilled += monthly;
      } else {
        total += monthly;
        paid +=
            objects(
                  account['charges'],
                ).where((c) => c['month'] == p).firstOrNull?['paid']
                as int? ??
            0;
      }
    }
    final credit = ((account['credit'] as int? ?? 0) - earlierUnbilled).clamp(
      0,
      1000000000,
    );
    return (total - paid - credit).clamp(0, 1000000000);
  }

  void preselect() {
    selected.clear();
    selected.addAll(
      s.members
          .where((m) => amount(m, startController.text) > 0)
          .map((m) => m['id'] as String),
    );
  }

  String nextCallStart() =>
      suggestedCallMonth(s.settings, s.rows('calls'), today());

  @override
  Widget build(BuildContext context) {
    if (!initialized && s.members.isNotEmpty) {
      startController.text = nextCallStart();
      preselect();
      initialized = true;
    }
    final next = nextCallStart();
    final days = DateTime.parse(
      '$next-01',
    ).difference(DateTime.parse(today())).inDays;
    final calls = [...s.rows('calls')]
      ..sort((a, b) => '${b['start']}'.compareTo('${a['start']}'));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (days >= 0 && days <= (s.settings['noticeDays'] as int)) ...[
          Panel(
            child: Text(
              'L’appel de ${monthLabel(next)} approche : échéance dans $days jour(s). Préparez votre sélection ci-dessous.',
            ),
          ),
          const SizedBox(height: 16),
        ],
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Préparer l’appel',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              const Text(
                'La sélection sert au message WhatsApp. Décocher une personne ne supprime pas sa cotisation ; utilisez une absence pour l’exonérer.',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: startController,
                decoration: const InputDecoration(
                  labelText: 'Premier mois de l’appel (AAAA-MM)',
                ),
                onChanged: (_) => setState(preselect),
              ),
              const SizedBox(height: 12),
              for (final m in s.members)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(m['name']),
                  subtitle: Text(
                    'Appel ${fcfa(amount(m, startController.text))} · Reste dû actuel ${fcfa(object(m['account'])['due'])} · Avoir ${fcfa(object(m['account'])['credit'])}',
                  ),
                  value: selected.contains(m['id']),
                  onChanged: busy
                      ? null
                      : (v) => setState(
                          () => v == true
                              ? selected.add(m['id'])
                              : selected.remove(m['id']),
                        ),
                ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: busy
                    ? null
                    : () async {
                        setState(() => busy = true);
                        await runAction(
                          context,
                          () => s.execute('call', {
                            'start': startController.text,
                            'memberIds': selected.toList(),
                          }),
                          'Appel préparé. Le message peut être copié ci-dessous.',
                        );
                        if (mounted) setState(() => busy = false);
                      },
                icon: const Icon(Icons.campaign_outlined),
                label: Text(
                  busy ? 'Préparation…' : 'Valider et générer le message',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Appels enregistrés',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        for (final call in calls)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Panel(
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(
                  '${monthLabel(call['start'])} – ${monthLabel(call['end'])}',
                ),
                children: [
                  SelectableText(call['message']),
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: () => runAction(
                      context,
                      () => Clipboard.setData(
                        ClipboardData(text: call['message']),
                      ),
                      'Message copié.',
                    ),
                    icon: const Icon(Icons.copy_outlined),
                    label: const Text('Copier pour WhatsApp'),
                  ),
                  for (final item in objects(call['members']))
                    Builder(
                      builder: (_) {
                        final member = s.members
                            .where((m) => m['id'] == item['memberId'])
                            .firstOrNull;
                        final charges =
                            objects(object(member?['account'])['charges'])
                                .where(
                                  (c) =>
                                      '${c['month']}'.compareTo(
                                            call['start'],
                                          ) >=
                                          0 &&
                                      '${c['month']}'.compareTo(call['end']) <=
                                          0,
                                )
                                .toList();
                        final due = charges.fold<num>(
                          0,
                          (sum, c) => sum + (c['amount'] as num),
                        );
                        final paid = charges.fold<num>(
                          0,
                          (sum, c) => sum + (c['paid'] as num),
                        );
                        return ListTile(
                          title: Text(item['name']),
                          subtitle: Text(
                            charges.isEmpty
                                ? 'Échéance à venir'
                                : paid >= due
                                ? 'Payé / exonéré'
                                : paid > 0
                                ? 'Partiellement payé'
                                : 'Non payé',
                          ),
                          trailing: Text(
                            '${fcfa(paid)} / ${fcfa(charges.isEmpty ? item['amount'] : due)}',
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
