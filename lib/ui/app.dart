import 'package:flutter/material.dart';
import '../data/store.dart';
import 'components.dart';
import 'admin.dart';

class GapShell extends StatefulWidget {
  final GapStore store;
  const GapShell({super.key, required this.store});
  @override
  State<GapShell> createState() => _GapShellState();
}

class _GapShellState extends State<GapShell> {
  int index = 0;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.store,
    builder: (context, _) {
      final store = widget.store;
      final tabs = <(String, IconData)>[
        ('Journal', Icons.receipt_long_outlined),
        ('Dépenses', Icons.shopping_bag_outlined),
        ('Événements', Icons.event_outlined),
        ('Contrôles', Icons.fact_check_outlined),
        if (store.user != null) ('Mon compte', Icons.person_outline),
        if (store.isAdmin) ('Gestion', Icons.tune),
      ];
      final selected = index < tabs.length ? index : 0;
      final pages = <Widget>[
        JournalPage(store: store),
        ExpensesPage(store: store),
        EventsPage(store: store),
        ControlsPage(store: store),
        if (store.user != null) AccountPage(store: store),
        if (store.isAdmin) AdminPage(store: store),
      ];
      final wide = MediaQuery.sizeOf(context).width >= 1050;
      return Scaffold(
        appBar: AppBar(
          title: Row(
            children: [
              const Icon(
                Icons.account_balance_wallet_outlined,
                color: Color(0xFF146C60),
              ),
              const SizedBox(width: 12),
              Flexible(
                child: Text(
                  store.summary['name'] ?? 'Comptes Bar GAP',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 20,
                  ),
                ),
              ),
            ],
          ),
          actions: [
            if (store.user == null)
              TextButton.icon(
                onPressed: () => login(context, store),
                icon: const Icon(Icons.login, size: 18),
                label: const Text('Connexion'),
              )
            else
              IconButton(
                tooltip: 'Se déconnecter',
                onPressed: () async {
                  await store.auth.signOut();
                  if (mounted) setState(() => index = 0);
                },
                icon: const Icon(Icons.logout),
              ),
            const SizedBox(width: 12),
          ],
        ),
        body: Column(
          children: [
            if (store.error != null)
              MaterialBanner(
                content: Text(store.error!),
                actions: [
                  TextButton(
                    onPressed: store.clearError,
                    child: const Text('Fermer'),
                  ),
                ],
              ),
            if (!wide)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    for (var i = 0; i < tabs.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(tabs[i].$1),
                          avatar: Icon(tabs[i].$2, size: 18),
                          selected: selected == i,
                          onSelected: (_) => setState(() => index = i),
                        ),
                      ),
                  ],
                ),
              ),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (wide)
                    NavigationRail(
                      extended: true,
                      backgroundColor: Colors.white,
                      minExtendedWidth: 210,
                      selectedIndex: selected,
                      onDestinationSelected: (i) => setState(() => index = i),
                      destinations: tabs
                          .map(
                            (t) => NavigationRailDestination(
                              icon: Icon(t.$2),
                              label: Text(t.$1),
                            ),
                          )
                          .toList(),
                    ),
                  Expanded(child: pages[selected]),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}

