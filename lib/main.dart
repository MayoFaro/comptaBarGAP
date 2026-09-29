import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'data/store.dart';
import 'ui/app.dart';

const useEmulators = bool.fromEnvironment('USE_EMULATORS');
const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  GapStore? store;
  String? startupError;
  if (useEmulators || projectId.isNotEmpty) {
    try {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: useEmulators
              ? 'demo-api-key'
              : const String.fromEnvironment('FIREBASE_API_KEY'),
          appId: useEmulators
              ? '1:123456789:web:demo'
              : const String.fromEnvironment('FIREBASE_APP_ID'),
          messagingSenderId: useEmulators
              ? '123456789'
              : const String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
          projectId: useEmulators ? 'demo-comptes-bar-gap' : projectId,
          authDomain: useEmulators
              ? 'demo-comptes-bar-gap.firebaseapp.com'
              : const String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
          storageBucket: useEmulators
              ? 'demo-comptes-bar-gap.appspot.com'
              : const String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
        ),
      );
      final db = FirebaseFirestore.instance;
      final auth = FirebaseAuth.instance;
      final functions = FirebaseFunctions.instanceFor(region: 'europe-west1');
      final storage = FirebaseStorage.instance;
      // Financial writes always need the server. Do not retain private data offline.
      db.settings = const Settings(persistenceEnabled: false);
      if (useEmulators) {
        const host = String.fromEnvironment(
          'EMULATOR_HOST',
          defaultValue: '127.0.0.1',
        );
        db.useFirestoreEmulator(host, 8080);
        await auth.useAuthEmulator(host, 9099);
        functions.useFunctionsEmulator(host, 5001);
        await storage.useStorageEmulator(host, 9199);
      }
      store = GapStore(
        db: db,
        auth: auth,
        functions: functions,
        storage: storage,
      );
    } catch (e) {
      startupError = friendlyError(e);
    }
  }
  runApp(GapApp(store: store, startupError: startupError));
}

class GapApp extends StatelessWidget {
  final GapStore? store;
  final String? startupError;
  const GapApp({super.key, this.store, this.startupError});
  @override
  Widget build(BuildContext context) {
    final colors = ColorScheme.fromSeed(
      seedColor: const Color(0xFF146C60),
      brightness: Brightness.light,
    );
    return MaterialApp(
      title: 'Comptes Bar GAP',
      debugShowCheckedModeBanner: false,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: colors,
        scaffoldBackgroundColor: const Color(0xFFF4F6F3),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFF4F6F3),
          surfaceTintColor: Colors.transparent,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF4F6F3),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      home: store != null
          ? GapShell(store: store!)
          : Scaffold(
              body: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.account_balance_wallet_outlined,
                          size: 48,
                          color: Color(0xFF146C60),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Comptes Bar GAP',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          startupError ??
                              'L’application est prête à être reliée à votre association. La connexion au service de gestion doit être configurée.',
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Consultez le guide de démarrage du projet pour lancer l’environnement local ou connecter Firebase.',
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
