import 'package:flutter/material.dart';

/// Smooth platform scroll physics with extra cache for list jank reduction.
class IipScrollBehavior extends MaterialScrollBehavior {
  const IipScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) {
    return const BouncingScrollPhysics(
      parent: AlwaysScrollableScrollPhysics(),
    );
  }

  @override
  Widget buildScrollbar(BuildContext context, Widget child, ScrollableDetails details) {
    return child;
  }
}
