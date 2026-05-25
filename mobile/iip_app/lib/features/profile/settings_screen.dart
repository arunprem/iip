import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/widgets/auth/mobile_text_field.dart';
import '../../shared/widgets/mobile_section.dart';
import '../auth/auth_controller.dart';
import 'office_switch_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  final _confirmPw = TextEditingController();
  bool _changingPassword = false;
  bool _obscureCurrent = true;
  bool _obscureNew = true;

  @override
  void dispose() {
    _currentPw.dispose();
    _newPw.dispose();
    _confirmPw.dispose();
    super.dispose();
  }

  Future<void> _changePassword(AuthController auth) async {
    final current = _currentPw.text;
    final newPw = _newPw.text;
    final confirm = _confirmPw.text;

    if (current.isEmpty || newPw.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Fill in all password fields.'), behavior: SnackBarBehavior.floating),
      );
      return;
    }
    if (newPw.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('New password must be at least 8 characters.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (newPw != confirm) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('New passwords do not match.'), behavior: SnackBarBehavior.floating),
      );
      return;
    }
    if (current == newPw) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('New password must differ from the current password.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() => _changingPassword = true);
    try {
      await auth.changePassword(currentPassword: current, newPassword: newPw);
      if (!mounted) return;
      _currentPw.clear();
      _newPw.clear();
      _confirmPw.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password changed successfully.'), behavior: SnackBarBehavior.floating),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.errorMessage ?? e.toString()),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  Future<void> _confirmLogout(AuthController auth) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to use the app.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok == true) await auth.logout();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final multiOffice = (auth.user?.offices.length ?? 0) > 1;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MobileSectionHeader(title: 'Appearance', colors: colors),
          MobileSettingsGroup(
            colors: colors,
            children: [
              SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                secondary: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    auth.isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
                    color: colors.primary,
                  ),
                ),
                title: Text('Dark mode', style: TextStyle(color: colors.text, fontWeight: FontWeight.w600)),
                subtitle: Text(
                  auth.isDark ? 'On' : 'Off',
                  style: TextStyle(color: colors.textMuted, fontSize: 12),
                ),
                value: auth.isDark,
                onChanged: auth.isBusy ? null : (_) => auth.toggleTheme(),
              ),
            ],
          ),
          if (multiOffice) ...[
            const SizedBox(height: 20),
            MobileSectionHeader(title: 'Access', colors: colors),
            MobileSettingsGroup(
              colors: colors,
              children: [
                MobileSettingsTile(
                  colors: colors,
                  icon: Icons.apartment_rounded,
                  title: 'Working unit',
                  subtitle: auth.currentOffice?.officeName ?? 'Select unit',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const OfficeSwitchScreen()),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 20),
          MobileSectionHeader(title: 'Security', colors: colors),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Change password',
                  style: TextStyle(color: colors.text, fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 14),
                MobileTextField(
                  colors: colors,
                  controller: _currentPw,
                  label: 'Current password',
                  icon: Icons.lock_outline,
                  obscureText: _obscureCurrent,
                  enabled: !_changingPassword,
                  suffix: IconButton(
                    icon: Icon(_obscureCurrent ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscureCurrent = !_obscureCurrent),
                  ),
                ),
                const SizedBox(height: 12),
                MobileTextField(
                  colors: colors,
                  controller: _newPw,
                  label: 'New password',
                  icon: Icons.lock_reset_outlined,
                  obscureText: _obscureNew,
                  enabled: !_changingPassword,
                  suffix: IconButton(
                    icon: Icon(_obscureNew ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscureNew = !_obscureNew),
                  ),
                ),
                const SizedBox(height: 12),
                MobileTextField(
                  colors: colors,
                  controller: _confirmPw,
                  label: 'Confirm new password',
                  icon: Icons.lock_reset_outlined,
                  obscureText: _obscureNew,
                  enabled: !_changingPassword,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _changingPassword ? null : () => _changePassword(auth),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.primary,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _changingPassword
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Update password'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          MobileSectionHeader(title: 'Session', colors: colors),
          MobileSettingsGroup(
            colors: colors,
            children: [
              MobileSettingsTile(
                colors: colors,
                icon: Icons.logout_rounded,
                title: 'Sign out',
                destructive: true,
                trailing: const SizedBox.shrink(),
                onTap: () => _confirmLogout(auth),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'IIP Mobile · Kerala Police',
              style: TextStyle(color: colors.textMuted, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}
