import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../auth/auth_controller.dart';

class AfisSuspectPick {
  AfisSuspectPick({
    required this.dossierId,
    required this.suspectId,
    required this.masterSuspectId,
    required this.criminalName,
    this.aliasName,
    this.officeName,
  });

  final String dossierId;
  final String suspectId;
  final String masterSuspectId;
  final String criminalName;
  final String? aliasName;
  final String? officeName;

  factory AfisSuspectPick.fromJson(Map<String, dynamic> json) {
    return AfisSuspectPick(
      dossierId: _str(json, 'dossier_id', 'dossierId') ?? '',
      suspectId: _str(json, 'suspect_id', 'suspectId') ?? '',
      masterSuspectId: _str(json, 'master_suspect_id', 'masterSuspectId') ?? '',
      criminalName: _str(json, 'criminal_name', 'criminalName') ?? 'Unknown',
      aliasName: _str(json, 'alias_name', 'aliasName'),
      officeName: _str(json, 'office_name', 'officeName'),
    );
  }

  static String? _str(Map<String, dynamic> json, String snake, String camel) {
    final v = json[snake] ?? json[camel];
    if (v == null) return null;
    final t = v.toString().trim();
    return t.isEmpty ? null : t;
  }
}

class AfisSuspectPickerScreen extends StatefulWidget {
  const AfisSuspectPickerScreen({super.key});

  @override
  State<AfisSuspectPickerScreen> createState() => _AfisSuspectPickerScreenState();
}

class _AfisSuspectPickerScreenState extends State<AfisSuspectPickerScreen> {
  final _searchCtrl = TextEditingController();
  List<AfisSuspectPick> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({String? q}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthController>();
      final api = auth.api;
      final params = <String, String>{'page': '1', 'page_size': '40'};
      if (q != null && q.trim().isNotEmpty) params['q'] = q.trim();
      final json = await api.getJson(
        '/mobile/fingerprints/suspect-picks?${Uri(queryParameters: params).query}',
      );
      final raw = json['items'] ?? json['dossiers'];
      final list = (raw as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AfisSuspectPick.fromJson)
          .where((e) => e.dossierId.isNotEmpty)
          .toList();
      if (!mounted) return;
      setState(() {
        _items = list;
        _loading = false;
        if (list.isEmpty && (q == null || q.trim().isEmpty)) {
          final office = auth.currentOffice?.officeName;
          _error = office != null && office.isNotEmpty
              ? 'No suspect dossiers in your assigned offices.\n'
                  'Current unit: $office — try switching office in Profile if dossiers '
                  'were created under another unit.'
              : null;
        }
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
        _items = [];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load suspects. Check network and that IAM is reachable '
            '(${e.runtimeType}).';
        _loading = false;
        _items = [];
      });
    }
  }

  Widget? _pickSubtitle(AfisSuspectPick item, IipColors colors) {
    final lines = <String>[
      if (item.aliasName != null && item.aliasName!.isNotEmpty)
        'Alias: ${item.aliasName}',
      if (item.officeName != null && item.officeName!.isNotEmpty)
        item.officeName!,
    ];
    if (lines.isEmpty) return null;
    return Text(
      lines.join('\n'),
      style: TextStyle(color: colors.textMuted, fontSize: 13),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: const Text('Select suspect'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search by name…',
                prefixIcon: const Icon(Icons.search_rounded),
                filled: true,
                fillColor: colors.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                suffixIcon: IconButton(
                  onPressed: () => _load(q: _searchCtrl.text),
                  icon: const Icon(Icons.arrow_forward_rounded),
                ),
              ),
              onSubmitted: (value) => _load(q: value),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: colors.error)),
                        ),
                      )
                    : _items.isEmpty
                        ? Center(
                            child: Text('No dossiers found', style: TextStyle(color: colors.textMuted)),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _items.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final item = _items[index];
                              return Material(
                                color: colors.surface,
                                borderRadius: BorderRadius.circular(12),
                                child: ListTile(
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    side: BorderSide(color: colors.border),
                                  ),
                                  title: Text(
                                    item.criminalName,
                                    style: TextStyle(
                                      color: colors.text,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  subtitle: _pickSubtitle(item, colors),
                                  trailing: Icon(Icons.chevron_right_rounded, color: colors.textMuted),
                                  onTap: () => Navigator.pop(context, item),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}
