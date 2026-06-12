import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/afis_match.dart';
import '../../services/secugen_capture.dart';
import '../auth/auth_controller.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import 'afis_repository.dart';

/// Field AFIS — SecuGen capture on Android OTG, search via ml-gateway.
class AfisSearchScreen extends StatefulWidget {
  const AfisSearchScreen({super.key});

  @override
  State<AfisSearchScreen> createState() => _AfisSearchScreenState();
}

class _AfisSearchScreenState extends State<AfisSearchScreen> {
  late final AfisRepository _repo;

  AfisMatchResult? _result;
  SecuGenDeviceStatus? _deviceStatus;
  bool _busy = false;
  bool _checkingDevice = false;
  String? _error;
  String? _lastFinger;
  String _fingerPosition = 'LEFT_THUMB';
  String _matchEngine = 'openafis';

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
    _repo = AfisRepository(context.read<AuthController>().api);
    if (_isAndroid) {
      _refreshDeviceStatus();
    }
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

  Future<void> _scanAndSearch() async {
    if (!_isAndroid) {
      setState(() {
        _error =
            'Field fingerprint search requires Android with a SecuGen HU20 over USB OTG.';
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });

    try {
      final captured = await SecuGenCapture.captureTemplate(
        fingerPosition: _fingerPosition,
      );
      _lastFinger = _fingerPosition;

      final result = await _repo.identifyFingerprint(
        captured.templateBytes,
        fingerPosition: _fingerPosition,
        matchEngine: _matchEngine,
        imageBytes: captured.imageBytes,
        imageWidth: captured.imageWidth,
        imageHeight: captured.imageHeight,
      );
      if (!mounted) return;
      setState(() {
        _result = result;
        _busy = false;
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
        _error =
            'Fingerprint search failed. Please verify scanner connection and network accessibility.';
        _busy = false;
      });
    }
  }

  Future<void> _openMatch(AfisFingerprintMatch match) async {
    final colors = context.read<AuthController>().colors;
    var dossierId = match.dossierId;
    if (dossierId == null || dossierId.isEmpty) {
      dossierId = await _repo.resolveDossierId(match);
      match.dossierId = dossierId;
    }
    if (!mounted) return;
    if (dossierId == null || dossierId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('No dossier record found for this match.'),
          backgroundColor: colors.error,
        ),
      );
      return;
    }
    context.pushSmooth(SuspectDossierDetailScreen(dossierId: dossierId));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
        surfaceTintColor: Colors.transparent,
        title: Text('Fingerprint search', style: TextStyle(color: colors.text)),
        elevation: 0,
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
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            _isAndroid
                ? 'Connect SecuGen HU20 via USB OTG to this phone, capture a print, and search submitted suspect dossiers.'
                : 'Fingerprint field search is available on Android with a SecuGen HU20 scanner.',
            style: TextStyle(color: colors.textMuted, height: 1.4),
          ),
          if (_isAndroid) ...[
            const SizedBox(height: 16),
            _ScannerStatusBanner(
              colors: colors,
              status: _deviceStatus,
              checking: _checkingDevice,
            ),
          ],
          const SizedBox(height: 20),
          _FingerprintPlaceholder(colors: colors, busy: _busy),
          if (_isAndroid) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: _fingerPosition,
              decoration: InputDecoration(
                labelText: 'Finger to scan',
                labelStyle: TextStyle(color: colors.textMuted),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              dropdownColor: colors.surface,
              style: TextStyle(color: colors.text),
              items: _fingerPositions
                  .map(
                    (e) => DropdownMenuItem(
                      value: e.$1,
                      child: Text(e.$2),
                    ),
                  )
                  .toList(),
              onChanged: _busy
                  ? null
                  : (v) {
                      if (v != null) setState(() => _fingerPosition = v);
                    },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _matchEngine,
              decoration: InputDecoration(
                labelText: 'Match engine',
                labelStyle: TextStyle(color: colors.textMuted),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              dropdownColor: colors.surface,
              style: TextStyle(color: colors.text),
              items: const [
                DropdownMenuItem(
                  value: 'openafis',
                  child: Text('OpenAFIS (ISO template)'),
                ),
                DropdownMenuItem(
                  value: 'nbis',
                  child: Text('NBIS (grayscale image)'),
                ),
              ],
              onChanged: _busy
                  ? null
                  : (v) {
                      if (v != null) setState(() => _matchEngine = v);
                    },
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: (_busy || !_isAndroid) ? null : _scanAndSearch,
            icon: const Icon(Icons.fingerprint_rounded),
            label: Text(_busy ? 'Capturing…' : 'Scan & search'),
            style: FilledButton.styleFrom(
              backgroundColor: colors.primary,
              minimumSize: const Size.fromHeight(48),
            ),
          ),
          if (_busy) ...[
            const SizedBox(height: 24),
            Center(child: CircularProgressIndicator(color: colors.primary)),
            const SizedBox(height: 8),
            Text(
              _busy && _result == null
                  ? 'Place finger on scanner, then matching against dossiers…'
                  : 'Matching template against submitted dossiers…',
              textAlign: TextAlign.center,
              style: TextStyle(color: colors.textMuted, fontSize: 13),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            _AfisErrorBanner(colors: colors, message: _error!),
          ],
          if (_result != null) ...[
            const SizedBox(height: 24),
            _AfisResultsPanel(
              colors: colors,
              result: _result!,
              onOpenMatch: _openMatch,
            ),
          ],
        ],
      ),
    );
  }
}

