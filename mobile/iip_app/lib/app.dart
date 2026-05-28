import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:provider/provider.dart';
import '../core/motion/iip_motion.dart';
import '../core/motion/iip_scroll_behavior.dart';
import '../core/theme/iip_colors.dart';
import '../core/theme/iip_theme.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/device_lock_setup_screen.dart';
import '../features/auth/device_lock_unlock_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/profile/office_switch_screen.dart';
import '../features/splash/splash_screen.dart';

class IipApp extends StatefulWidget {
  const IipApp({super.key});

  @override
  State<IipApp> createState() => _IipAppState();
}

class _IipAppState extends State<IipApp> {
  bool _nativeSplashRemoved = false;
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  String? _lastShownToastMessage;

  void _removeNativeSplashOnce() {
    if (_nativeSplashRemoved) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _nativeSplashRemoved) return;
      FlutterNativeSplash.remove();
      _nativeSplashRemoved = true;
    });
  }

  bool _isConnectionError(String message) {
    final m = message.toLowerCase();
    return m.contains('cannot reach server') ||
        m.contains('network unavailable') ||
        m.contains('connection') ||
        m.contains('timeout') ||
        m.contains('request failed');
  }

  void _maybeShowNetworkToast(String? message) {
    if (message == null || message.isEmpty) {
      _lastShownToastMessage = null;
      return;
    }
    if (!_isConnectionError(message)) return;
    if (_lastShownToastMessage == message) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final messenger = _messengerKey.currentState;
      if (messenger == null) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(message),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
          ),
        );
      _lastShownToastMessage = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthController>(
      builder: (context, auth, _) {
        _removeNativeSplashOnce();
        _maybeShowNetworkToast(auth.errorMessage);

        return MaterialApp(
          key: ValueKey('session-${auth.appSessionGeneration}'),
          scaffoldMessengerKey: _messengerKey,
          title: 'IIP Mobile',
          debugShowCheckedModeBanner: false,
          scrollBehavior: const IipScrollBehavior(),
          theme: buildIipTheme(IipColors.light, isDark: false),
          darkTheme: buildIipTheme(IipColors.dark, isDark: true),
          themeMode: auth.isDark ? ThemeMode.dark : ThemeMode.light,
          home: _AuthRoot(status: auth.status),
        );
      },
    );
  }
}

class _AuthRoot extends StatelessWidget {
  const _AuthRoot({required this.status});
  final AuthStatus status;

  @override
  Widget build(BuildContext context) {
    // No animation when leaving bootstrap splash — avoids a flash before login/unlock.
    if (status == AuthStatus.unknown) {
      return const SplashScreen();
    }

    return AnimatedSwitcher(
      duration: IipMotion.transitionDuration(context),
      reverseDuration: IipMotion.shortDuration(context),
      switchInCurve: IipMotion.enterCurve,
      switchOutCurve: IipMotion.exitCurve,
      layoutBuilder: (currentChild, previousChildren) {
        return Stack(
          alignment: Alignment.center,
          children: [
            ...previousChildren,
            if (currentChild != null) currentChild,
          ],
        );
      },
      transitionBuilder: (child, animation) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: IipMotion.enterCurve,
          reverseCurve: IipMotion.exitCurve,
        );
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.015),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
      child: KeyedSubtree(
        key: ValueKey(status),
        child: _RootRouter(status: status),
      ),
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
        return const SplashScreen();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
      case AuthStatus.needsOffice:
        return const OfficeSwitchScreen(onboarding: true);
      case AuthStatus.needsDeviceLockSetup:
        return const DeviceLockSetupScreen();
      case AuthStatus.needsDeviceUnlock:
        return const DeviceLockUnlockScreen();
      case AuthStatus.authenticated:
        return const AppShell();
    }
  }
}