Future<void> login(BuildContext context, GapStore store) async {
  final choice = await showDialog<String>(
    context: context,
    builder: (c) => SimpleDialog(
      title: const Text('Votre espace adhérent'),
      children: [
        SimpleDialogOption(
          onPressed: () => Navigator.pop(c, 'login'),
          child: const ListTile(
            leading: Icon(Icons.login),
            title: Text('Se connecter'),
          ),
        ),
        SimpleDialogOption(
          onPressed: () => Navigator.pop(c, 'reset'),
          child: const ListTile(
            leading: Icon(Icons.lock_reset),
            title: Text('Mot de passe oublié'),
          ),
        ),
      ],
    ),
  );
  if (choice == null || !context.mounted) return;
  await showGapForm(
    context,
    title: choice == 'login'
        ? 'Connexion'
        : 'Choisir ou réinitialiser le mot de passe',
    explanation: choice == 'login'
        ? 'Pour un premier accès, le gestionnaire doit créer votre compte. Utilisez ensuite « Mot de passe oublié » pour choisir votre mot de passe.'
        : 'Utilisez l’adresse pour laquelle le gestionnaire a créé votre accès. Si le compte existe, vous recevrez un lien pour choisir votre mot de passe.',
    fields: [
      const FormFieldSpec('email', 'Email'),
      if (choice == 'login')
        const FormFieldSpec('password', 'Mot de passe', password: true),
    ],
    submitLabel: choice == 'login' ? 'Se connecter' : 'Envoyer le lien',
    submit: (v) async {
      if (choice == 'login') {
        await store.signIn(v['email'], v['password']);
      } else {
        await store.auth.sendPasswordResetEmail(
          email: (v['email'] as String).trim(),
        );
      }
    },
  );
}

class JournalPage extends StatefulWidget {
  final GapStore store;
  const JournalPage({super.key, required this.store});
  @override
  State<JournalPage> createState() => _JournalPageState();
}

class _JournalPageState extends State<JournalPage> {
  String query = '', type = '', category = '', event = '', from = '', to = '';
  @override
  Widget build(BuildContext context) {
    final s = widget.store;
    if (s.summary['initialized'] != true) {
      return const PageBody(
        title: 'Journal de caisse',
        children: [
          EmptyState(
            'La caisse sera publiée après l’initialisation de l’association.',
          ),
        ],
      );
    }
    final rows =
        s
            .rows('publicOperations')
            .where(
              (o) =>
                  (query.isEmpty ||
                      '${o['label']}'.toLowerCase().contains(
                        query.toLowerCase(),
                      )) &&
                  (type.isEmpty || o['type'] == type) &&
                  (category.isEmpty || o['category'] == category) &&
                  (event.isEmpty || o['eventId'] == event) &&
                  (from.isEmpty || '${o['date']}'.compareTo(from) >= 0) &&
                  (to.isEmpty || '${o['date']}'.compareTo(to) <= 0),
            )
            .toList()
          ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    final last = object(s.summary['lastControl']);
    final inflow = rows
        .where((o) => o['cancelled'] != true && (o['delta'] as num) > 0)
        .fold<num>(0, (v, o) => v + (o['delta'] as num));
    final outflow = rows
        .where((o) => o['cancelled'] != true && (o['delta'] as num) < 0)
        .fold<num>(0, (v, o) => v - (o['delta'] as num));
    return PageBody(
      title: 'La caisse, en toute transparence',
      subtitle: 'Les mouvements d’espèces de l’association.',
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            Metric('Solde de caisse', s.summary['balance'], prominent: true),
            Metric('Cotisations encaissées', s.summary['contributions']),
            Metric('Remboursements reçus', s.summary['reimbursements']),
            Metric(
              'Avances à récupérer',
              s.summary['advancesOutstanding'] ?? 0,
            ),
          ],
        ),
        const SizedBox(height: 18),
        Panel(
          child: Row(
            children: [
              const Icon(Icons.verified_outlined, color: Color(0xFF146C60)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  last.isEmpty
                      ? 'Aucun contrôle de caisse enregistré.'
                      : 'Dernier contrôle : ${dayLabel(last['date'])} · Écart ${fcfa(last['difference'])}',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 28),
        Text(
          'Journal des opérations',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            SizedBox(
              width: 260,
              child: TextField(
                decoration: const InputDecoration(
                  labelText: 'Rechercher',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => query = v),
              ),
            ),
            filter(
              'Type',
              {'': 'Tous les types', ...labels},
              type,
              (v) => type = v,
            ),
            filter(
              'Catégorie',
              {
                '': 'Toutes',
                for (final o in s.rows('publicExpenses'))
                  if ('${o['category']}'.isNotEmpty)
                    '${o['category']}': '${o['category']}',
              },
              category,
              (v) => category = v,
            ),
            filter(
              'Événement',
              {
                '': 'Tous',
                for (final e in s.rows('publicEvents'))
                  '${e['id']}': '${e['name']}',
              },
              event,
              (v) => event = v,
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final range = await showDateRangePicker(
                  context: context,
                  firstDate: DateTime(2000),
                  lastDate: DateTime(2100),
                );
                if (range != null && mounted) {
                  setState(() {
                    from = range.start.toIso8601String().substring(0, 10);
                    to = range.end.toIso8601String().substring(0, 10);
                  });
                }
              },
              icon: const Icon(Icons.date_range),
              label: Text(
                from.isEmpty
                    ? 'Période'
                    : '${dayLabel(from)} – ${dayLabel(to)}',
              ),
            ),
            if (from.isNotEmpty)
              IconButton(
                tooltip: 'Effacer la période',
                onPressed: () => setState(() {
                  from = '';
                  to = '';
                }),
                icon: const Icon(Icons.close),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          '${rows.length} opérations · Entrées ${fcfa(inflow)} · Sorties ${fcfa(outflow)}',
        ),
        const SizedBox(height: 12),
        if (rows.isEmpty)
          const EmptyState('Aucune opération pour cette sélection.')
        else
          Panel(
            child: Column(
              children: [
                for (final o in rows)
                  OperationTile(operation: o, events: s.rows('publicEvents')),
              ],
            ),
          ),
        const SizedBox(height: 16),
        const Text(
          'Les cotisations et remboursements d’avoirs sont anonymisés. Les justificatifs et comptes individuels restent privés.',
          style: TextStyle(color: Colors.black54),
        ),
      ],
    );
  }