class _ScannerStatusBanner extends StatelessWidget {
  const _ScannerStatusBanner({
    required this.colors,
    required this.status,
    required this.checking,
  });

  final IipColors colors;
  final SecuGenDeviceStatus? status;
  final bool checking;

  @override
  Widget build(BuildContext context) {
    final ready = status?.ready == true;
    final borderColor = checking
        ? colors.border
        : ready
            ? colors.primary.withValues(alpha: 0.5)
            : colors.warning.withValues(alpha: 0.55);
    final bg = ready
        ? colors.primary.withValues(alpha: 0.08)
        : colors.warning.withValues(alpha: 0.08);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: checking
          ? Row(
              children: [
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.primary,
                  ),
                ),
                const SizedBox(width: 10),
                Text('Checking scanner…', style: TextStyle(color: colors.text)),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ready ? 'Scanner ready' : 'Scanner not ready',
                  style: TextStyle(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (status?.message != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    status!.message!,
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ],
                if (status != null && !status!.sdkInstalled) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Add FDxSDKProFDAndroid.aar to android/app/libs/ — see docs/SECUGEN_ANDROID.md',
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

class _FingerprintPlaceholder extends StatelessWidget {
  const _FingerprintPlaceholder({required this.colors, required this.busy});

  final IipColors colors;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      decoration: BoxDecoration(
        color: colors.surfaceHover,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          Icon(
            Icons.fingerprint_rounded,
            size: 72,
            color: busy ? colors.primary.withValues(alpha: 0.5) : colors.primary,
          ),
          const SizedBox(height: 12),
          Text(
            busy ? 'Capturing fingerprint…' : 'Ready to scan',
            style: TextStyle(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'USB OTG · SecuGen HU20',
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _AfisQualityBanner extends StatelessWidget {
  const _AfisQualityBanner({required this.colors, required this.quality});

  final IipColors colors;
  final AfisProbeQuality quality;

  @override
  Widget build(BuildContext context) {
    final isGood = quality.grade == 'good';
    final color = isGood ? colors.primary : colors.warning;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        '${quality.minutiaeCount} minutiae · ${quality.templateBytes} bytes · ${quality.message}',
        style: TextStyle(color: colors.textMuted, fontSize: 12, height: 1.35),
      ),
    );
  }
}

class _AfisErrorBanner extends StatelessWidget {
  const _AfisErrorBanner({required this.colors, required this.message});

  final IipColors colors;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.error.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, color: colors.error, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: colors.error,
                fontSize: 14,
                height: 1.35,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AfisResultsPanel extends StatelessWidget {
  const _AfisResultsPanel({
    required this.colors,
    required this.result,
    required this.onOpenMatch,
  });

  final IipColors colors;
  final AfisMatchResult result;
  final Future<void> Function(AfisFingerprintMatch match) onOpenMatch;

  @override
  Widget build(BuildContext context) {
    final quality = result.probeQuality;
    if (result.matches.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (quality != null) ...[
            _AfisQualityBanner(colors: colors, quality: quality),
            const SizedBox(height: 12),
          ],
          Text(
            'No matches found in submitted dossiers.',
            style: TextStyle(color: colors.textMuted),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (quality != null) ...[
          _AfisQualityBanner(colors: colors, quality: quality),
          const SizedBox(height: 12),
        ],
        Text(
          'Matches',
          style: TextStyle(
            color: colors.text,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 10),
        for (final match in result.matches)
          _AfisMatchCard(
            colors: colors,
            match: match,
            onTap: () => onOpenMatch(match),
          ),
      ],
    );
  }
}

class _AfisMatchCard extends StatelessWidget {
  const _AfisMatchCard({
    required this.colors,
    required this.match,
    required this.onTap,
  });

  final IipColors colors;
  final AfisFingerprintMatch match;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: colors.surfaceHover,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: colors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.fingerprint_rounded, color: colors.primary),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        match.displayName,
                        style: TextStyle(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${match.confidenceLabel} · ${match.matchPercent}% · ${match.fingerPosition.replaceAll('_', ' ').toLowerCase()}',
                        style: TextStyle(color: colors.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: colors.textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
