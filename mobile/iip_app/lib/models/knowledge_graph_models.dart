class SuspectProfileHit {
  SuspectProfileHit({
    required this.masterSuspectId,
    required this.displayName,
    required this.criminalName,
    this.aliasName,
    this.dossierId,
    this.gender,
    this.fathersName,
    this.age,
    this.photoId,
    this.dossierDraftId,
    this.storageKey,
    this.officeName,
    this.profileKind,
    this.linkStatus,
    this.matchTags = const [],
  });

  final String masterSuspectId;
  final String displayName;
  final String criminalName;
  final String? aliasName;
  final String? dossierId;
  final String? gender;
  final String? fathersName;
  final int? age;
  final String? photoId;
  final String? dossierDraftId;
  final String? storageKey;
  final String? officeName;
  final String? profileKind;
  final String? linkStatus;
  final List<String> matchTags;

  SuspectProfileHit mergeWith(SuspectProfileHit other) {
    if (masterSuspectId != other.masterSuspectId) return this;
    final tags = <String>[...matchTags];
    for (final tag in other.matchTags) {
      if (!tags.contains(tag)) tags.add(tag);
    }
    final otherName = other.criminalName.trim();
    final display = displayName.trim();
    if (otherName.isNotEmpty &&
        otherName.toLowerCase() != display.toLowerCase() &&
        !tags.contains(otherName)) {
      tags.add(otherName);
    }
    final otherAlias = other.aliasName?.trim();
    if (otherAlias != null &&
        otherAlias.isNotEmpty &&
        otherAlias.toLowerCase() != display.toLowerCase() &&
        !tags.contains(otherAlias)) {
      tags.add(otherAlias);
    }
    return SuspectProfileHit(
      masterSuspectId: masterSuspectId,
      displayName: displayName,
      criminalName: criminalName,
      aliasName: aliasName,
      dossierId: dossierId ?? other.dossierId,
      gender: gender ?? other.gender,
      fathersName: fathersName ?? other.fathersName,
      age: age ?? other.age,
      photoId: photoId ?? other.photoId,
      dossierDraftId: dossierDraftId ?? other.dossierDraftId,
      storageKey: storageKey ?? other.storageKey,
      officeName: officeName ?? other.officeName,
      profileKind: profileKind ?? other.profileKind,
      linkStatus: linkStatus ?? other.linkStatus,
      matchTags: tags,
    );
  }

  String get metaLine {
    final parts = <String>[];
    if (fathersName != null && fathersName!.isNotEmpty) {
      parts.add('Father: $fathersName');
    }
    if (aliasName != null && aliasName!.isNotEmpty) {
      parts.add('Alias: $aliasName');
    }
    if (gender != null && gender!.isNotEmpty) parts.add(gender!);
    if (age != null) parts.add('Age $age');
    if (officeName != null && officeName!.isNotEmpty) parts.add(officeName!);
    if (linkStatus == 'LINKED') {
      parts.add('Linked dossier');
    } else if (linkStatus == 'STANDALONE') {
      parts.add('Standalone dossier');
    }
    if (profileKind == 'stub') parts.add('Profile stub');
    if (masterSuspectId.length >= 8) {
      parts.add('Ref ${masterSuspectId.substring(0, 8)}');
    }
    return parts.join(' · ');
  }

  factory SuspectProfileHit.fromJson(Map<String, dynamic> json) {
    return SuspectProfileHit(
      masterSuspectId:
          (json['master_suspect_id'] ?? json['masterSuspectId']) as String? ?? '',
      displayName: json['display_name'] as String? ?? '',
      criminalName: json['criminal_name'] as String? ?? '',
      aliasName: json['alias_name'] as String?,
      dossierId: (json['dossier_id'] ?? json['dossierId']) as String?,
      gender: json['gender'] as String?,
      fathersName: (json['fathers_name'] ?? json['fathersName']) as String?,
      age: (json['age'] as num?)?.toInt(),
      photoId: (json['photo_id'] ?? json['photoId']) as String?,
      dossierDraftId:
          (json['dossier_draft_id'] ?? json['dossierDraftId']) as String?,
      storageKey: (json['storage_key'] ?? json['storageKey']) as String?,
      officeName: (json['office_name'] ?? json['officeName']) as String?,
      profileKind: (json['profile_kind'] ?? json['profileKind']) as String?,
      linkStatus: (json['link_status'] ?? json['linkStatus']) as String?,
      matchTags: (json['match_tags'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
    );
  }
}

List<SuspectProfileHit> groupProfileHitsByMaster(Iterable<SuspectProfileHit> hits) {
  final byMaster = <String, SuspectProfileHit>{};
  final order = <String>[];
  for (final hit in hits) {
    final existing = byMaster[hit.masterSuspectId];
    if (existing == null) {
      byMaster[hit.masterSuspectId] = hit;
      order.add(hit.masterSuspectId);
    } else {
      byMaster[hit.masterSuspectId] = existing.mergeWith(hit);
    }
  }
  return order.map((id) => byMaster[id]!).toList();
}

class SuspectProfileSearchResponse {
  SuspectProfileSearchResponse({
    required this.query,
    required this.results,
    required this.hasMore,
    required this.offset,
    required this.limit,
  });

  final String query;
  final List<SuspectProfileHit> results;
  final bool hasMore;
  final int offset;
  final int limit;

  factory SuspectProfileSearchResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['results'] as List<dynamic>? ?? [];
    return SuspectProfileSearchResponse(
      query: json['query'] as String? ?? '',
      results: raw
          .map((e) => SuspectProfileHit.fromJson(e as Map<String, dynamic>))
          .toList(),
      hasMore: json['has_more'] as bool? ?? false,
      offset: json['offset'] as int? ?? 0,
      limit: json['limit'] as int? ?? 20,
    );
  }
}

enum GraphNodeKind { center, associate, relative }

enum GraphLinkKind { associate, relative }

class GraphNode {
  GraphNode({
    required this.id,
    required this.label,
    required this.isCenter,
    this.nodeKind,
    this.gender,
    this.criminalName,
    this.photoId,
    this.dossierDraftId,
    this.storageKey,
    this.x = 0,
    this.y = 0,
  });

  final String id;
  final String label;
  final bool isCenter;
  final GraphNodeKind? nodeKind;
  final String? gender;
  final String? criminalName;
  final String? photoId;
  final String? dossierDraftId;
  final String? storageKey;
  double x;
  double y;

  GraphNodeKind get resolvedKind {
    if (isCenter || nodeKind == GraphNodeKind.center) return GraphNodeKind.center;
    if (nodeKind == GraphNodeKind.relative) return GraphNodeKind.relative;
    return GraphNodeKind.associate;
  }

  factory GraphNode.fromJson(Map<String, dynamic> json) {
    final kindRaw = json['node_kind'] as String?;
    GraphNodeKind? kind;
    if (kindRaw == 'center') {
      kind = GraphNodeKind.center;
    } else if (kindRaw == 'relative') {
      kind = GraphNodeKind.relative;
    } else if (kindRaw == 'associate') {
      kind = GraphNodeKind.associate;
    }
    return GraphNode(
      id: json['id'] as String? ?? '',
      label: json['label'] as String? ?? '',
      isCenter: json['is_center'] as bool? ?? false,
      nodeKind: kind,
      gender: json['gender'] as String?,
      criminalName: json['criminal_name'] as String?,
      photoId: (json['photo_id'] ?? json['photoId']) as String?,
      dossierDraftId:
          (json['dossier_draft_id'] ?? json['dossierDraftId']) as String?,
      storageKey: (json['storage_key'] ?? json['storageKey']) as String?,
    );
  }
}

class GraphEdge {
  GraphEdge({
    required this.id,
    required this.source,
    required this.target,
    required this.role,
    this.linkKind,
    this.dossierId,
  });

  final String id;
  final String source;
  final String target;
  final String role;
  final GraphLinkKind? linkKind;
  final String? dossierId;

  factory GraphEdge.fromJson(Map<String, dynamic> json) {
    final linkRaw = json['link_kind'] as String?;
    GraphLinkKind? linkKind;
    if (linkRaw == 'relative') {
      linkKind = GraphLinkKind.relative;
    } else if (linkRaw == 'associate') {
      linkKind = GraphLinkKind.associate;
    }
    return GraphEdge(
      id: json['id'] as String? ?? '',
      source: json['source'] as String? ?? '',
      target: json['target'] as String? ?? '',
      role: json['role'] as String? ?? '',
      linkKind: linkKind,
      dossierId: (json['dossier_id'] ?? json['dossierId']) as String?,
    );
  }
}

class NetworkGraphResponse {
  NetworkGraphResponse({
    required this.centerId,
    required this.nodes,
    required this.edges,
    this.error,
  });

  final String centerId;
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
  final String? error;

  factory NetworkGraphResponse.fromJson(Map<String, dynamic> json) {
    final nodesRaw = json['nodes'] as List<dynamic>? ?? [];
    final edgesRaw = json['edges'] as List<dynamic>? ?? [];
    return NetworkGraphResponse(
      centerId: (json['center_id'] ?? json['centerId']) as String? ?? '',
      nodes: nodesRaw
          .map((e) => GraphNode.fromJson(e as Map<String, dynamic>))
          .toList(),
      edges: edgesRaw
          .map((e) => GraphEdge.fromJson(e as Map<String, dynamic>))
          .toList(),
      error: json['error'] as String?,
    );
  }
}

class KgRelationStat {
  KgRelationStat({
    required this.key,
    required this.label,
    required this.count,
    required this.isRelative,
  });

  final String key;
  final String label;
  final int count;
  final bool isRelative;
}

String formatRelationRole(String role) {
  return role
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

String relationStatKey(GraphEdge edge) {
  final kind = edge.linkKind == GraphLinkKind.relative ? 'relative' : 'associate';
  final role = edge.role.trim().isEmpty ? 'UNKNOWN' : edge.role.trim();
  return '$kind:$role';
}

List<KgRelationStat> buildRelationStats(List<GraphEdge> edges) {
  final counts = <String, ({String label, int count, bool isRelative})>{};
  for (final edge in edges) {
    final key = relationStatKey(edge);
    final existing = counts[key];
    final isRelative = edge.linkKind == GraphLinkKind.relative;
    counts[key] = (
      label: formatRelationRole(edge.role),
      count: (existing?.count ?? 0) + 1,
      isRelative: isRelative,
    );
  }
  return counts.entries
      .map(
        (e) => KgRelationStat(
          key: e.key,
          label: e.value.label,
          count: e.value.count,
          isRelative: e.value.isRelative,
        ),
      )
      .toList()
    ..sort((a, b) => b.count.compareTo(a.count));
}
