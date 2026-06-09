import 'package:flutter/material.dart';
import '../../core/motion/iip_page_route.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/mobile_session.dart';
import '../home/module_placeholder_screen.dart';
import '../knowledge_graph/knowledge_graph_screen.dart';

class MobileWidgetTile extends StatelessWidget {
  const MobileWidgetTile({super.key, required this.widget, required this.colors});

  final MobileWidgetModel widget;
  final IipColors colors;

  static IconData iconFor(String name) {
    switch (name) {
      case 'LayoutDashboard':
        return Icons.dashboard_outlined;
      case 'Bell':
        return Icons.notifications_outlined;
      case 'User':
        return Icons.person_outline;
      case 'Radio':
        return Icons.sensors;
      case 'FolderOpen':
        return Icons.folder_open;
      case 'Bot':
        return Icons.psychology_outlined;
      case 'MapPin':
        return Icons.map_outlined;
      case 'Network':
        return Icons.hub_outlined;
      case 'Lock':
        return Icons.lock_outline;
      default:
        return Icons.widgets_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          if (widget.widgetKey == 'kg-canvas') {
            context.pushSmooth(const KnowledgeGraphScreen());
            return;
          }
          context.pushSmooth(ModulePlaceholderScreen(widget: widget));
        },
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(iconFor(widget.icon), color: colors.primary, size: 28),
                const Spacer(),
                Text(
                  widget.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: colors.textMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
