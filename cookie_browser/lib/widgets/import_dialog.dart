import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../models/cookie_item.dart';
import '../services/cookie_manager_service.dart';
import '../services/crypto_service.dart';

class ImportDialog extends StatefulWidget {
  final String activeUrl;
  final String activeDomain;
  final VoidCallback onImportCompleted;

  const ImportDialog({
    super.key,
    required this.activeUrl,
    required this.activeDomain,
    required this.onImportCompleted,
  });

  @override
  State<ImportDialog> createState() => _ImportDialogState();
}

class _ImportDialogState extends State<ImportDialog> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // File tab state
  PlatformFile? _selectedFile;
  String? _fileContent;
  bool _fileIsEncrypted = false;
  final TextEditingController _filePasswordController = TextEditingController();

  // Text tab state
  final TextEditingController _jsonTextController = TextEditingController();
  bool _textIsEncrypted = false;
  final TextEditingController _textPasswordController = TextEditingController();

  // Strategy & Status
  String _strategy = 'merge'; // 'merge' or 'replace'
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _jsonTextController.addListener(_checkTextEncryption);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _filePasswordController.dispose();
    _jsonTextController.dispose();
    _textPasswordController.dispose();
    super.dispose();
  }

  void _checkTextEncryption() {
    final text = _jsonTextController.text.trim();
    final encrypted = text.contains('advanced-cookie-editor-encrypted');
    if (encrypted != _textIsEncrypted) {
      setState(() => _textIsEncrypted = encrypted);
    }
  }

  Future<void> _pickFile() async {
    setState(() => _errorMessage = null);
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        withData: true,
      );

      if (result != null && result.files.isNotEmpty) {
        final file = result.files.first;
        String content = '';
        if (file.bytes != null) {
          content = utf8.decode(file.bytes!);
        } else if (file.path != null) {
          content = await File(file.path!).readAsString();
        }

        final isEnc = content.contains('advanced-cookie-editor-encrypted');
        setState(() {
          _selectedFile = file;
          _fileContent = content;
          _fileIsEncrypted = isEnc;
        });
      }
    } catch (e) {
      setState(() => _errorMessage = 'Gagal membaca file: $e');
    }
  }

  Future<void> _executeImport() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final isFileTab = _tabController.index == 0;
    String rawJson = '';
    String password = '';
    bool isEnc = false;

    if (isFileTab) {
      if (_fileContent == null || _fileContent!.isEmpty) {
        setState(() {
          _errorMessage = 'Silakan pilih file JSON terlebih dahulu.';
          _isLoading = false;
        });
        return;
      }
      rawJson = _fileContent!;
      isEnc = _fileIsEncrypted;
      password = _filePasswordController.text.trim();
    } else {
      rawJson = _jsonTextController.text.trim();
      if (rawJson.isEmpty) {
        setState(() {
          _errorMessage = 'Silakan tempel (paste) data JSON cookie.';
          _isLoading = false;
        });
        return;
      }
      isEnc = _textIsEncrypted;
      password = _textPasswordController.text.trim();
    }

    try {
      dynamic parsedData;
      if (isEnc) {
        if (password.isEmpty) {
          throw Exception('File/teks ini terenkripsi. Masukkan password dekripsi.');
        }
        final envelope = json.decode(rawJson) as Map<String, dynamic>;
        final decryptedText = CryptoService.decryptPayload(envelope, password);
        parsedData = json.decode(decryptedText);
      } else {
        parsedData = json.decode(rawJson);
      }

      List<dynamic> cookieList = [];
      if (parsedData is List) {
        cookieList = parsedData;
      } else if (parsedData is Map<String, dynamic> && parsedData['cookies'] is List) {
        cookieList = parsedData['cookies'] as List;
      } else {
        throw Exception('Format JSON tidak dikenali (wajib array cookie atau schema v1).');
      }

      if (cookieList.isEmpty) {
        throw Exception('Tidak ada cookie yang ditemukan dalam payload.');
      }

      // If strategy is replace, clear existing domain cookies first
      if (_strategy == 'replace') {
        final existing = await CookieManagerService.getCookies(widget.activeUrl);
        for (var c in existing) {
          await CookieManagerService.removeCookie(widget.activeUrl, c);
        }
      }

      int applied = 0;
      for (var item in cookieList) {
        if (item is Map<String, dynamic>) {
          final cookie = CookieItem.fromJson(item);
          final ok = await CookieManagerService.setCookie(widget.activeUrl, cookie);
          if (ok) applied++;
        }
      }

      widget.onImportCompleted();

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: Colors.green.shade800,
            content: Text('Berhasil mengimpor $applied cookie ke browser!'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString().replaceFirst('Exception: ', '');
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF1E1E24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.all(18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.file_download, color: Colors.amber, size: 22),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Import Cookies (2 Cara)',
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
            const SizedBox(height: 12),

            // Tab Bar
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFF282832),
                borderRadius: BorderRadius.circular(10),
              ),
              child: TabBar(
                controller: _tabController,
                indicatorColor: Colors.amber,
                labelColor: Colors.amber,
                unselectedLabelColor: Colors.grey,
                indicatorSize: TabBarIndicatorSize.tab,
                tabs: const [
                  Tab(icon: Icon(Icons.folder_open, size: 18), text: '1. Pilih File'),
                  Tab(icon: Icon(Icons.paste, size: 18), text: '2. Paste JSON'),
                ],
              ),
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

            // Tabs Content
            SizedBox(
              height: 190,
              child: TabBarView(
                controller: _tabController,
                children: [
                  // TAB 1: PICK FILE
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        InkWell(
                          onTap: _pickFile,
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF2A2A34),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: _selectedFile != null ? Colors.amber : Colors.white24,
                                width: _selectedFile != null ? 1.5 : 1,
                              ),
                            ),
                            child: Column(
                              children: [
                                Icon(
                                  _selectedFile != null ? Icons.check_circle : Icons.upload_file,
                                  color: _selectedFile != null ? Colors.amber : Colors.grey,
                                  size: 36,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _selectedFile != null
                                      ? '${_selectedFile!.name} (${(_selectedFile!.size / 1024).toStringAsFixed(1)} KB)'
                                      : 'Tap untuk pilih file (.json / .enc.json)',
                                  style: TextStyle(
                                    color: _selectedFile != null ? Colors.white : Colors.white70,
                                    fontSize: 12,
                                    fontWeight: _selectedFile != null ? FontWeight.bold : FontWeight.normal,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                if (_fileIsEncrypted)
                                  const Padding(
                                    padding: EdgeInsets.only(top: 6),
                                    child: Text('🔒 Terenkripsi AES-GCM', style: TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        if (_fileIsEncrypted) ...[
                          const SizedBox(height: 10),
                          TextField(
                            controller: _filePasswordController,
                            obscureText: true,
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                            decoration: const InputDecoration(
                              labelText: 'Password Dekripsi *',
                              isDense: true,
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),

                  // TAB 2: PASTE JSON TEXT
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _jsonTextController,
                          maxLines: 5,
                          style: const TextStyle(color: Colors.white, fontSize: 11, fontFamily: 'monospace'),
                          decoration: const InputDecoration(
                            hintText: 'Paste cookie JSON di sini (array [{name:...}] atau schema v1)...',
                            hintStyle: TextStyle(color: Colors.grey, fontSize: 11),
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                        ),
                        if (_textIsEncrypted) ...[
                          const SizedBox(height: 10),
                          TextField(
                            controller: _textPasswordController,
                            obscureText: true,
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                            decoration: const InputDecoration(
                              labelText: 'Password Dekripsi AES-GCM *',
                              isDense: true,
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Import Strategy
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF282832),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Text('Strategi:', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _strategy,
                        isExpanded: true,
                        dropdownColor: const Color(0xFF282832),
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                        items: const [
                          DropdownMenuItem(value: 'merge', child: Text('Merge (Gabungkan & perbarui)')),
                          DropdownMenuItem(value: 'replace', child: Text('Replace (Bersihkan domain dulu)')),
                        ],
                        onChanged: (v) {
                          if (v != null) setState(() => _strategy = v);
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Execute Button
            ElevatedButton.icon(
              onPressed: _isLoading ? null : _executeImport,
              icon: _isLoading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                  : const Icon(Icons.file_download_done),
              label: Text(_isLoading ? 'Mengimpor...' : 'Terapkan Cookie ke Browser'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber.shade700,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 12),
                textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