  Widget filter(
    String label,
    Map<String, String> choices,
    String value,
    void Function(String) update,
  ) => SizedBox(
    width: 200,
    child: DropdownButtonFormField<String>(
      isExpanded: true,
      value: choices.containsKey(value) ? value : '',
      decoration: InputDecoration(labelText: label),
      items: choices.entries
          .map(
            (e) => DropdownMenuItem(
              value: e.key,
              child: Text(e.value, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: (v) => setState(() => update(v ?? '')),
    ),
  );
}

class OperationTile extends StatelessWidget {
  final Json operation;
  final List<Json> events;
  final VoidCallback? onTap;
  const OperationTile({
    super.key,
    required this.operation,
    this.events = const [],
    this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final o = operation;
    final cancelled = o['cancelled'] == true;
    final delta =
        o['delta'] as num? ??
        switch (o['type']) {
          'payment' ||
          'reimbursement' ||
          'income' ||
          'advanceReturn' => o['amount'] as num,
          'refund' || 'advance' => -(o['amount'] as num),
          'expense' when o['payer'] == 'cash' => -(o['amount'] as num),
          'adjustment' =>
            (o['direction'] == 'in' ? 1 : -1) * (o['amount'] as num),
          _ => null,
        };
    final title = '${cancelled ? 'ANNULÉ · ' : ''}${o['label']}';
    final event = events.where((e) => e['id'] == o['eventId']).firstOrNull;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 6),
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: cancelled
            ? Colors.grey.shade100
            : delta != null && delta < 0
            ? const Color(0xFFFFEEE6)
            : const Color(0xFFE5F1ED),
        child: Icon(
          delta != null && delta < 0 ? Icons.north_east : Icons.south_west,
          size: 20,
          color: cancelled ? Colors.grey : const Color(0xFF174E45),
        ),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          decoration: cancelled ? TextDecoration.lineThrough : null,
        ),
      ),
      subtitle: Text(
        [
          dayLabel(o['date']),
          if ('${o['category'] ?? ''}'.isNotEmpty) o['category'],
          if (event != null) event['name'],
          if (o['payer'] == 'member' || o['payer'] == 'thirdParty')
            'Avance personnelle',
          if ((o['revision'] ?? 1) > 1) 'Corrigé',
        ].join(' · '),
      ),
      trailing: Text(
        '${delta != null && delta > 0 ? '+' : ''}${fcfa(delta ?? o['amount'])}',
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: cancelled
              ? Colors.grey
              : delta != null && delta < 0
              ? const Color(0xFF9E492E)
              : const Color(0xFF146C60),
        ),
      ),
    );
  }
}

