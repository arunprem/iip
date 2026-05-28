import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/widgets/iip_logo.dart';
import '../auth/auth_controller.dart';

/// Shown while [AuthController.bootstrap] runs — branded, not a blank loader.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthController>(
      builder: (context, auth, _) {
        final colors = auth.colors;
        return Theme(
          data: auth.isDark
              ? ThemeData(brightness: Brightness.dark, scaffoldBackgroundColor: colors.bg)
              : ThemeData(brightness: Brightness.light, scaffoldBackgroundColor: colors.bg),
          child: Scaffold(
            backgroundColor: colors.bg,
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Spacer(flex: 2),
                      const IipLogo(size: 112, whiteBackground: false),
                      const SizedBox(height: 20),
                      Text(
                        'IIP',
                        style: TextStyle(
                          color: colors.text,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Kerala Police',
                        style: TextStyle(
                          color: colors.textMuted,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Mobile',
                        style: TextStyle(
                          color: colors.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const Spacer(flex: 3),
                      SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: colors.primary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Starting…',
                        style: TextStyle(
                          color: colors.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const Spacer(flex: 2),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
