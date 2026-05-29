import 'dart:typed_data';

import '../../core/network/api_client.dart';
import '../../models/suspect_dossier_detail.dart';

class SuspectRepository {
  SuspectRepository(this._api);

  final ApiClient _api;

  Future<SuspectDossierDetail> fetchDossierDetail(String dossierId) async {
    final json = await _api.getJson('/intelligence/suspect-dossiers/$dossierId');
    return SuspectDossierDetail.fromJson(json);
  }

  Future<Uint8List?> fetchPhotoBytes(String storageKey) {
    final path =
        '/mobile/home/suspect-photos/image?storage_key=${Uri.encodeComponent(storageKey)}';
    return _api.getBytes(path);
  }
}
