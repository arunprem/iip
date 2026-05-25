import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

/// Disk cache for profile photos — keyed by user id + local version.
class ProfilePhotoCache {
  static Future<Directory> _dir() async {
    final base = await getTemporaryDirectory();
    final dir = Directory('${base.path}/profile_photos');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  static String _fileName(String userId, int version) => '${userId}_v$version.jpg';

  static Future<Uint8List?> read(String userId, int version) async {
    try {
      final file = File('${(await _dir()).path}/${_fileName(userId, version)}');
      if (!await file.exists()) return null;
      return await file.readAsBytes();
    } catch (_) {
      return null;
    }
  }

  static Future<void> write(String userId, int version, Uint8List bytes) async {
    try {
      final directory = await _dir();
      final file = File('${directory.path}/${_fileName(userId, version)}');
      await file.writeAsBytes(bytes, flush: true);
      await _pruneOldVersions(directory, userId, keepVersion: version);
    } catch (_) {}
  }

  static Future<void> clearUser(String userId) async {
    try {
      final directory = await _dir();
      await for (final entity in directory.list()) {
        if (entity is File && entity.path.contains(userId)) {
          await entity.delete();
        }
      }
    } catch (_) {}
  }

  static Future<void> clearAll() async {
    try {
      final directory = await _dir();
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    } catch (_) {}
  }

  static Future<void> _pruneOldVersions(
    Directory directory,
    String userId, {
    required int keepVersion,
  }) async {
    final prefix = '${userId}_v';
    await for (final entity in directory.list()) {
      if (entity is! File || !entity.path.contains(prefix)) continue;
      if (!entity.path.endsWith('_v$keepVersion.jpg')) {
        await entity.delete();
      }
    }
  }
}
