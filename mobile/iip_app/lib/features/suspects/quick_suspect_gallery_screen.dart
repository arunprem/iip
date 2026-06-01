import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme/iip_colors.dart';
import '../auth/auth_controller.dart';

class QuickSuspectItem {
  final String id;
  final String name;
  final String localPath;
  final double? latitude;
  final double? longitude;
  final DateTime timestamp;
  bool synced;
  String? serverId;
  bool deleting;

  QuickSuspectItem({
    required this.id,
    required this.name,
    required this.localPath,
    this.latitude,
    this.longitude,
    required this.timestamp,
    this.synced = false,
    this.serverId,
    this.deleting = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'localPath': localPath,
        'latitude': latitude,
        'longitude': longitude,
        'timestamp': timestamp.toIso8601String(),
        'synced': synced,
        'serverId': serverId,
        'deleting': deleting,
      };

  factory QuickSuspectItem.fromJson(Map<String, dynamic> json) => QuickSuspectItem(
        id: json['id'] as String,
        name: json['name'] as String,
        localPath: json['localPath'] as String,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        timestamp: DateTime.parse(json['timestamp'] as String),
        synced: json['synced'] as bool? ?? false,
        serverId: json['serverId'] as String?,
        deleting: json['deleting'] as bool? ?? false,
      );
}

class QuickSuspectGalleryScreen extends StatefulWidget {
  const QuickSuspectGalleryScreen({super.key});

  @override
  State<QuickSuspectGalleryScreen> createState() => _QuickSuspectGalleryScreenState();
}

class _QuickSuspectGalleryScreenState extends State<QuickSuspectGalleryScreen> {
  final List<QuickSuspectItem> _items = [];
  bool _loading = true;
  bool _syncing = false;
  bool _fetching = false;
  bool _searchActive = false;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _generateUuidV4() {
    final random = Random.secure();
    const hexDigits = '0123456789abcdef';
    final chars = List<String>.generate(36, (index) {
      if (index == 8 || index == 13 || index == 18 || index == 23) {
        return '-';
      }
      if (index == 14) {
        return '4';
      }
      final r = random.nextInt(16);
      if (index == 19) {
        return hexDigits[(r & 0x3) | 0x8];
      }
      return hexDigits[r];
    });
    return chars.join();
  }

  @override
  void initState() {
    super.initState();
    _loadLocalData();
  }

  Future<void> _loadLocalData() async {
    setState(() => _loading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('quick_suspects_gallery');
      if (raw != null) {
        final list = jsonDecode(raw) as List;
        _items.clear();
        _items.addAll(list.map((e) => QuickSuspectItem.fromJson(e as Map<String, dynamic>)));
        _items.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      }
    } catch (e) {
      debugPrint("Error loading quick suspects: $e");
    } finally {
      setState(() => _loading = false);
      _triggerAutoSync();
    }
  }

