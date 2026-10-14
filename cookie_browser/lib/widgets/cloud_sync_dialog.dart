import 'dart:async';
import 'package:flutter/material.dart';
import '../models/cookie_item.dart';
import '../services/cloud_sync_service.dart';

class CloudSyncDialog extends StatefulWidget {
  final List<CookieItem> cookies;
  final String activeDomain;
  final Function(List<CookieItem> restoredCookies) onRestore;

  const CloudSyncDialog({
    super.key,
    required this.cookies,
    required this.activeDomain,
    required this.onRestore,
  });

  @override
  State<CloudSyncDialog> createState() => _CloudSyncDialogState();
}

class _CloudSyncDialogState extends State<CloudSyncDialog> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _serverUrlController = TextEditingController(text: CloudSyncService.defaultServerUrl);
  final TextEditingController _pushPasswordController = TextEditingController();
  final TextEditingController _pullPasswordController = TextEditingController();

  bool _encrypt = false;
  bool _isLoading = false;
  bool _autoSync5s = false;
  Timer? _autoSyncTimer;
  bool? _isServerOnline;
  String? _statusMessage;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _checkServer();
  }

  @override
  void dispose() {
    _autoSyncTimer?.cancel();
    _tabController.dispose();
    _serverUrlController.dispose();
    _pushPasswordController.dispose();
    _pullPasswordController.dispose();
    super.dispose();
  }

  Future<void> _checkServer() async {
    final online = await CloudSyncService.checkHealth();
    if (mounted) {
      setState(() => _isServerOnline = online);
    }
  }

  Future<void> _handlePush() async {
    setState(() {
      _isLoading = true;
      _statusMessage = null;
    });

    try {
      final res = await CloudSyncService.pushCookies(
        widget.cookies,
        serverUrl: _serverUrlController.text.trim(),
        domain: widget.activeDomain,
        encrypt: _encrypt,
        password: _pushPasswordController.text.trim(),
      );

      if (mounted) {
        setState(() {
          _statusMessage = 'Successfully backed up ${widget.cookies.length} cookies (${res['filename'] ?? 'saved'})!';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _statusMessage = 'Error: $e';
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _toggleAutoSync(bool enable) {
    setState(() => _autoSync5s = enable);
    _autoSyncTimer?.cancel();
    if (enable) {
      _handlePush();
      _autoSyncTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        if (mounted && _autoSync5s && !_isLoading) {
          _handlePush();
        }
      });
    }
  }

  Future<void> _handlePull() async {
    setState(() {
      _isLoading = true;
      _statusMessage = null;
    });

    try {
      final restored = await CloudSyncService.fetchLatest(
        serverUrl: _serverUrlController.text.trim(),
        password: _pullPasswordController.text.trim().isEmpty ? null : _pullPasswordController.text.trim(),
      );

      widget.onRestore(restored);

      if (mounted) {
        setState(() {
          _statusMessage = 'Restored ${restored.length} cookies from server!';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _statusMessage = 'Error: $e';
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.cloud_sync, color: Colors.blueAccent),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Cloud Sync (warnet.web.id)',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _isServerOnline == true ? Colors.green.shade900 : Colors.red.shade900,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _isServerOnline == true ? '● Online' : (_isServerOnline == false ? '● Offline' : '...'),
                    style: TextStyle(
                      color: _isServerOnline == true ? Colors.greenAccent : Colors.redAccent,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TabBar(
              controller: _tabController,
              labelColor: Colors.blueAccent,
              unselectedLabelColor: Colors.grey,
              tabs: const [
                Tab(text: 'Push Backup'),
                Tab(text: 'Restore Latest'),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 220,
              child: TabBarView(
                controller: _tabController,
                children: [
                  // PUSH TAB
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Export ${widget.cookies.length} cookies ke https://erul.my.id/', style: const TextStyle(fontSize: 12)),
                        const SizedBox(height: 8),
                        SwitchListTile(
                          title: const Text('⚡ Auto-Sync Setiap 5 Detik', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.greenAccent)),
                          subtitle: const Text('Kirim otomatis setiap 5 detik ke server tanpa password', style: TextStyle(fontSize: 10)),
                          value: _autoSync5s,
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          activeColor: Colors.greenAccent,
                          onChanged: (v) => _toggleAutoSync(v),
                        ),
                        CheckboxListTile(
                          title: const Text('Encrypt with AES-GCM 256', style: TextStyle(fontSize: 12)),
                          value: _encrypt,
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          onChanged: (v) => setState(() => _encrypt = v ?? false),
                        ),
                        if (_encrypt)
                          TextField(
                            controller: _pushPasswordController,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Password *',
                              isDense: true,
                              border: OutlineInputBorder(),
                            ),
                          ),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: _isLoading ? null : _handlePush,
                          icon: _isLoading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.cloud_upload),
                          label: const Text('Push to Server'),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white),
                        ),
                      ],
                    ),
                  ),

                  // PULL TAB
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Fetch and restore latest cookies from server', style: const TextStyle(fontSize: 12)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _pullPasswordController,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Decryption Password (if encrypted)',
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: _isLoading ? null : _handlePull,
                          icon: _isLoading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.cloud_download),
                          label: const Text('Restore Latest Backup'),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (_statusMessage != null)
              Container(
                padding: const EdgeInsets.all(8),
                margin: const EdgeInsets.only(top: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade900,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  _statusMessage!,
                  style: const TextStyle(fontSize: 11, color: Colors.white),
                ),
              ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Close'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
