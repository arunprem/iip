import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/widgets/auth/auth_form_widgets.dart';
import '../../core/config/app_config.dart';
import '../../shared/widgets/auth/mobile_auth_page.dart';
import '../../shared/widgets/auth/mobile_captcha_field.dart';
import '../../shared/widgets/auth/mobile_text_field.dart';
import 'auth_controller.dart';
import 'login_validation.dart';
import 'mfa_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _pen = TextEditingController();
  final _password = TextEditingController();
  final _captcha = TextEditingController();
  final _passwordFocus = FocusNode();
  final _captchaFocus = FocusNode();
  bool _validateOnChange = false;

  String _captchaId = '';
  String _captchaImage = '';
  bool _loadingCaptcha = true;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _loadCaptcha();
  }

  Future<void> _loadCaptcha() async {
    setState(() => _loadingCaptcha = true);
    try {
      final auth = context.read<AuthController>();
      final data = await auth.fetchCaptcha();
      if (!mounted) return;
      setState(() {
        _captchaId = data['id'] ?? '';
        _captchaImage = data['image'] ?? '';
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Cannot reach server at ${AppConfig.apiBaseUrl}.\n'
              'Use your Mac IP on a physical phone (not localhost). Same Wi‑Fi?',
            ),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingCaptcha = false);
    }
  }

  void _submit(AuthController auth) {
    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid) {
      setState(() => _validateOnChange = true);
      return;
    }
    FocusScope.of(context).unfocus();
    auth.login(
      username: _pen.text.trim(),
      password: _password.text,
      captchaId: _captchaId,
      captchaCode: _captcha.text.trim(),
    );
  }

  @override
  void dispose() {
    _pen.dispose();
    _password.dispose();
    _captcha.dispose();
    _passwordFocus.dispose();
    _captchaFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final autovalidate = _validateOnChange
        ? AutovalidateMode.onUserInteraction
        : AutovalidateMode.disabled;

    if (auth.mfaToken != null) {
      return MfaScreen(colors: colors, enrollmentRequired: auth.enrollmentRequired);
    }

    return MobileAuthPage(
      colors: colors,
      trailing: MobileThemeButton(
        colors: colors,
        isDark: auth.isDark,
        onToggle: auth.toggleTheme,
      ),
      footer: Text(
        'Kerala Police · CCTNS Division',
        textAlign: TextAlign.center,
        style: TextStyle(color: colors.textMuted.withValues(alpha: 0.85), fontSize: 11),
      ),
      bottom: AuthPrimaryButton(
        colors: colors,
        label: auth.isBusy ? 'Signing in…' : 'Sign in',
        icon: Icons.arrow_forward_rounded,
        isLoading: auth.isBusy,
        onPressed: auth.isBusy || _loadingCaptcha || _captchaId.isEmpty ? null : () => _submit(auth),
      ),
      body: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MobileAuthBrand(
            colors: colors,
            title: 'Sign in',
            subtitle: 'Use your PEN and password',
          ),
          const SizedBox(height: 20),
          MobileAuthFormPanel(
            colors: colors,
            child: Form(
              key: _formKey,
              autovalidateMode: autovalidate,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (auth.errorMessage != null) ...[
                    AuthErrorBanner(message: auth.errorMessage!, colors: colors, compact: true),
                    const SizedBox(height: 12),
                  ],
                  MobileTextField(
                    colors: colors,
                    controller: _pen,
                    label: 'PEN number',
                    hint: 'PEN or login ID',
                    icon: Icons.badge_outlined,
                    textInputAction: TextInputAction.next,
                    enabled: !auth.isBusy,
                    autovalidateMode: autovalidate,
                    validator: validateLoginPen,
                    onSubmitted: (_) => _passwordFocus.requestFocus(),
                  ),
                  const SizedBox(height: 14),
                  MobileTextField(
                    colors: colors,
                    controller: _password,
                    focusNode: _passwordFocus,
                    label: 'Password',
                    hint: 'Enter password',
                    icon: Icons.lock_outline_rounded,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.next,
                    enabled: !auth.isBusy,
                    autovalidateMode: autovalidate,
                    validator: validateLoginPassword,
                    onSubmitted: (_) => _captchaFocus.requestFocus(),
                    suffix: IconButton(
                      onPressed: auth.isBusy
                          ? null
                          : () => setState(() => _obscurePassword = !_obscurePassword),
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        color: colors.textMuted,
                        size: 20,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  MobileCaptchaField(
                    colors: colors,
                    controller: _captcha,
                    imageBase64: _captchaImage,
                    isLoading: _loadingCaptcha,
                    onRefresh: _loadCaptcha,
                    enabled: !auth.isBusy && _captchaId.isNotEmpty,
                    focusNode: _captchaFocus,
                    autovalidateMode: autovalidate,
                    validator: validateLoginCaptcha,
                    onSubmitted: (_) => _submit(auth),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