  Future<void> _saveLocalData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final data = _items.map((e) => e.toJson()).toList();
      await prefs.setString('quick_suspects_gallery', jsonEncode(data));
    } catch (e) {
      debugPrint("Error saving quick suspects: $e");
    }
  }

  /// Fetches the server-side list of quick suspect captures and merges
  /// any new items that other field devices have uploaded.
  Future<void> _fetchFromServer() async {
    if (_fetching || _syncing) return;
    setState(() => _fetching = true);
    try {
      final api = context.read<AuthController>().api;
      final list = await api.getJsonList(
        '/intelligence/suspect-dossiers/quick-suspects',
      );
      int added = 0;
      for (final raw in list) {
        final map = raw as Map<String, dynamic>;
        final serverId = map['id'] as String?;
        if (serverId == null) continue;
        // Skip if we already have this capture locally (matched by serverId)
        final alreadyExists = _items.any((e) => e.serverId == serverId);
        if (alreadyExists) continue;

        // This is a photo from another device — add it to our local list
        final item = QuickSuspectItem(
          id: serverId,
          name: (map['name'] as String?) ?? 'Unknown',
          localPath: '', // No local file for server-only captures
          latitude: (map['latitude'] as num?)?.toDouble(),
          longitude: (map['longitude'] as num?)?.toDouble(),
          timestamp: map['captured_at'] != null
              ? DateTime.tryParse(map['captured_at'] as String) ?? DateTime.now()
              : DateTime.now(),
          synced: true,
          serverId: serverId,
          deleting: false,
        );
        _items.insert(0, item);
        added++;
      }
      if (added > 0) {
        _items.sort((a, b) => b.timestamp.compareTo(a.timestamp));
        await _saveLocalData();
        setState(() {});
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$added new photo${added > 1 ? 's' : ''} from field officers.'),
              backgroundColor: Colors.blueGrey.shade800,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }
    } catch (e) {
      debugPrint("Error fetching from server: $e");
    } finally {
      if (mounted) setState(() => _fetching = false);
    }
  }

  Future<void> _triggerAutoSync() async {
    if (_syncing) return;

    setState(() => _syncing = true);
    final api = context.read<AuthController>().api;

    // 1. Process any pending server deletions first (highly reliable offline deletions sync)
    try {
      final prefs = await SharedPreferences.getInstance();
      final pendingDeletes = prefs.getStringList('quick_suspect_pending_deletions') ?? [];

      // Also grab items marked as deleting to process them
      final deletingItems = _items.where((e) => e.deleting && e.serverId != null).toList();
      for (final item in deletingItems) {
        if (!pendingDeletes.contains(item.serverId)) {
          pendingDeletes.add(item.serverId!);
        }
      }

      if (pendingDeletes.isNotEmpty) {
        final remainingDeletes = <String>[];
        for (final serverId in pendingDeletes) {
          try {
            await api.deleteNoContent('/intelligence/suspect-dossiers/quick-suspects/$serverId');
            
            // Successfully deleted from server -> permanently clean local cache & file!
            final localIndex = _items.indexWhere((e) => e.serverId == serverId);
            if (localIndex != -1) {
              final item = _items[localIndex];
              try {
                final file = File(item.localPath);
                if (await file.exists()) {
                  await file.delete();
                }
              } catch (e) {
                debugPrint("Error deleting synced file: $e");
              }
              setState(() {
                _items.removeAt(localIndex);
              });
            }
          } catch (e) {
            debugPrint("Error syncing deletion for $serverId: $e");
            remainingDeletes.add(serverId);
          }
        }
        await prefs.setStringList('quick_suspect_pending_deletions', remainingDeletes);
        await _saveLocalData();
      }

      // Process local-only deleting items (unsynced items marked for deletion)
      final localOnlyDeletes = _items.where((e) => e.deleting && e.serverId == null).toList();
      if (localOnlyDeletes.isNotEmpty) {
        // Short artificial delay to let the user see the deleting cross-bar state clearly
        await Future.delayed(const Duration(milliseconds: 500));
        for (final item in localOnlyDeletes) {
          try {
            final file = File(item.localPath);
            if (await file.exists()) {
              await file.delete();
            }
          } catch (e) {
            debugPrint("Error deleting local unsynced file: $e");
          }
          setState(() {
            _items.remove(item);
          });
        }
        await _saveLocalData();
      }
    } catch (e) {
      debugPrint("Error processing pending deletions: $e");
    }

    // 2. Sync unsynced items (excluding those currently deleting)
    final unsynced = _items.where((e) => !e.synced && !e.deleting).toList();
    int syncCount = 0;

    for (final item in unsynced) {
      try {
        final file = File(item.localPath);
        if (!await file.exists()) {
          item.synced = true;
          await _saveLocalData();
          continue;
        }

        final bytes = await file.readAsBytes();
        final fields = <String, String>{
          'name': item.name,
          'latitude': item.latitude?.toString() ?? '',
          'longitude': item.longitude?.toString() ?? '',
          'id': item.id,
        };

        final response = await api.uploadMultipartWithFields(
          '/intelligence/suspect-dossiers/quick-suspects',
          'file',
          bytes,
          'quick_capture_${item.id}.jpg',
          fields,
        );

        if (response.containsKey('id')) {
          item.serverId = response['id'] as String?;
        }
        item.synced = true;
        
        // Save IMMEDIATELY after each successful upload to completely prevent duplicates
        await _saveLocalData();
        syncCount++;
      } catch (e) {
        debugPrint("Error syncing item ${item.id}: $e");
      }
    }

    if (mounted) {
      setState(() => _syncing = false);
      if (syncCount > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Synced successfully.'),
            backgroundColor: Colors.green.shade800,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _deleteItem(QuickSuspectItem item) async {
    final colors = context.read<AuthController>().colors;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text('Delete suspect photo?', style: TextStyle(color: colors.text)),
        content: Text(
          'This will permanently delete the photograph of ${item.name} from this device and remove it from the index.',
          style: TextStyle(color: colors.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: colors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    // Mark the item as deleting immediately (shows the diagonal cross-bar overlay)
    setState(() {
      item.deleting = true;
    });
    await _saveLocalData();
    _triggerAutoSync();
  }

  Future<Position?> _determinePosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return null;

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return null;
    }

    if (permission == LocationPermission.deniedForever) return null;

    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 5),
        ),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _captureSuspect() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1600,
      maxHeight: 1600,
    );

    if (image == null) return;

    if (!mounted) return;

    final nameController = TextEditingController();
    final colors = context.read<AuthController>().colors;

    final name = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Identifiable Name / Description',
                style: TextStyle(color: colors.text, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                'Add any unique tag or name to identify this capture in the web portal later.',
                style: TextStyle(color: colors.textMuted, fontSize: 12),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameController,
                autofocus: true,
                style: TextStyle(color: colors.text),
                decoration: InputDecoration(
                  labelText: 'Suspect Tag / Name',
                  labelStyle: TextStyle(color: colors.textMuted),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: colors.border)),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: colors.primary)),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx, nameController.text.trim());
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text('Add to Gallery'),
              ),
            ],
          ),
        );
      },
    );

    if (name == null || name.isEmpty) return;

    final position = await _determinePosition();

    final appDir = await getApplicationDocumentsDirectory();
    final quickDir = Directory('${appDir.path}/quick_suspects');
    if (!await quickDir.exists()) {
      await quickDir.create(recursive: true);
    }

    final id = _generateUuidV4();
    final localPath = '${quickDir.path}/quick_$id.jpg';
    await File(image.path).copy(localPath);

    final item = QuickSuspectItem(
      id: id,
      name: name,
      localPath: localPath,
      latitude: position?.latitude,
      longitude: position?.longitude,
      timestamp: DateTime.now(),
      synced: false,
    );

    setState(() {
      _items.insert(0, item);
    });

    await _saveLocalData();
    _triggerAutoSync();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: const Text('Quick Suspect Gallery'),
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
        elevation: 0,
        actions: [
          // Search toggle
          IconButton(
            icon: Icon(
              _searchActive ? Icons.search_off_rounded : Icons.search_rounded,
              color: _searchActive ? colors.primary : colors.textMuted,
            ),
            onPressed: () {
              setState(() {
                _searchActive = !_searchActive;
                if (!_searchActive) {
                  _searchController.clear();
                  _searchQuery = '';
                }
              });
            },
            tooltip: _searchActive ? 'Close Search' : 'Search by Tag',
          ),
          // Refresh: pull new photos from the server that other field officers uploaded
          IconButton(
            icon: AnimatedRotation(
              turns: _fetching ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 600),
              child: Icon(
                Icons.refresh_rounded,
                color: _fetching ? colors.primary : colors.textMuted,
              ),
            ),
            onPressed: _fetching ? null : _fetchFromServer,
            tooltip: 'Refresh from Server',
          ),
          // Sync: upload local offline photos to the server
          IconButton(
            icon: Icon(Icons.sync_rounded, color: _syncing ? colors.primary : colors.textMuted),
            onPressed: _syncing ? null : _triggerAutoSync,
            tooltip: 'Sync Local Photos Now',
          ),
        ],
      ),
      body: Column(
        children: [
          // Animated search bar
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOut,
            height: _searchActive ? 64 : 0,
            child: _searchActive
                ? Container(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    color: colors.bg,
                    child: TextField(
                      controller: _searchController,
                      autofocus: true,
                      style: TextStyle(color: colors.text, fontSize: 14),
                      onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                      decoration: InputDecoration(
                        hintText: 'Search by name or tag…',
                        hintStyle: TextStyle(color: colors.textMuted, fontSize: 13),
                        prefixIcon: Icon(Icons.search_rounded, color: colors.textMuted, size: 18),
                        suffixIcon: _searchQuery.isNotEmpty
                            ? IconButton(
                                icon: Icon(Icons.clear_rounded, color: colors.textMuted, size: 16),
                                onPressed: () => setState(() {
                                  _searchController.clear();
                                  _searchQuery = '';
                                }),
                              )
                            : null,
                        filled: true,
                        fillColor: colors.surface,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: colors.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: colors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: colors.primary, width: 1.5),
                        ),
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          // Gallery content
          Expanded(
            child: _loading
                ? Center(child: CircularProgressIndicator(color: colors.primary))
                : _buildFilteredBody(colors),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _captureSuspect,
        backgroundColor: colors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.photo_camera_rounded),
        label: const Text('Capture Suspect'),
      ),
    );
  }

  /// Routes to empty state, no-match state, or the filtered grid.
  Widget _buildFilteredBody(IipColors colors) {
    if (_items.isEmpty) return _buildEmptyState(colors);

    final filtered = _searchQuery.isEmpty
        ? _items
        : _items
            .where((e) => e.name.toLowerCase().contains(_searchQuery))
            .toList();

    if (filtered.isEmpty) return _buildNoMatchState(colors);
    return _buildGalleryGrid(colors, filtered);
  }

  Widget _buildNoMatchState(IipColors colors) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: colors.surface,
              shape: BoxShape.circle,
              border: Border.all(color: colors.border),
            ),
            child: Icon(Icons.manage_search_rounded, size: 52, color: colors.textMuted),
          ),
          const SizedBox(height: 20),
          Text(
            'No matches found',
            style: TextStyle(color: colors.text, fontSize: 17, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Text(
              'No suspect photo matches the tag "$_searchQuery". Try a different name or keyword.',
              textAlign: TextAlign.center,
              style: TextStyle(color: colors.textMuted, fontSize: 13, height: 1.45),
            ),
          ),
          const SizedBox(height: 20),
          TextButton.icon(
            onPressed: () => setState(() {
              _searchController.clear();
              _searchQuery = '';
            }),
            icon: Icon(Icons.clear_rounded, size: 16, color: colors.primary),
            label: Text('Clear Search', style: TextStyle(color: colors.primary)),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(IipColors colors) {
    return Padding(
      padding: const EdgeInsets.all(32.0),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: colors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: colors.border),
              ),
              child: Icon(Icons.photo_library_outlined, size: 64, color: colors.textMuted),
            ),
            const SizedBox(height: 24),
            Text(
              'No Suspect Captures Yet',
              style: TextStyle(color: colors.text, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Capture rapid, geo-tagged suspect photos in the field. They will be saved offline and synced to the portal automatically when online.',
              textAlign: TextAlign.center,
              style: TextStyle(color: colors.textMuted, fontSize: 13, height: 1.45),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGalleryGrid(IipColors colors, [List<QuickSuspectItem>? filtered]) {
    final displayItems = filtered ?? _items;
    return RefreshIndicator(
      onRefresh: () async {
        await _fetchFromServer();
        await _triggerAutoSync();
      },
      color: colors.primary,
      child: CustomScrollView(
        slivers: [
          // Search result count banner
          if (_searchQuery.isNotEmpty)
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: colors.primary.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.filter_list_rounded, size: 14, color: colors.primary),
                    const SizedBox(width: 6),
                    Text(
                      '${displayItems.length} result${displayItems.length == 1 ? '' : 's'} for "$_searchQuery"',
                      style: TextStyle(color: colors.primary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.72,
              ),
              itemCount: displayItems.length,
              itemBuilder: (context, index) {
                final item = displayItems[index];
                return _buildGalleryCard(item, colors);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGalleryCard(QuickSuspectItem item, IipColors colors) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Photo: local file if available, otherwise server-only placeholder
          if (item.localPath.isNotEmpty)
            Image.file(File(item.localPath), fit: BoxFit.cover)
          else
            Container(
              color: colors.surface,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.cloud_done_rounded, color: colors.primary, size: 40),
                  const SizedBox(height: 8),
                  Text(
                    'Synced from\nanother device',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colors.textMuted, fontSize: 10),
                  ),
                ],
              ),
            ),

          // Gradient Overlay
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.35),
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.85),
                ],
                stops: const [0.0, 0.45, 1.0],
              ),
            ),
          ),

          // Header: Delete circular icon in top-left (only shown when not deleting)
          if (!item.deleting)
            Positioned(
              top: 8,
              left: 8,
              child: GestureDetector(
                onTap: () => _deleteItem(item),
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.red.shade400.withValues(alpha: 0.4), width: 0.8),
                  ),
                  child: const Icon(
                    Icons.delete_rounded,
                    color: Colors.redAccent,
                    size: 14,
                  ),
                ),
              ),
            ),

          // Header: Sync Status Badge in top-right
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: item.synced
                    ? Colors.green.shade900.withValues(alpha: 0.85)
                    : Colors.amber.shade900.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: item.synced ? Colors.green.shade400 : Colors.amber.shade400,
                  width: 0.8,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    item.synced ? Icons.done_all_rounded : Icons.cloud_off_rounded,
                    color: Colors.white,
                    size: 10,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    item.synced ? 'Synced' : 'Offline',
                    style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),

          // Footer info
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.name.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.location_on_rounded, color: Colors.white70, size: 10),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        item.latitude != null && item.longitude != null
                            ? '${item.latitude!.toStringAsFixed(4)}, ${item.longitude!.toStringAsFixed(4)}'
                            : 'GPS not captured',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white70, fontSize: 10),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Deleting Overlay with Diagonal Cross Bar
          if (item.deleting) ...[
            Positioned.fill(
              child: Container(
                color: Colors.black.withValues(alpha: 0.65),
              ),
            ),
            Positioned.fill(
              child: CustomPaint(
                painter: CrossBarPainter(color: Colors.redAccent.withValues(alpha: 0.7), strokeWidth: 3.5),
              ),
            ),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.red.shade900.withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.redAccent, width: 0.8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.sync_problem_rounded, color: Colors.white, size: 12),
                    SizedBox(width: 4),
                    Text(
                      'DELETING...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class CrossBarPainter extends CustomPainter {
  final Color color;
  final double strokeWidth;

  CrossBarPainter({required this.color, required this.strokeWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke;

    canvas.drawLine(Offset.zero, Offset(size.width, size.height), paint);
    canvas.drawLine(Offset(size.width, 0), Offset(0, size.height), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
