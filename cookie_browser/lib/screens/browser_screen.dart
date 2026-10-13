import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/cookie_item.dart';
import '../services/cookie_manager_service.dart';
import '../widgets/cookie_editor_sheet.dart';

class BrowserScreen extends StatefulWidget {
  const BrowserScreen({super.key});

  @override
  State<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends State<BrowserScreen> {
  late final WebViewController _controller;
  final TextEditingController _urlInputController = TextEditingController();

  String _currentUrl = 'https://warnet.web.id';
  int _progress = 0;
  int _cookieCount = 0;
  bool _canGoBack = false;
  bool _canGoForward = false;
  bool _isDesktopMode = false;

  @override
  void initState() {
    super.initState();
    _urlInputController.text = _currentUrl;
    _initWebView();
  }

  void _initWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (mounted) setState(() => _progress = progress);
          },
          onPageStarted: (url) {
            _onUrlChanged(url);
          },
          onPageFinished: (url) async {
            _onUrlChanged(url);
            await _updateHistoryState();
            await _fetchCookieCount();
          },
        ),
      )
      ..loadRequest(Uri.parse(_currentUrl));
  }

  void _onUrlChanged(String url) {
    if (!mounted) return;
    setState(() {
      _currentUrl = url;
      _urlInputController.text = url;
    });
  }

  Future<void> _updateHistoryState() async {
    final canBack = await _controller.canGoBack();
    final canFwd = await _controller.canGoForward();
    if (mounted) {
      setState(() {
        _canGoBack = canBack;
        _canGoForward = canFwd;
      });
    }
  }

  Future<void> _fetchCookieCount() async {
    final list = await CookieManagerService.getCookies(_currentUrl);
    if (mounted) {
      setState(() {
        _cookieCount = list.length;
      });
    }
  }

  void _navigateTo(String input) {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return;

    String target;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      target = trimmed;
    } else if (trimmed.contains('.') && !trimmed.contains(' ')) {
      target = 'https://$trimmed';
    } else {
      // Search query
      target = 'https://www.google.com/search?q=${Uri.encodeComponent(trimmed)}';
    }

    _controller.loadRequest(Uri.parse(target));
  }

  String _getActiveDomain() {
    final uri = Uri.tryParse(_currentUrl);
    return uri?.host ?? '';
  }

  void _openCookieEditor() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => CookieEditorSheet(
        activeUrl: _currentUrl,
        activeDomain: _getActiveDomain(),
        onCookiesChanged: () {
          _fetchCookieCount();
        },
      ),
    );
  }

  void _toggleDesktopMode() {
    setState(() {
      _isDesktopMode = !_isDesktopMode;
    });
    final ua = _isDesktopMode
        ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        : '';
    _controller.setUserAgent(ua.isEmpty ? null : ua);
    _controller.reload();
  }

  @override
  Widget build(BuildContext context) {
    final isSecure = _currentUrl.startsWith('https://');

    return PopScope(
      canPop: !_canGoBack,
      onPopInvokedWithResult: (didPop, result) async {
        if (!didPop && _canGoBack) {
          await _controller.goBack();
          _updateHistoryState();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF141418),
        appBar: AppBar(
          backgroundColor: const Color(0xFF1E1E24),
          elevation: 1,
          titleSpacing: 8,
          title: Container(
            height: 42,
            decoration: BoxDecoration(
              color: const Color(0xFF2A2A32),
              borderRadius: BorderRadius.circular(21),
              border: Border.all(color: Colors.white12),
            ),
            child: Row(
              children: [
                const SizedBox(width: 10),
                Icon(
                  isSecure ? Icons.lock : Icons.lock_open,
                  size: 16,
                  color: isSecure ? Colors.greenAccent : Colors.orangeAccent,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _urlInputController,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: const InputDecoration(
                      hintText: 'Search or enter website URL...',
                      hintStyle: TextStyle(color: Colors.grey, fontSize: 13),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    textInputAction: TextInputAction.go,
                    onSubmitted: _navigateTo,
                  ),
                ),
                if (_progress > 0 && _progress < 100)
                  IconButton(
                    icon: const Icon(Icons.close, size: 18, color: Colors.grey),
                    onPressed: () => _controller.loadRequest(Uri.parse('about:blank')),
                  )
                else
                  IconButton(
                    icon: const Icon(Icons.refresh, size: 18, color: Colors.grey),
                    onPressed: () => _controller.reload(),
                  ),
              ],
            ),
          ),
          actions: [
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: Colors.white70),
              color: const Color(0xFF282832),
              onSelected: (val) {
                if (val == 'desktop') _toggleDesktopMode();
                if (val == 'clear_cookies') {
                  CookieManagerService.clearAll();
                  _fetchCookieCount();
                  _controller.reload();
                }
                if (val == 'home') _navigateTo('https://warnet.web.id');
              },
              itemBuilder: (ctx) => [
                PopupMenuItem(
                  value: 'desktop',
                  child: Row(
                    children: [
                      Icon(_isDesktopMode ? Icons.check_box : Icons.check_box_outline_blank, size: 18, color: Colors.white),
                      const SizedBox(width: 8),
                      const Text('Desktop Site', style: TextStyle(color: Colors.white, fontSize: 13)),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'home',
                  child: Row(
                    children: [
                      Icon(Icons.home, size: 18, color: Colors.white),
                      const SizedBox(width: 8),
                      Text('Go to warnet.web.id', style: TextStyle(color: Colors.white, fontSize: 13)),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'clear_cookies',
                  child: Row(
                    children: [
                      Icon(Icons.delete_sweep, size: 18, color: Colors.redAccent),
                      const SizedBox(width: 8),
                      Text('Clear All Browser Cookies', style: TextStyle(color: Colors.redAccent, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
          ],
          bottom: _progress > 0 && _progress < 100
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(
                    value: _progress / 100.0,
                    backgroundColor: Colors.transparent,
                    valueColor: const AlwaysStoppedAnimation<Color>(Colors.amber),
                  ),
                )
              : null,
        ),
        body: WebViewWidget(controller: _controller),
        bottomNavigationBar: Container(
          height: 56,
          decoration: const BoxDecoration(
            color: Color(0xFF1E1E24),
            border: Border(top: BorderSide(color: Colors.white12)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                color: _canGoBack ? Colors.white : Colors.white24,
                onPressed: _canGoBack ? () => _controller.goBack() : null,
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward),
                color: _canGoForward ? Colors.white : Colors.white24,
                onPressed: _canGoForward ? () => _controller.goForward() : null,
              ),

              // PROMINENT COOKIE INSPECTOR BUTTON
              GestureDetector(
                onTap: _openCookieEditor,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade700,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(color: Colors.amber.shade700.withOpacity(0.4), blurRadius: 8, spreadRadius: 1),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.cookie, color: Colors.black, size: 18),
                      const SizedBox(width: 6),
                      Text(
                        '$_cookieCount Cookies',
                        style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),

              IconButton(
                icon: const Icon(Icons.home, color: Colors.white70),
                onPressed: () => _navigateTo('https://warnet.web.id'),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, color: Colors.white70),
                onPressed: () => _controller.reload(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
