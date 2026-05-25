import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/mobile_session.dart';
import '../auth/auth_controller.dart';
import 'module_placeholder_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final session = auth.session;
    final colors = auth.colors;
    final widgets = session?.widgets ?? [];

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('IIP Mobile', style: TextStyle(color: colors.text, fontSize: 18, fontWeight: FontWeight.w600)),
            if (session != null)
              Text(
                session.officeRole,
                style: TextStyle(color: colors.textMuted, fontSize: 12),
              ),
          ],
        ),
      ),
      body: widgets.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No modules are enabled for your account on mobile.\nContact your administrator.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: colors.textMuted),
                ),
              ),
            )
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.95,
              ),
              itemCount: widgets.length,
              itemBuilder: (context, index) => _WidgetTile(widget: widgets[index]),
            ),
    );
  }
}

class _WidgetTile extends StatelessWidget {
  const _WidgetTile({required this.widget});
  final MobileWidgetModel widget;

  IconData _iconFor(String name) {
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
    final colors = context.watch<AuthController>().colors;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ModulePlaceholderScreen(widget: widget),
          ),
        );
      },
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(_iconFor(widget.icon), color: colors.primary, size: 28),
              const Spacer(),
              Text(
                widget.label,
                style: TextStyle(fontWeight: FontWeight.w600, color: colors.text, fontSize: 15),
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
    );
  }
}
