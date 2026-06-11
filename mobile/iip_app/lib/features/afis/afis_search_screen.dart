import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../core/config/app_config.dart';
import '../../core/motion/iip_page_route.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/afis_match.dart';
import '../auth/auth_controller.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import 'afis_repository.dart';

/// Field AFIS — capture a fingerprint template and search submitted dossiers.
class AfisSearchScreen extends StatefulWidget {
  const AfisSearchScreen({super.key});

  @override
  State<AfisSearchScreen> createState() => _AfisSearchScreenState();
}

class _AfisSearchScreenState extends State<AfisSearchScreen> {
  late final AfisRepository _repo;

  AfisMatchResult? _result;
  bool _busy = false;
  String? _error;
  String? _lastFinger;

  @override
  void initState() {
    super.initState();
    _repo = AfisRepository(context.read<AuthController>().api);
  }

  Future<Uint8List?> _captureFromBridge() async {
    final base = AppConfig.fingerprintBridgeUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base/capture');
    final response = await http
        .post(
          uri,
          headers: const {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: jsonEncode({'finger_position': 'RIGHT_THUMB'}),
        )
        .timeout(const Duration(seconds: 20));

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        'Fingerprint scanner bridge unavailable (${response.statusCode}). '
        'Start the capture service on the enrollment PC.',
      );
    }

    final data = jsonDecode(response.body);
    if (data is! Map<String, dynamic>) {
      throw ApiException('Invalid response from fingerprint bridge.');
    }
    final b64 = (data['template_data_b64'] ?? data['templateDataB64'])?.toString().trim();
    if (b64 == null || b64.isEmpty) {
      throw ApiException('Scanner returned an empty template.');
    }
    _lastFinger = (data['finger_position'] ?? data['fingerPosition'])?.toString();
    return base64Decode(b64);
  }

  Future<void> _scanAndSearch() async {
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      final templateBytes = await _captureFromBridge();
      if (templateBytes == null || !mounted) return;
      final result = await _repo.identifyFingerprint(
        templateBytes,
        fingerPosition: _lastFinger,
      );
      if (!mounted) return;
      setState(() {
        _result = result;
        _busy = false;
      });
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
            'Fingerprint search failed. Ensure the scanner bridge and ML gateway (port 8020) are running.';
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
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            'Place the suspect\'s finger on the SecuGen scanner connected to the enrollment workstation, then search the AFIS index.',
            style: TextStyle(color: colors.textMuted, height: 1.4),
          ),
          const SizedBox(height: 20),
          _FingerprintPlaceholder(colors: colors, busy: _busy),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : _scanAndSearch,
            icon: const Icon(Icons.fingerprint_rounded),
            label: Text(_busy ? 'Searching…' : 'Scan & search'),
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
              'Matching template against submitted dossiers…',
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
            busy ? 'Waiting for scanner…' : 'Ready to capture',
            style: TextStyle(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Bridge: ${AppConfig.fingerprintBridgeUrl}',
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.textMuted, fontSize: 11),
          ),
        ],
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
    if (result.matches.isEmpty) {
      return Text(
        'No matches found in submitted dossiers.',
        style: TextStyle(color: colors.textMuted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
                        '${match.matchPercent}% · ${match.fingerPosition.replaceAll('_', ' ').toLowerCase()}',
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
