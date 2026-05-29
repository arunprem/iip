import 'package:flutter/material.dart';
import '../../core/theme/iip_colors.dart';

/// Total height of the bottom chrome (nav row + home-indicator inset).
double iipBottomNavTotalHeight(BuildContext context) {
  return _kNavRowHeight + MediaQuery.paddingOf(context).bottom;
}

const double _kNavRowHeight = 68;
const double _kFabSize = 56;

/// Docked bottom navigation with center camera notch — surface extends to screen edge.
class NotchedBottomBar extends StatelessWidget {
  const NotchedBottomBar({
    super.key,
    required this.colors,
    required this.selectedIndex,
    required this.onSelect,
  });

  final IipColors colors;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border(
          top: BorderSide(color: colors.border.withValues(alpha: 0.85)),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.text.withValues(alpha: 0.07),
            blurRadius: 28,
            offset: const Offset(0, -10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: _kNavRowHeight,
            child: ClipRect(
              child: BottomAppBar(
                color: Colors.transparent,
                surfaceTintColor: Colors.transparent,
                elevation: 0,
                shadowColor: Colors.transparent,
                padding: EdgeInsets.zero,
                height: _kNavRowHeight,
                notchMargin: 6,
                shape: const CircularNotchedRectangle(),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _NavSlot(
                      colors: colors,
                      label: 'Home',
                      icon: Icons.home_outlined,
                      selectedIcon: Icons.home_rounded,
                      selected: selectedIndex == 0,
                      onTap: () => onSelect(0),
                    ),
                    _NavSlot(
                      colors: colors,
                      label: 'Services',
                      icon: Icons.grid_view_outlined,
                      selectedIcon: Icons.grid_view_rounded,
                      selected: selectedIndex == 1,
                      onTap: () => onSelect(1),
                    ),
                    const SizedBox(width: _kFabSize + 6),
                    _NavSlot(
                      colors: colors,
                      label: 'Map',
                      icon: Icons.map_outlined,
                      selectedIcon: Icons.map_rounded,
                      selected: selectedIndex == 2,
                      onTap: () => onSelect(2),
                    ),
                    _NavSlot(
                      colors: colors,
                      label: 'Settings',
                      icon: Icons.settings_outlined,
                      selectedIcon: Icons.settings_rounded,
                      selected: selectedIndex == 3,
                      onTap: () => onSelect(3),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(height: bottomInset),
        ],
      ),
    );
  }
}

class CenterCameraFab extends StatelessWidget {
  const CenterCameraFab({super.key, required this.colors, required this.onTap});

  final IipColors colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: _kFabSize,
      height: _kFabSize,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: colors.surface, width: 4),
        boxShadow: [
          BoxShadow(
            color: colors.primary.withValues(alpha: 0.45),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
          BoxShadow(
            color: colors.text.withValues(alpha: 0.12),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: colors.primary,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: const Center(
            child: Icon(Icons.camera_alt_rounded, color: Colors.white, size: 26),
          ),
        ),
      ),
    );
  }
}

class _NavSlot extends StatelessWidget {
  const _NavSlot({
    required this.colors,
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.selected,
    required this.onTap,
  });

  final IipColors colors;
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = colors.primary;
    final idle = colors.textMuted;

    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          splashColor: active.withValues(alpha: 0.12),
          highlightColor: active.withValues(alpha: 0.06),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? active.withValues(alpha: 0.12) : Colors.transparent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      selected ? selectedIcon : icon,
                      color: selected ? active : idle,
                      size: 22,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selected ? active : idle,
                        fontSize: 10,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        height: 1.0,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
