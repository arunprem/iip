import 'package:flutter/material.dart';
import 'iip_motion.dart';

/// Consistent push/pop transitions tuned to display refresh rate.
class IipPageRoute<T> extends PageRouteBuilder<T> {
  IipPageRoute({
    required Widget page,
    required BuildContext context,
    bool fullscreenDialog = false,
  }) : super(
          settings: RouteSettings(name: page.runtimeType.toString()),
          fullscreenDialog: fullscreenDialog,
          transitionDuration: IipMotion.transitionDuration(context),
          reverseTransitionDuration: IipMotion.shortDuration(context),
          pageBuilder: (_, animation, __) => page,
          transitionsBuilder: (_, animation, secondaryAnimation, child) {
            final enter = CurvedAnimation(
              parent: animation,
              curve: IipMotion.enterCurve,
              reverseCurve: IipMotion.exitCurve,
            );
            final fade = Tween<double>(begin: 0, end: 1).animate(enter);
            final slide = Tween<Offset>(
              begin: const Offset(0.04, 0),
              end: Offset.zero,
            ).animate(enter);

            return FadeTransition(
              opacity: fade,
              child: SlideTransition(
                position: slide,
                child: child,
              ),
            );
          },
        );
}

extension IipNavigator on BuildContext {
  Future<T?> pushSmooth<T>(Widget page, {bool fullscreenDialog = false}) {
    return Navigator.of(this).push<T>(
      IipPageRoute<T>(
        page: page,
        context: this,
        fullscreenDialog: fullscreenDialog,
      ),
    );
  }
}

/// Shared Material page transition (fade + subtle slide).
class IipAndroidPageTransitionsBuilder extends PageTransitionsBuilder {
  const IipAndroidPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final enter = CurvedAnimation(
      parent: animation,
      curve: IipMotion.enterCurve,
      reverseCurve: IipMotion.exitCurve,
    );
    return FadeTransition(
      opacity: Tween<double>(begin: 0, end: 1).animate(enter),
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.04, 0),
          end: Offset.zero,
        ).animate(enter),
        child: child,
      ),
    );
  }
}
