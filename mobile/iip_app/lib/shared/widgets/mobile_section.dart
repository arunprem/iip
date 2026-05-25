import 'package:flutter/material.dart';
import '../../core/theme/iip_colors.dart';

class MobileSectionHeader extends StatelessWidget {
  const MobileSectionHeader({super.key, required this.title, this.colors});

  final String title;
  final IipColors? colors;

  @override
  Widget build(BuildContext context) {
    final c = colors ?? IipColors.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          color: c.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class MobileSettingsGroup extends StatelessWidget {
  const MobileSettingsGroup({super.key, required this.colors, required this.children});

  final IipColors colors;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, color: colors.border, indent: 56),
            children[i],
          ],
        ],
      ),
    );
  }
}

class MobileSettingsTile extends StatelessWidget {
  const MobileSettingsTile({
    super.key,
    required this.colors,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.destructive = false,
  });

  final IipColors colors;
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final titleColor = destructive ? colors.error : colors.text;
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: (destructive ? colors.error : colors.primary).withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: destructive ? colors.error : colors.primary, size: 22),
      ),
      title: Text(title, style: TextStyle(color: titleColor, fontWeight: FontWeight.w600, fontSize: 15)),
      subtitle: subtitle != null
          ? Text(subtitle!, style: TextStyle(color: colors.textMuted, fontSize: 12))
          : null,
      trailing: trailing ??
          (onTap != null ? Icon(Icons.chevron_right_rounded, color: colors.textMuted) : null),
    );
  }
}