class ExpensesPage extends StatelessWidget {
  final GapStore store;
  const ExpensesPage({super.key, required this.store});
  @override
  Widget build(BuildContext context) {
    final rows = [...store.rows('publicExpenses')]
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    final categories = <String, num>{};
    for (final o in rows.where((o) => o['cancelled'] != true)) {
      categories.update(
        '${o['category']}',
        (v) => v + (o['amount'] as num),
        ifAbsent: () => o['amount'] as num,
      );
    }
    return PageBody(
      title: 'Dépenses de l’association',
      subtitle: 'Dépenses de caisse et avances personnelles.',
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            Metric('Dépenses brutes', store.summary['spending']),
            Metric('Coût net', store.summary['netCost']),
          ],
        ),
        const SizedBox(height: 24),
        if (categories.isNotEmpty) ...[
          Panel(
            child: Wrap(
              spacing: 24,
              runSpacing: 12,
              children: categories.entries
                  .map((e) => Text('${e.key} : ${fcfa(e.value)}'))
                  .toList(),
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (rows.isEmpty)
          const EmptyState('Aucune dépense enregistrée.')
        else
          Panel(
            child: Column(
              children: [
                for (final o in rows)
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                    leading: Icon(
                      o['fromCash'] == true
                          ? Icons.payments_outlined
                          : Icons.handshake_outlined,
                    ),
                    title: Text(
                      '${o['cancelled'] == true ? 'ANNULÉ · ' : ''}${o['label']}',
                    ),
                    subtitle: Text(
                      '${dayLabel(o['date'])} · ${o['category']}\n${o['fromCash'] == true ? 'Payé par la caisse' : 'Avance personnelle'} · Remboursé ${fcfa(o['reimbursed'])}',
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          fcfa(o['amount']),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        Text('Net ${fcfa(o['net'])}'),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class EventsPage extends StatelessWidget {
  final GapStore store;
  const EventsPage({super.key, required this.store});
  @override
  Widget build(BuildContext context) {
    final rows = [...store.rows('publicEvents')]
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return PageBody(
      title: 'Les événements',
      subtitle: 'Les dépenses et participations, regroupées par occasion.',
      children: [
        if (rows.isEmpty) const EmptyState('Aucun événement pour le moment.'),
        for (final e in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Panel(
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(e['name']),
                subtitle: Text(
                  '${dayLabel(e['date'])} · Coût net ${fcfa(e['net'])}',
                ),
                children: [
                  if ('${e['description']}'.isNotEmpty) Text(e['description']),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 24,
                    runSpacing: 8,
                    children: [
                      Text('Dépenses ${fcfa(e['expenses'])}'),
                      Text('Entrées ${fcfa(e['income'])}'),
                    ],
                  ),
                  for (final o
                      in store
                          .rows('publicExpenses')
                          .where((o) => o['eventId'] == e['id']))
                    ListTile(
                      title: Text(
                        '${o['cancelled'] == true ? 'ANNULÉ · ' : ''}${o['label']}',
                      ),
                      trailing: Text(fcfa(o['amount'])),
                    ),
                  for (final o
                      in store
                          .rows('publicOperations')
                          .where(
                            (o) =>
                                o['eventId'] == e['id'] &&
                                o['type'] != 'expense',
                          ))
                    OperationTile(operation: o),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class ControlsPage extends StatelessWidget {
  final GapStore store;
  const ControlsPage({super.key, required this.store});
  @override
  Widget build(BuildContext context) {
    final rows = [...store.rows('publicControls')]
      ..sort((a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}'));
    return PageBody(
      title: 'Contrôles de caisse',
      subtitle:
          'Le rapprochement entre le montant attendu et les espèces comptées.',
      children: [
        if (rows.isEmpty) const EmptyState('Aucun contrôle enregistré.'),
        for (final c in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Panel(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  c['difference'] == 0
                      ? Icons.check_circle_outline
                      : Icons.difference_outlined,
                  color: c['difference'] == 0
                      ? Colors.teal
                      : Colors.orange.shade800,
                ),
                title: Text(dayLabel(c['date'])),
                subtitle: Text(
                  'Théorique ${fcfa(c['theoretical'])}\nCompté ${fcfa(c['physical'])}',
                ),
                trailing: Text(
                  'Écart\n${fcfa(c['difference'])}',
                  textAlign: TextAlign.right,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class AccountPage extends StatelessWidget {
  final GapStore store;
  final Json? member;
  const AccountPage({super.key, required this.store, this.member});
  @override
  Widget build(BuildContext context) {
    final m = member ?? store.myMember;
    if (m == null) {
      return PageBody(
        title: 'Mon compte',
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  store.user?.emailVerified == false
                      ? 'Demandez le lien ci-dessous pour vérifier votre adresse email.'
                      : 'Activez le lien avec la fiche créée par votre gestionnaire.',
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () => runAction(
                    context,
                    store.activate,
                    'Votre accès est activé.',
                  ),
                  child: const Text(
                    'J’ai vérifié mon email · Activer mon compte',
                  ),
                ),
                if (store.user?.emailVerified == false)
                  TextButton(
                    onPressed: () => runAction(context, () async {
                      await store.user?.sendEmailVerification();
                    }, 'Email de vérification envoyé.'),
                    child: const Text('Envoyer le lien de vérification'),
                  ),
              ],
            ),
          ),
        ],
      );
    }
    final a = object(m['account']);
    return PageBody(
      title: member == null ? 'Mon compte' : '${m['name']}',
      subtitle: '${m['name']} · ${m['status']}',
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            Metric('Reste dû', a['due']),
            Metric('Avoir disponible', a['credit'], prominent: true),
          ],
        ),
        const SizedBox(height: 24),
        Text('Mes cotisations', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (objects(a['charges']).isEmpty)
          const EmptyState('Aucune cotisation due pour le moment.')
        else
          Panel(
            child: Column(
              children: [
                for (final c in objects(a['charges']).reversed)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(monthLabel(c['month'])),
                    subtitle: Text(
                      c['exempt'] == true
                          ? 'Absence ou période hors adhésion · Exonéré'
                          : 'Échéance ${dayLabel(c['dueDate'])}',
                    ),
                    trailing: Text(
                      c['exempt'] == true
                          ? '0 FCFA'
                          : '${fcfa(c['paid'])}\nsur ${fcfa(c['amount'])}',
                      textAlign: TextAlign.right,
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 24),
        Text(
          'Paiements et avoirs',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        Panel(
          child: Column(
            children: [
              if ((m['openingCredit'] ?? 0) > 0)
                ListTile(
                  title: const Text('Avoir antérieur repris'),
                  trailing: Text(fcfa(m['openingCredit'])),
                ),
              for (final p in objects(a['payments']).reversed)
                ListTile(
                  title: const Text('Paiement en espèces'),
                  subtitle: Text(dayLabel(p['date'])),
                  trailing: Text(fcfa(p['amount'])),
                ),
              for (final p in objects(a['credits']).reversed)
                ListTile(
                  title: Text('Avoir · ${p['label']}'),
                  subtitle: Text(dayLabel(p['date'])),
                  trailing: Text(fcfa(p['amount'])),
                ),
              for (final p in objects(a['refunds']).reversed)
                ListTile(
                  title: const Text('Avoir remboursé en espèces'),
                  subtitle: Text(dayLabel(p['date'])),
                  trailing: Text(fcfa(p['amount'])),
                ),
              if (objects(a['payments']).isEmpty &&
                  objects(a['credits']).isEmpty &&
                  objects(a['refunds']).isEmpty &&
                  (m['openingCredit'] ?? 0) == 0)
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('Aucun paiement ni avoir enregistré.'),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Les avoirs sont déduits automatiquement des cotisations dues, sans mouvement d’espèces.',
        ),
      ],
    );
  }
}
