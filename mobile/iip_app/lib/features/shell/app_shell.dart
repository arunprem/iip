import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/iip_colors.dart';
import '../auth/auth_controller.dart';
import '../frs/frs_mode_sheet.dart';
import '../home/home_screen.dart';
import '../map/intelligence_map_screen.dart';
import '../profile/settings_screen.dart';
import '../services/services_screen.dart';
import 'notched_bottom_bar.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  /// 0 Home, 1 Services, 2 Map, 3 Settings
  int _index = 0;

  void _openFrs() {
    final colors = context.read<AuthController>().colors;
    showFrsModeSheet(context, colors: colors);
  }

  @override
  Widget build(BuildContext context) {
    return Selector<AuthController, IipColors>(
      selector: (_, auth) => auth.colors,
      builder: (context, colors, _) {
        return Scaffold(
          backgroundColor: colors.bg,
          // Content can scroll under the rounded nav; bar surface fills the safe area.
          extendBody: true,
          body: IndexedStack(
            index: _index,
            children: [
              HomeScreen(onOpenSettings: () => setState(() => _index = 3)),
              const ServicesScreen(),
              const IntelligenceMapScreen(),
              const SettingsScreen(),
            ],
          ),
          floatingActionButton: CenterCameraFab(colors: colors, onTap: _openFrs),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
          floatingActionButtonAnimator: FloatingActionButtonAnimator.scaling,
          bottomNavigationBar: NotchedBottomBar(
            colors: colors,
            selectedIndex: _index,
            onSelect: (i) => setState(() => _index = i),
          ),
        );
      },
    );
  }
}
