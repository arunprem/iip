import 'dart:typed_data';

import 'package:crop_your_image/crop_your_image.dart';
import 'package:flutter/material.dart';
import '../../core/theme/iip_colors.dart';

/// 3:4 crop step for Field FRS photos (allows selecting a face when multiple exist).
class FrsPhotoCropScreen extends StatefulWidget {
  const FrsPhotoCropScreen({
    super.key,
    required this.imageBytes,
    required this.colors,
  });

  final Uint8List imageBytes;
  final IipColors colors;

  @override
  State<FrsPhotoCropScreen> createState() => _FrsPhotoCropScreenState();
}

class _FrsPhotoCropScreenState extends State<FrsPhotoCropScreen> {
  final _cropController = CropController();
  bool _cropping = false;
  bool _pendingCrop = false;

  void _onSaveTap() {
    if (_cropping) return;
    setState(() {
      _cropping = true;
      _pendingCrop = true;
    });
    _cropController.crop();
  }

  void _onCropped(CropResult result) {
    if (!_pendingCrop) return;
    setState(() {
      _cropping = false;
      _pendingCrop = false;
    });

    switch (result) {
      case CropSuccess(:final croppedImage):
        Navigator.of(context).pop(croppedImage);
      case CropFailure(:final cause):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not crop image: $cause'),
            behavior: SnackBarBehavior.floating,
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Crop suspect face'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: _cropping ? null : () => Navigator.of(context).pop(),
        ),
        actions: [
          TextButton(
            onPressed: _cropping ? null : _onSaveTap,
            child: _cropping
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text(
                    'Use crop',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Crop(
                image: widget.imageBytes,
                controller: _cropController,
                onCropped: _onCropped,
                aspectRatio: 3 / 4,
                interactive: true,
                baseColor: colors.primary,
                maskColor: Colors.black.withValues(alpha: 0.65),
                radius: 16,
                cornerDotBuilder: (size, index) => Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    color: colors.primary,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
            ),
          ),
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(20, 12, 20, 12 + MediaQuery.paddingOf(context).bottom),
            color: Colors.black,
            child: Column(
              children: [
                Text(
                  'Select the target face · pinch to zoom',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: _cropping ? null : _onSaveTap,
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    icon: _cropping
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_rounded),
                    label: Text(_cropping ? 'Processing…' : 'Crop & search face'),
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
