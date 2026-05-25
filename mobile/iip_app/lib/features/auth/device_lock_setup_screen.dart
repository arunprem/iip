import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/security/device_lock_service.dart';
import '../../shared/widgets/auth/auth_form_widgets.dart';
import '../../shared/widgets/auth/mobile_auth_page.dart';
import '../../shared/widgets/auth/pin_code_input.dart';
import '../../shared/widgets/auth/pin_entry_layout.dart';
import 'auth_controller.dart';

class DeviceLockSetupScreen extends StatefulWidget {
  const DeviceLockSetupScreen({super.key});

  @override
  State<DeviceLockSetupScreen> createState() => _DeviceLockSetupScreenState();
}

class _DeviceLockSetupScreenState extends State<DeviceLockSetupScreen> {
  final _lockService = DeviceLockService();
  bool _biometricAvailable = false;
  bool _busy = false;
  String? _error;

  String _pin = '';
  String? _firstPin;
  _SetupStep _step = _SetupStep.choose;
  bool _setupBiometricAfterPin = false;

  @override
  void initState() {
    super.initState();
    _checkBiometric();
  }

  Future<void> _checkBiometric() async {
    final ok = await _lockService.canUseBiometrics();
    if (mounted) setState(() => _biometricAvailable = ok);
  }

  Future<void> _finishPin(AuthController auth) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.setupDeviceLockPin(_pin, withBiometric: false);
      _popIfNeeded();
    } catch (e) {
      if (mounted) setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finishBiometric(AuthController auth) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!await _lockService.canUseBiometrics()) {
        setState(() => _error = 'Fingerprint is not available on this device.');
        return;
      }
      // Enroll preference only — unlock will show the system biometric prompt.
      await auth.setupDeviceLockBiometricOnly();
      _popIfNeeded();
    } catch (e) {
      if (mounted) setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finishBoth(AuthController auth) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.setupDeviceLockPin(_pin, withBiometric: true);
      _popIfNeeded();
    } catch (e) {
      if (mounted) setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _popIfNeeded() {
    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  String _friendlyError(Object e) {
    final msg = e.toString();
    if (msg.contains('6 digits')) return 'PIN must be exactly 6 digits.';
    return 'Could not save app lock. Try again.';
  }

  void _onPinCompleted(String code, AuthController auth) {
    if (_step == _SetupStep.pinConfirm) {
      if (code != _firstPin) {
        setState(() {
          _error = 'PINs do not match. Enter your PIN again.';
          _firstPin = null;
          _pin = '';
          _step = _SetupStep.pinEnter;
        });
        return;
      }
      _pin = code;
      if (_setupBiometricAfterPin) {
        _finishBoth(auth);
      } else {
        _finishPin(auth);
      }
      return;
    }
    if (code.length != 6) {
      setState(() => _error = 'Enter all 6 digits.');
      return;
    }
    _firstPin = code;
    setState(() {
      _error = null;
      _step = _SetupStep.pinConfirm;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final isPinStep = _step == _SetupStep.pinEnter || _step == _SetupStep.pinConfirm;
    final pinStepKey = _step == _SetupStep.pinEnter ? 'pin_enter' : 'pin_confirm';

    if (isPinStep) {
      return MobileAuthPage(
        colors: colors,
        pinLayout: true,
        body: PinEntryCenteredLayout(
          colors: colors,
          title: _step == _SetupStep.pinEnter ? 'Create your PIN' : 'Confirm your PIN',
          subtitle: _step == _SetupStep.pinEnter
              ? 'Choose a 6-digit code you will remember.'
              : 'Enter the same 6-digit code again.',
          error: _error,
          pin: PinCodeInput(
            key: ValueKey(pinStepKey),
            colors: colors,
            length: 6,
            autofocus: true,
            enabled: !_busy,
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
            onCompleted: (c) => _onPinCompleted(c, auth),
          ),
          belowPin: TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                      _step = _SetupStep.choose;
                      _firstPin = null;
                      _pin = '';
                      _error = null;
                    }),
            child: Text('Back', style: TextStyle(color: colors.textMuted, fontSize: 15)),
          ),
        ),
        bottom: const SizedBox.shrink(),
      );
    }

    return MobileAuthPage(
      colors: colors,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Secure this device',
            style: TextStyle(
              color: colors.text,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'After sign-in, use a 6-digit PIN or fingerprint for faster, secure access.',
            style: TextStyle(color: colors.textMuted, fontSize: 14, height: 1.4),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            AuthErrorBanner(message: _error!, colors: colors, compact: true),
          ],
          const SizedBox(height: 24),
          if (_step == _SetupStep.choose) ...[
            if (_biometricAvailable)
              AuthPrimaryButton(
                colors: colors,
                label: 'Use fingerprint',
                icon: Icons.fingerprint_rounded,
                isLoading: _busy,
                onPressed: _busy ? null : () => _finishBiometric(auth),
              ),
            if (_biometricAvailable) const SizedBox(height: 12),
            AuthPrimaryButton(
              colors: colors,
              label: 'Set up 6-digit PIN',
              icon: Icons.pin_rounded,
              isLoading: _busy,
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _step = _SetupStep.pinEnter;
                        _error = null;
                        _firstPin = null;
                        _pin = '';
                        _setupBiometricAfterPin = false;
                      }),
            ),
            if (_biometricAvailable) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _step = _SetupStep.pinEnter;
                          _error = null;
                          _firstPin = null;
                          _pin = '';
                          _setupBiometricAfterPin = true;
                        }),
                icon: const Icon(Icons.security_rounded),
                label: const Text('PIN + fingerprint'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: colors.primary,
                  side: BorderSide(color: colors.border),
                  minimumSize: const Size.fromHeight(48),
                ),
              ),
            ],
          ],
        ],
      ),
      bottom: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_step == _SetupStep.choose)
            AuthTextButton(
              colors: colors,
              label: 'Skip for now',
              onPressed: _busy
                  ? () {}
                  : () {
                      auth.skipDeviceLockSetup();
                      _popIfNeeded();
                    },
            ),
        ],
      ),
    );
  }
}

enum _SetupStep { choose, pinEnter, pinConfirm }
