class SuspectFingerprintRef {
  SuspectFingerprintRef({
    required this.templateId,
    required this.printId,
    required this.fingerPosition,
    required this.templateFormat,
    this.qualityScore,
    this.deviceModel,
  });

  factory SuspectFingerprintRef.fromJson(Map<String, dynamic> json) {
    return SuspectFingerprintRef(
      templateId: (json['template_id'] ?? json['templateId']) as String? ?? '',
      printId: (json['print_id'] ?? json['printId']) as String?,
      fingerPosition: (json['finger_position'] ?? json['fingerPosition']) as String? ?? '',
      templateFormat: (json['template_format'] ?? json['templateFormat']) as String? ?? 'ISO19794-2',
      qualityScore: (json['quality_score'] ?? json['qualityScore']) as num?,
      deviceModel: (json['device_model'] ?? json['deviceModel']) as String?,
    );
  }

  final String templateId;
  final String? printId;
  final String fingerPosition;
  final String templateFormat;
  final num? qualityScore;
  final String? deviceModel;
}
