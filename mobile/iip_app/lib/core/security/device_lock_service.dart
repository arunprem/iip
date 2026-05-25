import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

enum BiometricAuthOutcome { success, cancelled, unavailable, failed }

class DeviceLockService {
  DeviceLockService({LocalAuthentication? auth}) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  Future<bool> canUseBiometrics() async {
    try {
      if (!await _auth.isDeviceSupported()) return false;
      final canCheck = await _auth.canCheckBiometrics;
      if (!canCheck) return false;
      final types = await _auth.getAvailableBiometrics();
      return types.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Runs the system biometric sheet. Does not use [biometricOnly] on Android so
  /// device PIN/pattern can be offered when the sensor fails (better on Xiaomi, etc.).
  Future<BiometricAuthOutcome> authenticateWithBiometrics({
    String reason = 'Unlock IIP Mobile',
  }) async {
    try {
      final ok = await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
          sensitiveTransaction: false,
        ),
      );
      return ok ? BiometricAuthOutcome.success : BiometricAuthOutcome.cancelled;
    } on PlatformException catch (e) {
      if (e.code == 'NotAvailable' ||
          e.code == 'notAvailable' ||
          e.code == 'NotEnrolled' ||
          e.code == 'notEnrolled') {
        return BiometricAuthOutcome.unavailable;
      }
      if (e.code == 'UserCanceled' ||
          e.code == 'userCanceled' ||
          e.code == 'Canceled' ||
          e.code == 'canceled' ||
          e.code == 'LockedOut' ||
          e.code == 'lockedOut') {
        return BiometricAuthOutcome.cancelled;
      }
      return BiometricAuthOutcome.failed;
    } catch (_) {
      return BiometricAuthOutcome.failed;
    }
  }
}
