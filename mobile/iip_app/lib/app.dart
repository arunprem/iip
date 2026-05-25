import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/iip_colors.dart';
import '../core/theme/iip_theme.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/profile/office_switch_screen.dart';

class IipApp extends StatelessWidget {
  const IipApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthController>(
      builder: (context, auth, _) {
        return MaterialApp(
          title: 'IIP Mobile',
          debugShowCheckedModeBanner: false,
          theme: buildIipTheme(IipColors.light, isDark: false),
          darkTheme: buildIipTheme(IipColors.dark, isDark: true),
          themeMode: auth.isDark ? ThemeMode.dark : ThemeMode.light,
          home: _RootRouter(status: auth.status),
        );
      },
    );
  }
}

class _RootRouter extends StatelessWidget {
  const _RootRouter({required this.status});
  final AuthStatus status;

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.unauthenticated:
        return const LoginScreen();
      case AuthStatus.needsOffice:
        return const OfficeSwitchScreen(onboarding: true);
      case AuthStatus.authenticated:
        return const AppShell();
    }
  }
}
