import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/mobile_session.dart';
import '../auth/auth_controller.dart';

class ModulePlaceholderScreen extends StatelessWidget {
  const ModulePlaceholderScreen({super.key, required this.widget});

  final MobileWidgetModel widget;

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    return Scaffold(
      appBar: AppBar(title: Text(widget.label)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.description, style: TextStyle(color: colors.textMuted)),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'The ${widget.label} module will be implemented in a future release.\n\nRoute: ${widget.mobileRoute}',
                  style: TextStyle(color: colors.text, height: 1.45),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
