import 'package:flutter/material.dart';
import '../../../core/theme/iip_colors.dart';
import 'auth_form_widgets.dart';

/// Vertically centers PIN entry in the thumb-friendly middle of the screen.
class PinEntryCenteredLayout extends StatelessWidget {
  const PinEntryCenteredLayout({
    super.key,
    required this.colors,
    required this.pin,
    this.title,
    this.subtitle,
    this.error,
    this.top,
    this.belowPin,
    this.maxWidth = 320,
  });

  final IipColors colors;
  final Widget pin;
  final String? title;
  final String? subtitle;
  final String? error;
  final Widget? top;
  final Widget? belowPin;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (top != null) ...[
          top!,
          const SizedBox(height: 8),
        ],
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                physics: const BouncingScrollPhysics(parent: ClampingScrollPhysics()),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Padding(
                    padding: EdgeInsets.only(
                      bottom: keyboard > 0 ? keyboard * 0.35 : 24,
                    ),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(maxWidth: maxWidth),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (title != null) ...[
                              Text(
                                title!,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: colors.text,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 8),
                            ],
                            if (subtitle != null) ...[
                              Text(
                                subtitle!,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: colors.textMuted,
                                  fontSize: 14,
                                  height: 1.35,
                                ),
                              ),
                              const SizedBox(height: 20),
                            ],
                            if (error != null) ...[
                              AuthErrorBanner(
                                message: error!,
                                colors: colors,
                                compact: true,
                              ),
                              const SizedBox(height: 16),
                            ],
                            pin,
                            if (belowPin != null) ...[
                              const SizedBox(height: 16),
                              belowPin!,
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
