import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

typedef Json = Map<String, dynamic>;
String newId() =>
    '${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(0x7fffffff)}';
String today() => DateTime.now()
    .toUtc()
    .add(const Duration(hours: 1))
    .toIso8601String()
    .substring(0, 10);
String nextMonth(String month, [int count = 1]) {
  final p = month.split('-').map(int.parse).toList();
  return DateTime.utc(p[0], p[1] + count).toIso8601String().substring(0, 7);
}

String nextEvenMonth() {
  final m = today().substring(0, 7);
  return nextMonth(m, int.parse(m.substring(5)).isEven ? 2 : 1);
}

Json object(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};
List<Json> objects(dynamic value) =>
    value is List ? value.map(object).toList() : [];
String friendlyError(Object e) {
  if (e is FirebaseFunctionsException) {
    return e.message ?? 'L’opération n’a pas pu être enregistrée.';
  }
  if (e is FirebaseAuthException) {
    return switch (e.code) {
      'invalid-credential' ||
      'wrong-password' ||
      'user-not-found' => 'Email ou mot de passe incorrect.',
      'email-already-in-use' =>
        'Cet email possède déjà un accès. Connectez-vous ou réinitialisez le mot de passe.',
      'weak-password' => 'Utilisez un mot de passe d’au moins 8 caractères.',
      'invalid-email' => 'Adresse email invalide.',
      'too-many-requests' =>
        'Trop de tentatives. Réessayez dans quelques minutes.',
      'network-request-failed' =>
        'Connexion indisponible. Réessayez lorsque le réseau est rétabli.',
      _ => e.message ?? 'Connexion impossible.',
    };
  }
  if (e is FirebaseException) {
    return e.code == 'permission-denied'
        ? 'Vous ne disposez plus des droits nécessaires.'
        : 'Le service est indisponible. Vérifiez votre connexion.';
  }
  return e.toString().replaceFirst('Exception: ', '');
}

class GapStore extends ChangeNotifier {
  final FirebaseFirestore db;
  final FirebaseAuth auth;
  final FirebaseFunctions functions;
  final FirebaseStorage storage;
  GapStore({
    required this.db,
    required this.auth,
    required this.functions,
    required this.storage,
  }) {
    _public.add(
      db.doc('publicSummary/current').snapshots().listen((s) {
        summary = s.data() ?? {};
        notifyListeners();
      }, onError: _error),
    );
    for (final c in [
      'publicOperations',
      'publicExpenses',
      'publicEvents',
      'publicControls',
    ]) {
      _public.add(
        db.collection(c).snapshots().listen((s) {
          data[c] = s.docs.map((d) => d.data()).toList();
          notifyListeners();
        }, onError: _error),
      );
    }
    _authSub = auth.userChanges().listen(_userChanged);
  }
  Json summary = {}, profile = {}, settings = {};
  final Map<String, List<Json>> data = {};
  String? error;
  bool authReady = false;
  bool privateReady = false;
  final List<StreamSubscription<dynamic>> _public = [], _private = [];
  StreamSubscription<dynamic>? _authSub, _profileSub;
  int _generation = 0;
  User? get user => auth.currentUser;
  bool get isAdmin => profile['role'] == 'ADMIN';
  bool get isMember => profile['memberId'] != null && profile['memberId'] != '';
  List<Json> rows(String collection) => data[collection] ?? [];
  List<Json> get members =>
      [...rows('members')]
        ..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
  Json? get myMember =>
      members.where((m) => m['id'] == profile['memberId']).firstOrNull;
  void _error(Object e) {
    error = friendlyError(e);
    notifyListeners();
  }

  void clearError() {
    error = null;
    notifyListeners();
  }

