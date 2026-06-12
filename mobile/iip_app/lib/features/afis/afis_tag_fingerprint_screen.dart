import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../../services/secugen_capture.dart';
import '../auth/auth_controller.dart';
import 'afis_fingerprint_repository.dart';
import 'afis_suspect_picker_screen.dart';

/// Field officer tags a fingerprint to a selected suspect dossier (pending web approval).
class AfisTagFingerprintScreen extends StatefulWidget {
  const AfisTagFingerprintScreen({super.key});

  @override
  State<AfisTagFingerprintScreen> createState() => _AfisTagFingerprintScreenState();
}

class _AfisTagFingerprintScreenState extends State<AfisTagFingerprintScreen> {
  late final AfisFingerprintRepository _repo;

  AfisSuspectPick? _selectedSuspect;
  String _fingerPosition = 'RIGHT_THUMB';
  SecuGenDeviceStatus? _deviceStatus;
  bool _busy = false;
  bool _checkingDevice = false;
  String? _error;
  String? _success;

  static const _fingerPositions = [
    ('RIGHT_THUMB', 'Right thumb'),
    ('RIGHT_INDEX', 'Right index'),
    ('RIGHT_MIDDLE', 'Right middle'),
    ('RIGHT_RING', 'Right ring'),
    ('RIGHT_LITTLE', 'Right little'),
    ('LEFT_THUMB', 'Left thumb'),
    ('LEFT_INDEX', 'Left index'),
    ('LEFT_MIDDLE', 'Left middle'),
    ('LEFT_RING', 'Left ring'),
    ('LEFT_LITTLE', 'Left little'),
  ];

  bool get _isAndroid => Platform.isAndroid;

  @override
  void initState() {
    super.initState();
    _repo = AfisFingerprintRepository(context.read<AuthController>().api);
    if (_isAndroid) _refreshDeviceStatus();
  }

  Future<void> _refreshDeviceStatus() async {
    if (!_isAndroid) return;
    setState(() => _checkingDevice = true);
    try {
      final status = await SecuGenCapture.getStatus();
      if (!mounted) return;
      setState(() {
        _deviceStatus = status;
        _checkingDevice = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _deviceStatus = const SecuGenDeviceStatus(
          sdkInstalled: false,
          usbHostSupported: false,
          deviceAttached: false,
          ready: false,
          message: 'Could not read scanner status.',
        );
        _checkingDevice = false;
      });
    }
  }

  Future<void> _pickSuspect() async {
    final picked = await context.pushSmooth<AfisSuspectPick>(
      const AfisSuspectPickerScreen(),
    );
    if (picked != null && mounted) {
      setState(() {
        _selectedSuspect = picked;
        _success = null;
        _error = null;
      });
    }
  }

  Future<void> _captureAndSubmit() async {
    final suspect = _selectedSuspect;
    if (suspect == null) {
      setState(() => _error = 'Select a suspect dossier first.');
      return;
    }
    if (!_isAndroid) {
      setState(() {
        _error = 'Fingerprint capture requires Android with SecuGen HU20 over USB OTG.';
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });

    try {
      final captured = await SecuGenCapture.captureTemplate(
        fingerPosition: _fingerPosition,
      );
      final submission = await _repo.submitFingerprint(
        dossierId: suspect.dossierId,
        fingerPosition: captured.fingerPosition,
        templateBytes: captured.templateBytes,
        templateFormat: captured.templateFormat,
        qualityScore: captured.qualityScore,
        deviceModel: captured.deviceModel,
        imageBytes: captured.imageBytes,
        imageWidth: captured.imageWidth,
        imageHeight: captured.imageHeight,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _success =
            'Fingerprint submitted for ${suspect.criminalName}. '
            'Status: ${submission.status} — awaiting supervisor approval on the web portal.';
      });
      await _refreshDeviceStatus();
    } on PlatformException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message ?? 'Fingerprint capture failed (${e.code}).';
        _busy = false;
      });
      await _refreshDeviceStatus();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Submit failed. Check scanner connection and network.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    final ready = _deviceStatus?.ready ?? false;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: const Text('Tag fingerprint'),
        actions: [
          if (_isAndroid)
            IconButton(
              onPressed: _checkingDevice ? null : _refreshDeviceStatus,
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'Refresh scanner',
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Select a suspect, choose the finger, capture with HU20, and submit for supervisor approval.',
            style: TextStyle(color: colors.textMuted, fontSize: 14, height: 1.4),
          ),
          const SizedBox(height: 20),
          _SectionCard(
            colors: colors,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Suspect dossier', style: TextStyle(color: colors.text, fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                if (_selectedSuspect == null)
                  Text('No suspect selected', style: TextStyle(color: colors.textMuted))
                else
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _selectedSuspect!.criminalName,
                        style: TextStyle(color: colors.text, fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                      if (_selectedSuspect!.aliasName != null &&
                          _selectedSuspect!.aliasName!.isNotEmpty)
                        Text(
                          'Alias: ${_selectedSuspect!.aliasName}',
                          style: TextStyle(color: colors.textMuted, fontSize: 13),
                        ),
                    ],
                  ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _pickSuspect,
                  icon: const Icon(Icons.person_search_rounded),
                  label: Text(_selectedSuspect == null ? 'Select suspect' : 'Change suspect'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            colors: colors,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Finger position', style: TextStyle(color: colors.text, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _fingerPosition,
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: colors.surfaceHover,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  items: _fingerPositions
                      .map(
                        (e) => DropdownMenuItem(value: e.$1, child: Text(e.$2)),
                      )
                      .toList(),
                  onChanged: _busy
                      ? null
                      : (v) {
                          if (v != null) setState(() => _fingerPosition = v);
                        },
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (_isAndroid && _deviceStatus != null)
            _SectionCard(
              colors: colors,
              child: Row(
                children: [
                  Icon(
                    ready ? Icons.check_circle_rounded : Icons.usb_rounded,
                    color: ready ? colors.success : colors.warning,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _deviceStatus!.message ?? 'Scanner status unknown',
                      style: TextStyle(color: colors.text, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: (_busy || !ready || _selectedSuspect == null) ? null : _captureAndSubmit,
            icon: _busy
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: const CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.fingerprint_rounded),
            label: Text(_busy ? 'Capturing…' : 'Capture & submit'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              backgroundColor: colors.primary,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            _MessageBox(colors: colors, isError: true, text: _error!),
          ],
          if (_success != null) ...[
            const SizedBox(height: 16),
            _MessageBox(colors: colors, isError: false, text: _success!),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.colors, required this.child});

  final IipColors colors;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.border),
      ),
      child: child,
    );
  }
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({
    required this.colors,
    required this.isError,
    required this.text,
  });

  final IipColors colors;
  final bool isError;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: (isError ? colors.error : colors.success).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: (isError ? colors.error : colors.success).withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isError ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded,
            color: isError ? colors.error : colors.success,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: colors.text, fontSize: 13))),
        ],
      ),
    );
  }
}
