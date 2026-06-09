import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// In-memory + disk cache for suspect dossier photos (keyed by storage_key).
class SuspectPhotoCache {
  SuspectPhotoCache._();

  static const int _thumbWidth = 96;
  static const int _maxMemoryBytes = 200;
  static const int _maxMemoryThumbs = 200;

  static final _bytesMem = <String, Uint8List>{};
  static final _thumbMem = <String, ui.Image>{};
  static final _bytesInFlight = <String, Future<Uint8List?>>{};
  static final _thumbInFlight = <String, Future<ui.Image?>>{};

  static String _diskName(String storageKey) {
    final digest = sha256.convert(utf8.encode(storageKey)).toString();
    return '$digest.bin';
  }

  static Future<Directory> _dir() async {
    final base = await getTemporaryDirectory();
    final dir = Directory('${base.path}/suspect_photos');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  static Uint8List? bytesFromMemory(String storageKey) => _bytesMem[storageKey];

  static ui.Image? thumbnailFromMemory(String storageKey) => _thumbMem[storageKey];

  /// Snapshot thumbnails already in memory for the given keys.
  static Map<String, ui.Image> snapshotThumbnails(Iterable<String> storageKeys) {
    final out = <String, ui.Image>{};
    for (final key in storageKeys) {
      final img = _thumbMem[key];
      if (img != null) out[key] = img;
    }
    return out;
  }

  static Future<Uint8List?> loadBytes(
    String storageKey,
    Future<Uint8List?> Function() fetch,
  ) async {
    if (storageKey.isEmpty) return null;

    final mem = _bytesMem[storageKey];
    if (mem != null) return mem;

    final inflight = _bytesInFlight[storageKey];
    if (inflight != null) return inflight;

    final future = _loadBytesUncached(storageKey, fetch);
    _bytesInFlight[storageKey] = future;
    try {
      return await future;
    } finally {
      _bytesInFlight.remove(storageKey);
    }
  }

  static Future<Uint8List?> _loadBytesUncached(
    String storageKey,
    Future<Uint8List?> Function() fetch,
  ) async {
    try {
      final disk = await _readDisk(storageKey);
      if (disk != null) {
        _rememberBytes(storageKey, disk);
        return disk;
      }
    } catch (_) {}

    final bytes = await fetch();
    if (bytes == null || bytes.isEmpty) return null;

    _rememberBytes(storageKey, bytes);
    await _writeDisk(storageKey, bytes);
    return bytes;
  }

  static void _rememberBytes(String storageKey, Uint8List bytes) {
    if (_bytesMem.length >= _maxMemoryBytes && !_bytesMem.containsKey(storageKey)) {
      _bytesMem.remove(_bytesMem.keys.first);
    }
    _bytesMem[storageKey] = bytes;
  }

  static Future<ui.Image?> loadThumbnail(
    String storageKey,
    Future<Uint8List?> Function() fetchBytes, {
    int targetWidth = _thumbWidth,
  }) async {
    if (storageKey.isEmpty) return null;

    final mem = _thumbMem[storageKey];
    if (mem != null) return mem;

    final inflight = _thumbInFlight[storageKey];
    if (inflight != null) return inflight;

    final future = _loadThumbnailUncached(storageKey, fetchBytes, targetWidth: targetWidth);
    _thumbInFlight[storageKey] = future;
    try {
      return await future;
    } finally {
      _thumbInFlight.remove(storageKey);
    }
  }

  static Future<ui.Image?> _loadThumbnailUncached(
    String storageKey,
    Future<Uint8List?> Function() fetchBytes, {
    required int targetWidth,
  }) async {
    final bytes = await loadBytes(storageKey, fetchBytes);
    if (bytes == null) return null;

    final image = await _decodeThumb(bytes, targetWidth: targetWidth);
    if (image == null) return null;

    if (_thumbMem.length >= _maxMemoryThumbs && !_thumbMem.containsKey(storageKey)) {
      final evictKey = _thumbMem.keys.first;
      _thumbMem.remove(evictKey)?.dispose();
    }
    _thumbMem[storageKey] = image;
    return image;
  }

  static Future<ui.Image?> _decodeThumb(Uint8List bytes, {required int targetWidth}) async {
    final codec = await ui.instantiateImageCodec(bytes, targetWidth: targetWidth);
    final frame = await codec.getNextFrame();
    return frame.image;
  }

  static Future<Uint8List?> _readDisk(String storageKey) async {
    final file = File('${(await _dir()).path}/${_diskName(storageKey)}');
    if (!await file.exists()) return null;
    return file.readAsBytes();
  }

  static Future<void> _writeDisk(String storageKey, Uint8List bytes) async {
    try {
      final file = File('${(await _dir()).path}/${_diskName(storageKey)}');
      await file.writeAsBytes(bytes, flush: true);
    } catch (_) {}
  }

  static Future<void> clearAll() async {
    _bytesInFlight.clear();
    _thumbInFlight.clear();
    _bytesMem.clear();
    for (final img in _thumbMem.values) {
      img.dispose();
    }
    _thumbMem.clear();
    try {
      final directory = await _dir();
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    } catch (_) {}
  }
}
