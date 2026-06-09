import '../../core/network/api_client.dart';
import '../../models/knowledge_graph_models.dart';

class KnowledgeGraphRepository {
  KnowledgeGraphRepository(this._api);

  final ApiClient _api;

  Future<SuspectProfileSearchResponse> searchProfiles(
    String query, {
    int limit = 20,
    int offset = 0,
    String? excludeMasterSuspectId,
  }) async {
    final params = <String, String>{
      'q': query,
      'limit': '$limit',
      'offset': '$offset',
    };
    if (excludeMasterSuspectId != null && excludeMasterSuspectId.isNotEmpty) {
      params['exclude_master_suspect_id'] = excludeMasterSuspectId;
    }
    final queryString = params.entries
        .map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final json = await _api.getJson('/intelligence/knowledge-graph/search?$queryString');
    return SuspectProfileSearchResponse.fromJson(json);
  }

  Future<NetworkGraphResponse> fetchNetwork(String masterSuspectId, {int depth = 2}) async {
    final json = await _api.getJson(
      '/intelligence/knowledge-graph/network/$masterSuspectId?depth=$depth',
    );
    return NetworkGraphResponse.fromJson(json);
  }

  /// Resolves the most recent dossier id for a master profile (for opening dossier detail).
  Future<String?> resolveDossierIdForMaster(String masterSuspectId) async {
    final json = await _api.getJson('/intelligence/suspect-dossiers/masters/$masterSuspectId');
    final identities = json['identities'] as List<dynamic>? ?? [];
    if (identities.isEmpty) return null;
    return (identities.first as Map<String, dynamic>)['dossier_id'] as String?;
  }
}
