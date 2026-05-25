import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/iip_colors.dart';
import '../../shared/widgets/auth/auth_form_widgets.dart';
import '../../shared/widgets/auth/mobile_auth_page.dart';
import '../../shared/widgets/auth/pin_code_input.dart';
import 'auth_controller.dart';

class MfaScreen extends StatefulWidget {
  const MfaScreen({
    super.key,
    required this.colors,
    required this.enrollmentRequired,
  });

  final IipColors colors;
  final bool enrollmentRequired;

  @override
  State<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends State<MfaScreen> {
  String _code = '';

  void _verify(AuthController auth) {
    if (_code.length != 6) return;
    FocusScope.of(context).unfocus();
    auth.verifyMfa(_code);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = widget.colors;
    final title = widget.enrollmentRequired ? 'Set up 2FA' : 'Verification';
    final subtitle = widget.enrollmentRequired
        ? 'Enter the code from your authenticator to finish setup.'
        : 'Enter the 6-digit code from your authenticator app.';

    return MobileAuthPage(
      colors: colors,
      leading: IconButton(
        onPressed: auth.isBusy ? null : auth.clearMfaChallenge,
        style: IconButton.styleFrom(
          backgroundColor: colors.surface,
          foregroundColor: colors.text,
          side: BorderSide(color: colors.border),
        ),
        icon: const Icon(Icons.arrow_back_rounded, size: 22),
      ),
      trailing: MobileThemeButton(
        colors: colors,
        isDark: auth.isDark,
        onToggle: auth.toggleTheme,
      ),
      bottom: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AuthPrimaryButton(
            colors: colors,
            label: auth.isBusy ? 'Verifying…' : 'Continue',
            icon: Icons.check_rounded,
            isLoading: auth.isBusy,
            onPressed: auth.isBusy || _code.length != 6 ? null : () => _verify(auth),
          ),
          const SizedBox(height: 4),
          AuthTextButton(
            colors: colors,
            label: 'Back to sign in',
            onPressed: auth.isBusy ? () {} : auth.clearMfaChallenge,
          ),
        ],
      ),
      body: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MobileAuthBrand(colors: colors, title: title, subtitle: subtitle),
          const SizedBox(height: 24),
          MobileAuthFormPanel(
            colors: colors,
            child: Column(
              children: [
                if (auth.errorMessage != null) ...[
                  AuthErrorBanner(message: auth.errorMessage!, colors: colors, compact: true),
                  const SizedBox(height: 16),
                ],
                PinCodeInput(
                  colors: colors,
                  enabled: !auth.isBusy,
                  onChanged: (v) => setState(() => _code = v),
                  onCompleted: (v) {
                    setState(() => _code = v);
                    _verify(auth);
                  },
                ),
                const SizedBox(height: 14),
                Text(
                  'Google Authenticator or your assigned TOTP app',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
