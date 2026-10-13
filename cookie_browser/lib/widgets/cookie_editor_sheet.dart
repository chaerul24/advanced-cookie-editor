import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/cookie_item.dart';
import '../services/cookie_manager_service.dart';
import 'add_edit_cookie_dialog.dart';
import 'cloud_sync_dialog.dart';

class CookieEditorSheet extends StatefulWidget {
  final String activeUrl;
  final String activeDomain;
  final VoidCallback onCookiesChanged;

  const CookieEditorSheet({
    super.key,
    required this.activeUrl,
    required this.activeDomain,
    required this.onCookiesChanged,
  });

  @override
  State<CookieEditorSheet> createState() => _CookieEditorSheetState();
}

class _CookieEditorSheetState extends State<CookieEditorSheet> {
  List<CookieItem> _allCookies = [];
  List<CookieItem> _filteredCookies = [];
  bool _isLoading = true;
  bool _maskValues = true;
  String _searchQuery = '';
  String _activeFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadCookies();
  }

  Future<void> _loadCookies() async {
    setState(() => _isLoading = true);
    final cookies = await CookieManagerService.getCookies(widget.activeUrl);
    if (mounted) {
      setState(() {
        _allCookies = cookies;
        _isLoading = false;
        _applyFilters();
      });
    }
  }

  void _applyFilters() {
    var list = _allCookies;

    // Filter type
    if (_activeFilter == 'secure') {
      list = list.where((c) => c.secure).toList();
    } else if (_activeFilter == 'httponly') {
      list = list.where((c) => c.httpOnly).toList();
    } else if (_activeFilter == 'session') {
      list = list.where((c) => c.session).toList();
    }

    // Search query
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      list = list.where((c) =>
        c.name.toLowerCase().contains(q) ||
        c.value.toLowerCase().contains(q) ||
        c.domain.toLowerCase().contains(q)
      ).toList();
    }

    setState(() {
      _filteredCookies = list;
    });
  }

  void _showAddEditDialog([CookieItem? cookie]) async {
    final result = await showDialog<CookieItem>(
      context: context,
      builder: (ctx) => AddEditCookieDialog(
        cookie: cookie,
        activeDomain: widget.activeDomain,
      ),
    );

    if (result != null) {
      await CookieManagerService.setCookie(widget.activeUrl, result);
      widget.onCookiesChanged();
      await _loadCookies();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved cookie "${result.name}"')),
        );
      }
    }
  }

  void _deleteCookie(CookieItem cookie) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Cookie'),
        content: Text('Delete "${cookie.name}" for ${widget.activeDomain}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await CookieManagerService.removeCookie(widget.activeUrl, cookie);
      widget.onCookiesChanged();
      await _loadCookies();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Deleted cookie "${cookie.name}"')),
        );
      }
    }
  }

  void _openCloudSync() {
    showDialog(
      context: context,
      builder: (ctx) => CloudSyncDialog(
        cookies: _allCookies,
        activeDomain: widget.activeDomain,
        onRestore: (restored) async {
          for (var c in restored) {
            await CookieManagerService.setCookie(widget.activeUrl, c);
          }
          widget.onCookiesChanged();
          await _loadCookies();
        },
      ),
    );
  }

  void _exportJson() {
    final payload = {
      'format': 'advanced-cookie-editor',
      'version': 1,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'itemCount': _allCookies.length,
      'domain': widget.activeDomain,
      'cookies': _allCookies.map((c) => c.toJson()).toList(),
    };
    final jsonStr = const JsonEncoder.withIndent('  ').convert(payload);
    Clipboard.setData(ClipboardData(text: jsonStr));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Copied ${_allCookies.length} cookies as JSON to clipboard!')),
    );
  }

  void _importJsonPrompt() {
    final textController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Paste Cookie JSON'),
        content: TextField(
          controller: textController,
          maxLines: 8,
          decoration: const InputDecoration(
            hintText: 'Paste cookie JSON array or schema v1...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final raw = textController.text.trim();
              if (raw.isEmpty) return;
              try {
                final dynamic data = json.decode(raw);
                List<dynamic> list = [];
                if (data is List) {
                  list = data;
                } else if (data is Map && data['cookies'] is List) {
                  list = data['cookies'] as List;
                }
                int count = 0;
                for (var item in list) {
                  if (item is Map<String, dynamic>) {
                    final c = CookieItem.fromJson(item);
                    await CookieManagerService.setCookie(widget.activeUrl, c);
                    count++;
                  }
                }
                Navigator.of(ctx).pop();
                widget.onCookiesChanged();
                await _loadCookies();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Imported $count cookies successfully!')),
                  );
                }
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Invalid JSON format: $e')),
                );
              }
            },
            child: const Text('Import'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Color(0xFF1E1E24),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(top: 8, bottom: 4),
            decoration: BoxDecoration(
              color: Colors.grey.shade600,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Icon(Icons.cookie, color: Colors.amber, size: 24),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.activeDomain.isEmpty ? 'All Cookies' : widget.activeDomain,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${_allCookies.length} cookies detected',
                        style: const TextStyle(color: Colors.grey, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, color: Colors.white70),
                  onPressed: _loadCookies,
                  tooltip: 'Refresh Cookies',
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white70),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),

          // Action Pills Row
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                ElevatedButton.icon(
                  onPressed: () => _showAddEditDialog(),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add Cookie'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.amber.shade700,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: _openCloudSync,
                  icon: const Icon(Icons.cloud_sync, size: 16, color: Colors.blueAccent),
                  label: const Text('warnet.web.id', style: TextStyle(color: Colors.blueAccent, fontSize: 12)),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.blueAccent)),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: _exportJson,
                  icon: const Icon(Icons.copy, size: 16, color: Colors.white70),
                  label: const Text('Copy JSON', style: TextStyle(color: Colors.white70, fontSize: 12)),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: _importJsonPrompt,
                  icon: const Icon(Icons.file_upload, size: 16, color: Colors.white70),
                  label: const Text('Import JSON', style: TextStyle(color: Colors.white70, fontSize: 12)),
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: () => setState(() => _maskValues = !_maskValues),
                  icon: Icon(_maskValues ? Icons.visibility : Icons.visibility_off, size: 16, color: Colors.grey),
                  label: Text(_maskValues ? 'Masked' : 'Visible', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                ),
              ],
            ),
          ),

          // Search Bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Search cookie name or value...',
                hintStyle: TextStyle(color: Colors.grey.shade500),
                prefixIcon: const Icon(Icons.search, size: 18, color: Colors.grey),
                isDense: true,
                filled: true,
                fillColor: const Color(0xFF2A2A32),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              ),
              onChanged: (q) {
                _searchQuery = q.trim();
                _applyFilters();
              },
            ),
          ),

          const Divider(height: 1, color: Colors.white12),

          // Cookie List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _filteredCookies.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.cookie_outlined, size: 48, color: Colors.white24),
                            const SizedBox(height: 8),
                            Text(
                              _searchQuery.isNotEmpty ? 'No cookies match search' : 'No cookies for this site yet',
                              style: const TextStyle(color: Colors.white54, fontSize: 13),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        itemCount: _filteredCookies.length,
                        itemBuilder: (ctx, idx) {
                          final c = _filteredCookies[idx];
                          final displayVal = _maskValues ? '••••••••••••••••' : c.value;
                          return Container(
                            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF282830),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        c.name,
                                        style: const TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 14),
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.copy, size: 16, color: Colors.white70),
                                      tooltip: 'Copy Value',
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(),
                                      onPressed: () {
                                        Clipboard.setData(ClipboardData(text: '${c.name}=${c.value}'));
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(content: Text('Copied "${c.name}" value!')),
                                        );
                                      },
                                    ),
                                    const SizedBox(width: 8),
                                    IconButton(
                                      icon: const Icon(Icons.edit, size: 16, color: Colors.white70),
                                      tooltip: 'Edit Cookie',
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(),
                                      onPressed: () => _showAddEditDialog(c),
                                    ),
                                    const SizedBox(width: 8),
                                    IconButton(
                                      icon: const Icon(Icons.delete, size: 16, color: Colors.redAccent),
                                      tooltip: 'Delete Cookie',
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(),
                                      onPressed: () => _deleteCookie(c),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  displayVal,
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.85),
                                    fontSize: 12,
                                    fontFamily: 'monospace',
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    if (c.domain.isNotEmpty)
                                      Text('${c.domain}${c.path}', style: const TextStyle(color: Colors.grey, fontSize: 10)),
                                    const Spacer(),
                                    if (c.secure)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                        margin: const EdgeInsets.only(left: 4),
                                        decoration: BoxDecoration(color: Colors.green.shade900, borderRadius: BorderRadius.circular(4)),
                                        child: const Text('Secure', style: TextStyle(color: Colors.greenAccent, fontSize: 9)),
                                      ),
                                    if (c.httpOnly)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                        margin: const EdgeInsets.only(left: 4),
                                        decoration: BoxDecoration(color: Colors.orange.shade900, borderRadius: BorderRadius.circular(4)),
                                        child: const Text('HttpOnly', style: TextStyle(color: Colors.orangeAccent, fontSize: 9)),
                                      ),
                                    if (c.session)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                        margin: const EdgeInsets.only(left: 4),
                                        decoration: BoxDecoration(color: Colors.purple.shade900, borderRadius: BorderRadius.circular(4)),
                                        child: const Text('Session', style: TextStyle(color: Colors.purpleAccent, fontSize: 9)),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
