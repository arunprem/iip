import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_controller.dart';
import '../home/home_screen.dart';
import '../profile/account_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;

    return Scaffold(
      backgroundColor: colors.bg,
      body: IndexedStack(
        index: _index,
        children: const [
          HomeScreen(),
          AccountScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        backgroundColor: colors.surface,
        indicatorColor: colors.primary.withValues(alpha: 0.15),
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.grid_view_rounded, color: colors.textMuted),
            selectedIcon: Icon(Icons.grid_view_rounded, color: colors.primary),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded, color: colors.textMuted),
            selectedIcon: Icon(Icons.person_rounded, color: colors.primary),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
