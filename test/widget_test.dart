import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:comptes_bar_gap/main.dart';
import 'package:comptes_bar_gap/ui/components.dart';

void main() {
  testWidgets(
    'Sans configuration, explique la connexion requise sans inventer de données',
    (tester) async {
      await tester.pumpWidget(const GapApp());
      expect(find.text('Comptes Bar GAP'), findsOneWidget);
      expect(find.textContaining('reliée à votre association'), findsOneWidget);
      expect(find.textContaining('10 000'), findsNothing);
    },
  );
  testWidgets(
    'Le formulaire conserve les valeurs et affiche un refus du serveur',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showGapForm(
                  context,
                  title: 'Remboursement',
                  fields: const [
                    FormFieldSpec('amount', 'Montant', number: true),
                  ],
                  submit: (_) async {
                    throw Exception('Avoir insuffisant');
                  },
                ),
                child: const Text('Ouvrir'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Ouvrir'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '5000');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();
      expect(find.text('Avoir insuffisant'), findsOneWidget);
      expect(find.text('5000'), findsOneWidget);
      expect(find.text('Remboursement'), findsOneWidget);
    },
  );
}
