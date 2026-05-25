import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/iip_colors.dart';
import '../iip_logo.dart';
import 'ai_network_background.dart';

/// Native mobile auth shell — single column, no web-style split panels.
class MobileAuthPage extends StatelessWidget {
  const MobileAuthPage({
    super.key,
    required this.colors,
    required this.body,
    required this.bottom,
    this.leading,
    this.trailing,
    this.footer,
    /// PIN screens: body fills height so digits can sit in the vertical center.
    this.pinLayout = false,
  });

  final IipColors colors;
  final Widget body;
  final Widget bottom;
  final Widget? leading;
  final Widget? trailing;
  final Widget? footer;
  final bool pinLayout;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final overlay = isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlay,
      child: Scaffold(
        backgroundColor: colors.bg,
        resizeToAvoidBottomInset: true,
        body: AiNetworkBackground(
          colors: colors,
          isDark: isDark,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: 48,
                    child: Row(
                      children: [
                        leading ?? const SizedBox(width: 40),
                        const Spacer(),
                        if (trailing != null) trailing!,
                      ],
                    ),
                  ),
                  Expanded(
                    child: pinLayout
                        ? body
                        : LayoutBuilder(
                            builder: (context, constraints) {
                              return SingleChildScrollView(
                                physics: const BouncingScrollPhysics(
                                  parent: ClampingScrollPhysics(),
                                ),
                                keyboardDismissBehavior:
                                    ScrollViewKeyboardDismissBehavior.onDrag,
                                child: ConstrainedBox(
                                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                                  child: body,
                                ),
                              );
                            },
                          ),
                  ),
                  bottom,
                  if (footer != null) ...[
                    const SizedBox(height: 12),
                    footer!,
                    const SizedBox(height: 4),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Frosted panel so inputs stay readable over the network background.
class MobileAuthFormPanel extends StatelessWidget {
  const MobileAuthFormPanel({super.key, required this.colors, required this.child});

  final IipColors colors;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final panelColor = isDark
        ? colors.surface.withValues(alpha: 0.97)
        : Colors.white.withValues(alpha: 0.98);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      decoration: BoxDecoration(
        color: panelColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border.withValues(alpha: 0.9)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

class MobileAuthBrand extends StatelessWidget {
  const MobileAuthBrand({
    super.key,
    required this.colors,
    required this.title,
    this.subtitle,
  });

  final IipColors colors;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const IipLogo(size: 96, whiteBackground: false),
        const SizedBox(height: 16),
        Text(
          'IIP',
          style: TextStyle(
            color: colors.text,
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Kerala Police',
          style: TextStyle(
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 20),
        Align(
          alignment: Alignment.centerLeft,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: colors.text,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                  letterSpacing: -0.5,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(
                  subtitle!,
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.35,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class MobileThemeButton extends StatelessWidget {
  const MobileThemeButton({super.key, required this.colors, required this.isDark, required this.onToggle});

  final IipColors colors;
  final bool isDark;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onToggle,
      style: IconButton.styleFrom(
        backgroundColor: colors.surface.withValues(alpha: 0.95),
        foregroundColor: colors.textMuted,
        side: BorderSide(color: colors.border),
        minimumSize: const Size(40, 40),
        elevation: 2,
        shadowColor: Colors.black.withValues(alpha: 0.12),
      ),
      icon: Icon(isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined, size: 20),
    );
  }
}
