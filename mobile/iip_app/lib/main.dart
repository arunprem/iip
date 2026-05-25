import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'core/storage/token_storage.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: binding);

  final isDark = await TokenStorage().readDarkMode();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthController(initialDark: isDark)..bootstrap(),
      child: const IipApp(),
    ),
  );
}
