import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/motion/iip_motion.dart';
import '../auth/auth_controller.dart';
import 'mobile_widget_tile.dart';

/// Backend-configured feature modules (mobile widgets).
class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final session = auth.session;
    final colors = auth.colors;
    final widgets = session?.widgets ?? [];

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: const Text('Services'),
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
        elevation: 0,
      ),
      body: widgets.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No services are enabled for your role on mobile.\nContact your administrator.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: colors.textMuted, height: 1.45),
                ),
              ),
            )
          : CustomScrollView(
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
              cacheExtent: IipMotion.scrollCacheExtent,
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text(
                      'Tap a module to open intelligence tools assigned to your unit.',
                      style: TextStyle(color: colors.textMuted, fontSize: 13, height: 1.4),
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.95,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) => MobileWidgetTile(
                        widget: widgets[index],
                        colors: colors,
                      ),
                      childCount: widgets.length,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
