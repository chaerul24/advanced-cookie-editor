import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../models/cookie_item.dart';
import '../services/crypto_service.dart';

class ExportDialog extends StatefulWidget {
  final List<CookieItem> allCookies;
  final String activeDomain;

  const ExportDialog({
    super.key,
    required this.allCookies,
    required this.activeDomain,
  });

  @override
  State<ExportDialog> createState() => _ExportDialogState();
}

class _ExportDialogState extends State<ExportDialog> {
  String _scope = 'active'; // 'active' or 'all'
  bool _encrypt = false;
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmController = TextEditingController();
  String? _errorMessage;
  bool _isLoading = false;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  List<CookieItem> _getTargetCookies() {
    if (_scope == 'all') {
      return widget.allCookies;
    }
    final d = widget.activeDomain.toLowerCase();
    return widget.allCookies.where((c) {
      final cd = c.domain.replaceAll(RegExp(r'^\.'), '').toLowerCase();
      return d == cd || d.endsWith('.$cd');
    }).toList();
  }

  String _generateExportPayload() {
    final target = _getTargetCookies();
    if (target.isEmpty) {
      throw Exception('Tidak ada cookie yang cocok untuk diekspor.');
    }

    final plainMap = {
      'format': 'advanced-cookie-editor',
      'version': 1,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'itemCount': target.length,
      'metadata': {
        'client': 'Cookie Browser Android APK',
        'scope': _scope,
        'domain': widget.activeDomain,
      },
      'cookies': target.map((c) => c.toJson()).toList(),
    };

    if (_encrypt) {
      final pw = _passwordController.text.trim();
      final confirm = _confirmController.text.trim();
      if (pw.length < 6) {
        throw Exception('Password minimal 6 karakter untuk enkripsi AES-GCM.');
      }
      if (pw != confirm) {
        throw Exception('Konfirmasi password tidak cocok.');
      }
      final encryptedMap = CryptoService.encryptPayload(json.encode(plainMap), pw);
      return const JsonEncoder.withIndent('  ').convert(encryptedMap);
    } else {
      return const JsonEncoder.withIndent('  ').convert(plainMap);
    }
  }

  Future<void> _handleCopyJson() async {
    setState(() => _errorMessage = null);
    try {
      final jsonStr = _generateExportPayload();
      await Clipboard.setData(ClipboardData(text: jsonStr));
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: Colors.blue.shade800,
            content: Text('Berhasil menyalin ${_getTargetCookies().length} cookie ke Clipboard!'),
          ),
        );
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _handleShareFile() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final jsonStr = _generateExportPayload();
      final tempDir = await getTemporaryDirectory();
      final domainSlug = widget.activeDomain.isEmpty ? 'all' : widget.activeDomain.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '-');
      final dateSlug = DateTime.now().toIso8601String().substring(0, 10);
      final ext = _encrypt ? 'enc.json' : 'json';
      final fileName = 'cookies-$domainSlug-$dateSlug.$ext';

      final file = File('${tempDir.path}/$fileName');
      await file.writeAsString(jsonStr);

      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/json')],
        subject: 'Backup Cookie $domainSlug',
        text: 'Backup Cookie ($fileName)',
      );

      if (mounted) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final targetCount = _getTargetCookies().length;

    return Dialog(
      backgroundColor: const Color(0xFF1E1E24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.all(18),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.file_upload, color: Colors.amber, size: 22),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Export Cookies',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white70, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              if (_errorMessage != null)
                Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade900.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade400),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Colors.redAccent, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_errorMessage!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
                      ),
                    ],
                  ),
                ),

              // Scope
              const Text('Cakupan Ekspor:', style: TextStyle(color: Colors.grey, fontSize: 12)),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF282832),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _scope,
                    isExpanded: true,
                    dropdownColor: const Color(0xFF282832),
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                    items: [
                      DropdownMenuItem(
                        value: 'active',
                        child: Text('Domain Aktif (${widget.activeDomain.isEmpty ? "Semua" : widget.activeDomain})'),
                      ),
                      const DropdownMenuItem(
                        value: 'all',
                        child: Text('Semua Cookie yang Terdeteksi'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _scope = v);
                    },
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Total: $targetCount cookie terpilih',
                style: const TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),

              // Encryption Checkbox
              CheckboxListTile(
                title: const Text(
                  'Enkripsi Password (AES-GCM 256)',
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                ),
                subtitle: const Text(
                  'Mengamankan token rahasia dengan PBKDF2 SHA-256',
                  style: TextStyle(color: Colors.grey, fontSize: 10),
                ),
                value: _encrypt,
                contentPadding: EdgeInsets.zero,
                dense: true,
                onChanged: (v) => setState(() => _encrypt = v ?? false),
              ),

              if (_encrypt) ...[
                const SizedBox(height: 6),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  decoration: const InputDecoration(
                    labelText: 'Password Ekspor (min 6 karakter) *',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _confirmController,
                  obscureText: true,
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  decoration: const InputDecoration(
                    labelText: 'Konfirmasi Password *',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
              ],

              const SizedBox(height: 18),

              // Export Actions (2 Buttons)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isLoading ? null : _handleCopyJson,
                      icon: const Icon(Icons.copy, size: 16),
                      label: const Text('Salin JSON'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white38),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _isLoading ? null : _handleShareFile,
                      icon: _isLoading
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                          : const Icon(Icons.share, size: 16),
                      label: Text(_isLoading ? 'Menyiapkan...' : 'Simpan/Share'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.amber.shade700,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
