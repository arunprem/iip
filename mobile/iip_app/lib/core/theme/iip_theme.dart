import 'package:flutter/material.dart';
import 'iip_colors.dart';
import '../motion/iip_page_route.dart';

ThemeData buildIipTheme(IipColors colors, {required bool isDark}) {
  return ThemeData(
    useMaterial3: true,
    brightness: isDark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: colors.bg,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: IipAndroidPageTransitionsBuilder(),
        TargetPlatform.iOS: IipAndroidPageTransitionsBuilder(),
      },
    ),
    colorScheme: ColorScheme(
      brightness: isDark ? Brightness.dark : Brightness.light,
      primary: colors.primary,
      onPrimary: Colors.white,
      secondary: colors.primary,
      onSecondary: Colors.white,
      error: colors.error,
      onError: Colors.white,
      surface: colors.surface,
      onSurface: colors.text,
      onSurfaceVariant: colors.textMuted,
      outline: colors.border,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: colors.surface,
      foregroundColor: colors.text,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: colors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: colors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: colors.bg,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colors.primary, width: 2),
      ),
      labelStyle: TextStyle(color: colors.textMuted),
      hintStyle: TextStyle(color: colors.textMuted.withValues(alpha: 0.7)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: colors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    textTheme: TextTheme(
      bodyLarge: TextStyle(color: colors.text),
      bodyMedium: TextStyle(color: colors.text),
      bodySmall: TextStyle(color: colors.textMuted),
      titleLarge: TextStyle(color: colors.text, fontWeight: FontWeight.bold),
      titleMedium: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
    ),
  );
}
