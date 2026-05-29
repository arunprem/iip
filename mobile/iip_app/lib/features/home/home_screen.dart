import 'dart:async';
import 'dart:typed_data';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_motion.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/home_models.dart';
import '../auth/auth_controller.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import 'home_controller.dart';
import '../../core/motion/iip_page_route.dart';
import '../../shared/widgets/dashboard_top_bar.dart';

/// Officer dashboard — assignments, nearby suspects, and performance.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.onOpenSettings});

  /// Opens the Settings tab in [AppShell] when the profile avatar is tapped.
  final VoidCallback? onOpenSettings;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final HomeController _home;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthController>();
    _home = HomeController(auth.api);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _home.refresh();
      final auth = context.read<AuthController>();
      if (auth.profile == null) {
        unawaited(auth.loadProfile());
      } else if (auth.officerHasProfilePhoto) {
        unawaited(auth.fetchProfilePhotoBytes());
      }
    });
  }

  @override
  void dispose() {
    _home.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final session = auth.session;
    final name = auth.profile?.fullName ?? auth.user?.fullName ?? 'Officer';
    final firstName = name.trim().split(RegExp(r'\s+')).first;

    return ListenableBuilder(
      listenable: _home,
      builder: (context, _) {
        return Scaffold(
          backgroundColor: colors.bg,
          body: RefreshIndicator(
            color: colors.primary,
            onRefresh: _home.refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              cacheExtent: IipMotion.scrollCacheExtent,
              slivers: [
                SliverAppBar(
                  pinned: true,
                  backgroundColor: colors.bg,
                  foregroundColor: colors.text,
                  surfaceTintColor: Colors.transparent,
                  elevation: 0,
                  toolbarHeight: 64,
                  title: DashboardTopBar(
                    colors: colors,
                    greeting: 'Hello, $firstName',
                    subtitle: session?.officeRole,
                    onProfileTap: widget.onOpenSettings,
                  ),
                ),
                if (_home.state == HomeLoadState.loading && _home.dashboard == null)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_home.state == HomeLoadState.error && _home.dashboard == null)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _ErrorPanel(
                      colors: colors,
                      message: _home.errorMessage ?? 'Something went wrong.',
                      onRetry: _home.refresh,
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    sliver: SliverList(
                      delegate: SliverChildListDelegate([
                        _AssignmentsSection(home: _home, colors: colors),
                        const SizedBox(height: 16),
                        _NearbySuspectsSection(home: _home, colors: colors),
                        const SizedBox(height: 16),
                        _PerformanceSection(home: _home, colors: colors),
                      ]),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _AssignmentsSection extends StatelessWidget {
  const _AssignmentsSection({required this.home, required this.colors});

  final HomeController home;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return _DashboardSection(
      colors: colors,
      icon: Icons.assignment_outlined,
      title: 'Assignments',
      subtitle: home.unreadAssignments > 0
          ? '${home.unreadAssignments} unread'
          : 'Tasks and alerts assigned to you',
      child: _Panel(
        colors: colors,
        child: home.assignments.isEmpty
            ? _EmptyHint(
                colors: colors,
                icon: Icons.inbox_outlined,
                message: 'No assignments or alerts yet.',
              )
            : Column(
                children: [
                  for (var i = 0; i < home.assignments.length; i++) ...[
                    if (i > 0) Divider(height: 1, color: colors.border),
                    _AssignmentTile(
                      colors: colors,
                      item: home.assignments[i],
                      onTap: () => home.markAssignmentRead(home.assignments[i]),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}

class _AssignmentTile extends StatelessWidget {
  const _AssignmentTile({
    required this.colors,
    required this.item,
    required this.onTap,
  });

  final IipColors colors;
  final HomeNotificationItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final typeColor = _typeColor(item.notificationType);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(top: 6, right: 10),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: item.unread ? colors.primary : Colors.transparent,
                border: item.unread
                    ? null
                    : Border.all(color: colors.border),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: typeColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          item.notificationType.toUpperCase(),
                          style: TextStyle(
                            color: typeColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _formatTime(item.createdAt),
                        style: TextStyle(color: colors.textMuted, fontSize: 11),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.title,
                    style: TextStyle(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  if (item.message.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.message,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: colors.textMuted, fontSize: 12, height: 1.35),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _typeColor(String type) {
    switch (type.toLowerCase()) {
      case 'alert':
        return colors.error;
      case 'warning':
        return const Color(0xFFE6A817);
      default:
        return colors.primary;
    }
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final now = DateTime.now();
      if (now.difference(dt).inDays == 0) {
        return DateFormat.jm().format(dt);
      }
      return DateFormat.MMMd().format(dt);
    } catch (_) {
      return '';
    }
  }
}

class _NearbySuspectsSection extends StatelessWidget {
  const _NearbySuspectsSection({required this.home, required this.colors});

  final HomeController home;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return _DashboardSection(
      colors: colors,
      icon: Icons.person_search_outlined,
      title: 'Nearby suspects',
      subtitle: 'Within 500 m of your current location',
      child: _Panel(
        colors: colors,
        child: home.nearbyMessage != null && home.nearbySuspects.isEmpty
            ? _EmptyHint(
                colors: colors,
                icon: home.locationDenied
                    ? Icons.location_off_outlined
                    : Icons.location_searching,
                message: home.nearbyMessage!,
              )
            : SizedBox(
                height: 148,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: home.nearbySuspects.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    final suspect = home.nearbySuspects[index];
                    return _NearbySuspectCard(
                      colors: colors,
                      suspect: suspect,
                      photoLoader: () => home.photoBytesFor(suspect.storageKey),
                    );
                  },
                ),
              ),
      ),
    );
  }
}

class _NearbySuspectCard extends StatefulWidget {
  const _NearbySuspectCard({
    required this.colors,
    required this.suspect,
    required this.photoLoader,
  });

  final IipColors colors;
  final NearbySuspectItem suspect;
  final Future<Uint8List?> Function() photoLoader;

  @override
  State<_NearbySuspectCard> createState() => _NearbySuspectCardState();
}

class _NearbySuspectCardState extends State<_NearbySuspectCard> {
  Uint8List? _bytes;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    final bytes = await widget.photoLoader();
    if (mounted) setState(() => _bytes = bytes);
  }

  void _openDetail(BuildContext context) {
    context.pushSmooth(
      SuspectDossierDetailScreen(
        dossierId: widget.suspect.dossierId,
        distanceM: widget.suspect.distanceM,
        heroImageBytes: _bytes,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.suspect;
    final colors = widget.colors;
    return SizedBox(
      width: 108,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => _openDetail(context),
              borderRadius: BorderRadius.circular(12),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: _bytes != null
                      ? Image.memory(_bytes!, fit: BoxFit.cover)
                      : ColoredBox(
                          color: colors.primary.withValues(alpha: 0.08),
                          child: Icon(Icons.person, size: 40, color: colors.textMuted),
                        ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: () => _openDetail(context),
            child: Text(
              s.criminalName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: colors.text,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
            ),
          ),
          Text(
            '${s.distanceM.round()} m',
            style: TextStyle(color: colors.primary, fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _PerformanceSection extends StatelessWidget {
  const _PerformanceSection({required this.home, required this.colors});

  final HomeController home;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    final dash = home.dashboard;
    return _DashboardSection(
      colors: colors,
      icon: Icons.insights_outlined,
      title: 'Performance',
      subtitle: 'Dossiers submitted and notification activity',
      child: dash == null
          ? _Panel(
              colors: colors,
              child: _EmptyHint(
                colors: colors,
                icon: Icons.bar_chart_rounded,
                message: 'Performance data is not available.',
              ),
            )
          : Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _StatChip(
                        colors: colors,
                        label: 'Dossiers',
                        value: '${dash.dossiersSubmitted}',
                        caption: 'all time',
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _StatChip(
                        colors: colors,
                        label: 'This week',
                        value: '${dash.dossiersThisWeek}',
                        caption: 'submitted',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _Panel(
                  colors: colors,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Weekly dossiers',
                        style: TextStyle(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 160,
                        child: _WeeklyBarChart(
                          colors: colors,
                          data: dash.weeklyDossiers,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                _Panel(
                  colors: colors,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Notifications',
                        style: TextStyle(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 120,
                        child: _NotificationPieChart(
                          colors: colors,
                          unread: dash.unreadNotifications,
                          read: dash.readNotifications,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _WeeklyBarChart extends StatelessWidget {
  const _WeeklyBarChart({required this.colors, required this.data});

  final IipColors colors;
  final List<WeeklyDossierCount> data;

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return Center(
        child: Text('No dossier history yet.', style: TextStyle(color: colors.textMuted)),
      );
    }
    final maxY = data.map((e) => e.count).fold<int>(0, (a, b) => a > b ? a : b);
    final top = maxY == 0 ? 4.0 : (maxY + 1).toDouble();

    return BarChart(
      BarChartData(
        maxY: top,
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(color: colors.border, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: (value, _) => Text(
                value.toInt().toString(),
                style: TextStyle(color: colors.textMuted, fontSize: 10),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final i = value.toInt();
                if (i < 0 || i >= data.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    data[i].label,
                    style: TextStyle(color: colors.textMuted, fontSize: 9),
                  ),
                );
              },
            ),
          ),
        ),
        barGroups: [
          for (var i = 0; i < data.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: data[i].count.toDouble(),
                  color: colors.primary,
                  width: 14,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _NotificationPieChart extends StatelessWidget {
  const _NotificationPieChart({
    required this.colors,
    required this.unread,
    required this.read,
  });

  final IipColors colors;
  final int unread;
  final int read;

  @override
  Widget build(BuildContext context) {
    final total = unread + read;
    if (total == 0) {
      return Center(
        child: Text('No notification history.', style: TextStyle(color: colors.textMuted)),
      );
    }
    return Row(
      children: [
        Expanded(
          flex: 2,
          child: PieChart(
            PieChartData(
              sectionsSpace: 2,
              centerSpaceRadius: 28,
              sections: [
                PieChartSectionData(
                  value: unread.toDouble(),
                  color: colors.primary,
                  title: unread > 0 ? '$unread' : '',
                  radius: 36,
                  titleStyle: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                PieChartSectionData(
                  value: read.toDouble(),
                  color: colors.textMuted.withValues(alpha: 0.35),
                  title: read > 0 ? '$read' : '',
                  radius: 32,
                  titleStyle: TextStyle(
                    color: colors.text,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LegendDot(colors: colors, color: colors.primary, label: 'Unread'),
              const SizedBox(height: 6),
              _LegendDot(
                colors: colors,
                color: colors.textMuted.withValues(alpha: 0.5),
                label: 'Read',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({
    required this.colors,
    required this.color,
    required this.label,
  });

  final IipColors colors;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(color: colors.textMuted, fontSize: 12)),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.colors,
    required this.label,
    required this.value,
    required this.caption,
  });

  final IipColors colors;
  final String label;
  final String value;
  final String caption;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: colors.textMuted, fontSize: 11)),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: colors.text,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(caption, style: TextStyle(color: colors.textMuted, fontSize: 10)),
        ],
      ),
    );
  }
}

class _DashboardSection extends StatelessWidget {
  const _DashboardSection({
    required this.colors,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final IipColors colors;
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 20, color: colors.primary),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: colors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        child,
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.colors, required this.child});

  final IipColors colors;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
      ),
      child: child,
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({
    required this.colors,
    required this.message,
    required this.icon,
  });

  final IipColors colors;
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        children: [
          Icon(icon, size: 32, color: colors.textMuted.withValues(alpha: 0.7)),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.textMuted, fontSize: 13, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({
    required this.colors,
    required this.message,
    required this.onRetry,
  });

  final IipColors colors;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off_outlined, size: 40, color: colors.textMuted),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: colors.textMuted)),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
