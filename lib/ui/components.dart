import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../data/store.dart';

String fcfa(dynamic n) =>
    '${NumberFormat.decimalPattern('fr').format(n is num ? n : 0)} FCFA';
String dayLabel(dynamic date) {
  try {
    return DateFormat('dd/MM/yyyy', 'fr').format(DateTime.parse('$date'));
  } catch (_) {
    return '$date';
  }
}

String monthLabel(dynamic month) {
  if (month == 'opening') return 'Solde antérieur';
  try {
    return DateFormat('MMMM yyyy', 'fr').format(DateTime.parse('$month-01'));
  } catch (_) {
    return '$month';
  }
}

const labels = {
  'payment': 'Cotisation',
  'expense': 'Dépense',
  'reimbursement': 'Remboursement reçu',
  'refund': 'Remboursement d’avoir',
  'income': 'Autre entrée',
  'adjustment': 'Correction de caisse',
  'opening': 'Ouverture',
  'advance': 'Avance à récupérer',
  'advanceReturn': 'Remboursement d’avance',
};

class PageBody extends StatelessWidget {
  final String title, subtitle;
  final List<Widget> children;
  final Widget? action;
  const PageBody({
    super.key,
    required this.title,
    this.subtitle = '',
    required this.children,
    this.action,
  });
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1200),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 20,
              runSpacing: 12,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(subtitle),
                    ],
                  ],
                ),
                if (action != null) action!,
              ],
            ),
            const SizedBox(height: 24),
            ...children,
          ],
        ),
      ),
    ),
  );
}

class Panel extends StatelessWidget {
  final Widget child;
  const Panel({super.key, required this.child});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(padding: const EdgeInsets.all(20), child: child),
  );
}

class EmptyState extends StatelessWidget {
  final String text;
  const EmptyState(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Panel(
    child: SizedBox(
      width: double.infinity,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Column(
          children: [
            const Icon(Icons.inbox_outlined, size: 36, color: Colors.grey),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center),
          ],
        ),
      ),
    ),
  );
}

class Metric extends StatelessWidget {
  final String label;
  final dynamic value;
  final bool prominent;
  const Metric(this.label, this.value, {super.key, this.prominent = false});
  @override
  Widget build(BuildContext context) => Container(
    width: prominent ? 310 : 240,
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: prominent ? const Color(0xFF174E45) : Colors.white,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(color: prominent ? Colors.white70 : Colors.black54),
        ),
        const SizedBox(height: 12),
        Text(
          fcfa(value),
          style: TextStyle(
            fontSize: prominent ? 30 : 24,
            fontWeight: FontWeight.w700,
            color: prominent ? Colors.white : const Color(0xFF174E45),
          ),
        ),
      ],
    ),
  );
}

class FormFieldSpec {
  final String key, label;
  final dynamic initial;
  final bool required, number, password, check;
  final int lines;
  final Map<String, String>? choices;
  final String? hint;
  const FormFieldSpec(
    this.key,
    this.label, {
    this.initial = '',
    this.required = true,
    this.number = false,
    this.password = false,
    this.check = false,
    this.lines = 1,
    this.choices,
    this.hint,
  });
}

Future<bool?> showGapForm(
  BuildContext context, {
  required String title,
  String? explanation,
  required List<FormFieldSpec> fields,
  required Future<void> Function(Json) submit,
  String submitLabel = 'Enregistrer',
  Widget? extra,
}) => showDialog<bool>(
  context: context,
  barrierDismissible: false,
  builder: (_) => _GapForm(
    title: title,
    explanation: explanation,
    fields: fields,
    submit: submit,
    submitLabel: submitLabel,
    extra: extra,
  ),
);

class _GapForm extends StatefulWidget {
  final String title, submitLabel;
  final String? explanation;
  final List<FormFieldSpec> fields;
  final Future<void> Function(Json) submit;
  final Widget? extra;
  const _GapForm({
    required this.title,
    required this.fields,
    required this.submit,
    required this.submitLabel,
    this.explanation,
    this.extra,
  });
  @override
  State<_GapForm> createState() => _GapFormState();
}

class _GapFormState extends State<_GapForm> {
  final key = GlobalKey<FormState>();
  final Map<String, TextEditingController> controllers = {};
  final Json values = {};
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    for (final f in widget.fields) {
      if (f.check || f.choices != null) {
        values[f.key] = f.initial;
      } else {
        controllers[f.key] = TextEditingController(text: '${f.initial}');
      }
    }
  }

  @override
  void dispose() {
    for (final c in controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    if (!key.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = {...values};
      for (final f in widget.fields) {
        if (controllers.containsKey(f.key)) {
          final v = controllers[f.key]!.text.trim();
          result[f.key] = f.number ? (int.tryParse(v) ?? 0) : v;
        }
      }
      await widget.submit(result);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = friendlyError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 540,
        child: SingleChildScrollView(
          child: Form(
            key: key,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (widget.explanation != null) ...[
                  Text(widget.explanation!),
                  const SizedBox(height: 20),
                ],
                for (final f in widget.fields)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: f.check
                        ? CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(f.label),
                            value: values[f.key] == true,
                            onChanged: busy
                                ? null
                                : (v) => setState(() => values[f.key] = v),
                          )
                        : f.choices != null
                        ? DropdownButtonFormField<String>(
                            isExpanded: true,
                            value: f.choices!.containsKey(values[f.key])
                                ? values[f.key]
                                : null,
                            decoration: InputDecoration(labelText: f.label),
                            items: f.choices!.entries
                                .map(
                                  (e) => DropdownMenuItem(
                                    value: e.key,
                                    child: Text(
                                      e.value,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: busy ? null : (v) => values[f.key] = v,
                            validator: (v) =>
                                f.required && (v == null || v.isEmpty)
                                ? 'Choisissez une valeur.'
                                : null,
                          )
                        : TextFormField(
                            controller: controllers[f.key],
                            enabled: !busy,
                            obscureText: f.password,
                            maxLines: f.password ? 1 : f.lines,
                            keyboardType: f.number
                                ? TextInputType.number
                                : f.key.toLowerCase().contains('email')
                                ? TextInputType.emailAddress
                                : TextInputType.text,
                            decoration: InputDecoration(
                              labelText: f.label,
                              helperText: f.hint,
                            ),
                            validator: (v) {
                              if (f.required &&
                                  (v == null || v.trim().isEmpty)) {
                                return 'Ce champ est requis.';
                              }
                              if (f.number &&
                                  v!.isNotEmpty &&
                                  int.tryParse(v) == null) {
                                return 'Saisissez un nombre entier.';
                              }
                              return null;
                            },
                          ),
                  ),
                if (widget.extra != null) widget.extra!,
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: busy ? null : () => Navigator.pop(context, false),
          child: const Text('Annuler'),
        ),
        FilledButton(
          onPressed: busy ? null : save,
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(widget.submitLabel),
        ),
      ],
    ),
  );
}

void toast(BuildContext context, String message) => ScaffoldMessenger.of(
  context,
).showSnackBar(SnackBar(content: Text(message)));
Future<void> runAction(
  BuildContext context,
  Future<void> Function() action, [
  String message = 'Enregistré.',
]) async {
  try {
    await action();
    if (context.mounted) toast(context, message);
  } catch (e) {
    if (context.mounted) toast(context, friendlyError(e));
  }
}
