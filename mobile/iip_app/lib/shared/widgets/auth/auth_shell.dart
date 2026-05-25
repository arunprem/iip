import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/iip_colors.dart';
import '../iip_logo.dart';

/// Full-screen auth layout: branded header, body, footer.
class AuthShell extends StatelessWidget {
  const AuthShell({
    super.key,
    required this.colors,
    required this.child,
    this.headerTitle,
    this.headerSubtitle,
    this.showLogo = true,
    this.leading,
    this.trailing,
    this.footer,
    this.compact = false,
    this.showHeroBand = true,
    this.scrollable = true,
  });

  final IipColors colors;
  final Widget child;
  final String? headerTitle;
  final String? headerSubtitle;
  final bool showLogo;
  final Widget? leading;
  final Widget? trailing;
  final Widget? footer;
  /// Fits login on one screen: smaller header, no hero band, no scroll when idle.
  final bool compact;
  final bool showHeroBand;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final footerWidget = footer ??
        Text(
          compact
              ? 'Developed and maintained by Kerala Police, CCTNS Division'
              : 'Developed and maintained by\nKerala Police, CCTNS Division',
          textAlign: TextAlign.center,
          maxLines: compact ? 2 : null,
          style: TextStyle(
            color: colors.textMuted.withValues(alpha: 0.85),
            fontSize: compact ? 10 : 11,
            height: 1.35,
          ),
        );

    final horizontalPad = compact ? 16.0 : 24.0;
    final showHero = showHeroBand && !compact;

    final bodyContent = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: compact ? MainAxisSize.max : MainAxisSize.min,
      children: [
        if (showHero) ...[
          _AuthHeroBand(colors: colors, isDark: isDark),
          SizedBox(height: compact ? 12 : 28),
        ],
        IipBrandHeader(
          colors: colors,
          showLogo: showLogo,
          title: headerTitle,
          subtitle: headerSubtitle,
          compact: compact,
        ),
        SizedBox(height: compact ? 10 : 28),
        if (compact) Expanded(child: child) else child,
      ],
    );

    return Theme(
      data: Theme.of(context).copyWith(
        textTheme: Theme.of(context).textTheme.apply(
              bodyColor: colors.text,
              displayColor: colors.text,
            ),
        inputDecorationTheme: Theme.of(context).inputDecorationTheme.copyWith(
              hintStyle: TextStyle(color: colors.textMuted.withValues(alpha: 0.75)),
              labelStyle: TextStyle(color: colors.textMuted),
            ),
      ),
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        child: Scaffold(
          backgroundColor: colors.bg,
          resizeToAvoidBottomInset: true,
          body: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(8, compact ? 4 : 8, 16, 0),
                  child: Row(
                    children: [
                      if (leading != null) leading! else const SizedBox(width: 48),
                      const Spacer(),
                      if (trailing != null) trailing!,
                    ],
                  ),
                ),
                Expanded(
                  child: compact
                      ? Padding(
                          padding: EdgeInsets.fromLTRB(horizontalPad, 4, horizontalPad, 8),
                          child: Column(
                            children: [
                              Expanded(child: bodyContent),
                            ],
                          ),
                        )
                      : scrollable
                          ? SingleChildScrollView(
                              padding: EdgeInsets.fromLTRB(horizontalPad, 8, horizontalPad, 16),
                              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                              child: bodyContent,
                            )
                          : Padding(
                              padding: EdgeInsets.fromLTRB(horizontalPad, 8, horizontalPad, 16),
                              child: bodyContent,
                            ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(horizontalPad, 4, horizontalPad, compact ? 8 : 16),
                  child: footerWidget,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AuthHeroBand extends StatelessWidget {
  const _AuthHeroBand({required this.colors, required this.isDark});

  final IipColors colors;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 72,
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark
                ? [
                    const Color(0xFF0F172A),
                    const Color(0xFF1E3A5F),
                    const Color(0xFF0C4A6E),
                  ]
                : [
                    const Color(0xFF0F172A),
                    const Color(0xFF1E40AF),
                    const Color(0xFF0369A1),
                  ],
          ),
        ),
        child: CustomPaint(
          painter: _GridPainter(),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Icon(Icons.verified_user_outlined, color: Colors.white.withValues(alpha: 0.9), size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Secure access for authorized personnel. Sessions are monitored and audited.',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.88),
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..strokeWidth = 0.5;
    const step = 20.0;
    for (var x = 0.0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
