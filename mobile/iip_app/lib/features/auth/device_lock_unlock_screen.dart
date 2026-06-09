import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/security/device_lock_service.dart';
import '../../core/storage/device_lock_storage.dart';
import '../../shared/widgets/auth/auth_form_widgets.dart';
import '../../shared/widgets/auth/mobile_auth_page.dart';
import '../../shared/widgets/auth/pin_code_input.dart';
import '../../core/theme/iip_colors.dart';
import '../../shared/widgets/auth/pin_entry_layout.dart';
import 'auth_controller.dart';

class DeviceLockUnlockScreen extends StatefulWidget {
  const DeviceLockUnlockScreen({super.key});

  @override
  State<DeviceLockUnlockScreen> createState() => _DeviceLockUnlockScreenState();
}

class _DeviceLockUnlockScreenState extends State<DeviceLockUnlockScreen> {
  final _lockService = DeviceLockService();
  final _pinKey = GlobalKey<PinCodeInputState>();
  bool _busy = false;
  bool _showPin = false;
  bool _biometricAvailable = false;
  String? _error;
  DeviceLockMethod? _method;
  bool _autoPromptDone = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final auth = context.read<AuthController>();
    final method = await auth.deviceLock.readMethod();
    final bio =
        await _lockService.canUseBiometrics() && await auth.deviceLock.biometricEnabled();
    final hasPin = await auth.deviceLock.hasPin();
    if (!mounted) return;
    setState(() {
      _method = method;
      _biometricAvailable = bio;
      _showPin = method == DeviceLockMethod.pin || (!bio && hasPin);
    });
    if (bio && method != DeviceLockMethod.pin && !_autoPromptDone) {
      _autoPromptDone = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _tryBiometric(auth, fromButton: false));
    }
  }

  String _messageForOutcome(BiometricAuthOutcome outcome) {
    switch (outcome) {
      case BiometricAuthOutcome.success:
        return '';
      case BiometricAuthOutcome.cancelled:
        return 'Authentication cancelled. Use your PIN or try again.';
      case BiometricAuthOutcome.unavailable:
        return 'Fingerprint is not set up on this device. Use your PIN or sign in with password.';
      case BiometricAuthOutcome.failed:
        return 'Could not verify fingerprint. Try again or use your PIN.';
    }
  }

  Future<void> _tryBiometric(AuthController auth, {required bool fromButton}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final outcome = await _lockService.authenticateWithBiometrics();
    if (!mounted) return;
    if (outcome == BiometricAuthOutcome.success) {
      await auth.completeDeviceUnlock();
      if (!mounted) return;
      if (auth.status == AuthStatus.unauthenticated) return;
      if (auth.status != AuthStatus.authenticated) {
        final msg = auth.errorMessage ?? 'Could not unlock. Please sign in again.';
        setState(() {
          _busy = false;
          _error = msg;
          _showPin = true;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
        );
      }
      return;
    }
    setState(() {
      _busy = false;
      _error = _messageForOutcome(outcome);
      if (outcome != BiometricAuthOutcome.cancelled || fromButton) {
        _showPin = true;
      }
    });
  }

  Future<void> _verifyPin(String pin, AuthController auth) async {
    if (pin.length != 6) {
      setState(() => _error = 'Enter all 6 digits.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await auth.verifyDeviceLockPin(pin);
    if (!mounted) return;
    if (ok) {
      await auth.completeDeviceUnlock();
      if (!mounted) return;
      if (auth.status == AuthStatus.unauthenticated) return;
      if (auth.status != AuthStatus.authenticated) {
        final msg = auth.errorMessage ?? 'Could not unlock. Please sign in again.';
        setState(() {
          _busy = false;
          _error = msg;
        });
        _pinKey.currentState?.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
        );
      }
    } else {
      setState(() {
        _busy = false;
        _error = 'Incorrect PIN. Try again.';
      });
      _pinKey.currentState?.clear();
    }
  }

  Widget _compactHeader(IipColors colors) {
    return Column(
      children: [
        Icon(Icons.lock_rounded, size: 40, color: colors.primary),
        const SizedBox(height: 8),
        Text(
          'Unlock IIP',
          style: TextStyle(
            color: colors.text,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final pinAllowed = _method == DeviceLockMethod.pin ||
        _method == DeviceLockMethod.both ||
        _showPin;
    final showPinEntry = pinAllowed && (_showPin || !_biometricAvailable);

    return MobileAuthPage(
      colors: colors,
      pinLayout: showPinEntry,
      body: showPinEntry
          ? PinEntryCenteredLayout(
              colors: colors,
              top: _compactHeader(colors),
              title: 'Enter your PIN',
              subtitle: '6-digit code to unlock',
              error: _error,
              pin: PinCodeInput(
                key: _pinKey,
                colors: colors,
                length: 6,
                autofocus: !_biometricAvailable || _showPin,
                enabled: !_busy,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                onCompleted: (c) => _verifyPin(c, auth),
              ),
              belowPin: _biometricAvailable
                  ? TextButton(
                      onPressed: _busy ? null : () => _tryBiometric(auth, fromButton: true),
                      child: Text(
                        'Use fingerprint instead',
                        style: TextStyle(color: colors.primary, fontSize: 15),
                      ),
                    )
                  : null,
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.lock_rounded, size: 48, color: colors.primary),
                const SizedBox(height: 16),
                Text(
                  'Unlock IIP',
                  style: TextStyle(
                    color: colors.text,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Use your PIN or fingerprint to continue.',
                  style: TextStyle(color: colors.textMuted, fontSize: 14),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  AuthErrorBanner(message: _error!, colors: colors, compact: true),
                ],
                const SizedBox(height: 28),
                AuthPrimaryButton(
                  colors: colors,
                  label: _busy ? 'Checking…' : 'Use fingerprint',
                  icon: Icons.fingerprint_rounded,
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _tryBiometric(auth, fromButton: true),
                ),
                if (pinAllowed) ...[
                  const SizedBox(height: 16),
                  Center(
                    child: TextButton(
                      onPressed: _busy ? null : () => setState(() => _showPin = true),
                      child: Text('Use PIN instead', style: TextStyle(color: colors.primary)),
                    ),
                  ),
                ],
              ],
            ),
      bottom: AuthTextButton(
        colors: colors,
        label: 'Sign in with password',
        onPressed: _busy ? () {} : () => auth.logout(),
      ),
    );
  }
}
