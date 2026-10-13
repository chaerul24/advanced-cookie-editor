import 'package:flutter/material.dart';
import '../models/cookie_item.dart';

class AddEditCookieDialog extends StatefulWidget {
  final CookieItem? cookie;
  final String activeDomain;

  const AddEditCookieDialog({
    super.key,
    this.cookie,
    required this.activeDomain,
  });

  @override
  State<AddEditCookieDialog> createState() => _AddEditCookieDialogState();
}

class _AddEditCookieDialogState extends State<AddEditCookieDialog> {
  late TextEditingController _nameController;
  late TextEditingController _valueController;
  late TextEditingController _domainController;
  late TextEditingController _pathController;

  bool _isSession = true;
  bool _secure = false;
  bool _httpOnly = false;
  String _sameSite = 'lax';
  bool _obscureValue = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final c = widget.cookie;
    _nameController = TextEditingController(text: c?.name ?? '');
    _valueController = TextEditingController(text: c?.value ?? '');
    _domainController = TextEditingController(text: c?.domain ?? widget.activeDomain);
    _pathController = TextEditingController(text: c?.path ?? '/');

    if (c != null) {
      _isSession = c.session;
      _secure = c.secure;
      _httpOnly = c.httpOnly;
      _sameSite = c.sameSite;
    } else {
      _secure = widget.activeDomain.isNotEmpty;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _valueController.dispose();
    _domainController.dispose();
    _pathController.dispose();
    super.dispose();
  }

  void _onSave() {
    final name = _nameController.text.trim();
    final value = _valueController.text.trim();
    final domain = _domainController.text.trim();
    final path = _pathController.text.trim();

    if (name.isEmpty) {
      setState(() => _errorMessage = 'Cookie name cannot be empty');
      return;
    }
    if (_sameSite == 'no_restriction' && !_secure) {
      setState(() => _errorMessage = 'SameSite=None requires Secure flag');
      return;
    }

    final item = CookieItem(
      name: name,
      value: value,
      domain: domain,
      path: path.isEmpty ? '/' : path,
      secure: _secure,
      httpOnly: _httpOnly,
      session: _isSession,
      sameSite: _sameSite,
      expirationDate: _isSession ? null : (DateTime.now().millisecondsSinceEpoch ~/ 1000 + 30 * 86400),
    );

    Navigator.of(context).pop(item);
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.cookie != null;
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.cookie, color: Colors.amber),
          const SizedBox(width: 8),
          Text(isEdit ? 'Edit Cookie' : 'New Cookie', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_errorMessage != null)
              Container(
                padding: const EdgeInsets.all(8),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.red.shade900.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.red.shade400),
                ),
                child: Text(_errorMessage!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
              ),
            TextField(
              controller: _nameController,
              enabled: !isEdit,
              decoration: const InputDecoration(
                labelText: 'Cookie Name *',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _valueController,
              obscureText: _obscureValue,
              decoration: InputDecoration(
                labelText: 'Cookie Value',
                isDense: true,
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: Icon(_obscureValue ? Icons.visibility : Icons.visibility_off, size: 20),
                  onPressed: () => setState(() => _obscureValue = !_obscureValue),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _domainController,
              decoration: const InputDecoration(
                labelText: 'Domain',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _pathController,
              decoration: const InputDecoration(
                labelText: 'Path',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: CheckboxListTile(
                    title: const Text('Session', style: TextStyle(fontSize: 12)),
                    value: _isSession,
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    onChanged: (v) => setState(() => _isSession = v ?? true),
                  ),
                ),
                Expanded(
                  child: CheckboxListTile(
                    title: const Text('Secure', style: TextStyle(fontSize: 12)),
                    value: _secure,
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    onChanged: (v) => setState(() => _secure = v ?? false),
                  ),
                ),
              ],
            ),
            CheckboxListTile(
              title: const Text('HttpOnly', style: TextStyle(fontSize: 12)),
              value: _httpOnly,
              dense: true,
              contentPadding: EdgeInsets.zero,
              onChanged: (v) => setState(() => _httpOnly = v ?? false),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _sameSite,
              decoration: const InputDecoration(
                labelText: 'SameSite Attribute',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'lax', child: Text('Lax (Default)', style: TextStyle(fontSize: 13))),
                DropdownMenuItem(value: 'strict', child: Text('Strict', style: TextStyle(fontSize: 13))),
                DropdownMenuItem(value: 'no_restriction', child: Text('None (Requires Secure)', style: TextStyle(fontSize: 13))),
              ],
              onChanged: (v) {
                if (v != null) {
                  setState(() {
                    _sameSite = v;
                    if (v == 'no_restriction') _secure = true;
                  });
                }
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _onSave,
          style: ElevatedButton.styleFrom(backgroundColor: Colors.amber.shade700, foregroundColor: Colors.black),
          child: const Text('Save Cookie', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }
}
