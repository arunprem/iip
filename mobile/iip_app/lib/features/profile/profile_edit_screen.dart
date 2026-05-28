import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/motion/iip_motion.dart';
import '../../shared/widgets/auth/auth_form_widgets.dart';
import '../../shared/widgets/auth/mobile_text_field.dart';
import '../../models/profile_models.dart';
import '../auth/auth_controller.dart';

class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  State<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends State<ProfileEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _email = TextEditingController();
  final _pen = TextEditingController();
  final _department = TextEditingController();
  bool _validateOnChange = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = context.read<AuthController>().profile;
    if (p != null) _fill(p);
    else {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final auth = context.read<AuthController>();
        await auth.loadProfile();
        if (mounted && auth.profile != null) _fill(auth.profile!);
      });
    }
  }

  void _fill(UserProfileData p) {
    _fullName.text = p.fullName;
    _email.text = p.email;
    _pen.text = p.badgeNumber;
    _department.text = p.department;
  }

  String? _required(String? v, String label) {
    if ((v ?? '').trim().isEmpty) return '$label is required.';
    return null;
  }

  Future<void> _save(AuthController auth) async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      setState(() => _validateOnChange = true);
      return;
    }
    setState(() => _saving = true);
    try {
      await auth.updateProfile(
        fullName: _fullName.text.trim(),
        email: _email.text.trim(),
        badgeNumber: _pen.text.trim(),
        department: _department.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated.'), behavior: SnackBarBehavior.floating),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.errorMessage ?? 'Something went wrong. Please try again.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _pen.dispose();
    _department.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final autovalidate = _validateOnChange
        ? AutovalidateMode.onUserInteraction
        : AutovalidateMode.disabled;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: const Text('Edit profile'),
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        cacheExtent: IipMotion.scrollCacheExtent,
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        children: [
          Form(
            key: _formKey,
            autovalidateMode: autovalidate,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MobileTextField(
                  colors: colors,
                  controller: _fullName,
                  label: 'Full name',
                  icon: Icons.person_outline,
                  enabled: !_saving,
                  autovalidateMode: autovalidate,
                  validator: (v) => _required(v, 'Full name'),
                ),
                const SizedBox(height: 14),
                MobileTextField(
                  colors: colors,
                  controller: _email,
                  label: 'Email',
                  icon: Icons.email_outlined,
                  enabled: !_saving,
                  autovalidateMode: autovalidate,
                  validator: (v) {
                    final t = (v ?? '').trim();
                    if (t.isEmpty) return 'Email is required.';
                    if (!t.contains('@')) return 'Enter a valid email.';
                    return null;
                  },
                ),
                const SizedBox(height: 14),
                MobileTextField(
                  colors: colors,
                  controller: _pen,
                  label: 'PEN number',
                  icon: Icons.badge_outlined,
                  enabled: !_saving,
                  autovalidateMode: autovalidate,
                  validator: (v) => _required(v, 'PEN number'),
                ),
                const SizedBox(height: 14),
                MobileTextField(
                  colors: colors,
                  controller: _department,
                  label: 'Department',
                  icon: Icons.domain_outlined,
                  enabled: !_saving,
                  autovalidateMode: autovalidate,
                  validator: (v) => _required(v, 'Department'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          AuthPrimaryButton(
            colors: colors,
            label: _saving ? 'Saving…' : 'Save changes',
            icon: Icons.check_rounded,
            isLoading: _saving,
            onPressed: _saving ? null : () => _save(auth),
          ),
        ],
      ),
    );
  }
}
