import 'dart:typed_data';
import 'dart:ui' as ui;

import '../../core/network/api_client.dart';
import '../../core/storage/suspect_photo_cache.dart';
import '../../models/suspect_dossier_detail.dart';

class SuspectRepository {
  SuspectRepository(this._api);

  final ApiClient _api;

  ApiClient get api => _api;

  Future<SuspectDossierDetail> fetchDossierDetail(String dossierId) async {
    final json = await _api.getJson('/intelligence/suspect-dossiers/$dossierId');
    return SuspectDossierDetail.fromJson(json);
  }

  Future<Uint8List?> fetchPhotoBytes(String storageKey) {
    return SuspectPhotoCache.loadBytes(storageKey, () {
      final path =
          '/mobile/home/suspect-photos/image?storage_key=${Uri.encodeComponent(storageKey)}';
      return _api.getBytes(path);
    });
  }

  Future<ui.Image?> fetchPhotoThumbnail(String storageKey, {int targetWidth = 96}) {
    return SuspectPhotoCache.loadThumbnail(
      storageKey,
      () => fetchPhotoBytes(storageKey),
      targetWidth: targetWidth,
    );
  }
}
