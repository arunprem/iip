import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_controller.dart';
import '../../models/auth_models.dart';
import '../../core/theme/iip_colors.dart';

/// Pick working unit (office) when user has multiple assignments.
class OfficeSwitchScreen extends StatelessWidget {
  const OfficeSwitchScreen({
    super.key,
    this.onboarding = false,
  });

  final bool onboarding;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final offices = auth.user?.offices ?? [];
    final currentId = auth.currentOffice?.officeId;

    final body = offices.isEmpty
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'No offices are assigned to your account.\nContact your administrator.',
                textAlign: TextAlign.center,
                style: TextStyle(color: colors.textMuted),
              ),
            ),
          )
        : ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: offices.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final office = offices[index];
              final selected = office.officeId == currentId;
              return _OfficeCard(
                colors: colors,
                office: office,
                selected: selected,
                loading: auth.isBusy,
                onTap: () => _select(context, auth, office.officeId),
              );
            },
          );

    if (onboarding) {
      return Scaffold(
        backgroundColor: colors.bg,
        appBar: AppBar(
          title: const Text('Select working unit'),
          automaticallyImplyLeading: false,
        ),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text(
                'Choose the unit you want to log in to. You can change this later in Settings.',
                style: TextStyle(color: colors.textMuted, fontSize: 14, height: 1.4),
              ),
            ),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: const Text('Working unit'),
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Text(
              'Your access and modules depend on the selected unit.',
              style: TextStyle(color: colors.textMuted, fontSize: 14),
            ),
          ),
          Expanded(child: body),
        ],
      ),
    );
  }

  Future<void> _select(BuildContext context, AuthController auth, String officeId) async {
    if (auth.isBusy) return;
    try {
      await auth.selectOffice(officeId);
      if (!context.mounted) return;
      if (onboarding) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Working unit updated.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } on Object {
      if (!context.mounted) return;
      final msg = auth.errorMessage ?? 'Could not switch unit.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
      );
    }
  }
}

class _OfficeCard extends StatelessWidget {
  const _OfficeCard({
    required this.colors,
    required this.office,
    required this.selected,
    required this.loading,
    required this.onTap,
  });

  final IipColors colors;
  final OfficeAssignment office;
  final bool selected;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? colors.primary : colors.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.apartment_rounded, color: colors.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      office.officeName,
                      style: TextStyle(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      office.roleName,
                      style: TextStyle(color: colors.textMuted, fontSize: 13),
                    ),
                  ],
                ),
              ),
              if (loading && selected)
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: colors.primary),
                )
              else if (selected)
                Icon(Icons.check_circle_rounded, color: colors.primary, size: 26)
              else
                Icon(Icons.chevron_right_rounded, color: colors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
