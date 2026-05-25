import '../core/theme/iip_colors.dart';

class MobileWidgetModel {
  MobileWidgetModel({
    required this.id,
    required this.widgetKey,
    required this.label,
    required this.description,
    required this.icon,
    required this.mobileRoute,
    required this.sortOrder,
    this.menuKey,
    this.privilegeCode,
  });

  final String id;
  final String widgetKey;
  final String label;
  final String description;
  final String icon;
  final String mobileRoute;
  final int sortOrder;
  final String? menuKey;
  final String? privilegeCode;

  factory MobileWidgetModel.fromJson(Map<String, dynamic> json) {
    return MobileWidgetModel(
      id: json['id'] as String,
      widgetKey: json['widget_key'] as String,
      label: json['label'] as String,
      description: json['description'] as String? ?? '',
      icon: json['icon'] as String? ?? 'apps',
      mobileRoute: json['mobile_route'] as String,
      sortOrder: json['sort_order'] as int? ?? 0,
      menuKey: json['menu_key'] as String?,
      privilegeCode: json['privilege_code'] as String?,
    );
  }
}

class MobileSession {
  MobileSession({
    required this.officeRole,
    required this.widgets,
    required this.colors,
    required this.isDarkDefault,
  });

  final String officeRole;
  final List<MobileWidgetModel> widgets;
  final IipColors colors;
  final bool isDarkDefault;

  factory MobileSession.fromJson(Map<String, dynamic> json, {required bool isDark}) {
    final theme = json['theme'] as Map<String, dynamic>? ?? {};
    final modeKey = isDark ? 'dark' : 'light';
    final palette = theme[modeKey] as Map<String, dynamic>? ?? {};
    final widgetsJson = json['widgets'] as List<dynamic>? ?? [];

    return MobileSession(
      officeRole: json['office_role'] as String? ?? '',
      widgets: widgetsJson
          .map((e) => MobileWidgetModel.fromJson(e as Map<String, dynamic>))
          .toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
      colors: IipColors.fromJson(
        palette.containsKey('colors') ? palette : {'mode': isDark ? 'dark' : 'light', 'colors': palette},
      ),
      isDarkDefault: theme['default_mode'] == 'dark',
    );
  }
}