  Future<void> _userChanged(User? u) async {
    final generation = ++_generation;
    await _profileSub?.cancel();
    await _clearPrivate();
    if (generation != _generation) return;
    profile = {};
    authReady = true;
    notifyListeners();
    if (u == null) return;
    _profileSub = db.doc('users/${u.uid}').snapshots().listen((s) async {
      if (generation != _generation) return;
      final next = s.data() ?? {};
      if (next['role'] == profile['role'] &&
          next['memberId'] == profile['memberId'] &&
          privateReady) {
        return;
      }
      await _clearPrivate();
      if (generation != _generation) return;
      profile = next;
      if (isAdmin) {
        _private.add(
          db.doc('config/settings').snapshots().listen((v) {
            settings = v.data() ?? {};
            notifyListeners();
          }, onError: _error),
        );
        for (final c in [
          'members',
          'operations',
          'controls',
          'events',
          'calls',
          'audit',
        ]) {
          _watchPrivate(db.collection(c), c, generation);
        }
        if (summary['initialized'] == true) {
          unawaited(
            execute('refresh', {}).catchError((Object e) {
              _error(e);
            }),
          );
        }
      } else if (isMember) {
        _private.add(
          db.doc('members/${profile['memberId']}').snapshots().listen((v) {
            if (generation != _generation) return;
            data['members'] = v.exists ? [v.data()!] : [];
            notifyListeners();
          }, onError: _error),
        );
      }
      privateReady = true;
      notifyListeners();
    }, onError: _error);
  }

  void _watchPrivate(Query<Json> query, String c, int generation) {
    _private.add(
      query.snapshots().listen((s) {
        if (generation != _generation || !isAdmin) return;
        data[c] = s.docs.map((d) => d.data()).toList();
        notifyListeners();
      }, onError: _error),
    );
  }

  Future<void> _clearPrivate() async {
    for (final sub in _private) {
      await sub.cancel();
    }
    _private.clear();
    for (final c in [
      'members',
      'operations',
      'controls',
      'events',
      'calls',
      'audit',
    ]) {
      data.remove(c);
    }
    settings = {};
    privateReady = false;
  }

  Future<void> execute(String action, Json payload, {String? commandId}) async {
    await functions.httpsCallable('command').call({
      'id': commandId ?? newId(),
      'action': action,
      'payload': payload,
    });
  }

  Future<void> activate() async {
    await user?.reload();
    await auth.currentUser?.getIdToken(true);
    await functions.httpsCallable('activateMyAccount').call();
  }

  Future<void> signIn(String email, String password) async {
    await auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> createMemberAccess(String memberId) async {
    await functions.httpsCallable('createMemberAccess').call({
      'memberId': memberId,
    });
  }

  Future<String> uploadReceipt(
    String operationId,
    Uint8List bytes,
    String extension,
  ) async {
    if (bytes.length >= 10 * 1024 * 1024) {
      throw Exception('Le justificatif doit faire moins de 10 Mo.');
    }
    final ext = extension.toLowerCase();
    final mime = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
    }[ext];
    if (mime == null) {
      throw Exception('Formats acceptés : JPG, PNG, WebP et PDF.');
    }
    final path = 'receipts/$operationId/${newId()}.$ext';
    await storage.ref(path).putData(bytes, SettableMetadata(contentType: mime));
    return path;
  }

  @override
  void dispose() {
    for (final s in [..._public, ..._private]) {
      unawaited(s.cancel());
    }
    unawaited(_authSub?.cancel());
    unawaited(_profileSub?.cancel());
    super.dispose();
  }
}

/// The next unprepared cycle, or the upcoming one after the current call.
String suggestedCallMonth(Json settings, List<Json> calls, String date) {
  final schedules = objects(settings['schedules']);
  var start = schedules.first['from'] as String;
  final current = date.substring(0, 7);
  while (true) {
    final schedule = schedules.lastWhere(
      (s) => '${s['from']}'.compareTo(start) <= 0,
    );
    final next = nextMonth(start, schedule['frequency'] as int);
    if (next.compareTo(current) > 0) {
      return calls.any((c) => c['start'] == start) ? next : start;
    }
    start = next;
  }
}
