import 'package:flutter_test/flutter_test.dart';
import 'package:comptes_bar_gap/data/store.dart';

void main() {
  final settings = <String, dynamic>{
    'schedules': [
      {'from': '2026-10', 'frequency': 2},
    ],
  };
  test('Rappel avant échéance et maintien tant que l’appel manque', () {
    expect(suggestedCallMonth(settings, [], '2026-09-28'), '2026-10');
    expect(suggestedCallMonth(settings, [], '2026-10-15'), '2026-10');
    expect(
      suggestedCallMonth(settings, [
        {'start': '2026-10'},
      ], '2026-10-15'),
      '2026-12',
    );
    expect(
      suggestedCallMonth(settings, [
        {'start': '2026-12'},
      ], '2027-01-05'),
      '2027-02',
    );
  });
}
