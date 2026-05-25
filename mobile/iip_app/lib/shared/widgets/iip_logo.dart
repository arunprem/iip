import 'package:flutter/material.dart';
import '../../core/theme/iip_colors.dart';

/// Kerala Police emblem — matches web portal [IipLogo] with optional white backing.
class IipLogo extends StatelessWidget {
  const IipLogo({
    super.key,
    this.size = 88,
    this.whiteBackground = true,
  });

  final double size;
  final bool whiteBackground;

  static const _assetPath = 'assets/images/kerala_police_logo.png';

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final dimension = whiteBackground ? size * 0.72 : size;

    Widget image = Image.asset(
      _assetPath,
      width: dimension,
      height: dimension,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Icon(
        Icons.shield_outlined,
        size: size * 0.5,
        color: isDark ? Colors.white : const Color(0xFF465FFF),
      ),
    );

    if (isDark && !whiteBackground) {
      image = ColorFiltered(
        colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
        child: image,
      );
    }

    if (!whiteBackground) return image;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: image,
    );
  }
}

class IipBrandHeader extends StatelessWidget {
  const IipBrandHeader({
    super.key,
    required this.colors,
    this.title,
    this.subtitle,
    this.showLogo = true,
    this.compact = false,
  });

  final IipColors colors;
  final String? title;
  final String? subtitle;
  final bool showLogo;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (showLogo) const IipLogo(size: 56, whiteBackground: true),
          if (showLogo) const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'IIP · Kerala Police',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.3,
                  ),
                ),
                if (title != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    title!,
                    style: TextStyle(
                      color: colors.text,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      height: 1.1,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 12,
                      height: 1.3,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        if (showLogo) ...[
          const IipLogo(size: 96, whiteBackground: true),
          const SizedBox(height: 20),
        ],
        Text(
          'IIP',
          style: TextStyle(
            color: colors.text,
            fontSize: 15,
            fontWeight: FontWeight.w700,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Kerala Police',
          style: TextStyle(
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.5,
          ),
        ),
        if (title != null) ...[
          const SizedBox(height: 20),
          Text(
            title!,
            style: TextStyle(
              color: colors.text,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              height: 1.15,
              letterSpacing: -0.5,
            ),
            textAlign: TextAlign.center,
          ),
        ],
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 14,
              height: 1.45,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
