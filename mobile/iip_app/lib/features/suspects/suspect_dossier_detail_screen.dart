import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/suspect_dossier_detail.dart';
import '../auth/auth_controller.dart';
import '../knowledge_graph/knowledge_graph_screen.dart';
import 'dossier_photo_viewer_screen.dart';
import 'suspect_repository.dart';

/// Cinematic dossier brief — hero portrait, metadata chips, and officer-visible fields.
class SuspectDossierDetailScreen extends StatefulWidget {
  const SuspectDossierDetailScreen({
    super.key,
    required this.dossierId,
    this.distanceM,
    this.heroImageBytes,
  });

  final String dossierId;
  final double? distanceM;
  final Uint8List? heroImageBytes;

  @override
  State<SuspectDossierDetailScreen> createState() =>
      _SuspectDossierDetailScreenState();
}

class _SuspectDossierDetailScreenState extends State<SuspectDossierDetailScreen> {
  late final SuspectRepository _repo;

  SuspectDossierDetail? _detail;
  Uint8List? _heroBytes;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _heroBytes = widget.heroImageBytes;
    _repo = SuspectRepository(context.read<AuthController>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await _repo.fetchDossierDetail(widget.dossierId);
      if (!mounted) return;
      final front = detail.frontPhoto;
      if (_heroBytes == null && front != null && front.storageKey.isNotEmpty) {
        _heroBytes = await _repo.fetchPhotoBytes(front.storageKey);
      }
      setState(() {
        _detail = detail;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('ApiException: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    return Scaffold(
      backgroundColor: colors.bg,
      body: _loading
          ? Center(child: CircularProgressIndicator(color: colors.primary))
          : _error != null
              ? _ErrorState(colors: colors, message: _error!, onRetry: _load)
              : _detail == null
                  ? _ErrorState(
                      colors: colors,
                      message: 'Dossier not found or access denied.',
                      onRetry: _load,
                    )
                  : _DossierBody(
                      detail: _detail!,
                      colors: colors,
                      heroBytes: _heroBytes,
                      repo: _repo,
                      distanceM: widget.distanceM,
                    ),
    );
  }
}

class _DossierBody extends StatelessWidget {
  const _DossierBody({
    required this.detail,
    required this.colors,
    required this.heroBytes,
    required this.repo,
    this.distanceM,
  });

  final SuspectDossierDetail detail;
  final IipColors colors;
  final Uint8List? heroBytes;
  final SuspectRepository repo;
  final double? distanceM;

  @override
  Widget build(BuildContext context) {
    final identity = detail.identity;
    final name = identity.criminalName.trim().isEmpty
        ? 'Unknown subject'
        : identity.criminalName;

    return CustomScrollView(
      physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
      slivers: [
        SliverAppBar(
          expandedHeight: 340 + MediaQuery.paddingOf(context).top,
          stretch: true,
          pinned: false,
          elevation: 0,
          backgroundColor: Colors.black,
          leading: const SizedBox.shrink(),
          flexibleSpace: FlexibleSpaceBar(
            stretchModes: const [
              StretchMode.zoomBackground,
            ],
            background: _HeroPoster(
              name: name,
              heroBytes: heroBytes,
              colors: colors,
              frontStorageKey: detail.frontPhoto?.storageKey,
              repo: repo,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Transform.translate(
            offset: const Offset(0, -28),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name.toUpperCase(),
                    style: TextStyle(
                      color: colors.text,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                      height: 1.15,
                    ),
                  ),
                  if (identity.aliasName != null &&
                      identity.aliasName!.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      'aka ${identity.aliasName}',
                      style: TextStyle(
                        color: colors.textMuted,
                        fontSize: 15,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  _MetaChipsRow(
                    detail: detail,
                    colors: colors,
                    distanceM: distanceM,
                  ),
                  if (detail.canViewMaster && detail.masterSuspectId.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          context.pushSmooth(
                            KnowledgeGraphScreen(
                              initialMasterSuspectId: detail.masterSuspectId,
                              initialDisplayName: name,
                              initialDossierId: detail.dossierId,
                            ),
                          );
                        },
                        icon: Icon(Icons.hub_outlined, color: colors.primary, size: 18),
                        label: Text(
                          'View associate network',
                          style: TextStyle(color: colors.primary, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  _OfficerVisibilityBanner(detail: detail, colors: colors),
                  const SizedBox(height: 20),
                  _SynopsisCard(identity: identity, colors: colors),
                  if (detail.address?.hasContent == true) ...[
                    const SizedBox(height: 16),
                    _SectionCard(
                      colors: colors,
                      title: 'Permanent address',
                      icon: Icons.home_work_outlined,
                      child: _AddressBlock(address: detail.address!, colors: colors),
                    ),
                  ],
                  if (detail.hasDifferentPresentAddress &&
                      detail.presentAddress?.hasContent == true) ...[
                    const SizedBox(height: 16),
                    _SectionCard(
                      colors: colors,
                      title: 'Present address',
                      icon: Icons.location_on_outlined,
                      child: _AddressBlock(
                        address: detail.presentAddress!,
                        colors: colors,
                      ),
                    ),
                  ],
                  if (detail.contacts.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _SectionCard(
                      colors: colors,
                      title: 'Contact channels',
                      icon: Icons.contact_phone_outlined,
                      child: Column(
                        children: [
                          for (var i = 0; i < detail.contacts.length; i++) ...[
                            if (i > 0) const SizedBox(height: 10),
                            _ContactRow(contact: detail.contacts[i], colors: colors),
                          ],
                        ],
                      ),
                    ),
                  ],
                  if (detail.relatives.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _SectionCard(
                      colors: colors,
                      title: 'Associates & relatives',
                      icon: Icons.groups_outlined,
                      child: Column(
                        children: [
                          for (var i = 0; i < detail.relatives.length; i++) ...[
                            if (i > 0)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                child: Divider(color: colors.border, height: 1),
                              ),
                            _RelativeRow(relative: detail.relatives[i], colors: colors),
                          ],
                        ],
                      ),
                    ),
                  ],
                  if (detail.socialAccounts.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _SectionCard(
                      colors: colors,
                      title: 'Digital footprint',
                      icon: Icons.public_outlined,
                      child: Column(
                        children: [
                          for (var i = 0; i < detail.socialAccounts.length; i++) ...[
                            if (i > 0) const SizedBox(height: 10),
                            _SocialRow(
                              account: detail.socialAccounts[i],
                              colors: colors,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                  if (detail.photos.length > 1) ...[
                    const SizedBox(height: 16),
                    _PhotoGallerySection(
                      photos: detail.photos,
                      colors: colors,
                      repo: repo,
                    ),
                  ],
                  const SizedBox(height: 16),
                  _CreditsFooter(detail: detail, colors: colors),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _HeroPoster extends StatelessWidget {
  const _HeroPoster({
    required this.name,
    required this.heroBytes,
    required this.colors,
    required this.repo,
    this.frontStorageKey,
  });

  final String name;
  final Uint8List? heroBytes;
  final IipColors colors;
  final SuspectRepository repo;
  final String? frontStorageKey;

  void _openZoom(BuildContext context) {
    openDossierPhotoViewer(
      context,
      colors: colors,
      imageBytes: heroBytes,
      storageKey: frontStorageKey,
      repo: repo,
      title: name,
    );
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final canZoom = heroBytes != null ||
        (frontStorageKey != null && frontStorageKey!.isNotEmpty);

    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          onTap: canZoom ? () => _openZoom(context) : null,
          behavior: HitTestBehavior.opaque,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (heroBytes != null)
                Image.memory(heroBytes!, fit: BoxFit.cover)
              else
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        colors.surfaceHover,
                        colors.surface,
                      ],
                    ),
                  ),
                  child: Center(
                    child: Icon(
                      Icons.person_outline,
                      size: 88,
                      color: colors.textMuted.withValues(alpha: 0.35),
                    ),
                  ),
                ),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.35),
                      Colors.transparent,
                      colors.bg,
                    ],
                    stops: const [0.0, 0.45, 1.0],
                  ),
                ),
              ),
            ],
          ),
        ),
        Positioned(
          top: top + 8,
          left: 8,
          child: Material(
            color: colors.surface.withValues(alpha: 0.92),
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: IconButton(
              icon: Icon(Icons.arrow_back_rounded, color: colors.text),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: 36,
          child: Text(
            'INTELLIGENCE DOSSIER',
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
            ),
          ),
        ),
        if (canZoom)
          Positioned(
            right: 16,
            bottom: 32,
            child: Material(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(20),
              child: InkWell(
                onTap: () => _openZoom(context),
                borderRadius: BorderRadius.circular(20),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.zoom_in_rounded, color: Colors.white, size: 18),
                      SizedBox(width: 4),
                      Text(
                        'Zoom',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MetaChipsRow extends StatelessWidget {
  const _MetaChipsRow({
    required this.detail,
    required this.colors,
    this.distanceM,
  });

  final SuspectDossierDetail detail;
  final IipColors colors;
  final double? distanceM;

  @override
  Widget build(BuildContext context) {
    final id = detail.identity;
    final chips = <Widget>[
      if (distanceM != null)
        _MetaChip(
          label: '${distanceM!.round()} m away',
          accent: colors.primary,
        ),
      _MetaChip(
        label: detail.linkStatus.replaceAll('_', ' '),
        accent: colors.warning,
      ),
      if (id.gender != null && id.gender!.isNotEmpty)
        _MetaChip(label: id.gender!, accent: colors.success),
      if (id.age != null) _MetaChip(label: '${id.age} yrs', accent: colors.textMuted),
      if (id.category != null && id.category!.isNotEmpty)
        _MetaChip(label: id.category!, accent: colors.error),
    ];
    return Wrap(spacing: 8, runSpacing: 8, children: chips);
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label, required this.accent});

  final String label;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withValues(alpha: 0.45)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: accent,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _OfficerVisibilityBanner extends StatelessWidget {
  const _OfficerVisibilityBanner({
    required this.detail,
    required this.colors,
  });

  final SuspectDossierDetail detail;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    final office = detail.officeName ?? detail.identity.officeName ?? 'Your unit';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            colors.primary.withValues(alpha: 0.25),
            colors.primary.withValues(alpha: 0.08),
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.primary.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_user_outlined, color: colors.primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Visible to your assignment',
                  style: TextStyle(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'You are viewing this record as an authorised officer of $office. '
                  'Handle per intelligence SOP; do not share outside approved channels.',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
                if (detail.canViewMaster) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Master profile access granted',
                    style: TextStyle(
                      color: colors.success,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SynopsisCard extends StatelessWidget {
  const _SynopsisCard({required this.identity, required this.colors});

  final SuspectIdentity identity;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      colors: colors,
      title: 'Identity synopsis',
      icon: Icons.badge_outlined,
      child: Column(
        children: [
          _FactRow(label: "Father's name", value: identity.fathersName, colors: colors),
          _FactRow(label: 'Date of birth', value: _formatDob(identity), colors: colors),
          _FactRow(label: 'Place of birth', value: identity.placeOfBirth, colors: colors),
          _FactRow(label: 'Religion', value: identity.religion, colors: colors),
          _FactRow(
            label: 'Submitted',
            value: _formatSubmitted(identity.submittedAt),
            colors: colors,
          ),
        ],
      ),
    );
  }

  String? _formatDob(SuspectIdentity id) {
    if (id.dateOfBirth != null && id.dateOfBirth!.isNotEmpty) {
      try {
        return DateFormat.yMMMd().format(DateTime.parse(id.dateOfBirth!));
      } catch (_) {
        return id.dateOfBirth;
      }
    }
    if (id.yearOfBirth != null) return '${id.yearOfBirth}';
    return null;
  }

  String? _formatSubmitted(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    try {
      return DateFormat.yMMMd().add_jm().format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso;
    }
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.colors,
    required this.title,
    required this.icon,
    required this.child,
  });

  final IipColors colors;
  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: colors.text.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: colors.textMuted),
              const SizedBox(width: 8),
              Text(
                title.toUpperCase(),
                style: TextStyle(
                  color: colors.text,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _FactRow extends StatelessWidget {
  const _FactRow({required this.label, required this.colors, this.value});

  final String label;
  final IipColors colors;
  final String? value;

  @override
  Widget build(BuildContext context) {
    if (value == null || value!.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(color: colors.textMuted, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value!,
              style: TextStyle(
                color: colors.text,
                fontSize: 13,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddressBlock extends StatelessWidget {
  const _AddressBlock({required this.address, required this.colors});

  final SuspectAddressBlock address;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (address.formattedLine.isNotEmpty)
          Text(
            address.formattedLine,
            style: TextStyle(
              color: colors.text,
              fontSize: 14,
              height: 1.45,
            ),
          ),
        const SizedBox(height: 10),
        _FactRow(label: 'PIN', value: address.pincode, colors: colors),
        _FactRow(label: 'Police station', value: address.policeStation, colors: colors),
        _FactRow(
          label: 'District / State',
          value: [address.district, address.state]
              .whereType<String>()
              .where((e) => e.isNotEmpty)
              .join(', '),
          colors: colors,
        ),
        if (address.latitude != null && address.longitude != null)
          _FactRow(
            label: 'Coordinates',
            value: '${address.latitude}, ${address.longitude}',
            colors: colors,
          ),
      ],
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({required this.contact, required this.colors});

  final SuspectContact contact;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: colors.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            contact.contactType,
            style: TextStyle(
              color: colors.primary,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            contact.value,
            style: TextStyle(
              color: colors.text,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _RelativeRow extends StatelessWidget {
  const _RelativeRow({required this.relative, required this.colors});

  final SuspectRelative relative;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (relative.relation != null && relative.relation!.isNotEmpty) relative.relation,
      if (relative.occupation != null && relative.occupation!.isNotEmpty)
        relative.occupation,
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          relative.name,
          style: TextStyle(
            color: colors.text,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (subtitle.isNotEmpty)
          Text(
            subtitle,
            style: TextStyle(color: colors.textMuted, fontSize: 12),
          ),
      ],
    );
  }
}

class _SocialRow extends StatelessWidget {
  const _SocialRow({required this.account, required this.colors});

  final SuspectSocialAccount account;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          account.platform,
          style: TextStyle(
            color: colors.primary,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          account.details,
          style: TextStyle(
            color: colors.text,
            fontSize: 13,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

class _PhotoGallerySection extends StatelessWidget {
  const _PhotoGallerySection({
    required this.photos,
    required this.colors,
    required this.repo,
  });

  final List<SuspectPhotoRef> photos;
  final IipColors colors;
  final SuspectRepository repo;

  @override
  Widget build(BuildContext context) {
    final others = photos
        .where((p) => p.poseType.toUpperCase() != 'FRONT')
        .toList();
    if (others.isEmpty) return const SizedBox.shrink();

    return _SectionCard(
      colors: colors,
      title: 'Additional imagery',
      icon: Icons.photo_library_outlined,
      child: SizedBox(
        height: 92,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          itemCount: others.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (context, index) {
            final photo = others[index];
            return _GalleryThumb(photo: photo, repo: repo, colors: colors);
          },
        ),
      ),
    );
  }
}

class _GalleryThumb extends StatefulWidget {
  const _GalleryThumb({
    required this.photo,
    required this.repo,
    required this.colors,
  });

  final SuspectPhotoRef photo;
  final SuspectRepository repo;
  final IipColors colors;

  @override
  State<_GalleryThumb> createState() => _GalleryThumbState();
}

class _GalleryThumbState extends State<_GalleryThumb> {
  Uint8List? _bytes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final bytes = await widget.repo.fetchPhotoBytes(widget.photo.storageKey);
    if (mounted) setState(() => _bytes = bytes);
  }

  @override
  Widget build(BuildContext context) {
    const thumbWidth = 72.0;
    const thumbHeight = 92.0;

    final poseLabel = widget.photo.poseType.replaceAll('_', ' ');

    return SizedBox(
      width: thumbWidth,
      height: thumbHeight,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () => openDossierPhotoViewer(
                context,
                colors: widget.colors,
                imageBytes: _bytes,
                storageKey: widget.photo.storageKey,
                repo: widget.repo,
                title: poseLabel,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (_bytes != null)
                      Image.memory(_bytes!, fit: BoxFit.cover, width: thumbWidth)
                    else
                      ColoredBox(
                        color: widget.colors.surfaceHover,
                        child: Center(
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: widget.colors.primary,
                            ),
                          ),
                        ),
                      ),
                    if (_bytes != null)
                      const Align(
                        alignment: Alignment.bottomRight,
                        child: Padding(
                          padding: EdgeInsets.all(4),
                          child: Icon(
                            Icons.zoom_in_rounded,
                            color: Colors.white,
                            size: 16,
                            shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            poseLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: widget.colors.textMuted,
              fontSize: 9,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}

class _CreditsFooter extends StatelessWidget {
  const _CreditsFooter({required this.detail, required this.colors});

  final SuspectDossierDetail detail;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    final shortId = detail.dossierId.length > 8
        ? detail.dossierId.substring(0, 8).toUpperCase()
        : detail.dossierId.toUpperCase();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: Column(
        children: [
          Text(
            'END OF DOSSIER',
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 3,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '${detail.officeName ?? 'Unit'} · Ref $shortId',
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            detail.status,
            style: TextStyle(color: colors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({
    required this.colors,
    required this.message,
    required this.onRetry,
  });

  final IipColors colors;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ColoredBox(
        color: colors.bg,
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                icon: Icon(Icons.arrow_back_rounded, color: colors.text),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.lock_outline, size: 48, color: colors.error),
                    const SizedBox(height: 16),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: colors.textMuted),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(onPressed: onRetry, child: const Text('Retry')),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
